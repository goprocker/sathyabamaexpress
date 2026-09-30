// Clerk wiring shared by the whole web app. Auth is optional: with no
// VITE_CLERK_PUBLISHABLE_KEY the app runs open (local demo), and every helper
// here degrades to a no-op so components never need to check.
import { useAuth, useClerk, useUser } from "@clerk/react";

export const CLERK_PUBLISHABLE_KEY: string =
  typeof import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY === "string" ? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY.trim() : "";

export const authEnabled = CLERK_PUBLISHABLE_KEY.length > 0;

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;

/** Set once by <AuthBridge>; lets plain (non-React) API code attach the session token. */
export function setTokenGetter(fn: TokenGetter | null) {
  tokenGetter = fn;
}

/** Authorization header for API calls; empty when signed out or auth is disabled. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  try {
    const token = await tokenGetter();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export interface Account {
  enabled: boolean;
  loaded: boolean;
  signedIn: boolean;
  name: string;
  email: string;
  signOut: () => Promise<void>;
}

function useClerkAccount(): Account {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  return {
    enabled: true,
    loaded: isLoaded,
    signedIn: Boolean(isSignedIn),
    name: user?.fullName ?? user?.firstName ?? "",
    email: user?.primaryEmailAddress?.emailAddress ?? "",
    signOut: () => clerk.signOut(),
  };
}

const openAccount: Account = {
  enabled: false,
  loaded: true,
  signedIn: true,
  name: "",
  email: "",
  signOut: async () => {},
};

function useOpenAccount(): Account {
  return openAccount;
}

/** Chosen once at module load, so hook order never changes between renders. */
export const useAccount: () => Account = authEnabled ? useClerkAccount : useOpenAccount;
