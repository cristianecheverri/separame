import { useQuery } from '@tanstack/react-query';
import { apiPaths, type SlugCheckResponse } from '@shared/api';
import { slugProblem, slugify } from '@shared/slug';
import { useId } from 'react';
import { cx } from '../../components/ui/cx';
import { ui } from '../../components/ui/styles';
import { api } from '../../lib/api';
import { useDebounced } from '../../lib/useDebounced';

const PROBLEM: Record<string, string> = {
  too_short: 'El enlace debe tener al menos 3 caracteres.',
  too_long: 'El enlace puede tener máximo 40 caracteres.',
  invalid: 'Usa solo letras minúsculas, números y guiones.',
  reserved: 'Ese enlace está reservado, prueba otro.',
};

export type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'current';

/**
 * Live availability of a slug (debounced GET /me/slug-check). `ownSlug` (team forms): the signed-in
 * professional's own link, which the server reports as free for them but a member/team can't use.
 */
export function useSlugCheck(slug: string, currentSlug: string | null, ownSlug: string | null = null) {
  const debounced = useDebounced(slug, 400);
  const problem = slugProblem(slug);
  const isCurrent = !!currentSlug && slug === currentSlug;
  const isOwn = !!ownSlug && slug === ownSlug && !isCurrent;
  const check = useQuery({
    queryKey: ['slug-check', debounced],
    queryFn: () => api.get<SlugCheckResponse>(apiPaths.slugCheck(debounced)),
    enabled: !slugProblem(debounced) && debounced !== currentSlug,
    staleTime: 30_000,
  });
  let status: SlugStatus;
  if (!slug) status = 'idle';
  else if (problem) status = 'invalid';
  else if (isCurrent) status = 'current';
  else if (isOwn) status = 'taken';
  else if (debounced !== slug || check.isFetching || !check.data) status = 'checking';
  else status = check.data.available ? 'available' : check.data.problem === 'taken' ? 'taken' : 'invalid';
  const message =
    status === 'invalid'
      ? PROBLEM[problem ?? check.data?.problem ?? 'invalid']
      : isOwn
        ? 'Ese es tu propio enlace: elige otro.'
        : status === 'taken' ? 'Ese enlace ya lo tiene otra persona.' : null;
  return { status, message, suggestion: status === 'taken' && !isOwn ? (check.data?.suggestion ?? null) : null };
}

interface Props {
  value: string;
  onChange: (slug: string) => void;
  check: ReturnType<typeof useSlugCheck>;
  host: string;
  disabled?: boolean;
  /** «Tu enlace» by default (team plan: a member's or the team page's link). */
  label?: string;
  /** Status line for the slug already saved (default: «Es tu enlace actual.»). */
  currentText?: string;
}

/** "separame.app/<slug>" input with live availability. */
export function SlugField({ value, onChange, check, host, disabled, label = 'Tu enlace', currentText = 'Es tu enlace actual.' }: Props) {
  const id = useId();
  const { status, message, suggestion } = check;
  return (
    <div className="flex flex-col gap-[6px] min-w-0">
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <div className={cx('flex items-center h-12 rounded-[14px] border-2 bg-white min-w-0 focus-within:shadow-[0_0_0_3px_rgba(11,110,79,0.15)]', status === 'invalid' || status === 'taken' ? 'border-warn' : 'border-line focus-within:border-primary', disabled && 'bg-surface')}>
        <span className="pl-[14px] text-[15px] font-semibold text-muted whitespace-nowrap shrink-0">{host}/</span>
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={`${id}-status`}
          aria-invalid={status === 'invalid' || status === 'taken' || undefined}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
          onBlur={() => onChange(slugify(value) || value)}
          className="h-full grow min-w-0 bg-transparent pr-[14px] text-[15px] font-semibold text-ink outline-none focus-visible:outline-none"
        />
      </div>
      <div id={`${id}-status`} aria-live="polite" className="text-[13px] min-h-[18px]">
        {status === 'checking' && <span className="text-muted">Revisando…</span>}
        {status === 'available' && <span className="font-semibold text-primary">¡Está libre!</span>}
        {status === 'current' && <span className="text-muted">{currentText}</span>}
        {message && (
          <span className="font-semibold text-warn-ink">
            {message}
            {suggestion && (
              <>
                {' '}
                <button type="button" className="font-bold text-primary underline underline-offset-2 hit-44" onClick={() => onChange(suggestion)}>
                  Usar «{suggestion}»
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export const slugReady = (status: SlugStatus) => status === 'available' || status === 'current';
