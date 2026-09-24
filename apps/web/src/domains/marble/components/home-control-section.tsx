import type { ReactNode } from "react";

export function HomeControlSection({
  title,
  action,
  children,
  emphasis = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <section aria-label={title} className={emphasis
      ? "w-full border-y-2 border-primary bg-primary/5"
      : "w-full border-b bg-background"}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="space-y-4 p-3">{children}</div>
    </section>
  );
}
