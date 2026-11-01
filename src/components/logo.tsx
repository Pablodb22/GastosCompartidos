export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1c3b69" />
      <path d="M9 21.5V10.5h3.2v11zM14.4 21.5V14h3.2v7.5zM19.8 21.5v-4.5H23v4.5z" fill="#fff" />
    </svg>
  );
}
