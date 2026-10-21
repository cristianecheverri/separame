import { useId } from 'react';
import { formatDuration, formatServicePrice } from '@shared/format';
import type { PriceDisplay } from '@shared/types';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import { ui } from '../../components/ui/styles';
import { formatCopInput, parseCopInput } from '../../lib/format';

/** "Precio en tu página" options (proposal price-option-editor). */
export const PRICE_DISPLAY_OPTIONS: { value: PriceDisplay; label: string; help: string }[] = [
  { value: 'fixed', label: 'Valor fijo', help: 'Es un precio de referencia: no se cobra en línea.' },
  { value: 'free', label: 'Sin costo', help: 'Tu página dice «Sin costo».' },
  { value: 'agreed', label: 'Precio a convenir', help: 'Tu página dice «Precio a convenir»: lo acuerdas en la cita.' },
  { value: 'hidden', label: 'No mostrar', help: 'Tu página no muestra ningún precio para este servicio.' },
];

/** Price text in the panel's service list ("Sin precio visible" when hidden). */
export function listPriceText(item: { priceCop: number | null; priceDisplay?: PriceDisplay }): string {
  return formatServicePrice(item) || 'Sin precio visible';
}

interface Props {
  display: PriceDisplay;
  price: string;
  onChange: (next: { display: PriceDisplay; price: string }) => void;
  error?: string;
  disabled?: boolean;
  preview: { name: string; durationMin: number; description: string };
}

export function PriceDisplayField({ display, price, onChange, error, disabled, preview }: Props) {
  const id = useId();
  const priceId = `${id}-price`;
  const helpId = `${id}-help`;
  const help = PRICE_DISPLAY_OPTIONS.find((o) => o.value === display)!.help;
  const previewPrice = formatServicePrice({ priceCop: display === 'fixed' ? parseCopInput(price) : null, priceDisplay: display });
  return (
    <fieldset className="border-0 m-0 p-0 min-w-0 flex flex-col gap-2" disabled={disabled}>
      <legend className={cx(ui.label, 'p-0 pb-2')}>Precio en tu página</legend>
      <div className="flex flex-wrap gap-2">
        {PRICE_DISPLAY_OPTIONS.map((o) => (
          <Chip key={o.value} selected={display === o.value} onClick={() => onChange({ display: o.value, price })} disabled={disabled}>
            {o.label}
          </Chip>
        ))}
      </div>
      {display === 'fixed' && (
        <div className="flex flex-col gap-[6px] pt-1">
          <label htmlFor={priceId} className="text-[13px] font-semibold text-ink-2">
            Valor de referencia
          </label>
          <div className="flex gap-2">
            <div className={ui.prefix} aria-hidden="true">
              COP $
            </div>
            <input
              id={priceId}
              type="text"
              inputMode="numeric"
              className={cx(ui.input, 'grow')}
              placeholder="Valor en pesos"
              value={price}
              aria-invalid={error ? true : undefined}
              aria-describedby={helpId}
              onChange={(e) => onChange({ display, price: formatCopInput(e.target.value) })}
            />
          </div>
        </div>
      )}
      {error ? (
        <div id={helpId} className="text-[13px] font-semibold text-warn-ink" role="alert">
          {error}
        </div>
      ) : (
        <div id={helpId} className={ui.help}>
          {help}
        </div>
      )}
      <div className="bg-surface rounded-[16px] py-3 px-[14px] flex flex-col gap-1">
        <span className="text-[12px] font-bold text-ink-2">Así se ve en tu página</span>
        <div className="flex justify-between items-center gap-[10px]">
          <span className="flex flex-col gap-[2px] min-w-0">
            <span className="font-bold text-[15px] [overflow-wrap:anywhere]">{preview.name.trim() || 'Nombre del servicio'}</span>
            <span className="text-[13px] text-muted">{[formatDuration(preview.durationMin), preview.description.trim()].filter(Boolean).join(' · ')}</span>
          </span>
          {previewPrice && <span className="font-bold text-[14px] whitespace-nowrap">{previewPrice}</span>}
        </div>
      </div>
    </fieldset>
  );
}
