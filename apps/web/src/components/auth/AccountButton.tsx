import { Link } from "@tanstack/react-router";
import { UserButton } from "@clerk/react";
import { LogIn, User } from "lucide-react";
import { useAccount } from "@/lib/auth";

/**
 * Account icon for every header, in the app and on the public pages.
 * Signed in: Clerk's avatar menu (manage account, sign out).
 * Signed out (public pages only, the app itself is gated): a sign-in icon.
 * Auth not configured: a plain link to the profile.
 */
export function AccountButton({ className }: { className: string }) {
  const account = useAccount();
  if (!account.enabled) {
    return (
      <Link to="/profile" aria-label="Account" className={className}>
        <User size={19} strokeWidth={1.6} />
      </Link>
    );
  }
  if (!account.signedIn) {
    return (
      <Link to="/" aria-label="Sign in" className={className}>
        <LogIn size={19} strokeWidth={1.6} />
      </Link>
    );
  }
  return (
    <span className="flex size-11 items-center justify-center" aria-label={`Account${account.email ? `, ${account.email}` : ""}`}>
      <UserButton
        appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }}
        userProfileMode="modal"
      />
    </span>
  );
}
