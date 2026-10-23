import { cx } from '../../components/ui/cx';
import { ALL_PROS, setActingSelection } from '../../lib/actingPro';
import { useActing } from '../../lib/queries';
import { allDotBackground, memberColor } from './memberColors';
import { memberChipLabel } from './teamText';

interface Props {
  /** «Todos» (merged view): only on Agenda and Citas; elsewhere «Todos» acts on the owner. */
  allowAll: boolean;
  /** 'bar': full-width strip under the phone header; 'inline': chips inside the page (desktop). */
  variant: 'bar' | 'inline';
  className?: string;
}

const chip = 'h-11 px-4 rounded-full text-[14px] text-ink border-2 inline-flex items-center gap-2 shrink-0 whitespace-nowrap transition-colors';
const dot = 'w-3 h-3 rounded-full shrink-0 shadow-[inset_0_0_0_1px_rgba(21,36,29,0.25)]';

/** Team plan: «Todos · Laura (tú) · Julián · Sara» (boards team-owner-agenda). Nothing without a team. */
export function ProSelector({ allowAll, variant, className }: Props) {
  const { members, selection, ownerId } = useActing();
  if (members.length < 2) return null;
  const selected = !allowAll && selection === ALL_PROS ? ownerId : selection;
  const options = [
    ...(allowAll ? [{ id: ALL_PROS, label: 'Todos', background: allDotBackground(members.length) }] : []),
    ...members.map((m, i) => ({ id: m.proId, label: memberChipLabel(m), background: memberColor(i).bg })),
  ];
  return (
    <div
      role="group"
      aria-label="Profesional"
      className={cx(
        variant === 'bar'
          ? 'bg-white border-b border-line px-4 py-[10px] flex gap-2 overflow-x-auto [scrollbar-width:none]'
          : 'flex flex-wrap gap-2',
        className,
      )}
    >
      {options.map((o) => {
        const on = o.id === selected;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => setActingSelection(o.id)}
            className={cx(chip, on ? 'bg-primary-soft border-primary font-bold' : 'bg-white border-line font-semibold hover:border-line-strong')}
          >
            <span aria-hidden="true" className={dot} style={{ background: o.background }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Routes where the selector applies, and whether «Todos» is offered there. */
export function selectorFor(pathname: string): { allowAll: boolean } | null {
  if (pathname === '/' || pathname === '/appointments') return { allowAll: true };
  if (['/services', '/availability', '/clients', '/stats'].includes(pathname)) return { allowAll: false };
  return null;
}
