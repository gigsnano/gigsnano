export function VerifiedBadge({ label = "Payment verified" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10 1.5l2.1 1.7 2.68-.36 1.03 2.5 2.5 1.03-.36 2.68L19.65 11l-1.7 2.1.36 2.68-2.5 1.03-1.03 2.5-2.68-.36L10 20.65l-2.1-1.7-2.68.36-1.03-2.5-2.5-1.03.36-2.68L.35 11l1.7-2.1-.36-2.68 2.5-1.03 1.03-2.5 2.68.36L10 1.5zm3.85 6.35a.75.75 0 0 0-1.2-.9l-3.4 4.53-1.62-1.62a.75.75 0 1 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.13-.08l3.9-5.24z"
          clipRule="evenodd"
        />
      </svg>
      {label}
    </span>
  );
}
