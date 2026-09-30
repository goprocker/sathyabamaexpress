// Where each user's household state lives. One JSON document per user.
import fs from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import type { CanonicalStateData } from "@household/db";

export interface StateBackend {
  /** True when one process is the only writer, so loaded stores can be kept in memory. */
  readonly cacheable: boolean;
  load(userId: string): Promise<CanonicalStateData | null>;
  save(userId: string, state: CanonicalStateData): Promise<void>;
  /** Which user owns the action with this vendor-call id (Snapserve webhooks carry no user). */
  findUserByCall(callId: string): Promise<string | null>;
}

const ownsCall = (state: CanonicalStateData, callId: string) =>
  Array.isArray(state.actions) && state.actions.some((a) => a.externalCallId === callId);

/** Clerk ids look like user_2abc..., but never trust them as file names. */
const safeName = (userId: string) => userId.replace(/[^a-zA-Z0-9_-]/g, "_");

export class FileStateBackend implements StateBackend {
  readonly cacheable = true;
  constructor(private readonly dir: string) {}

  private file(userId: string) {
    return path.join(this.dir, `${safeName(userId)}.json`);
  }

  async load(userId: string) {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file(userId), "utf8")) as CanonicalStateData;
      return Array.isArray(parsed?.resources) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(userId: string, state: CanonicalStateData) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(userId), JSON.stringify(state), "utf8");
  }

  async findUserByCall(callId: string) {
    let names: string[] = [];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return null;
    }
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      try {
        const state = JSON.parse(await fs.readFile(path.join(this.dir, name), "utf8")) as CanonicalStateData;
        if (ownsCall(state, callId)) return name.slice(0, -".json".length);
      } catch {
        /* skip unreadable file */
      }
    }
    return null;
  }
}

/** Serverless-safe: every request reads the latest state, so instances never serve stale data. */
export class PostgresStateBackend implements StateBackend {
  readonly cacheable = false;
  private pool: Promise<Pool> | null = null;
  private ready: Promise<unknown> | null = null;

  constructor(private readonly connectionString: string) {}

  /** The driver is loaded only when a database is actually configured, so a missing or odd `pg` build cannot take down the whole API. */
  private getPool(): Promise<Pool> {
    this.pool ??= import("pg").then((mod) => {
      const PoolCtor = mod.Pool ?? (mod as { default?: { Pool?: typeof mod.Pool } }).default?.Pool;
      if (!PoolCtor) throw new Error("The pg driver did not load.");
      return new PoolCtor({ connectionString: this.connectionString, max: 3 });
    });
    return this.pool;
  }

  private async init(): Promise<Pool> {
    const pool = await this.getPool();
    this.ready ??= pool.query(
      `create table if not exists livora_user_state (
         user_id text primary key,
         state jsonb not null,
         updated_at timestamptz not null default now()
       )`,
    );
    await this.ready;
    return pool;
  }

  async load(userId: string) {
    const pool = await this.init();
    const res = await pool.query<{ state: CanonicalStateData }>(
      "select state from livora_user_state where user_id = $1",
      [userId],
    );
    const state = res.rows[0]?.state;
    return state && Array.isArray(state.resources) ? state : null;
  }

  async save(userId: string, state: CanonicalStateData) {
    const pool = await this.init();
    await pool.query(
      `insert into livora_user_state (user_id, state) values ($1, $2::jsonb)
       on conflict (user_id) do update set state = excluded.state, updated_at = now()`,
      [userId, JSON.stringify(state)],
    );
  }

  async findUserByCall(callId: string) {
    const pool = await this.init();
    const res = await pool.query<{ user_id: string }>(
      "select user_id from livora_user_state where state->'actions' @> $1::jsonb limit 1",
      [JSON.stringify([{ externalCallId: callId }])],
    );
    return res.rows[0]?.user_id ?? null;
  }
}

export class MemoryStateBackend implements StateBackend {
  readonly cacheable: boolean = false;
  readonly saved = new Map<string, CanonicalStateData>();
  async load(userId: string) {
    const s = this.saved.get(userId);
    return s ? structuredClone(s) : null;
  }
  async save(userId: string, state: CanonicalStateData) {
    this.saved.set(userId, structuredClone(state));
  }
  async findUserByCall(callId: string) {
    for (const [userId, state] of this.saved) if (ownsCall(state, callId)) return userId;
    return null;
  }
}

/** Postgres when DATABASE_URL is set, otherwise files (a temp dir on Vercel, where the disk is read-only). */
export function defaultStateBackend(): StateBackend {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return new PostgresStateBackend(url);
  const dir = process.env.VERCEL
    ? path.resolve("/tmp", "livora-users")
    : path.resolve(process.cwd(), ".data", "users");
  return new FileStateBackend(dir);
}
