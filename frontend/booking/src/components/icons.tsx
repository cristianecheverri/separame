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
export const Cross = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const Alert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Svg>
);
