import { Pin } from '../components/icons';
import { RevealedNotice } from '../components/ui';
import { StepTitle, type StepId } from './FlowChrome';

export interface ReviewRow {
  label: string;
  value: string;
  sub: string;
  /** Step to jump back to; null hides "Cambiar" (e.g. the only service). */
  step: StepId | null;
  /** Screen-reader label of "Cambiar" (default: "Cambiar <label>"). */
  changeLabel?: string;
}

interface Props {
  rows: ReviewRow[];
  address: string;
  error: string | null;
  onEdit: (step: StepId) => void;
  titleRef: preact.Ref<HTMLHeadingElement>;
}

export function StepReview({ rows, address, error, onEdit, titleRef }: Props) {
  return (
    <section class="flex flex-col gap-3.5">
      <StepTitle titleRef={titleRef}>¿Todo bien?</StepTitle>
      <div class="bg-primary-soft rounded-[22px] py-1.5 px-4">
        {rows.map((row, i) => (
          <div key={row.label} class={`flex justify-between items-center gap-2.5 py-3 ${i > 0 ? 'border-t border-primary-line' : ''}`}>
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-[13px] text-ink-2">{row.label}</span>
              <span class="font-bold text-[15px] break-words">{row.value}</span>
              {row.sub && <span class="text-[13px] text-ink-2 [overflow-wrap:anywhere]">{row.sub}</span>}
            </div>
            {row.step && (
            <button
              type="button"
              onClick={() => row.step && onEdit(row.step)}
              aria-label={row.changeLabel ?? `Cambiar ${row.label.toLowerCase()}`}
              class="h-11 px-3 border-0 bg-transparent font-bold text-[14px] text-primary shrink-0 rounded-full hover:text-primary-dark"
            >
              Cambiar
            </button>
            )}
          </div>
        ))}
      </div>
      {address && (
        <div class="flex gap-2.5 items-start text-[14px] text-ink-2 leading-[1.45]">
          <Pin size={20} class="shrink-0" />
          <span>{address}</span>
        </div>
      )}
      {error && <RevealedNotice message={error} />}
    </section>
  );
}
