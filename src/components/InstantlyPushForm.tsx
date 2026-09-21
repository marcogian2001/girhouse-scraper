'use client';

import { Mail, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/libs/I18nNavigation';

type Step = 'idle' | 'loading-accounts' | 'choosing' | 'pushing';

export const InstantlyPushForm = (props: {
  campaignId: string;
  readyCount: number;
  approvedCount: number;
}) => {
  const t = useTranslations('InstantlyPushForm');
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleApprove = async () => {
    setError(null);
    setStep('loading-accounts');

    const approveResponse = await fetch(`/api/campaigns/${props.campaignId}/approve`, {
      method: 'POST',
    });

    if (!approveResponse.ok) {
      setError(t('error_approve'));
      setStep('idle');

      return;
    }

    const accountsResponse = await fetch('/api/instantly/accounts');

    if (!accountsResponse.ok) {
      setError(t('error_accounts'));
      setStep('idle');
      router.refresh();

      return;
    }

    const payload: { accounts: { email: string }[] } = await accountsResponse.json();

    setAccounts(payload.accounts.map((account) => account.email));
    setStep('choosing');
    router.refresh();
  };

  const handlePush = async () => {
    setError(null);
    setStep('pushing');

    const response = await fetch(`/api/campaigns/${props.campaignId}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailList: selected, timezone }),
    });

    if (!response.ok) {
      setError(t('error_push'));
      setStep('choosing');

      return;
    }

    // The push runs as a job; the progress poller reports when it lands
    await fetch('/api/jobs/process', { method: 'POST' });
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('summary', { ready: props.readyCount, approved: props.approvedCount })}
      </p>

      {step === 'choosing' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{t('label_mailboxes')}</span>

            {accounts.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="link"
                onClick={() => {
                  setSelected(selected.length === accounts.length ? [] : accounts);
                }}
              >
                {selected.length === accounts.length ? t('button_clear') : t('button_select_all')}
              </Button>
            )}
          </div>

          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('no_mailboxes')}</p>
          ) : (
            <div className="divide-y rounded-xl border">
              {accounts.map((email) => (
                <Label
                  key={email}
                  className="flex items-center gap-3 p-3 font-normal hover:bg-accent/40"
                >
                  <Checkbox
                    checked={selected.includes(email)}
                    onCheckedChange={(checked) => {
                      setSelected(
                        checked ? [...selected, email] : selected.filter((item) => item !== email),
                      );
                    }}
                  />
                  <Mail className="size-4 text-muted-foreground" />
                  {email}
                </Label>
              ))}
            </div>
          )}

          <p className="text-sm text-muted-foreground">{t('timezone', { timezone })}</p>

          <Button
            type="button"
            className="h-10"
            disabled={selected.length === 0 || step !== 'choosing'}
            onClick={handlePush}
          >
            <Send />
            {t('button_push')}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className="h-10"
          disabled={props.readyCount === 0 || step !== 'idle'}
          onClick={handleApprove}
        >
          {step !== 'idle' && <Spinner />}
          {step === 'idle' ? t('button_approve') : t('button_working')}
        </Button>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
