import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, CheckCheck, Download } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { ModuleIcon } from "@/components/ui/livora";
import { useMarkRead, useNotifications } from "@/hooks/life";
import { ago } from "@/lib/format";
import { disablePush, enablePush, getPushState, sendTestPush, useInstallPrompt, type PushState } from "@/lib/pwa";

export function NotificationsPage() {
  const query = useNotifications();
  const mark = useMarkRead();

  return (
    <div className="mx-auto max-w-[760px]">
      <QueryBoundary query={query}>
        {({ groups, unread }) => (
          <>
            <PageHeader
              eyebrow="Notification centre"
              title="Grouped, not noisy"
              subtitle={unread ? `${unread} unread across ${groups.filter((g) => g.unread).length} topics.` : "You're all caught up."}
              action={
                unread > 0 ? (
                  <button type="button" onClick={() => mark.mutate("all")} className="btn-secondary !min-h-0 h-11 !rounded-full !px-5">
                    <CheckCheck size={16} strokeWidth={1.5} />
                    Mark all read
                  </button>
                ) : undefined
              }
            />
            <PhoneAlertsCard />
            <div className="space-y-3">
              {groups.length === 0 && (
                <p className="card-base p-5 text-[15px] text-text-secondary">
                  Nothing yet. You'll see low or expiring stock, orders and purchases here.
                </p>
              )}
              {groups.map((g) => (
                <section key={g.title} className="card-base p-5" aria-label={g.title}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-[22px] tracking-[-0.03em]">{g.title}</h2>
                    <span className="mono-label">
                      {g.items.length} alert{g.items.length > 1 ? "s" : ""} · {ago(g.newestMinutes)}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {g.items.map((n) => (
                      <li key={n.id}>
                        <Link
                          to={n.href}
                          onClick={() => !n.read && mark.mutate([n.id])}
                          className={`flex items-center gap-3 rounded-[20px] bg-surface-elevated px-3.5 py-3 transition-transform duration-[180ms] hover:-translate-y-0.5 ${
                            n.read ? "opacity-60" : ""
                          }`}
                        >
                          <ModuleIcon module={n.module} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[16px] leading-tight tracking-[-0.02em]">{n.title}</span>
                            <span className="block truncate text-[13px] text-text-tertiary">{n.detail}</span>
                          </span>
                          {!n.read && <span aria-label="Unread" className="size-2.5 shrink-0 rounded-full bg-tint-coral" />}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {g.unread > 0 && (
                    <button
                      type="button"
                      onClick={() => mark.mutate(g.items.map((i) => i.id))}
                      className="mt-3 text-[13px] text-text-secondary underline-offset-4 hover:underline"
                    >
                      Mark group read
                    </button>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

/** Install the app and turn on phone notifications for stock and order alerts. */
function PhoneAlertsCard() {
  const install = useInstallPrompt();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getPushState().then(setState);
  }, [install.installed]);

  const run = async (fn: () => Promise<PushState | unknown>, done?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const out = await fn();
      if (typeof out === "string") setState(out as PushState);
      if (done) setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return null;
  return (
    <section className="card-base mb-3 space-y-3 p-5" aria-label="Alerts on this phone">
      <div className="flex items-center gap-2">
        <BellRing size={18} strokeWidth={1.6} />
        <h2 className="text-[18px] tracking-[-0.02em]">Alerts on this phone</h2>
      </div>

      {!install.installed && (install.canPrompt || install.iosManual) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-text-secondary">
            {install.iosManual
              ? "On iPhone, tap Share, then \u201cAdd to Home Screen\u201d, and open LIVORA from there to get alerts."
              : "Install LIVORA for one-tap access and alerts like any other app."}
          </p>
          {install.canPrompt && (
            <button type="button" onClick={() => void install.install()} className="btn-secondary !min-h-0 h-11 !rounded-full !px-5">
              <Download size={16} strokeWidth={1.5} />
              Install app
            </button>
          )}
        </div>
      )}

      {state === "unsupported" && <p className="text-[14px] text-text-secondary">This browser can't show phone notifications.</p>}
      {state === "blocked" && (
        <p className="text-[14px] text-text-secondary">Notifications are blocked. Allow them for this site in your browser settings.</p>
      )}
      {state === "off" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-text-secondary">Get a notification when milk runs low, food is about to expire, or a store confirms your order.</p>
          <button type="button" disabled={busy} onClick={() => void run(enablePush, "Notifications are on for this device.")} className="btn-primary !min-h-0 h-11 !rounded-full !px-5">
            Turn on
          </button>
        </div>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-text-secondary">On for this device.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void run(sendTestPush, "Test sent. It should arrive in a few seconds.")} className="btn-secondary !min-h-0 h-11 !rounded-full !px-5">
              Send a test
            </button>
            <button type="button" disabled={busy} onClick={() => void run(disablePush, "Notifications are off for this device.")} className="btn-secondary !min-h-0 h-11 !rounded-full !px-5">
              Turn off
            </button>
          </div>
        </div>
      )}
      {state === "needs-install" && !install.iosManual && (
        <p className="text-[14px] text-text-secondary">Install the app first to get notifications on this device.</p>
      )}
      {message && (
        <p role="status" className="text-[13px] text-text-secondary">
          {message}
        </p>
      )}
    </section>
  );
}
