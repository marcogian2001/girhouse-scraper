'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { demoVslStatus } from '@/libs/DemoVsl';
import { useRouter } from '@/libs/I18nNavigation';

const DEMO_VERSIONS = ['a', 'b'] as const;

type DemoVersion = (typeof DEMO_VERSIONS)[number];

/**
 * Picks the version of the demo the link shows, and creates or rewrites version B: the
 * video Gigi narrates on his own, around the pain points of the lead's sector.
 * @param props Component props.
 * @param props.conversationId The conversation.
 * @param props.url The demo link.
 * @param props.version The version the link shows.
 * @param props.vslStatus Where version B stands.
 * @param props.pains The pain points version B leans on, once written.
 * @returns The panel.
 */
export const DemoVersionPanel = (props: {
  conversationId: string;
  url: string;
  version: DemoVersion;
  vslStatus: Awaited<ReturnType<typeof demoVslStatus>>;
  pains: string[];
}) => {
  const t = useTranslations('ConversationDemoCard');
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [hasError, setHasError] = useState(false);

  const save = async (version: DemoVersion, regenerate: boolean) => {
    setIsBusy(true);
    setHasError(false);

    const response = await fetch(`/api/replies/${props.conversationId}/demo/version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, regenerate }),
    });

    setIsBusy(false);
    setHasError(!response.ok);

    if (response.ok) {
      router.refresh();
    }
  };

  const hasVsl = props.vslStatus === 'ready' || props.vslStatus === 'unvoiced';

  return (
    <Field>
      <FieldLabel>{t('label_version')}</FieldLabel>
      <Tabs
        value={props.version}
        onValueChange={async (value) => {
          const next = DEMO_VERSIONS.find((option) => option === value);

          if (next && next !== props.version) {
            await save(next, false);
          }
        }}
      >
        <TabsList>
          {DEMO_VERSIONS.map((option) => (
            <TabsTrigger key={option} value={option} disabled={isBusy}>
              {t(`version_${option}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FieldDescription>{t(`hint_version_${props.version}`)}</FieldDescription>

      <p className="text-sm text-muted-foreground">{t(`vsl_status_${props.vslStatus}`)}</p>

      {props.pains.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('vsl_pains')}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {props.pains.map((pain) => (
              <li key={pain}>{pain}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {DEMO_VERSIONS.filter((option) => option === 'a' || hasVsl).map((option) => (
          <a
            key={option}
            href={`${props.url}?anteprima=1&versione=${option}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t(`open_preview_${option}`)}
            <ExternalLink className="size-3.5" />
          </a>
        ))}

        {props.vslStatus !== 'building' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={async () => {
              await save('b', true);
            }}
          >
            {isBusy && <Spinner />}
            {props.vslStatus === 'none' ? t('button_create_b') : t('button_regenerate_b')}
          </Button>
        )}
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_version')}</AlertDescription>
        </Alert>
      )}
    </Field>
  );
};
