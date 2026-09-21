import * as z from 'zod';
import { Env } from '@/libs/Env';
import type { contactSchema, parallelProcessorEnum } from '@/models/Schema';
import { requireEnv } from '@/utils/Helpers';
import type { EnrichmentBasis } from '@/validations/EnrichmentValidation';
import { EnrichmentBasisValidation } from '@/validations/EnrichmentValidation';

const PARALLEL_API_URL = 'https://api.parallel.ai/v1';

export type ParallelProcessor = (typeof parallelProcessorEnum.enumValues)[number];

/**
 * List price of one completed task run, in millionths of a US dollar.
 * Parallel bills per run, not per token, and failed runs are free.
 */
export const PROCESSOR_RUN_COST_MICROS: Record<ParallelProcessor, number> = {
  lite: 5000,
  base: 10_000,
  core: 25_000,
  pro: 100_000,
};

/** The contact fields a task run is built from. */
export type EnrichmentTarget = Pick<
  typeof contactSchema.$inferSelect,
  'email' | 'firstName' | 'lastName' | 'phone' | 'company' | 'website' | 'linkedinUrl' | 'extra'
>;

/**
 * The research fields Parallel is asked to fill in. Sized for the `core`
 * processor, which covers roughly ten fields per run.
 */
const ENRICHMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    person_found: {
      type: 'boolean',
      description: 'Whether any credible online presence was found for this exact person.',
    },
    identity_match_confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description:
        'How certain you are that the information below belongs to this exact person rather than a namesake. Use "low" whenever the only link is a common name.',
    },
    identity_match_reasoning: {
      type: 'string',
      description:
        'One or two sentences explaining which signals tie the findings to this person, or why they could not be tied to them.',
    },
    full_name: { type: 'string', description: 'Full name as published online, or "" if unknown.' },
    current_role: { type: 'string', description: 'Current job title, or "" if unknown.' },
    current_company: { type: 'string', description: 'Current employer, or "" if unknown.' },
    company_description: {
      type: 'string',
      description: 'What the company sells and to whom, in one or two sentences.',
    },
    company_industry: { type: 'string', description: 'Industry of the company, or "".' },
    location: { type: 'string', description: 'City and country, or "" if unknown.' },
    linkedin_url: { type: 'string', description: 'LinkedIn profile URL, or "" if not confirmed.' },
    recent_activity: {
      type: 'string',
      description:
        'Anything recent and verifiable: funding, launches, hiring, posts, talks, press. "" if nothing was found.',
    },
    personalization_hooks: {
      type: 'string',
      description:
        'Two or three concrete, checkable details a cold email could reference. Leave "" rather than inventing anything.',
    },
  },
  required: [
    'person_found',
    'identity_match_confidence',
    'identity_match_reasoning',
    'full_name',
    'current_role',
    'current_company',
    'company_description',
    'company_industry',
    'location',
    'linkedin_url',
    'recent_activity',
    'personalization_hooks',
  ],
} as const;

const createRunResponseSchema = z.object({
  run_id: z.string(),
  status: z.string(),
});

const runResultResponseSchema = z.object({
  run: z.object({
    run_id: z.string(),
    status: z.string(),
  }),
  output: z.object({
    type: z.string(),
    content: z.unknown(),
    basis: z.array(EnrichmentBasisValidation).nullish(),
  }),
});

export type TaskRunOutcome =
  | { state: 'completed'; content: unknown; basis: EnrichmentBasis[] }
  | { state: 'pending' }
  | { state: 'failed'; error: string };

/**
 * Turns the known contact fields into the research brief sent to Parallel.
 * Deliberately spells out how thin the input is so the model reports a low
 * identity confidence instead of guessing on a namesake.
 * @param contact The contact to research.
 * @returns The plain-language task input.
 */
export const buildTaskInput = (contact: EnrichmentTarget) => {
  const emailDomain = contact.email.split('@').at(1);

  const known = [
    ['Email', contact.email],
    ['Email domain', emailDomain],
    ['First name', contact.firstName],
    ['Last name', contact.lastName],
    ['Phone', contact.phone],
    ['Company', contact.company],
    ['Website', contact.website],
    ['LinkedIn', contact.linkedinUrl],
    ...Object.entries(contact.extra),
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const knownLines = known.map(([label, value]) => `- ${label}: ${value}`).join('\n');

  return [
    'Research this person so a cold email can reference something true and specific about them.',
    '',
    'Known details:',
    knownLines,
    '',
    'Rules:',
    `- The email domain (${emailDomain ?? 'unknown'}) is the strongest signal for the employer. Prefer sources that corroborate it.`,
    '- Only report findings you can tie to this exact person. Namesakes are common.',
    '- Set identity_match_confidence to "low" when the only link is a common name, "medium" when one independent signal corroborates, "high" when several do.',
    '- Leave a field as an empty string rather than guessing. An empty field is more useful than a wrong one.',
  ].join('\n');
};

/**
 * Starts a Parallel task run for one contact.
 * @param options The call options.
 * @param options.contact The contact to research.
 * @param options.processor The Parallel processor tier to run.
 * @returns The identifier of the created run.
 * @throws {Error} When the API key is missing or Parallel rejects the request.
 */
export const createTaskRun = async (options: {
  contact: EnrichmentTarget;
  processor: ParallelProcessor;
}) => {
  const apiKey = requireEnv('PARALLEL_API_KEY', Env.PARALLEL_API_KEY);

  const response = await fetch(`${PARALLEL_API_URL}/tasks/runs`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      processor: options.processor,
      input: buildTaskInput(options.contact),
      task_spec: {
        output_schema: {
          type: 'json',
          json_schema: ENRICHMENT_JSON_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Parallel run creation failed with ${response.status}: ${await response.text()}`,
    );
  }

  return createRunResponseSchema.parse(await response.json());
};

/**
 * Polls a Parallel task run for its result.
 * Keeps the request short so the worker never blocks: a run still in flight
 * answers 408 and is reported as pending rather than waited on.
 * @param options The call options.
 * @param options.runId The run to read.
 * @param options.timeoutSeconds How long Parallel may hold the request open.
 * @returns Whether the run completed, is still running, or failed.
 * @throws {Error} When the API key is missing.
 */
export const fetchTaskRunResult = async (options: {
  runId: string;
  timeoutSeconds: number;
}): Promise<TaskRunOutcome> => {
  const apiKey = requireEnv('PARALLEL_API_KEY', Env.PARALLEL_API_KEY);

  const response = await fetch(
    `${PARALLEL_API_URL}/tasks/runs/${options.runId}/result?timeout=${options.timeoutSeconds}`,
    { headers: { 'x-api-key': apiKey } },
  );

  // The run is still active and Parallel closed the long poll
  if (response.status === 408) {
    return { state: 'pending' };
  }

  if (!response.ok) {
    return {
      state: 'failed',
      error: `Parallel returned ${response.status}: ${await response.text()}`,
    };
  }

  const result = runResultResponseSchema.parse(await response.json());

  if (result.run.status !== 'completed') {
    return { state: 'failed', error: `Parallel run ended as ${result.run.status}` };
  }

  return {
    state: 'completed',
    content: result.output.content,
    basis: result.output.basis ?? [],
  };
};
