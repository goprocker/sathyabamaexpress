import { useState } from "react";
import { useSignIn } from "@clerk/react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { requestDemoTicket } from "@/lib/demoApi";

/**
 * "Try the demo": signs into a real Clerk account whose household is already full
 * of sample data. The server issues a one-time ticket; Clerk turns it into a normal
 * session, so nothing about the demo is special once you are in.
 */
export function DemoLogin() {
  const { signIn } = useSignIn();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const ticket = await requestDemoTicket();
      const attempt = await signIn.ticket({ ticket });
      if (attempt.error) throw new Error("The demo sign-in didn't go through. Please try again.");
      const done = await signIn.finalize();
      if (done.error) throw new Error("The demo sign-in didn't go through. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The demo is unavailable right now. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[400px] space-y-3 text-center">
      <div className="flex items-center gap-3 text-[13px] text-text-tertiary" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button variant="secondary" onClick={() => void start()} disabled={busy} className="w-full">
        <Play size={16} strokeWidth={1.75} />
        {busy ? "Opening the demo…" : "Try the demo"}
      </Button>
      <p className="text-[13px] text-text-tertiary">A ready-made household with sample family, vehicles, bills and subscriptions. No sign-up needed.</p>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
