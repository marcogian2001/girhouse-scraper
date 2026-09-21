'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CampaignMappingStep } from '@/components/CampaignMappingStep';
import { CampaignReview } from '@/components/CampaignReview';
import { CampaignSettingsForm } from '@/components/CampaignSettingsForm';
import { CampaignWizardFooter } from '@/components/CampaignWizardFooter';
import { CampaignWizardSteps } from '@/components/CampaignWizardSteps';
import type { ParsedCsv } from '@/components/CsvUploader';
import { CsvUploader } from '@/components/CsvUploader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useRouter } from '@/libs/I18nNavigation';
import type { ColumnMapping } from '@/utils/Csv';
import { autoDetectMapping, toContactRows } from '@/utils/Csv';
import type { CampaignSettings } from '@/validations/CampaignValidation';
import {
  CampaignSettingsValidation,
  CampaignValidation,
  MAX_CONTACTS_PER_CAMPAIGN,
} from '@/validations/CampaignValidation';

const TOTAL_STEPS = 4;

export const NewCampaignWizard = (props: { knowledgeAssets: { id: string; name: string }[] }) => {
  const t = useTranslations('NewCampaignWizard');
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owned here rather than inside the settings step, so partial answers survive
  // a trip back to an earlier step
  const form = useForm({
    resolver: zodResolver(CampaignSettingsValidation),
    defaultValues: {
      name: '',
      processor: 'core' as const,
      emailCount: 3,
      delaysDays: [3, 4, 0],
      knowledgeAssetIds: [] as string[],
      extraPrompt: '',
    },
  });

  const contacts = csv ? toContactRows({ rows: csv.rows, mapping }) : [];

  // Static keys, so the message types check and no i18n glob is needed
  const steps = [
    { id: 'upload', label: t('step_upload_label'), hint: t('step_upload_hint') },
    { id: 'mapping', label: t('step_mapping_label'), hint: t('step_mapping_hint') },
    { id: 'sequence', label: t('step_sequence_label'), hint: t('step_sequence_hint') },
    { id: 'review', label: t('step_review_label'), hint: t('step_review_hint') },
  ];

  const activeStep = steps[step - 1];

  const handleNext = async () => {
    // Only the settings step needs schema validation before moving on
    if (step === 3) {
      if (!(await form.trigger())) {
        return;
      }

      // Parsed here rather than during render: `form.getValues()` reads mutable
      // state the React compiler would happily cache from the first render
      const parsed = CampaignSettingsValidation.safeParse(form.getValues());

      if (!parsed.success) {
        return;
      }

      setSettings(parsed.data);
    }

    setStep(Math.min(step + 1, TOTAL_STEPS));
  };

  const handleSubmit = async () => {
    if (!settings) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const parsed = CampaignValidation.safeParse({ ...settings, contacts });

    if (!parsed.success) {
      // The settings passed the same schema at step 3, so name the contact list
      // instead of sending the user back to the sequence for nothing
      const isContactIssue = parsed.error.issues.some((issue) => issue.path.at(0) === 'contacts');

      setError(isContactIssue ? t('error_contacts') : t('error_invalid'));
      setIsSubmitting(false);

      return;
    }

    const response = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });

    if (!response.ok) {
      setError(t('error_create'));
      setIsSubmitting(false);

      return;
    }

    const created: { id: string } = await response.json();

    router.push(`/dashboard/campaigns/${created.id}`);
  };

  const canAdvance =
    (step === 1 && csv !== null) ||
    (step === 2 && contacts.length > 0 && contacts.length <= MAX_CONTACTS_PER_CAMPAIGN) ||
    step === 3;

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CampaignWizardSteps steps={steps} current={step} onSelect={setStep} />
      </CardHeader>

      <CardContent className="min-h-96 space-y-6">
        {/* The stepper above already names the step, so only the hint is needed */}
        <p className="text-sm text-muted-foreground">{activeStep?.hint}</p>

        {step === 1 && (
          <CsvUploader
            fileName={csv?.fileName}
            onParsed={(parsed) => {
              setCsv(parsed);
              setMapping(autoDetectMapping(parsed.headers));

              // Seed the campaign name from the file, unless the user typed one
              if (!form.getFieldState('name').isDirty) {
                form.setValue('name', parsed.fileName.replace(/\.csv$/iu, ''));
              }

              setStep(2);
            }}
          />
        )}

        {step === 2 && csv && (
          <CampaignMappingStep
            headers={csv.headers}
            mapping={mapping}
            contacts={contacts}
            totalRows={csv.rows.length}
            onChange={setMapping}
          />
        )}

        {step === 3 && <CampaignSettingsForm form={form} knowledgeAssets={props.knowledgeAssets} />}

        {step === 4 && csv && settings && (
          <CampaignReview
            fileName={csv.fileName}
            contactCount={contacts.length}
            settings={settings}
            knowledgeAssets={props.knowledgeAssets}
          />
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CampaignWizardFooter
        isFirstStep={step === 1}
        isLastStep={step === TOTAL_STEPS}
        canAdvance={canAdvance}
        isSubmitting={isSubmitting}
        onBack={() => {
          setStep(Math.max(step - 1, 1));
        }}
        onNext={handleNext}
        onSubmit={handleSubmit}
      />
    </Card>
  );
};
