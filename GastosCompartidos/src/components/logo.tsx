export function Logo({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.6" stopColor="#d946ef" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="url(#logo-g)" />
      <path
        d="M16 24.5s-7.5-4.4-7.5-10a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.6-7.5 10-7.5 10z"
        fill="#fff"
      />
      <text x="16" y="18.6" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#c026d3" fontFamily="system-ui, sans-serif">
        €
      </text>
    </svg>
  );
}
