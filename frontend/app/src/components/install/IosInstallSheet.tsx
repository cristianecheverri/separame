import { Modal } from '../ui/Modal';

function ShareGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M8 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

function AddGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#15241D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/** iOS has no install API: two illustrated steps in Safari. */
export function IosInstallSheet({ open, onClose, otherBrowser }: { open: boolean; onClose: () => void; otherBrowser: boolean }) {
  const steps = [
    { glyph: <ShareGlyph />, text: <>Toca <strong>Compartir</strong> en la barra de Safari.</> },
    { glyph: <AddGlyph />, text: <>Elige <strong>«Agregar a inicio»</strong> y luego <strong>Agregar</strong>.</> },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Instala Sepárame en tu iPhone"
      description={otherBrowser ? 'Abre separame.app en Safari para instalarla: este navegador no puede agregarla a tu pantalla de inicio.' : 'Son dos pasos y queda con su ícono, como cualquier app.'}
      footer={
        <button type="button" onClick={onClose} className="h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] grow sm:grow-0" data-autofocus>
          Entendido
        </button>
      }
    >
      <ol className="m-0 p-0 list-none flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-[14px] items-center bg-surface rounded-[16px] p-[14px]">
            <span className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center font-bold text-[14px] shrink-0">{i + 1}</span>
            <span className="w-12 h-12 rounded-[14px] bg-white flex items-center justify-center shrink-0">{s.glyph}</span>
            <span className="text-[15px] leading-[1.4]">{s.text}</span>
          </li>
        ))}
      </ol>
      <div className="bg-accent-soft rounded-[14px] px-4 py-3 text-[14px] leading-[1.45]">En iPhone, los avisos de tus citas solo llegan si Sepárame está instalada en tu pantalla de inicio.</div>
    </Modal>
  );
}
