// One household store per signed-in user, each starting empty.
import { buildFreshUserState, HouseholdStore, type CanonicalStateData } from "@household/db";
import type { StateBackend } from "./state-backend.js";

export class UserStores {
  private readonly cache = new Map<string, HouseholdStore>();
  /** Latest unsaved state per user, and the write currently in flight. Writes coalesce. */
  private readonly queued = new Map<string, CanonicalStateData>();
  private readonly writing = new Map<string, Promise<void>>();

  constructor(private readonly backend: StateBackend) {}

  /** Opens in progress. A new user's first screen fires several requests at once; they must all get the same store. */
  private readonly opening = new Map<string, Promise<HouseholdStore>>();

  get(userId: string): Promise<HouseholdStore> {
    const cached = this.cache.get(userId);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.opening.get(userId);
    if (inFlight) return inFlight;
    const opening = this.open(userId).finally(() => this.opening.delete(userId));
    this.opening.set(userId, opening);
    return opening;
  }

  private async open(userId: string): Promise<HouseholdStore> {
    const loaded = await this.backend.load(userId);
    const store = new HouseholdStore(null, loaded ?? undefined, {
      seed: buildFreshUserState,
      onPersist: (state) => this.persist(userId, state),
    });
    // A brand-new user is written straight away so the account exists before first use.
    if (!loaded) this.persist(userId, store.getState());
    if (this.backend.cacheable) this.cache.set(userId, store);
    return store;
  }

  /** The user (and their store) that placed the vendor call with this id, if any. */
  async findByCall(callId: string): Promise<{ userId: string; store: HouseholdStore } | null> {
    for (const [userId, store] of this.cache) {
      if (store.getState().actions.some((a) => a.externalCallId === callId)) return { userId, store };
    }
    const userId = await this.backend.findUserByCall(callId);
    return userId ? { userId, store: await this.get(userId) } : null;
  }

  private persist(userId: string, state: CanonicalStateData) {
    this.queued.set(userId, state);
    if (this.writing.has(userId)) return;
    const run = async () => {
      // Loop so a change that lands mid-write is saved right after, not lost.
      for (;;) {
        const next = this.queued.get(userId);
        if (!next) return;
        this.queued.delete(userId);
        try {
          await this.backend.save(userId, next);
        } catch (err) {
          console.error(`[user-stores] failed to save state for ${userId}:`, err);
        }
      }
    };
    const p = run().finally(() => {
      this.writing.delete(userId);
      // Something queued in the gap between the last check and here: write it too.
      const late = this.queued.get(userId);
      if (late) this.persist(userId, late);
    });
    this.writing.set(userId, p);
  }

  /** Resolves once everything queued for this user is on disk / in the database. */
  async flush(userId: string): Promise<void> {
    await this.writing.get(userId);
  }
}
