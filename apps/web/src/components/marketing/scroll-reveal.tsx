"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Reveals children on first scroll into view with a heavy, spring-eased
 * fade-up + de-blur. Motion is disabled for `prefers-reduced-motion`. Only
 * transform/opacity/filter animate — no layout thrash.
 */
export function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-[opacity,transform,filter] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        "motion-reduce:!translate-y-0 motion-reduce:!opacity-100 motion-reduce:!blur-0 motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-10 opacity-0 blur-[6px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
