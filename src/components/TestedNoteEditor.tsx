'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

/**
 * Shows what a campaign tested and edits it in place, from the tests table.
 * @param props Component props.
 * @param props.campaignId The campaign.
 * @param props.note What was tested, if written.
 * @returns The note with its edit popover.
 */
export const TestedNoteEditor = (props: { campaignId: string; note: string | null }) => {
  const t = useTranslations('CampaignTests');
  // Seeded once, so the saved text shows at once without waiting for the page
  const [note, setNote] = useState(props.note);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="flex items-start gap-1">
      {note && <p className="line-clamp-3 text-xs whitespace-pre-line">{note}</p>}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={note ? 'icon-xs' : 'xs'}
            aria-label={t('label_hypothesis')}
            className="shrink-0 text-muted-foreground"
          >
            {note ? <Pencil /> : <Plus />}
            {!note && t('button_add_note')}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-80 space-y-3">
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const field = new FormData(event.currentTarget).get('hypothesis');
              const value = typeof field === 'string' ? field : '';
              setIsSaving(true);
              setHasError(false);

              const response = await fetch(`/api/campaigns/${props.campaignId}/test`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hypothesis: value }),
              });

              setIsSaving(false);

              if (response.ok) {
                setNote(value.trim() || null);
                setIsOpen(false);
              } else {
                setHasError(true);
              }
            }}
          >
            <Textarea
              name="hypothesis"
              rows={4}
              autoFocus
              defaultValue={note ?? ''}
              placeholder={t('placeholder_hypothesis')}
              aria-label={t('label_hypothesis')}
            />
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving && <Spinner />}
                {t('button_save')}
              </Button>
              {hasError && <span className="text-xs text-destructive">{t('error_save')}</span>}
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
};
