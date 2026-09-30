import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/profile";
import { authEnabled, useAccount } from "@/lib/auth";
import { resetDemoHousehold } from "@/lib/demoApi";

/** Shown only inside the demo account, so nobody mistakes the sample data for their own. */
export function DemoBanner() {
  const { data } = useProfile({ enabled: authEnabled });
  const account = useAccount();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data?.isDemo) return null;

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetDemoHousehold();
      await qc.invalidateQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the demo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] border border-warning/30 bg-warning-subtle px-4 py-3 text-[14px]">
      <FlaskConical size={18} strokeWidth={1.5} className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1 basis-[240px] text-text-secondary">
        <strong className="font-medium text-text-primary">You're in the demo.</strong> Everything here is sample data. It resets for each new demo visit, and files and phone calls are switched off.
      </p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => void reset()} disabled={busy} className="min-h-[44px] rounded-full px-3 text-[14px] text-text-primary underline-offset-4 hover:underline disabled:opacity-60">
          {busy ? "Resetting…" : "Reset sample data"}
        </button>
        <button type="button" onClick={() => void account.signOut()} className="min-h-[44px] rounded-full px-3 text-[14px] text-text-primary underline-offset-4 hover:underline">
          Leave demo
        </button>
      </div>
      {error && (
        <p role="alert" className="basis-full text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
