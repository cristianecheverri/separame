/** Inline SVG icons copied from the mockups (24×24 viewBox, stroke icons). */
import type { ComponentChildren } from 'preact';

interface IconProps {
  size?: number;
  strokeWidth?: number;
  stroke?: string;
  class?: string;
}

function Svg({ size = 20, strokeWidth = 2, stroke = 'currentColor', class: className, children }: IconProps & { children: ComponentChildren }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={className}
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: IconProps) => <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>;
export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>;
export const Check = (p: IconProps) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const Clock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const Pin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);
export const CalendarPlus = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M12 13v5M9.5 15.5h5" />
  </Svg>
);
export const CalendarX = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    <path d="M10 14l4 4M14 14l-4 4" />
  </Svg>
);
export const Mail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Svg>
);
export const Phone = (p: IconProps) => (
  <Svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></Svg>
);
export const Swap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3L4 7l4 4" />
    <path d="M4 7h16" />
    <path d="M16 21l4-4-4-4" />
    <path d="M20 17H4" />
  </Svg>
);
export const Bell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Svg>
);
export const Cross = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const Alert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Svg>
);
export const Users = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
    <path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
  </Svg>
);
export const Download = (p: IconProps) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>;

/** Brand marks for "Otros calendarios" (filled, 48×48 viewBox). */
export const GoogleCalendarMark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="6" width="36" height="36" rx="5" fill="#fff" />
    <path d="M11 6h26a5 5 0 0 1 5 5v1H6v-1a5 5 0 0 1 5-5z" fill="#4285F4" />
    <rect x="36" y="11" width="6" height="25" fill="#4285F4" />
    <path d="M6 11h6v25H6z" fill="#FBBC04" />
    <path d="M6 36h30v6H11a5 5 0 0 1-5-5z" fill="#34A853" />
    <path d="M36 36h6l-6 6z" fill="#EA4335" />
    <text x="24" y="31.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="15" fill="#4285F4">31</text>
  </svg>
);
export const OutlookMark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect x="17" y="10" width="25" height="28" rx="3.5" fill="#28A8EA" />
    <path d="M17 17l12.5 9L42 17" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" />
    <rect x="6" y="13" width="22" height="22" rx="3.5" fill="#0A64AD" />
    <ellipse cx="17" cy="24" rx="5.4" ry="6.6" fill="none" stroke="#fff" stroke-width="3" />
  </svg>
);
