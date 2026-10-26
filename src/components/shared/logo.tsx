export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <circle cx="32" cy="27" r="9" className="fill-solar" />
      <g className="stroke-solar" strokeWidth="3.5" strokeLinecap="round">
        <path d="M32 9v5M32 40v5M14 27h5M45 27h5M19.3 14.3l3.5 3.5M41.2 36.2l3.5 3.5M44.7 14.3l-3.5 3.5M22.8 36.2l-3.5 3.5" />
      </g>
      <path d="M12 52h40" className="stroke-primary-foreground" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M18 52l6-7h16l6 7" fill="none" className="stroke-primary-foreground" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
