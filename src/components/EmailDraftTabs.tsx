'use client';

import { useTranslations } from 'next-intl';
import type { DraftView } from '@/components/EmailDraftEditor';
import { EmailDraftEditor } from '@/components/EmailDraftEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const EmailDraftTabs = (props: { drafts: DraftView[]; delaysDays: number[] }) => {
  const t = useTranslations('EmailDraftTabs');

  const firstDraft = props.drafts.at(0);

  if (!firstDraft) {
    return null;
  }

  return (
    <Tabs defaultValue={String(firstDraft.stepIndex)}>
      <TabsList>
        {props.drafts.map((draft) => (
          <TabsTrigger key={draft.id} value={String(draft.stepIndex)}>
            {t('tab_step', { step: draft.stepIndex })}
          </TabsTrigger>
        ))}
      </TabsList>

      {props.drafts.map((draft) => (
        // Mounted even while hidden, so an unsaved edit survives a tab switch
        <TabsContent
          key={draft.id}
          value={String(draft.stepIndex)}
          forceMount
          className="pt-2 data-[state=inactive]:hidden"
        >
          <EmailDraftEditor
            draft={draft}
            // Step 1 goes out immediately; every follow-up waits out the gap
            // configured after the step before it
            delayDays={
              draft.stepIndex === 1 ? null : (props.delaysDays[draft.stepIndex - 2] ?? null)
            }
          />
        </TabsContent>
      ))}
    </Tabs>
  );
};
