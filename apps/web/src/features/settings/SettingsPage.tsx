// Settings (Design System §10 #12)
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Divider, Row, SectionHeader } from "@/components/ui/primitives";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Settings" />

      <section className="space-y-2">
        <SectionHeader>Household</SectionHeader>
        <Card className="px-5 py-2">
          <Row label="Name" value="The Sharma Household" />
          <Divider />
          <Row label="Language" value="English · Tamil · Tanglish" />
          <Divider />
          <Row label="Currency" value="INR ₹" />
        </Card>
      </section>

      <section className="space-y-2">
        <SectionHeader>Voice</SectionHeader>
        <Card className="px-5 py-2">
          <Row label="Input language" value="Auto (mixed)" />
          <Divider />
          <Row label="Wake behavior" value="Tap to talk" />
        </Card>
      </section>

      <section className="space-y-2">
        <SectionHeader>Approvals</SectionHeader>
        <Card className="px-5 py-2">
          <Row label="Purchases" value="Always ask" />
          <Divider />
          <Row label="Vendor calls" value="Always ask" />
          <Divider />
          <Row label="Low-risk reminders" value="Automatic" />
        </Card>
      </section>

      <section className="space-y-2">
        <SectionHeader>Data</SectionHeader>
        <Card className="px-5 py-2">
          <Row label="Canonical state" value="PostgreSQL · server-side" />
          <Divider />
          <Row label="Receipt storage" value="Protected bucket" />
        </Card>
      </section>

      <p className="text-meta">
        Demo build — settings are illustrative and not yet persisted.
      </p>
    </div>
  );
}
