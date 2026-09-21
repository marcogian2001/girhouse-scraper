'use client';

import { FileText, UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Papa from 'papaparse';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export type ParsedCsv = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Checks that a dropped file looks like a CSV before it reaches the parser.
 * @param file The file the user chose or dropped.
 * @returns Whether the name or MIME type says CSV.
 */
const isCsv = (file: File) => file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';

export const CsvUploader = (props: {
  fileName?: string;
  onParsed: (parsed: ParsedCsv) => void;
}) => {
  const t = useTranslations('CsvUploader');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!isCsv(file)) {
      setError(t('error_type'));

      return;
    }

    setError(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];

        if (headers.length === 0 || result.data.length === 0) {
          setError(t('error_empty'));

          return;
        }

        props.onParsed({ fileName: file.name, headers, rows: result.data });
      },
      error: () => {
        setError(t('error_parse'));
      },
    });
  };

  return (
    <div className="space-y-3">
      {/* Drag handlers sit on the wrapper; the label inside keeps click and
          keyboard working without putting listeners on a non-interactive element */}
      <div
        data-dragging={isDragging}
        className="rounded-xl border-2 border-dashed transition-colors hover:border-primary/50 has-focus-visible:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50 data-[dragging=true]:border-primary data-[dragging=true]:bg-accent"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => {
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFile(event.dataTransfer.files[0]);
        }}
      >
        <label
          htmlFor="csv-file"
          className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 p-8 text-center"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UploadCloud className="size-5" />
          </span>

          <span className="space-y-1">
            <span className="block font-medium">{t('dropzone_title')}</span>
            <span className="block text-sm text-muted-foreground">{t('hint')}</span>
          </span>

          <Button type="button" variant="outline" size="sm" asChild>
            <span>{t('button_choose')}</span>
          </Button>

          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
            }}
          />
        </label>
      </div>

      {props.fileName && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="size-4" />
          {t('label_selected', { file: props.fileName })}
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
