'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { KnowledgeMentionTextarea } from '@/components/KnowledgeMentionTextarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

export type KnowledgePromptAsset = {
  id: string;
  name: string;
  content: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const KnowledgePromptEditor = (props: {
  asset: KnowledgePromptAsset;
  documents: { id: string; name: string }[];
  onClose: () => void;
}) => {
  const t = useTranslations('KnowledgePromptEditor');
  const router = useRouter();
  const [name, setName] = useState(props.asset.name);
  const [content, setContent] = useState(props.asset.content);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const isDirty = name !== props.asset.name || content !== props.asset.content;

  const handleSave = async () => {
    setSaveState('saving');

    const response = await fetch(`/api/knowledge/${props.asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });

    setSaveState(response.ok ? 'saved' : 'error');

    if (response.ok) {
      router.refresh();
    }
  };

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <Field>
          <FieldLabel htmlFor={`prompt-name-${props.asset.id}`}>{t('label_name')}</FieldLabel>
          <Input
            id={`prompt-name-${props.asset.id}`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSaveState('idle');
            }}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`prompt-content-${props.asset.id}`}>{t('label_content')}</FieldLabel>
          <KnowledgeMentionTextarea
            id={`prompt-content-${props.asset.id}`}
            rows={8}
            className="min-h-40"
            documents={props.documents}
            value={content}
            onValueChange={(value) => {
              setContent(value);
              setSaveState('idle');
            }}
          />
        </Field>
      </CardContent>

      <CardFooter className="items-center gap-3 border-t py-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isDirty || saveState === 'saving'}
          onClick={handleSave}
        >
          {saveState === 'saving' && <Spinner />}
          {saveState === 'saving' ? t('button_saving') : t('button_save')}
        </Button>

        <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
          {t('button_cancel')}
        </Button>

        {saveState === 'saved' && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-3.5" />
            {t('saved')}
          </span>
        )}

        {saveState === 'error' && (
          <span className="text-sm text-destructive">{t('error_save')}</span>
        )}
      </CardFooter>
    </Card>
  );
};
