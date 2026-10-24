'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRouter } from '@/libs/I18nNavigation';

const TIERS = ['1', '2', '3'];

export type CoverageTermView = { id: string; term: string; tier: number; isActive: boolean };

/**
 * Picks a tier out of a select value.
 * @param props Component props.
 * @param props.id The id of the trigger.
 * @param props.value The current tier.
 * @param props.label The accessible name of the trigger.
 * @param props.onValueChange Called with the tier picked.
 * @returns A compact tier select.
 */
const TierSelect = (props: {
  id?: string;
  value: number;
  label: string;
  onValueChange: (tier: number) => void;
}) => {
  const t = useTranslations('CoverageTermsEditor');

  return (
    <Select
      value={String(props.value)}
      onValueChange={(value) => {
        props.onValueChange(Number(value));
      }}
    >
      <SelectTrigger id={props.id} aria-label={props.label} className="w-32">
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {TIERS.map((tier) => (
          <SelectItem key={tier} value={tier}>
            {t('tier', { tier })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const CoverageTermsEditor = (props: { terms: CoverageTermView[] }) => {
  const t = useTranslations('CoverageTermsEditor');
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [tier, setTier] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const terms = props.terms.toSorted((a, b) => a.tier - b.tier || a.term.localeCompare(b.term));

  const send = async (options: { url: string; method: string; body?: unknown }) => {
    setError(null);

    const response = await fetch(options.url, {
      method: options.method,
      headers: { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      setError(response.status === 409 ? t('error_duplicate') : t('error_save'));

      return false;
    }

    router.refresh();

    return true;
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();

          if (await send({ url: '/api/coverage/terms', method: 'POST', body: { term, tier } })) {
            setTerm('');
          }
        }}
      >
        <Input
          value={term}
          placeholder={t('placeholder_term')}
          aria-label={t('label_term')}
          className="min-w-48 flex-1"
          onChange={(event) => {
            setTerm(event.target.value);
          }}
        />
        <TierSelect value={tier} label={t('label_tier')} onValueChange={setTier} />
        <Button type="submit" disabled={term.trim().length === 0}>
          <Plus />
          {t('button_add')}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="max-h-96 overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('column_term')}</TableHead>
              <TableHead>{t('column_tier')}</TableHead>
              <TableHead>{t('column_active')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>

          <TableBody>
            {terms.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.term}</TableCell>

                <TableCell>
                  <TierSelect
                    value={item.tier}
                    label={t('label_tier')}
                    onValueChange={async (value) =>
                      await send({
                        url: `/api/coverage/terms/${item.id}`,
                        method: 'PATCH',
                        body: { tier: value },
                      })
                    }
                  />
                </TableCell>

                <TableCell>
                  <Checkbox
                    checked={item.isActive}
                    aria-label={t('column_active')}
                    onCheckedChange={async (checked) =>
                      await send({
                        url: `/api/coverage/terms/${item.id}`,
                        method: 'PATCH',
                        body: { isActive: checked === true },
                      })
                    }
                  />
                </TableCell>

                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('button_delete')}
                    onClick={async () =>
                      await send({ url: `/api/coverage/terms/${item.id}`, method: 'DELETE' })
                    }
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
