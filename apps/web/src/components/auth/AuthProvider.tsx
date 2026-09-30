import { useEffect, type ReactNode } from "react";
import { ClerkProvider, useAuth } from "@clerk/react";
import { CLERK_PUBLISHABLE_KEY, authEnabled, setTokenGetter } from "@/lib/auth";

// Clerk appearance follows the design system: warm surface, single green accent.
const appearance = {
  variables: {
    colorPrimary: "#2E6B3E",
    colorBackground: "#FBFAF3",
    colorText: "#14231A",
    colorInputBackground: "#FFFFFF",
    borderRadius: "12px",
    fontFamily: "inherit",
  },
  elements: { card: { boxShadow: "none", border: "1px solid rgba(20, 35, 26, 0.09)" } },
} as const;

function AuthBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);
  return <>{children}</>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!authEnabled) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} appearance={appearance} afterSignOutUrl="/">
      <AuthBridge>{children}</AuthBridge>
    </ClerkProvider>
  );
}
