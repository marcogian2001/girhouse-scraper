'use client';

import { FileText, MessageSquareQuote, Trash2, UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/libs/I18nNavigation';
import { DOCUMENT_MIME_TYPES } from '@/validations/KnowledgeValidation';

export type KnowledgeAssetView = {
  id: string;
  name: string;
  kind: 'prompt' | 'document';
};

export const KnowledgeManager = (props: { assets: KnowledgeAssetView[] }) => {
  const t = useTranslations('KnowledgeManager');
  const router = useRouter();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSavePrompt = async () => {
    setIsBusy(true);
    setError(null);

    const response = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });

    setIsBusy(false);

    if (!response.ok) {
      setError(t('error_save'));

      return;
    }

    setName('');
    setContent('');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* The add form leads, since it is what brings someone to this page */}
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* `py-0` lets the rows run edge to edge, so the header carries its own */}
        <Card className="py-0 lg:order-2">
          <CardHeader className="border-b py-(--card-spacing)">
            <CardTitle>{t('list_title')}</CardTitle>
          </CardHeader>

          {props.assets.length === 0 ? (
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <MessageSquareQuote className="size-5" />
                    </span>
                  </EmptyMedia>

                  <EmptyTitle>{t('list_empty')}</EmptyTitle>
                  <EmptyDescription>{t('list_empty_description')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          ) : (
            <ItemGroup>
              {props.assets.map((asset) => (
                <Item key={asset.id}>
                  <ItemMedia>
                    <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {asset.kind === 'document' ? (
                        <FileText className="size-4" />
                      ) : (
                        <MessageSquareQuote className="size-4" />
                      )}
                    </span>
                  </ItemMedia>

                  <ItemContent>
                    <ItemTitle>{asset.name}</ItemTitle>
                    <ItemDescription>{t(`kind_${asset.kind}`)}</ItemDescription>
                  </ItemContent>

                  <ItemActions>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('button_delete')}
                      disabled={isBusy}
                      onClick={async () => {
                        setIsBusy(true);
                        await fetch(`/api/knowledge/${asset.id}`, { method: 'DELETE' });
                        setIsBusy(false);
                        router.refresh();
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </Card>

        <Card className="lg:order-1">
          <CardHeader>
            <CardTitle>{t('add_title')}</CardTitle>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="prompt">
              <TabsList className="w-full">
                <TabsTrigger value="prompt" className="flex-1">
                  {t('tab_prompt')}
                </TabsTrigger>
                <TabsTrigger value="document" className="flex-1">
                  {t('tab_document')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="prompt" className="space-y-4 pt-4">
                <FieldDescription>{t('prompt_description')}</FieldDescription>

                <Field>
                  <FieldLabel htmlFor="asset-name">{t('label_name')}</FieldLabel>
                  <Input
                    id="asset-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="asset-content">{t('label_content')}</FieldLabel>
                  <Textarea
                    id="asset-content"
                    rows={8}
                    className="min-h-40"
                    value={content}
                    onChange={(event) => {
                      setContent(event.target.value);
                    }}
                  />
                </Field>

                <Button
                  type="button"
                  className="w-full"
                  disabled={isBusy || !name.trim() || !content.trim()}
                  onClick={handleSavePrompt}
                >
                  {isBusy && <Spinner />}
                  {t('button_save_prompt')}
                </Button>
              </TabsContent>

              <TabsContent value="document" className="space-y-4 pt-4">
                <FieldDescription>{t('document_description')}</FieldDescription>

                {/* The label is the drop target, so click and keyboard both work */}
                <label
                  htmlFor="knowledge-file"
                  className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50 has-focus-visible:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UploadCloud className="size-4" />
                  </span>

                  <span className="text-sm text-muted-foreground">{t('document_hint')}</span>

                  <input
                    id="knowledge-file"
                    type="file"
                    accept={DOCUMENT_MIME_TYPES.join(',')}
                    className="sr-only"
                    disabled={isBusy}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];

                      if (!file) {
                        return;
                      }

                      setIsBusy(true);
                      setError(null);

                      const formData = new FormData();
                      formData.append('file', file);

                      const response = await fetch('/api/knowledge', {
                        method: 'POST',
                        body: formData,
                      });

                      setIsBusy(false);
                      event.target.value = '';

                      if (response.ok) {
                        router.refresh();

                        return;
                      }

                      setError(t('error_upload'));
                    }}
                  />
                </label>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
