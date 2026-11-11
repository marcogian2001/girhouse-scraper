import * as z from 'zod';
import { findCopywritingModel } from '@/utils/CopywritingModels';

// The reply automation runs on Claude only
const claudeModel = z.string().refine((id) => findCopywritingModel(id)?.provider === 'anthropic', {
  error: 'Unknown Claude model',
});

const days = z.number().int().min(1).max(365);

/** How the one answer to a "not interested" reads: A offers the demo, B shares its link. */
export const NOT_INTERESTED_VERSIONS = ['a', 'b'] as const;

export type NotInterestedVersion = (typeof NOT_INTERESTED_VERSIONS)[number];

export const AutomationSettingsValidation = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(['draft', 'auto']),
    confidenceThreshold: z.number().min(0).max(1),
    businessHourStart: z.number().int().min(0).max(23),
    businessHourEnd: z.number().int().min(1).max(24),
    monthlyPrice: z.number().int().min(1).max(10_000),
    newMonthlyPrice: z.number().int().min(1).max(10_000),
    priceIncreaseDays: days,
    onboardingSlotsPerMonth: z.number().int().min(1).max(1000),
    demoNotOpenedBusinessDays: days,
    maxFollowUps: z.number().int().min(0).max(10),
    whatsappAfterBusinessDays: days,
    nurturingIntervalDays: days,
    nurturingMaxCount: z.number().int().min(0).max(12),
    classificationModel: claudeModel,
    writingModel: claudeModel,
    whatsappBusinessNumber: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/u)
      .nullable(),
  })
  .refine((value) => value.businessHourStart < value.businessHourEnd, {
    error: 'Business hours must end after they start',
    path: ['businessHourEnd'],
  });

export type AutomationSettingsInput = z.infer<typeof AutomationSettingsValidation>;

export const ReplyImportValidation = z.object({
  leadEmail: z.email(),
});

export const CATEGORY_VALUES = [
  'interested',
  'question',
  'not_now',
  'not_interested',
  'stop',
  'out_of_office',
  'auto_reply',
  'wrong_person',
  'other',
] as const;

export const ClassificationOverrideValidation = z.object({
  category: z.enum(CATEGORY_VALUES),
});

// A send time as a date field gives it, in Italian time; null sends as soon as possible
const scheduledForField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u)
  .nullable()
  .optional();

export const OutboundApprovalValidation = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(5000),
  scheduledFor: scheduledForField,
});

export const OutboundRewriteValidation = z.object({
  scheduledFor: scheduledForField,
  notInterestedVersion: z.enum(NOT_INTERESTED_VERSIONS).optional(),
});
