/** Shared class strings with the mockups' exact values (line A). */
export const ui = {
  h1: 'm-0 font-display font-extrabold text-[28px] leading-[1.15] sm:text-[34px] sm:leading-[1.2] tracking-[-0.8px]',
  h2: 'm-0 font-display font-extrabold text-[20px]',
  h2sm: 'm-0 font-display font-extrabold text-[18px]',
  card: 'bg-white rounded-[24px] p-[18px] sm:p-[22px] flex flex-col',
  label: 'text-[14px] font-semibold',
  help: 'text-[12px] text-muted',
  input:
    'h-12 w-full min-w-0 rounded-[14px] border-2 border-line bg-white px-[14px] text-[15px] text-ink outline-none focus-visible:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(11,110,79,0.15)] disabled:bg-surface disabled:text-muted disabled:cursor-not-allowed',
  textarea:
    'w-full min-w-0 rounded-[14px] border-2 border-line bg-white px-[14px] py-3 text-[15px] text-ink resize-none outline-none focus-visible:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(11,110,79,0.15)] disabled:bg-surface disabled:cursor-not-allowed',
  prefix: 'h-12 rounded-[14px] bg-surface px-[14px] flex items-center font-semibold text-[15px] shrink-0',
  btnPrimary:
    'h-[46px] px-5 rounded-full bg-primary text-white font-bold text-[14px] inline-flex gap-2 items-center justify-center hover:bg-primary-dark transition-colors disabled:bg-disabled disabled:text-muted disabled:cursor-not-allowed',
  btnOutline:
    'h-[46px] px-[18px] rounded-full border-2 border-line-strong bg-white font-bold text-[14px] text-ink inline-flex gap-2 items-center justify-center hover:border-ink-2 transition-colors disabled:cursor-not-allowed disabled:text-muted',
  btnLocked: 'bg-disabled text-muted cursor-not-allowed hover:bg-disabled',
  chip: 'h-11 px-4 rounded-full font-semibold text-[14px] border-2 text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  chipOn: 'bg-accent border-accent',
  chipOff: 'bg-white border-line hover:border-line-strong',
  iconBtn:
    'w-11 h-11 rounded-full flex items-center justify-center text-ink-2 hover:bg-[rgba(21,36,29,0.07)] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  linkBtn: 'font-bold text-primary hover:text-primary-dark text-left',
  badge: 'text-[12px] font-bold py-[5px] px-[10px] rounded-full whitespace-nowrap',
} as const;
