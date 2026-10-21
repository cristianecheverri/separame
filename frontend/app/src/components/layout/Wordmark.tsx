import { cx } from '../ui/cx';

export function Wordmark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={cx('font-display font-extrabold tracking-[-0.5px] leading-none', className)} style={{ fontSize: size }}>
      sepárame<span className="text-accent">.</span>
    </span>
  );
}
