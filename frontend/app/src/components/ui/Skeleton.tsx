import { cx } from './cx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />;
}

/** Loading placeholder for a whole page section. */
export function SectionSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('bg-white rounded-[24px] p-[22px] flex flex-col gap-3', className)} aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-[16px]" />
      ))}
    </div>
  );
}
