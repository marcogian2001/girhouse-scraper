'use client';

import { useTranslations } from 'next-intl';
import { GoogleLogo } from '../GoogleReviews';
import { IPhoneFrame } from '../IPhoneFrame';
import { useTimedSequence } from '../useTimedSequence';
import { WhatsAppChat } from '../WhatsAppChat';
import { SceneLabel } from './SceneLabel';

/** How long the two messages take before the review shows. */
const REVIEW_DELAY_MS = 3000;

/**
 * The review request: the same message to every customer after a service, whatever their
 * experience, as Google's rules ask, then the review on the profile.
 * @param props Component props.
 * @param props.company The business.
 * @param props.texts The message and the customer's answer.
 * @returns The scene.
 */
export const ReviewRequestScene = (props: {
  company: string;
  texts: { customerName: string; message: string; reply: string };
}) => {
  const t = useTranslations('DemoPage');
  const shown = useTimedSequence({ target: 1, intervalMs: REVIEW_DELAY_MS });

  return (
    <div className="flex flex-col items-center gap-3">
      <SceneLabel>{t('video_review_label')}</SceneLabel>
      <IPhoneFrame statusBarClassName="bg-[#f6f6f6] text-neutral-900">
        <WhatsAppChat
          company={props.company}
          messages={[
            { from: 'business', text: props.texts.message, options: [] },
            { from: 'customer', text: props.texts.reply, options: [] },
          ]}
          upTo={2}
          isReminder
        />
      </IPhoneFrame>
      {shown > 0 && (
        <p className="flex animate-pop items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow-xl ring-1 ring-neutral-200">
          <GoogleLogo className="size-5 shrink-0" />
          {t('video_review_result', { customer: props.texts.customerName })}
        </p>
      )}
    </div>
  );
};
