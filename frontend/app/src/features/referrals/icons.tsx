/** Icons of the referral boards (24×24, currentColor), same strokes as the mockups. */
import type { SVGProps } from 'react';

type Props = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false,
});

export function GiftIcon({ size = 20, strokeWidth = 2, ...rest }: Props) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...rest}>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8v13M3 12.5h18" />
      <path d="M12 8C10.5 5 7 4.5 7 6.5S10 8 12 8c2 0 5-.5 5-1.5S13.5 5 12 8" />
    </svg>
  );
}

export function ShareNodesIcon({ size = 16, strokeWidth = 2, ...rest }: Props) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...rest}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

export function UserPlusIcon({ size = 15, strokeWidth = 2, ...rest }: Props) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} {...rest}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}
