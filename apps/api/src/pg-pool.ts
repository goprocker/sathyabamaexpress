// One lazily-created Postgres pool per connection string, shared by everything that needs the database.
import type { Pool } from "pg";

const pools = new Map<string, Promise<Pool>>();

/** The driver is loaded only when a database is configured, so a missing or odd `pg` build cannot stop the API from starting. */
export function getPgPool(connectionString: string): Promise<Pool> {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = import("pg").then((mod) => {
      const PoolCtor = mod.Pool ?? (mod as { default?: { Pool?: typeof mod.Pool } }).default?.Pool;
      if (!PoolCtor) throw new Error("The pg driver did not load.");
      const created = new PoolCtor({
        connectionString,
        // Serverless: few connections, and a slow or unreachable database must fail fast
        // with a clear error instead of hanging until the platform kills the function.
        max: 2,
        connectionTimeoutMillis: 8_000,
        query_timeout: 10_000,
        idleTimeoutMillis: 10_000,
        allowExitOnIdle: true,
      });
      // A connection the server drops while idle emits 'error'. Without a listener that
      // crashes the whole function instead of just opening a fresh connection next time.
      created.on("error", (err) => console.error("[postgres] idle connection error:", err.message));
      return created;
    });
    pools.set(connectionString, pool);
    // A failed load must not stay cached: let the next request try again.
    pool.catch(() => pools.delete(connectionString));
  }
  return pool;
}
