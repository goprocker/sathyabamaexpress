import { Link } from "@tanstack/react-router";
import { UserButton } from "@clerk/react";
import { User } from "lucide-react";
import { useAccount } from "@/lib/auth";

/**
 * Account icon for the top bar, on every screen. Signed in: Clerk's avatar menu
 * (manage account, sign out). Auth not configured: a plain link to the profile.
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
  return (
    <span className="flex size-11 items-center justify-center" aria-label={`Account${account.email ? `, ${account.email}` : ""}`}>
      <UserButton
        appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }}
        userProfileMode="modal"
      />
    </span>
  );
}
