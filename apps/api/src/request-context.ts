// Who is making the current request, and which household store is theirs.
// Set by the auth hook; read anywhere below it without threading arguments.
import { AsyncLocalStorage } from "node:async_hooks";
import type { HouseholdStore } from "@household/db";

export interface UserContext {
  userId: string;
  store: HouseholdStore;
}

const storage = new AsyncLocalStorage<UserContext>();

export const runWithUser = <T>(ctx: UserContext, fn: () => T): T => storage.run(ctx, fn);
export const currentUser = (): UserContext | undefined => storage.getStore();

/**
 * True for a signed-in user's own household: it starts empty and never shows sample data.
 * False for the shared no-login demo and for the demo account, which are meant to be full of sample data.
 */
export const ownsHousehold = (): boolean => {
  const user = storage.getStore();
  return user !== undefined && user.store.getState().isDemo !== true;
};

/**
 * A store handle that always resolves to the signed-in user's own store, and
 * to `fallback` (the shared demo store) when nobody is signed in. Lets the
 * existing route handlers keep using a single `store` variable.
 */
export function scopedStore(fallback: HouseholdStore): HouseholdStore {
  return new Proxy(fallback, {
    get(_target, prop) {
      const target = currentUser()?.store ?? fallback;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
