'use client';

import { Phone, PhoneMissed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { IPhoneFrame } from '../IPhoneFrame';
import { useTimedSequence } from '../useTimedSequence';
import { WhatsAppChat } from '../WhatsAppChat';
import { VSL_MISSED_CALL_STEP_MS } from './VslScript';

/**
 * A missed call from the caller's phone: it rings, nobody answers, and a moment later the
 * business's WhatsApp message arrives on its own, and the caller answers it.
 * @param props Component props.
 * @param props.company The business called.
 * @param props.message What the business sends after the missed call.
 * @param props.reply What the caller answers.
 * @returns The scene.
 */
export const MissedCallScene = (props: { company: string; message: string; reply: string }) => {
  const t = useTranslations('DemoPage');
  const moment = useTimedSequence({ target: 2, intervalMs: VSL_MISSED_CALL_STEP_MS });

  return (
    <div className="flex flex-col items-center gap-3">
      <p
        className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow transition-colors ${moment >= 2 ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
      >
        {moment >= 2 ? t('vsl_missed_auto') : t('vsl_case_missed_call')}
      </p>
      <IPhoneFrame
        statusBarClassName={
          moment >= 2 ? 'bg-[#f6f6f6] text-neutral-900' : 'bg-neutral-900 text-white'
        }
      >
        {moment >= 2 ? (
          <WhatsAppChat
            company={props.company}
            messages={[
              { from: 'business', text: props.message, options: [] },
              { from: 'customer', text: props.reply, options: [] },
            ]}
            upTo={2}
            isReminder
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-between bg-gradient-to-b from-neutral-700 to-neutral-900 px-6 pt-16 pb-14 text-white">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-20 items-center justify-center rounded-full bg-neutral-500 text-3xl font-semibold">
                {props.company.charAt(0).toUpperCase()}
              </span>
              <p className="text-2xl font-semibold">{props.company}</p>
              <p
                className={`text-sm ${moment >= 1 ? 'font-semibold text-red-400' : 'animate-pulse text-white/70'}`}
              >
                {moment >= 1 ? t('vsl_missed_no_answer') : t('vsl_missed_calling')}
              </p>
            </div>
            <span
              className={`flex size-16 items-center justify-center rounded-full ${moment >= 1 ? 'bg-neutral-600' : 'bg-red-500'}`}
            >
              {moment >= 1 ? (
                <PhoneMissed className="size-7" />
              ) : (
                <Phone className="size-7 rotate-[135deg]" />
              )}
            </span>
          </div>
        )}
      </IPhoneFrame>
    </div>
  );
};
