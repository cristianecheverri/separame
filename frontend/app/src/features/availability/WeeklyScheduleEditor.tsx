import { useState } from 'react';
import { formatTime } from '@shared/format';
import { minutesOf, WEEKDAYS, type Weekday } from '@shared/time';
import type { TimeRange } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { PlusIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { PillSelect } from '../../components/ui/PillSelect';
import { Switch } from '../../components/ui/Switch';
import { DAY_LABELS, nextRange, sortRanges, timeStepsWith, type ScheduleDraft } from './scheduleModel';

interface Props {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  errors?: Partial<Record<Weekday, string>>;
  readOnly?: boolean;
}

interface Editing {
  day: Weekday;
  index: number;
  isNew: boolean;
}

const rangeLabel = (r: TimeRange) => `${formatTime(r.start)} – ${formatTime(r.end)}`;
const timeOptions = (current: string) => timeStepsWith(current).map((t) => ({ value: t, label: formatTime(t) }));

/** "Horario semanal" rows: switch, day, editable range chips, "+". */
export function WeeklyScheduleEditor({ value, onChange, errors = {}, readOnly }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draftRange, setDraftRange] = useState<TimeRange>({ start: '08:00', end: '12:00' });

  const setDay = (day: Weekday, patch: Partial<ScheduleDraft[Weekday]>) => onChange({ ...value, [day]: { ...value[day], ...patch } });

  const openEditor = (day: Weekday, index: number, isNew = false, range?: TimeRange) => {
    setDraftRange(range ?? value[day].ranges[index]);
    setEditing({ day, index, isNew });
  };

  const applyRange = () => {
    if (!editing) return;
    const ranges = [...value[editing.day].ranges];
    if (editing.isNew) ranges.push(draftRange);
    else ranges[editing.index] = draftRange;
    setDay(editing.day, { ranges: sortRanges(ranges) });
    setEditing(null);
  };

  const removeRange = () => {
    if (!editing) return;
    if (!editing.isNew) {
      const ranges = value[editing.day].ranges.filter((_, i) => i !== editing.index);
      setDay(editing.day, ranges.length ? { ranges } : { ranges: [], open: false });
    }
    setEditing(null);
  };

  const invalid = minutesOf(draftRange.end) <= minutesOf(draftRange.start);

  return (
    <>
      {WEEKDAYS.map((day) => {
        const d = value[day];
        const name = DAY_LABELS[day];
        const add = nextRange(d.ranges);
        return (
          <div key={day} className="border-t border-line">
            <div className="flex flex-wrap gap-3 items-center py-3 min-h-12">
              <Switch
                on={d.open}
                label={`Atender el ${name.toLowerCase()}`}
                disabled={readOnly}
                onToggle={() => setDay(day, d.open ? { open: false } : { open: true, ranges: d.ranges.length ? d.ranges : [{ start: '08:00', end: '12:00' }] })}
              />
              <div className="w-[96px] font-bold text-[15px]">{name}</div>
              {d.open ? (
                <div className="flex flex-wrap gap-2 grow items-center basis-full sm:basis-0 min-w-0">
                  {d.ranges.map((r, i) => (
                    <button
                      key={`${r.start}-${i}`}
                      type="button"
                      disabled={readOnly}
                      onClick={() => openEditor(day, i)}
                      aria-label={`Editar franja del ${name.toLowerCase()}: ${rangeLabel(r)}`}
                      className="h-10 px-[14px] rounded-full bg-primary-soft text-primary flex items-center font-bold text-[14px] whitespace-nowrap hit-44 hover:bg-primary-line disabled:cursor-not-allowed disabled:hover:bg-primary-soft"
                    >
                      {rangeLabel(r)}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={`Agregar franja el ${name.toLowerCase()}`}
                    disabled={readOnly || !add}
                    onClick={() => add && openEditor(day, d.ranges.length, true, add)}
                    className="hit-44 w-10 h-10 rounded-full border-2 border-dashed border-line-strong bg-white text-ink-2 flex items-center justify-center hover:border-ink-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <PlusIcon size={16} />
                  </button>
                </div>
              ) : (
                <span className="text-[14px] text-muted">Cerrado</span>
              )}
            </div>
            {errors[day] && d.open && (
              <div className="text-[13px] font-semibold text-warn-ink pb-3 -mt-1" role="alert">
                {name}: {errors[day]}
              </div>
            )}
          </div>
        );
      })}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Franja del ${DAY_LABELS[editing.day].toLowerCase()}` : ''}
        description="Elige desde y hasta qué hora te pueden reservar."
        footer={
          <>
            <button type="button" disabled={invalid} onClick={applyRange} className="h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] hover:bg-primary-dark grow sm:grow-0 disabled:bg-disabled disabled:text-muted disabled:cursor-not-allowed">
              Listo
            </button>
            <button type="button" onClick={removeRange} className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] text-ink grow sm:grow-0">
              {editing?.isNew ? 'Cancelar' : 'Quitar franja'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-[6px]">
            <span className="text-[14px] font-semibold">Desde</span>
            <PillSelect variant="field" label="Desde" value={draftRange.start} options={timeOptions(draftRange.start)} onChange={(start) => setDraftRange({ ...draftRange, start })} />
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className="text-[14px] font-semibold">Hasta</span>
            <PillSelect variant="field" label="Hasta" value={draftRange.end} options={timeOptions(draftRange.end)} onChange={(end) => setDraftRange({ ...draftRange, end })} />
          </div>
        </div>
        <div className={cx('text-[13px]', invalid ? 'text-warn-ink font-semibold' : 'text-muted')}>
          {invalid ? 'La hora final debe ser después de la inicial.' : `${rangeLabel(draftRange)}, hora de Colombia.`}
        </div>
      </Modal>
    </>
  );
}
