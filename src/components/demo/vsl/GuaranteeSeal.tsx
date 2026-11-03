import { useTranslations } from 'next-intl';

/**
 * The gold 30 day guarantee seal, with its two ribbons, as on the checkout.
 * @param props Component props.
 * @param props.className Size classes; the seal scales with its font size.
 * @returns The seal.
 */
export const GuaranteeSeal = (props: { className?: string }) => {
  const t = useTranslations('DemoPage');

  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 ${props.className ?? 'text-[10px]'}`}
    >
      <span className="absolute top-[70%] left-[22%] h-[2.2em] w-[1.6em] rotate-[18deg] bg-[#9b1c1c] [clip-path:polygon(0_0,100%_0,100%_100%,50%_80%,0_100%)]" />
      <span className="absolute top-[70%] right-[22%] h-[2.2em] w-[1.6em] -rotate-[18deg] bg-[#9b1c1c] [clip-path:polygon(0_0,100%_0,100%_100%,50%_80%,0_100%)]" />
      <span className="relative flex size-[6em] flex-col items-center justify-center rounded-full bg-gradient-to-br from-[#fbe39a] via-[#e0b235] to-[#b9851c] text-center leading-none font-black text-[#5b1a12] shadow-md ring-[0.35em] ring-[#f1cd61]">
        <span className="text-[0.8em] tracking-wide uppercase">{t('video_seal_top')}</span>
        <span className="text-[2.2em]">30</span>
        <span className="text-[0.8em] tracking-wide uppercase">{t('video_seal_bottom')}</span>
      </span>
    </span>
  );
};
