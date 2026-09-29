export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && (
          <p className="mt-3 max-w-[56ch] text-[17px] leading-snug tracking-[-0.01em] text-text-secondary">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}
