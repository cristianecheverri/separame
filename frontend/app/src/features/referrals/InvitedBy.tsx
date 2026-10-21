import { usePublicReferral } from './queries';

/** "Te invitó Dra. Laura Pérez" chip on the signup card (proposal referral-signup-invited). Nothing for unknown codes. */
export function InvitedBy({ code }: { code: string | null }) {
  const referral = usePublicReferral(code);
  if (!referral.data) return null;
  return (
    <div className="self-start flex items-center gap-2 bg-primary-soft rounded-full py-1 pl-1 pr-[14px] text-[13px] font-semibold text-primary">
      <span aria-hidden="true" className="w-7 h-7 rounded-full bg-accent text-ink flex items-center justify-center font-display font-extrabold text-[12px]">
        {referral.data.initials}
      </span>
      Te invitó {referral.data.name}
    </div>
  );
}
