// Household members and per-module sharing (LIVORA AI)
import { PageHeader } from "@/components/layout/PageHeader";
import { ModuleIcon, Toggle } from "@/components/ui/livora";
import { Card, Divider, SectionHeader, StatusPill } from "@/components/ui/primitives";
import { useActiveProfile } from "@/lib/profile";
import { MODULES, type ModuleId } from "@/lib/modules";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useMembers, useScopes, useSetScope } from "@/hooks/life";

const scopes: Array<{ module: ModuleId; label: string }> = [
  { module: "kitchen", label: "Pantry, shopping list and meal plan" },
  { module: "personal", label: "Shared calendar and events" },
  { module: "admin", label: "Bills and documents" },
  { module: "mobility", label: "Commute and trip sharing" },
  { module: "circular", label: "Wardrobe and listings" },
];

export function MembersPage() {
  const { active, members, setActive } = useActiveProfile();
  const membersQuery = useMembers();
  const scopesQuery = useScopes();
  const setScope = useSetScope();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader eyebrow="Household" title="People and privacy" subtitle="Share what helps everyone. Keep the rest private." />

      <QueryBoundary query={membersQuery} rows={2}>
        {() => (
      <section className="space-y-2">
        <SectionHeader>Profiles</SectionHeader>
        <Card className="px-3 py-2">
          {members.map((m, i) => (
            <div key={m.id}>
              {i > 0 && <Divider />}
              <button
                type="button"
                onClick={() => setActive(m.id)}
                aria-pressed={active?.id === m.id}
                className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[24px] px-2 text-left transition-colors hover:bg-surface-elevated"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent-subtle text-[15px] text-accent">
                    {m.name.slice(0, 1)}
                  </span>
                  <span>
                    <span className="block text-[16px] leading-tight">{m.name}</span>
                    <span className="text-[13px] capitalize text-text-tertiary">{m.role}</span>
                  </span>
                </span>
                {active?.id === m.id && <StatusPill tone="accent">Viewing as</StatusPill>}
              </button>
            </div>
          ))}
        </Card>
      </section>
        )}
      </QueryBoundary>

      <section className="space-y-2">
        <SectionHeader>Shared with the household</SectionHeader>
        <QueryBoundary query={scopesQuery} rows={2}>
          {(shared) => (
        <Card className="px-5 py-2">
          {scopes.map((s, i) => (
            <div key={s.module}>
              {i > 0 && <Divider />}
              <div className="flex min-h-[68px] items-center justify-between gap-4">
                <span className="flex items-center gap-3">
                  <ModuleIcon module={s.module} size={40} />
                  <span>
                    <span className="block text-[16px] leading-tight">{MODULES[s.module].label}</span>
                    <span className="text-[13px] text-text-tertiary">{s.label}</span>
                  </span>
                </span>
                <Toggle
                  checked={shared[s.module]}
                  onChange={(v) => setScope.mutate({ module: s.module, enabled: v })}
                  label={`Share ${MODULES[s.module].label}`}
                />
              </div>
            </div>
          ))}
        </Card>
          )}
        </QueryBoundary>
        <p className="text-meta">Sharing choices are stored by the API. Per-member enforcement is not built yet.</p>
      </section>
    </div>
  );
}
