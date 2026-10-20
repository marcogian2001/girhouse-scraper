'use client';

import { CheckCircle2, Hourglass, Mail, PhoneCall, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScrollAnchor } from '../ScrollAnchor';
import { useTimedSequence } from '../useTimedSequence';
import { WhatsAppIcon } from '../WhatsAppIcon';

const NODES = [
  { key: 'trigger', icon: Zap, tint: 'bg-amber-100 text-amber-700' },
  { key: 'wait_1', icon: Hourglass, tint: 'bg-neutral-100 text-neutral-600' },
  { key: 'whatsapp', icon: WhatsAppIcon, tint: 'bg-green-100 text-green-700' },
  { key: 'wait_2', icon: Hourglass, tint: 'bg-neutral-100 text-neutral-600' },
  { key: 'email', icon: Mail, tint: 'bg-sky-100 text-sky-700' },
  { key: 'call', icon: PhoneCall, tint: 'bg-violet-100 text-violet-700' },
] as const;

type NodeKey = (typeof NODES)[number]['key'] | 'stop';

/**
 * Plays what one node of the automation does, so each action is seen happening.
 * @param props Component props.
 * @param props.node The node that just fired.
 * @returns The animation of that action.
 */
const ActionStage = (props: { node: NodeKey }) => {
  const t = useTranslations('DemoPage');

  if (props.node === 'whatsapp') {
    return (
      <div className="mx-auto w-64 space-y-3 rounded-[2rem] border-[6px] border-neutral-900 bg-[#efeae2] p-3 pt-6 shadow-2xl">
        <div className="flex animate-in items-center gap-2 rounded-2xl bg-white/95 p-2.5 shadow-lg duration-500 slide-in-from-top-6">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#25d366] text-white">
            <WhatsAppIcon className="size-5" />
          </span>
          <div className="min-w-0 text-left">
            <p className="text-xs font-semibold">WhatsApp</p>
            <p className="truncate text-[11px] text-neutral-500">{t('followup_stage_whatsapp')}</p>
          </div>
        </div>
        <p className="animate-in rounded-lg rounded-tl-none bg-white px-3 py-2 text-left text-sm shadow-sm delay-500 duration-500 fill-mode-both fade-in">
          {t('followup_stage_whatsapp')}
        </p>
      </div>
    );
  }

  if (props.node === 'email') {
    return (
      <div className="relative mx-auto w-full max-w-sm">
        <Mail className="absolute -top-6 left-1/2 size-12 -translate-x-1/2 animate-out text-sky-500 duration-1000 fill-mode-forwards fade-out slide-out-to-top-12" />
        <div className="animate-in space-y-2 rounded-2xl bg-white p-4 text-left shadow-2xl ring-1 ring-sky-100 delay-300 duration-500 fill-mode-both fade-in slide-in-from-bottom-6">
          <p className="text-xs text-neutral-400">{t('followup_stage_email_to')}</p>
          <p className="text-sm font-semibold">{t('followup_stage_email_subject')}</p>
          <p className="text-sm text-neutral-600">{t('followup_stage_email_body')}</p>
          <p className="flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckCircle2 className="size-3.5" />
            {t('followup_stage_sent')}
          </p>
        </div>
      </div>
    );
  }

  if (props.node === 'call') {
    return (
      <div className="mx-auto flex w-64 flex-col items-center gap-3 rounded-[2rem] bg-neutral-900 px-6 py-6 text-white shadow-2xl md:gap-4 md:py-10">
        <span className="relative flex size-16 items-center justify-center rounded-full bg-violet-500 md:size-20">
          <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/60" />
          <PhoneCall className="relative size-8" />
        </span>
        <p className="text-lg font-semibold">{t('followup_stage_call')}</p>
        <p className="text-xs text-white/60">{t('followup_stage_call_detail')}</p>
      </div>
    );
  }

  if (props.node === 'stop') {
    return (
      <div className="mx-auto flex max-w-sm animate-pop flex-col items-center gap-3 rounded-3xl bg-green-50 p-8 ring-2 ring-green-300">
        <CheckCircle2 className="size-12 text-green-600" />
        <p className="text-center font-semibold text-green-800">{t('followup_stage_stop')}</p>
      </div>
    );
  }

  // Side by side on a phone, so the wait takes little height above the workflow
  return (
    <div className="mx-auto flex max-w-xs items-center gap-3 md:flex-col md:text-center">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white shadow-xl ring-1 ring-neutral-200 md:size-20">
        <Hourglass className="size-6 animate-spin text-neutral-500 [animation-duration:2s] md:size-9" />
      </span>
      <p className="font-semibold text-neutral-700">{t(`followup_stage_${props.node}`)}</p>
    </div>
  );
};

/**
 * An automation run as the workflow builder shows it: the nodes light up one after
 * another while the stage beside them plays each action, until the customer answers.
 * It plays through on its own, with no press of "Next".
 * @returns The workflow mockup.
 */
export const FollowUpStep = () => {
  const t = useTranslations('DemoPage');
  // One tick per node, then one more for the customer's answer that stops it
  const tick = useTimedSequence({ target: NODES.length + 1, intervalMs: 1800 });
  const active = Math.max(Math.min(tick, NODES.length), 1);
  const isStopped = tick > NODES.length;
  const current: NodeKey = isStopped ? 'stop' : (NODES[active - 1]?.key ?? 'trigger');

  return (
    <div className="grid items-center gap-4 md:gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="rounded-2xl border border-neutral-200 bg-[radial-gradient(circle,_#e5e5e5_1px,_transparent_1px)] bg-[size:18px_18px] p-4 shadow-2xl md:p-6">
        <ol className="mx-auto flex max-w-sm flex-col items-center">
          {NODES.map((node, index) => {
            const isOn = index < active;
            const isCurrent = node.key === current;

            return (
              <li key={node.key} className="relative flex w-full flex-col items-center">
                {index > 0 && (
                  <span
                    className={`h-6 w-0.5 transition-colors ${isOn ? 'bg-(--demo-primary)' : 'bg-neutral-300'}`}
                  />
                )}
                {isCurrent && <ScrollAnchor key={current} className="absolute inset-0" />}
                <div
                  className={`flex w-full items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-all duration-500 ${isOn ? 'border-(--demo-primary)/40 opacity-100' : 'border-neutral-200 opacity-40'} ${isCurrent ? 'scale-[1.03] animate-node-pulse' : ''}`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${node.tint}`}
                  >
                    <node.icon className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">
                    {t(`followup_node_${node.key}`)}
                  </span>
                  {isOn && index > 0 && (
                    <CheckCircle2 className="size-4 animate-pop text-green-600" />
                  )}
                </div>
              </li>
            );
          })}
          {isStopped && (
            <li className="relative flex w-full flex-col items-center">
              <ScrollAnchor className="absolute inset-0" />
              <span className="h-6 w-0.5 bg-green-500" />
              <div className="flex w-full animate-pop items-center gap-3 rounded-xl border-2 border-green-500 bg-green-50 p-3 shadow">
                <CheckCircle2 className="size-5 text-green-600" />
                <span className="text-sm font-semibold text-green-800">
                  {t('followup_node_stop')}
                </span>
              </div>
            </li>
          )}
        </ol>
      </div>

      {/* On a phone the action plays above the workflow, so both fit on screen */}
      <div
        key={current}
        className="-order-1 min-h-28 animate-in content-center duration-500 zoom-in-95 fade-in md:min-h-80 lg:order-none"
      >
        <ActionStage node={current} />
      </div>
    </div>
  );
};
