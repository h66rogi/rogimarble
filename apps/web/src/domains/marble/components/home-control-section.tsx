import type { ReactNode } from "react";

export function HomeControlSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="w-full border-b bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="space-y-5 px-4 py-4">{children}</div>
    </section>
  );
}
