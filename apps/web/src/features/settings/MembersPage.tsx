// Household members (Design System §10 #13)
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Divider, SectionHeader, StatusPill } from "@/components/ui/primitives";

const members = [
  { name: "Priya", role: "Owner", approvals: "All actions" },
  { name: "Arun", role: "Member", approvals: "Kitchen only" },
];

export function MembersPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Members"
        subtitle="Who shares this household."
      />
      <section className="space-y-2">
        <SectionHeader>People</SectionHeader>
        <Card className="px-5 py-2">
          {members.map((m, i) => (
            <div key={m.name}>
              {i > 0 && <Divider />}
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-accent-subtle text-small font-medium text-accent">
                    {m.name.slice(0, 1)}
                  </span>
                  <div>
                    <p className="text-small font-medium">{m.name}</p>
                    <p className="text-meta">{m.role}</p>
                  </div>
                </div>
                <StatusPill tone="neutral">{m.approvals}</StatusPill>
              </div>
            </div>
          ))}
        </Card>
      </section>
      <p className="text-meta">
        Multi-member households and shared approvals are a stretch goal (PRD §16).
      </p>
    </div>
  );
}
