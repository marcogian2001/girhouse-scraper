'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ColumnMapping } from '@/utils/Csv';
import { autoDetectMapping, CONTACT_FIELDS } from '@/utils/Csv';

/** Sentinel for "no column", because an empty string is not a valid Select value. */
const UNMAPPED = '__unmapped__';

export const ColumnMapper = (props: {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}) => {
  const t = useTranslations('ColumnMapper');

  // Recomputing the auto-detected set is cheap and keeps the badge honest when
  // the user overrides one of the guesses
  const detected = autoDetectMapping(props.headers);

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-xl border">
        {CONTACT_FIELDS.map((field) => (
          <div
            key={field}
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {t(`field_${field}`)}
                {field === 'email' && <span className="text-destructive"> *</span>}
              </span>

              {props.mapping[field] && props.mapping[field] === detected[field] && (
                <Badge variant="outline" className="text-xs">
                  {t('badge_detected')}
                </Badge>
              )}
            </div>

            <Select
              value={props.mapping[field] ?? UNMAPPED}
              onValueChange={(value) => {
                // Rebuilt rather than mutated, so clearing a field drops its key
                const next = Object.fromEntries(
                  Object.entries({ ...props.mapping, [field]: value }).filter(
                    ([, header]) => header !== UNMAPPED,
                  ),
                );

                props.onChange(next);
              }}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder={t('placeholder_unmapped')} />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value={UNMAPPED}>{t('placeholder_unmapped')}</SelectItem>

                {props.headers.map((header) => (
                  <SelectItem key={header} value={header}>
                    {header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{t('hint_extra_columns')}</p>
    </div>
  );
};
