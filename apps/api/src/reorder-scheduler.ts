// Periodic restock check. Stock can run low or expire without anyone opening
// the app, so a long-running server (pm2 / Docker) re-checks every household on
// a timer. Serverless deployments skip this and rely on the per-request checks
// (or an external cron calling POST /api/reorders/scan).
import { runWithUser } from "./request-context.js";
import type { UserStores } from "./user-stores.js";

export interface ReorderSchedulerOptions {
  intervalMs: number;
  /** Signed-in households; null when auth is off (only the shared demo store exists). */
  userStores: UserStores | null;
  /** Runs one restock check against whichever store is current. */
  check: (trigger: string) => Promise<unknown>;
  onError?: (err: unknown) => void;
}

const FIRST_RUN_DELAY_MS = 15_000;

export function startReorderScheduler(options: ReorderSchedulerOptions): () => void {
  let running = false;

  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      if (!options.userStores) {
        await options.check("Scheduled inventory check");
        return;
      }
      for (const userId of await options.userStores.listUserIds()) {
        try {
          const store = await options.userStores.get(userId);
          await runWithUser({ userId, store }, () => options.check("Scheduled inventory check"));
          await options.userStores.flush(userId);
        } catch (err) {
          options.onError?.(err);
        }
      }
    } catch (err) {
      options.onError?.(err);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => void sweep(), Math.min(FIRST_RUN_DELAY_MS, options.intervalMs));
  const timer = setInterval(() => void sweep(), options.intervalMs);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
