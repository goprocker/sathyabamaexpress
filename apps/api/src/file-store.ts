// Uploaded documents and bills (Aadhaar, PAN, licence, bill photos...).
// Every file is encrypted with AES-256-GCM before it reaches storage, and the
// ciphertext is bound to its owner and file id, so a stored blob cannot be
// swapped between users or files. Storage sees only opaque bytes.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getPgPool } from "./pg-pool.js";

export interface FileMeta {
  id: string;
  name: string;
  mimeType: string;
}

export interface StoredFile extends FileMeta {
  bytes: Buffer;
}

export interface FileStore {
  put(userId: string, meta: FileMeta, bytes: Buffer): Promise<void>;
  get(userId: string, id: string): Promise<StoredFile | null>;
  delete(userId: string, id: string): Promise<void>;
}

/** Raw storage: opaque bytes plus the (non-secret) name and type. */
interface BlobStore {
  put(userId: string, meta: FileMeta, blob: Buffer): Promise<void>;
  get(userId: string, id: string): Promise<{ meta: FileMeta; blob: Buffer } | null>;
  delete(userId: string, id: string): Promise<void>;
}

// ── Encryption ─────────────────────────────────────────────────────────────

const VERSION = 1;

/**
 * The key comes from DOCUMENT_ENCRYPTION_KEY (32+ bytes, base64 or hex) when set,
 * otherwise it is derived from the Clerk secret key. Rotating either makes files
 * stored under the old key unreadable, so keep whichever you use stable.
 */
export function documentKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const explicit = env.DOCUMENT_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const bytes = /^[0-9a-f]{64,}$/i.test(explicit) ? Buffer.from(explicit, "hex") : Buffer.from(explicit, "base64");
    if (bytes.length >= 32) return bytes.subarray(0, 32);
    throw new Error("DOCUMENT_ENCRYPTION_KEY must be at least 32 bytes (base64 or hex).");
  }
  const secret = env.CLERK_SECRET_KEY?.trim();
  if (!secret) return null;
  return Buffer.from(crypto.hkdfSync("sha256", secret, "livora-documents", "file-encryption-v1", 32));
}

export function encryptFile(key: Buffer, userId: string, id: string, plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${userId}:${id}`));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}

export function decryptFile(key: Buffer, userId: string, id: string, sealed: Buffer): Buffer {
  if (sealed[0] !== VERSION) throw new Error("Unsupported file format.");
  const iv = sealed.subarray(1, 13);
  const tag = sealed.subarray(13, 29);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(`${userId}:${id}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(29)), decipher.final()]);
}

class EncryptingFileStore implements FileStore {
  constructor(
    private readonly inner: BlobStore,
    private readonly key: Buffer,
  ) {}

  put(userId: string, meta: FileMeta, bytes: Buffer) {
    return this.inner.put(userId, meta, encryptFile(this.key, userId, meta.id, bytes));
  }

  async get(userId: string, id: string) {
    const stored = await this.inner.get(userId, id);
    if (!stored) return null;
    return { ...stored.meta, bytes: decryptFile(this.key, userId, id, stored.blob) };
  }

  delete(userId: string, id: string) {
    return this.inner.delete(userId, id);
  }
}

// ── Storage backends ───────────────────────────────────────────────────────

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

class DiskBlobStore implements BlobStore {
  constructor(private readonly dir: string) {}
  private base(userId: string, id: string) {
    return path.join(this.dir, safe(userId), safe(id));
  }
  async put(userId: string, meta: FileMeta, blob: Buffer) {
    const base = this.base(userId, meta.id);
    await fs.mkdir(path.dirname(base), { recursive: true });
    await fs.writeFile(`${base}.bin`, blob);
    await fs.writeFile(`${base}.json`, JSON.stringify(meta));
  }
  async get(userId: string, id: string) {
    const base = this.base(userId, id);
    try {
      const [blob, meta] = await Promise.all([fs.readFile(`${base}.bin`), fs.readFile(`${base}.json`, "utf8")]);
      return { meta: JSON.parse(meta) as FileMeta, blob };
    } catch {
      return null;
    }
  }
  async delete(userId: string, id: string) {
    const base = this.base(userId, id);
    await Promise.all([fs.rm(`${base}.bin`, { force: true }), fs.rm(`${base}.json`, { force: true })]);
  }
}

class PostgresBlobStore implements BlobStore {
  private ready: Promise<unknown> | null = null;
  constructor(private readonly connectionString: string) {}

  private async init() {
    const pool = await getPgPool(this.connectionString);
    this.ready ??= pool
      .query(
        `create table if not exists livora_user_files (
           user_id text not null,
           file_id text not null,
           name text not null,
           mime_type text not null,
           data bytea not null,
           created_at timestamptz not null default now(),
           primary key (user_id, file_id)
         )`,
      )
      .catch((err: unknown) => {
        this.ready = null;
        throw err;
      });
    await this.ready;
    return pool;
  }

  async put(userId: string, meta: FileMeta, blob: Buffer) {
    const pool = await this.init();
    await pool.query(
      `insert into livora_user_files (user_id, file_id, name, mime_type, data) values ($1, $2, $3, $4, $5)
       on conflict (user_id, file_id) do update set name = excluded.name, mime_type = excluded.mime_type, data = excluded.data`,
      [userId, meta.id, meta.name, meta.mimeType, blob],
    );
  }
  async get(userId: string, id: string) {
    const pool = await this.init();
    const res = await pool.query<{ name: string; mime_type: string; data: Buffer }>(
      "select name, mime_type, data from livora_user_files where user_id = $1 and file_id = $2",
      [userId, id],
    );
    const row = res.rows[0];
    return row ? { meta: { id, name: row.name, mimeType: row.mime_type }, blob: row.data } : null;
  }
  async delete(userId: string, id: string) {
    const pool = await this.init();
    await pool.query("delete from livora_user_files where user_id = $1 and file_id = $2", [userId, id]);
  }
}

/** For tests: keeps ciphertext in memory. `blobs` is exposed so a test can prove nothing readable is stored. */
export class MemoryBlobStore implements BlobStore {
  readonly blobs = new Map<string, { meta: FileMeta; blob: Buffer }>();
  async put(userId: string, meta: FileMeta, blob: Buffer) {
    this.blobs.set(`${userId}/${meta.id}`, { meta, blob });
  }
  async get(userId: string, id: string) {
    return this.blobs.get(`${userId}/${id}`) ?? null;
  }
  async delete(userId: string, id: string) {
    this.blobs.delete(`${userId}/${id}`);
  }
}

export function encryptedFileStore(inner: BlobStore, key: Buffer): FileStore {
  return new EncryptingFileStore(inner, key);
}

/**
 * Postgres when DATABASE_URL is set, otherwise local files (a temp folder on Vercel).
 * Returns null when there is no encryption key: files are never stored unencrypted.
 */
export function defaultFileStore(): FileStore | null {
  const key = documentKey();
  if (!key) return null;
  const url = process.env.DATABASE_URL?.trim();
  const inner: BlobStore = url
    ? new PostgresBlobStore(url)
    : new DiskBlobStore(process.env.VERCEL ? path.resolve("/tmp", "livora-files") : path.resolve(process.cwd(), ".data", "files"));
  return new EncryptingFileStore(inner, key);
}
