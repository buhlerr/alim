export function PageHeader({
  title,
  description,
  eyebrow = "Aspyre // Infra",
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="space-y-2.5">
        <div className="flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.3em] text-signal">
          <span className="h-px w-7 bg-signal/60" />
          {eyebrow}
        </div>
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
