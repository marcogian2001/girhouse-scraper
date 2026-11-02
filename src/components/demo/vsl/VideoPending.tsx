import { useTranslations } from 'next-intl';
import { GirhouseLogo } from '../GirhouseLogo';

/**
 * What the link shows while the video is still being made.
 * @param props Component props.
 * @param props.company The business name.
 * @returns The waiting screen.
 */
export const VideoPending = (props: { company: string }) => {
  const t = useTranslations('DemoPage');

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <GirhouseLogo tone="black" className="h-8" />
      <h1 className="text-2xl font-bold tracking-tight text-balance wrap-anywhere text-neutral-950">
        {t('video_pending_title', { company: props.company })}
      </h1>
      <p className="text-neutral-600">{t('video_pending_text')}</p>
    </main>
  );
};
