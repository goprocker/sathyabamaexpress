/** LIVORA AI mark: a rounded tile with an open loop, tied to the module colours. */
export function LivoraMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="lv-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3F8352" />
          <stop offset="0.55" stopColor="#2A9A8B" />
          <stop offset="1" stopColor="#3F86C4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="13" fill="url(#lv-bg)" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="12.5" fill="none" stroke="rgba(255,255,255,0.35)" />
      <path
        d="M14 10v15.5a3.5 3.5 0 0 0 3.5 3.5H27"
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27.5" cy="13.5" r="2.6" fill="#F4C46E" />
    </svg>
  );
}
