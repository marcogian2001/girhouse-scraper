'use client';

import { CheckCheck, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GoogleLogo } from '../GoogleReviews';
import { IPhoneFrame } from '../IPhoneFrame';
import { useTimedSequence } from '../useTimedSequence';
import { SceneLabel } from './SceneLabel';

const STARS = 5;

/** The moments of the scene: the question, five stars, the thanks with the link, the reply, the review. */
const MOMENTS = 1 + STARS + 3;

const MOMENT_MS = 600;

/**
 * A WhatsApp bubble of the business or the customer.
 * @param props Component props.
 * @param props.isCustomer Whether the customer wrote it.
 * @param props.children The bubble's content.
 * @returns The bubble.
 */
const Bubble = (props: { isCustomer?: boolean; children: React.ReactNode }) => (
  <div
    className={`flex animate-in duration-300 fade-in slide-in-from-bottom-2 ${props.isCustomer ? 'justify-end' : 'justify-start'}`}
  >
    <div
      className={`max-w-[82%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] leading-snug text-neutral-900 shadow-sm ${props.isCustomer ? 'rounded-tr-none bg-[#d9fdd3]' : 'rounded-tl-none bg-white'}`}
    >
      {props.children}
      <span className="float-right mt-1.5 ml-2 flex items-center gap-0.5 text-[10.5px] text-neutral-500">
        10:02
        {props.isCustomer && <CheckCheck className="size-3.5 text-[#53bdeb]" />}
      </span>
    </div>
  </div>
);

/**
 * The review request after a service: the customer taps the stars in the WhatsApp message,
 * then gets the link to Google, as everyone does whatever the stars, and writes the review.
 * @param props Component props.
 * @param props.company The business.
 * @param props.texts The message with the Google link and the customer's answer.
 * @returns The scene.
 */
export const ReviewRequestScene = (props: {
  company: string;
  texts: { customerName: string; message: string; reply: string };
}) => {
  const t = useTranslations('DemoPage');
  const moment = useTimedSequence({ target: MOMENTS, intervalMs: MOMENT_MS });
  const stars = Math.min(Math.max(moment - 1, 0), STARS);

  return (
    <div className="flex flex-col items-center gap-3">
      <SceneLabel>{t('video_review_label')}</SceneLabel>
      <IPhoneFrame statusBarClassName="bg-[#f6f6f6] text-neutral-900" reserve="labelAndCard">
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-[#f6f6f6] px-3 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-sm font-semibold text-white">
            {props.company.charAt(0).toUpperCase()}
          </span>
          <p className="min-w-0 truncate text-[15px] font-semibold text-neutral-900">
            {props.company}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#efeae2] px-2.5 py-3">
          {moment >= 1 && (
            <Bubble>
              <span className="block">
                {t('video_review_stars_question', { customer: props.texts.customerName })}
              </span>
              <span className="mt-1.5 flex gap-1" aria-label={t('video_review_stars', { stars })}>
                {Array.from({ length: STARS }, (_unused, index) => (
                  <Star
                    key={index}
                    className={`size-7 transition-all duration-300 ${index < stars ? 'scale-110 fill-[#fbbc04] text-[#fbbc04]' : 'text-neutral-300'}`}
                  />
                ))}
              </span>
            </Bubble>
          )}
          {moment >= STARS + 2 && <Bubble>{props.texts.message}</Bubble>}
          {moment >= STARS + 3 && <Bubble isCustomer>{props.texts.reply}</Bubble>}
        </div>
      </IPhoneFrame>
      {moment >= MOMENTS && (
        <p className="flex animate-pop items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow-xl ring-1 ring-neutral-200">
          <GoogleLogo className="size-5 shrink-0" />
          {t('video_review_result', { customer: props.texts.customerName })}
        </p>
      )}
    </div>
  );
};
