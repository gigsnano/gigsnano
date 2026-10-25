import type { ReactNode } from "react";

interface IDsSectionProps {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

/** One chapter of the design-system page. */
export function DsSection({ id, eyebrow, title, description, children }: IDsSectionProps) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-14 first:border-t-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}
