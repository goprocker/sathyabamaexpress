import type { ReactNode } from "react";
import { SignInPage } from "@/features/auth/SignInPage";
import { authEnabled, useAccount } from "@/lib/auth";

function Gate({ children }: { children: ReactNode }) {
  const account = useAccount();
  if (!account.loaded) {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center text-[14px] text-text-secondary">
        Loading…
      </div>
    );
  }
  return account.signedIn ? <>{children}</> : <SignInPage />;
}

/** Product pages need a session. With auth disabled (no Clerk key) it renders straight through. */
export function AuthGate({ children }: { children: ReactNode }) {
  return authEnabled ? <Gate>{children}</Gate> : <>{children}</>;
}
