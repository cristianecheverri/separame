import { Modal } from '../../components/ui/Modal';
import { useActing } from '../../lib/queries';
import { initials } from '@shared/format';
import { memberColor } from './memberColors';

interface Props {
  onPick: (proId: string) => void;
  onClose: () => void;
}

/** Team plan, «Nueva cita» under «Todos»: first, whose agenda it goes to. */
export function PickProModal({ onPick, onClose }: Props) {
  const { members } = useActing();
  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva cita"
      description="¿Con quién es la cita?"
      footer={
        <button type="button" onClick={onClose} className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] text-ink grow sm:grow-0">
          Volver
        </button>
      }
    >
      <ul className="m-0 p-0 list-none flex flex-col gap-2" aria-label="Profesionales">
        {members.map((m, i) => {
          const color = memberColor(i);
          return (
            <li key={m.proId}>
              <button
                type="button"
                onClick={() => onPick(m.proId)}
                className="w-full min-h-16 flex items-center gap-[14px] p-3 rounded-[18px] border-2 border-line bg-white text-left hover:border-primary transition-colors"
              >
                <span aria-hidden="true" className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 font-display font-extrabold text-[16px]" style={{ background: color.bg, color: color.fg }}>
                  {initials(m.name)}
                </span>
                <span className="flex flex-col gap-[2px] min-w-0">
                  <span className="font-bold text-[15px] [overflow-wrap:anywhere]">
                    {m.name}
                    {m.isOwner && <span className="font-semibold text-muted"> · tú</span>}
                  </span>
                  <span className="text-[13px] text-muted">{m.title}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
