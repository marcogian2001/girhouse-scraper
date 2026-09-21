'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

export const CampaignNameEditor = (props: { campaignId: string; name: string }) => {
  const t = useTranslations('CampaignNameEditor');
  // Seeded once from the props: the page refreshes while jobs run and must not reset the edit
  const [name, setName] = useState(props.name);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const startEditing = () => {
    setHasError(false);
    setIsEditing(true);
  };

  const handleSave = async (value: string) => {
    const nextName = value.trim();

    if (!nextName || nextName === name) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);

    const response = await fetch(`/api/campaigns/${props.campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nextName }),
    });

    setIsSaving(false);
    setIsEditing(false);

    if (response.ok) {
      setName(nextName);
    } else {
      setHasError(true);
    }
  };

  return (
    <div className="space-y-1">
      {isEditing ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            aria-label={t('label_name')}
            className="h-10 w-72 max-w-full text-2xl font-semibold tracking-tight md:text-2xl"
            defaultValue={name}
            disabled={isSaving}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            onBlur={async (event) => {
              await handleSave(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }

              if (event.key === 'Escape') {
                // Restored first, so the blur caused by closing the field finds nothing to save
                event.currentTarget.value = name;
                setIsEditing(false);
              }
            }}
          />
          {isSaving && <Spinner />}
        </div>
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">
          <button
            type="button"
            className="cursor-text text-start"
            title={t('hint_rename')}
            onDoubleClick={startEditing}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                startEditing();
              }
            }}
          >
            {name}
          </button>
        </h1>
      )}

      {hasError && <p className="text-sm text-destructive">{t('error_rename')}</p>}
    </div>
  );
};
