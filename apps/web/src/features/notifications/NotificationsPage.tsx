import { Link } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { ModuleIcon } from "@/components/ui/livora";
import { useMarkRead, useNotifications } from "@/hooks/life";
import { ago } from "@/lib/format";

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
            <div className="space-y-3">
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
