'use client';

import { FileText, MessageSquareQuote, Pencil, Trash2, UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import { KnowledgeMentionTextarea } from '@/components/KnowledgeMentionTextarea';
import { KnowledgePromptEditor } from '@/components/KnowledgePromptEditor';
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
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouter } from '@/libs/I18nNavigation';
import { DOCUMENT_MIME_TYPES } from '@/validations/KnowledgeValidation';

export type KnowledgeAssetView = {
  id: string;
  name: string;
  kind: 'prompt' | 'document';
  content: string | null;
};

/**
 * Lists one kind of saved asset in its own card, with delete and, for prompts, inline editing.
 * @param props - The assets of one kind and the shared busy state.
 * @returns The card with the assets or an empty state.
 */
const KnowledgeAssetList = (props: {
  kind: KnowledgeAssetView['kind'];
  title: string;
  emptyTitle: string;
  assets: KnowledgeAssetView[];
  documents: KnowledgeAssetView[];
  isBusy: boolean;
  onBusyChange: (isBusy: boolean) => void;
}) => {
  const t = useTranslations('KnowledgeManager');
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const Icon = props.kind === 'document' ? FileText : MessageSquareQuote;

  return (
    // `py-0` lets the rows run edge to edge, so the header carries its own
    <Card className="py-0">
      <CardHeader className="border-b py-(--card-spacing)">
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>

      {props.assets.length === 0 ? (
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <span className="flex size-10 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                  <Icon className="size-4" />
                </span>
              </EmptyMedia>

              <EmptyTitle>{props.emptyTitle}</EmptyTitle>
              <EmptyDescription>{t('list_empty_description')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <ItemGroup>
          {props.assets.map((asset) => (
            <Fragment key={asset.id}>
              <Item>
                <ItemMedia>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                </ItemMedia>

                <ItemContent>
                  <ItemTitle>{asset.name}</ItemTitle>
                </ItemContent>

                <ItemActions>
                  {asset.kind === 'prompt' && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('button_edit')}
                      disabled={props.isBusy}
                      onClick={() => {
                        setEditingId(editingId === asset.id ? null : asset.id);
                      }}
                    >
                      <Pencil />
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('button_delete')}
                    disabled={props.isBusy}
                    onClick={async () => {
                      props.onBusyChange(true);
                      await fetch(`/api/knowledge/${asset.id}`, { method: 'DELETE' });
                      props.onBusyChange(false);
                      router.refresh();
                    }}
                  >
                    <Trash2 />
                  </Button>
                </ItemActions>
              </Item>

              {editingId === asset.id && asset.content !== null && (
                <KnowledgePromptEditor
                  asset={{ id: asset.id, name: asset.name, content: asset.content }}
                  documents={props.documents}
                  onClose={() => {
                    setEditingId(null);
                  }}
                />
              )}
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </Card>
  );
};

export const KnowledgeManager = (props: { assets: KnowledgeAssetView[] }) => {
  const t = useTranslations('KnowledgeManager');
  const router = useRouter();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompts = props.assets.filter((asset) => asset.kind === 'prompt');
  const documents = props.assets.filter((asset) => asset.kind === 'document');

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
        <div className="space-y-6 lg:order-2">
          <KnowledgeAssetList
            kind="prompt"
            title={t('prompts_title', { count: prompts.length })}
            emptyTitle={t('prompts_empty')}
            assets={prompts}
            documents={documents}
            isBusy={isBusy}
            onBusyChange={setIsBusy}
          />

          <KnowledgeAssetList
            kind="document"
            title={t('documents_title', { count: documents.length })}
            emptyTitle={t('documents_empty')}
            assets={documents}
            documents={documents}
            isBusy={isBusy}
            onBusyChange={setIsBusy}
          />
        </div>

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
                  <KnowledgeMentionTextarea
                    id="asset-content"
                    rows={8}
                    className="min-h-40"
                    documents={documents}
                    value={content}
                    onValueChange={setContent}
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
                  className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors hover:border-primary/50 has-focus-visible:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg border bg-background text-muted-foreground">
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
