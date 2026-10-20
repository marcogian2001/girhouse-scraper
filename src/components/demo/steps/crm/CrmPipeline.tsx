'use client';

import { CalendarCheck, NotebookPen, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DemoSnapshot } from '@/models/Schema';
import { ScrollAnchor } from '../../ScrollAnchor';
import { useTimedSequence } from '../../useTimedSequence';
import { WhatsAppIcon } from '../../WhatsAppIcon';
import { chosenSlotOf } from './CrmData';

const STAGES = ['new', 'contacted', 'booked', 'customer'] as const;

const EXAMPLES = [
  { stage: 0, name: 'Marco R.' },
  { stage: 1, name: 'Sara B.' },
  { stage: 3, name: 'Luca T.' },
  { stage: 3, name: 'Elena M.' },
] as const;

/** The drag played by the cursor: approach, grab, move, drop, twice, then a click on the card. */
const PHASES = 9;

/**
 * Reads where the card and the cursor are at a phase of the drag.
 * @param phase The phase, from 0.
 * @returns The column the card sits in, whether it is held, and whether the note is open.
 */
const dragState = (phase: number) => {
  const column = Number(phase >= 3) + Number(phase >= 6);

  return {
    column,
    isHeld: [2, 3, 5, 6].includes(phase),
    showsCursor: phase >= 1,
    isNoteOpen: phase >= 8,
  };
};

/**
 * A Kanban pipeline where a cursor drags the customer's card from stage to stage,
 * then opens the note the system wrote from the chat.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @returns The pipeline panel.
 */
export const CrmPipeline = (props: { data: DemoSnapshot }) => {
  const t = useTranslations('DemoPage');
  const phase = useTimedSequence({ target: PHASES, intervalMs: 850 });
  const state = dragState(phase);
  const slot = chosenSlotOf(props.data);
  const { customerName, service, note } = props.data.chat;
  const left = `calc(${state.column * 25}% + 10px)`;

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-neutral-50 shadow-xl">
      <div className="relative min-w-[780px] p-3">
        <div className="grid grid-cols-4 gap-3">
          {STAGES.map((stage, index) => (
            <div
              key={stage}
              className="min-h-[420px] rounded-xl bg-white/70 p-2 ring-1 ring-neutral-200"
            >
              <p className="flex items-center justify-between px-1 pb-2 text-xs font-semibold text-neutral-500">
                {t(`crm_stage_${stage}`)}
                <span className="rounded-full bg-neutral-100 px-1.5">
                  {EXAMPLES.filter((example) => example.stage === index).length +
                    (state.column === index ? 1 : 0)}
                </span>
              </p>
              {/* Room for the moving card at the top of every column */}
              <div className="h-[184px]" />
              <div className="space-y-2">
                {EXAMPLES.filter((example) => example.stage === index).map((example) => (
                  <div
                    key={example.name}
                    className="rounded-lg bg-white p-2.5 text-xs text-neutral-400 shadow-sm ring-1 ring-neutral-100"
                  >
                    <p className="font-medium text-neutral-500">{example.name}</p>
                    <p>{t('example')}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Follows the card, so on a phone the pipeline scrolls sideways with it */}
        <ScrollAnchor
          key={state.column}
          className="absolute top-12 h-40 w-[calc(25%-20px)]"
          style={{ left }}
        />

        <div
          className={`absolute top-12 w-[calc(25%-20px)] space-y-2 rounded-xl bg-white p-3.5 ring-2 ring-(--demo-primary)/40 transition-all duration-700 ease-in-out ${state.isHeld ? 'scale-105 rotate-2 shadow-2xl' : 'shadow-md'}`}
          style={{ left }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{customerName}</p>
            <WhatsAppIcon className="size-4 shrink-0 text-[#25d366]" />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Phone className="size-3" />
            {t('crm_phone_example')}
          </p>
          {service && (
            <p className="rounded-md bg-(--demo-primary)/10 px-2 py-1 text-xs font-medium text-(--demo-primary)">
              {service}
            </p>
          )}
          {state.column >= 2 && slot && (
            <p className="flex animate-in items-center gap-1.5 text-xs font-medium text-neutral-700 fade-in">
              <CalendarCheck className="size-3.5 text-green-600" />
              {slot}
            </p>
          )}
          {note && (
            <p className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <NotebookPen className="size-3" />
              {t('crm_note_label')}
            </p>
          )}
        </div>

        {state.isNoteOpen && note && (
          <div
            className="absolute top-[13.5rem] w-[calc(25%+60px)] animate-pop space-y-1.5 rounded-xl bg-yellow-50 p-3.5 text-sm shadow-2xl ring-1 ring-yellow-200"
            style={{ left }}
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold text-yellow-800">
              <NotebookPen className="size-3.5" />
              {t('crm_note_title')}
            </p>
            <p className="text-neutral-800">{note}</p>
            <p className="text-[11px] text-yellow-700">{t('crm_note_source')}</p>
          </div>
        )}

        {state.showsCursor && (
          <svg
            viewBox="0 0 24 24"
            className={`pointer-events-none absolute z-20 size-7 drop-shadow-lg transition-all duration-700 ease-in-out ${state.isHeld ? 'scale-90' : ''}`}
            style={{
              left: `calc(${state.column * 25 + 15}% + 10px)`,
              top: state.isNoteOpen ? '9.5rem' : '7rem',
            }}
            aria-hidden
          >
            <path
              d="M4 2l15 11.5-6.5 1 3.8 7.2-2.6 1.3-3.8-7.3L5 20z"
              fill="#111827"
              stroke="white"
              strokeWidth="1.5"
            />
          </svg>
        )}
      </div>
    </div>
  );
};
