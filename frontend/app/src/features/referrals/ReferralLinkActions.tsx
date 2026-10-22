import { useEffect, useRef, useState } from 'react';
import { referralLinkLabel } from '@shared/referrals';
import { CopyIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { copyText } from '../../lib/clipboard';
import { shareOrCopy, trackShare } from '../../lib/share';
import { ShareNodesIcon } from './icons';

const SHARE_TEXT = 'Agenda tus citas en línea con Sepárame. Regístrate con mi enlace:';

/** The invitation link box. */
export function ReferralLinkBox({ url }: { url: string }) {
  return <div className="bg-surface rounded-[14px] py-3 px-[14px] font-bold text-[15px] [overflow-wrap:anywhere]">{referralLinkLabel(url)}</div>;
}

/** "Copiar" (label turns into "¡Copiado!") and "Compartir" (native share sheet; copies when there is none). */
export function ReferralLinkButtons({ url }: { url: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await copyText(url))) return toast.error('No pudimos copiar el enlace.');
    trackShare('copied', 'referral_link');
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2_500);
  };
  const share = async () => {
    const outcome = await shareOrCopy({ title: 'Sepárame', text: SHARE_TEXT, url });
    trackShare(outcome, 'referral_link');
    if (outcome === 'copied') toast.success('Enlace copiado. Pégalo donde quieras.');
    else if (outcome === 'failed') toast.error('No pudimos copiar el enlace.');
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copiar tu enlace de invitación"
        className="h-11 px-[18px] rounded-full border-2 border-line-strong bg-white font-bold text-[14px] text-ink inline-flex gap-2 items-center hover:border-ink-2 transition-colors"
      >
        <CopyIcon size={16} /> <span aria-live="polite">{copied ? '¡Copiado!' : 'Copiar'}</span>
      </button>
      <button
        type="button"
        onClick={() => void share()}
        className="h-11 px-[18px] rounded-full bg-primary text-white font-bold text-[14px] inline-flex gap-2 items-center hover:bg-primary-dark transition-colors"
      >
        <ShareNodesIcon size={16} /> Compartir
      </button>
    </div>
  );
}
