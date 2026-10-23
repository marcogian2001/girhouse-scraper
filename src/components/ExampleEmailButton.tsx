'use client';

import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/**
 * Opens the first email a campaign sent, as an example of how its emails are built.
 * @param props Component props.
 * @param props.campaignName The campaign, for the panel title.
 * @param props.email The example email, null when the campaign has none.
 * @returns The button and its side panel, or a dash without an email.
 */
export const ExampleEmailButton = (props: {
  campaignName: string;
  email: { subject: string; body: string } | null;
}) => {
  const t = useTranslations('CampaignTests');

  if (!props.email) {
    return <span className="text-muted-foreground">–</span>;
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Mail />
          {t('button_example')}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{props.campaignName}</SheetTitle>
          <SheetDescription>{t('example_description')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('example_subject')}</p>
            <p className="font-medium">{props.email.subject}</p>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{props.email.body}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
