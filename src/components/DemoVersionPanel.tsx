'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { findBannedWords } from '@/components/demo/vsl/VideoScript';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import type { demoVslStatus } from '@/libs/DemoVsl';
import { useRouter } from '@/libs/I18nNavigation';
import type { DemoVsl } from '@/models/Schema';

const CHECKS = ['check_name', 'check_italian', 'check_images'] as const;

/**
 * The one-minute check a person makes before the link goes out, or when it was made.
 * @param props Component props.
 * @param props.checkedAt When a person checked the video, if they did.
 * @param props.isBusy Whether the panel is saving.
 * @param props.onCheck Records the check.
 * @returns The check.
 */
const VideoCheck = (props: {
  checkedAt: string | null;
  isBusy: boolean;
  onCheck: () => Promise<void>;
}) => {
  const t = useTranslations('ConversationDemoCard');
  const format = useFormatter();

  if (props.checkedAt) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-green-600" />
        {t('video_checked', {
          date: format.dateTime(new Date(props.checkedAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        })}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('video_check_title')}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {CHECKS.map((check) => (
          <li key={check}>{t(check)}</li>
        ))}
      </ul>
      <Button type="button" size="sm" disabled={props.isBusy} onClick={props.onCheck}>
        {props.isBusy && <Spinner />}
        {t('button_check')}
      </Button>
    </div>
  );
};

/**
 * The demo's video: where it stands, how it closes and its check. A demo from before the
 * video stays as it is until someone asks for the new one.
 * @param props Component props.
 * @param props.conversationId The conversation.
 * @param props.isOldVersion Whether the link still shows a demo from before the video.
 * @param props.vslStatus Where the video stands.
 * @param props.vsl The video's script, once written.
 * @returns The panel.
 */
export const DemoVersionPanel = (props: {
  conversationId: string;
  isOldVersion: boolean;
  vslStatus: Awaited<ReturnType<typeof demoVslStatus>>;
  vsl: DemoVsl | null;
}) => {
  const t = useTranslations('ConversationDemoCard');
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [hasError, setHasError] = useState(false);

  const send = async (action: 'regenerate' | 'check') => {
    setIsBusy(true);
    setHasError(false);

    const response = await fetch(`/api/replies/${props.conversationId}/demo/version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });

    setIsBusy(false);
    setHasError(!response.ok);

    if (response.ok) {
      router.refresh();
    }
  };

  const isReady =
    !props.isOldVersion && (props.vslStatus === 'ready' || props.vslStatus === 'unvoiced');
  const banned = isReady && props.vsl ? findBannedWords(props.vsl.lines) : [];
  const canCreate = props.isOldVersion || props.vslStatus === 'none';

  return (
    <Field>
      <FieldLabel>{t('label_video')}</FieldLabel>
      <FieldDescription>
        {props.isOldVersion ? t('video_old_version') : t(`vsl_status_${props.vslStatus}`)}
      </FieldDescription>

      {banned.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{t('video_banned', { words: banned.join(', ') })}</AlertDescription>
        </Alert>
      )}

      {isReady && (
        <VideoCheck
          checkedAt={props.vsl?.checkedAt ?? null}
          isBusy={isBusy}
          onCheck={async () => {
            await send('check');
          }}
        />
      )}

      {props.vslStatus !== 'building' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={isBusy}
          onClick={async () => {
            await send('regenerate');
          }}
        >
          {isBusy && <Spinner />}
          {canCreate ? t('button_create_video') : t('button_regenerate_video')}
        </Button>
      )}

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_version')}</AlertDescription>
        </Alert>
      )}
    </Field>
  );
};
