export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ata-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
      <circle cx="11" cy="11" r="7.2" stroke="url(#ata-logo)" strokeWidth="3" />
      <path d="M15.8 15.8 20.5 20.5" stroke="url(#ata-logo)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
