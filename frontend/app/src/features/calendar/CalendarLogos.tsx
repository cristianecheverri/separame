/** Small calendar app marks (same simplified style as the booking emails). */

export function GoogleCalendarLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#FFFFFF" />
      <path d="M6 2h12a4 4 0 0 1 4 4H2a4 4 0 0 1 4-4z" fill="#4285F4" />
      <path d="M22 6v12a4 4 0 0 1-2 3.46V6z" fill="#EA4335" />
      <path d="M2 18h20a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" fill="#34A853" />
      <path d="M2 6h2v15.46A4 4 0 0 1 2 18z" fill="#FBBC04" />
      <text x="13" y="16.6" textAnchor="middle" fontFamily="Figtree, system-ui, sans-serif" fontWeight="800" fontSize="9.5" fill="#4285F4">
        31
      </text>
    </svg>
  );
}

export function OutlookLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#0078D4" />
      <ellipse cx="12" cy="12" rx="4.6" ry="5.4" fill="none" stroke="#FFFFFF" strokeWidth="2.6" />
    </svg>
  );
}

export function AppleCalendarLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2.75" y="3.75" width="18.5" height="17.5" rx="4" fill="#FFFFFF" stroke="#15241D" strokeWidth="1.5" />
      <path d="M2.75 8a4 4 0 0 1 4-4.25h10.5a4 4 0 0 1 4 4.25z" fill="#FF3B30" />
      <path d="M8 2.5v3M16 2.5v3" stroke="#15241D" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 12h2M11 12h2M15 12h2M7 16h2M11 16h2" stroke="#15241D" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
