'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { findBannedWords } from '@/components/demo/vsl/VideoScript';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import type { demoVslStatus } from '@/libs/DemoVsl';
import { useRouter } from '@/libs/I18nNavigation';
import type { DemoVsl } from '@/models/Schema';

/**
 * The demo's video: where it stands and the words to avoid it uses. A demo from before the
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

  const regenerate = async () => {
    setIsBusy(true);
    setHasError(false);

    const response = await fetch(`/api/replies/${props.conversationId}/demo/version`, {
      method: 'POST',
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

      {props.vslStatus !== 'building' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={isBusy}
          onClick={async () => {
            await regenerate();
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
