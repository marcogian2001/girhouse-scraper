import { Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The nudge to turn the volume up before starting, drawn as the iPhone's volume bar: a
 * tall pill that fills up from the bottom, again and again, with the speaker at its foot.
 * @param props Component props.
 * @param props.isShown Whether to show it: only the new video has it.
 * @returns The hint, or nothing.
 */
export const VolumeHint = (props: { isShown: boolean }) => {
  const t = useTranslations('DemoPage');

  if (!props.isShown) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <span
        aria-hidden
        className="relative h-36 w-12 overflow-hidden rounded-[1.1rem] bg-neutral-800 shadow-xl ring-1 ring-black/10 md:h-44 md:w-14"
      >
        <span className="absolute inset-x-0 bottom-0 animate-volume-up bg-white" />
        <Volume2 className="absolute inset-x-0 bottom-3 mx-auto size-6 text-neutral-800" />
      </span>
      <span className="text-xs font-semibold text-neutral-600">{t('video_volume_hint')}</span>
    </div>
  );
};
