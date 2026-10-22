import * as z from 'zod';
import { findCopywritingModel } from '@/utils/CopywritingModels';

// The reply automation runs on Claude only
const claudeModel = z.string().refine((id) => findCopywritingModel(id)?.provider === 'anthropic', {
  error: 'Unknown Claude model',
});

const minutes = z.number().int().min(0).max(240);
const days = z.number().int().min(1).max(365);

export const AutomationSettingsValidation = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(['draft', 'auto']),
    confidenceThreshold: z.number().min(0).max(1),
    replyDelayMinMinutes: minutes,
    replyDelayMaxMinutes: minutes,
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
  .refine((value) => value.replyDelayMinMinutes <= value.replyDelayMaxMinutes, {
    error: 'The minimum delay cannot exceed the maximum',
    path: ['replyDelayMaxMinutes'],
  })
  .refine((value) => value.businessHourStart < value.businessHourEnd, {
    error: 'Business hours must end after they start',
    path: ['businessHourEnd'],
  });

export type AutomationSettingsInput = z.infer<typeof AutomationSettingsValidation>;

export const ObjectionValidation = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  examples: z.array(z.string().trim().min(1).max(300)).max(20),
  responseAngle: z.string().trim().min(1).max(2000),
  status: z.enum(['active', 'needs_review']),
  closesConversation: z.boolean().default(false),
});

export type ObjectionInput = z.infer<typeof ObjectionValidation>;

export const ReplySimulationValidation = z.object({
  company: z.string().trim().min(1).max(200),
  leadEmail: z.email(),
  previousEmail: z.string().trim().max(5000),
  replyText: z.string().trim().min(1).max(5000),
});

export const CATEGORY_VALUES = [
  'interested',
  'question',
  'objection',
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

/** The objection form, with examples typed one per line. */
export const ObjectionFormValidation = ObjectionValidation.omit({ examples: true }).extend({
  examplesText: z.string().max(6000),
});

/**
 * Splits the examples typed in the objection form into a list.
 * @param text One example per line.
 * @returns The non-empty examples.
 */
export const toObjectionExamples = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

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

export const OutboundRewriteValidation = z.object({ scheduledFor: scheduledForField });
