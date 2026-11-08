'use client';

import { useTranslations } from 'next-intl';
import { IPhoneFrame } from '../IPhoneFrame';
import { useTimedSequence } from '../useTimedSequence';
import { SceneLabel } from './SceneLabel';

/** How long each part of the exchange waits for the one before. */
const PART_MS = 1500;

/**
 * A comment under a post that turns into a request: a private message goes out on its own
 * and the person answers.
 * @param props Component props.
 * @param props.company The business.
 * @param props.texts The comment, the private message and the answer.
 * @returns The scene.
 */
export const SocialRequestScene = (props: {
  company: string;
  texts: { customerName: string; comment: string; message: string; reply: string };
}) => {
  const t = useTranslations('DemoPage');
  const shown = useTimedSequence({ target: 3, intervalMs: PART_MS });
  const initial = props.texts.customerName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-2 md:gap-3">
      <SceneLabel>{t('video_social_label')}</SceneLabel>
      <IPhoneFrame statusBarClassName="bg-white text-neutral-900">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-white p-3">
          <p className="truncate border-b border-neutral-100 pb-2 text-center text-sm font-semibold text-neutral-950">
            {props.company}
          </p>

          {shown >= 1 && (
            <div className="flex animate-pop items-start gap-2 rounded-2xl bg-neutral-100 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] text-sm font-bold text-white">
                {initial}
              </span>
              <p className="min-w-0 text-sm text-neutral-900">
                <span className="font-semibold">{props.texts.customerName}</span>{' '}
                <span className="text-neutral-500">{t('video_social_comment')}</span>
                <br />
                {props.texts.comment}
              </p>
            </div>
          )}

          {shown >= 2 && (
            <div className="flex animate-pop flex-col items-end gap-1">
              <span className="text-[11px] font-semibold text-(--demo-primary)">
                {t('video_social_auto')}
              </span>
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-[#4f5bd5] to-[#962fbf] px-3 py-2 text-sm text-white">
                {props.texts.message}
              </p>
            </div>
          )}

          {shown >= 3 && (
            <p className="max-w-[85%] animate-pop self-start rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-900">
              {props.texts.reply}
            </p>
          )}
        </div>
      </IPhoneFrame>
    </div>
  );
};
