'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';
import type { ReplyCategory } from '@/utils/ReplyRouting';
import { CATEGORY_VALUES } from '@/validations/AutomationValidation';

export const ClassificationEditor = (props: {
  classificationId: string;
  category: ReplyCategory;
}) => {
  const t = useTranslations('ClassificationEditor');
  const categoryT = useTranslations('ReplyCategory');
  const router = useRouter();
  const [category, setCategory] = useState(props.category);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setHasError(false);

    const response = await fetch(`/api/replies/classifications/${props.classificationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });

    setIsSaving(false);

    if (!response.ok) {
      setHasError(true);

      return;
    }

    router.refresh();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={category}
          onValueChange={(value) => {
            const next = CATEGORY_VALUES.find((option) => option === value);

            if (next) {
              setCategory(next);
            }
          }}
        >
          <SelectTrigger aria-label={t('label_category')} className="w-56">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {CATEGORY_VALUES.map((option) => (
              <SelectItem key={option} value={option}>
                {categoryT(`category_${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          disabled={isSaving || category === props.category}
          onClick={handleSave}
        >
          {isSaving && <Spinner />}
          {t('button_save')}
        </Button>
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertDescription>{t('error_save')}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
