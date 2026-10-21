import type { ReactNode } from 'react';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[16px] border-2 border-dashed border-line-strong px-5 py-7 flex flex-col items-center text-center gap-2">
      <div className="font-display font-extrabold text-[18px]">{title}</div>
      {children && <div className="text-[14px] text-muted leading-[1.45] max-w-[360px]">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
