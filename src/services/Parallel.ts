import * as z from 'zod';
import { Env } from '@/libs/Env';
import type { contactSchema, leadSchema, parallelProcessorEnum } from '@/models/Schema';
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

/** The business fields a decision maker run is built from. */
export type DecisionMakerTarget = Pick<
  typeof leadSchema.$inferSelect,
  'company' | 'website' | 'hasWebsite' | 'phone' | 'address' | 'city' | 'category'
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

/** The decision maker and public contact Parallel is asked to find for a business. */
const DECISION_MAKER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    decision_maker_found: {
      type: 'boolean',
      description: 'Whether the person who decides on purchases for this business was identified.',
    },
    first_name: { type: 'string', description: 'First name of the decision maker, or "".' },
    last_name: { type: 'string', description: 'Last name of the decision maker, or "".' },
    role: {
      type: 'string',
      description: 'Role of the decision maker, such as owner, CEO or managing partner, or "".',
    },
    linkedin_url: {
      type: 'string',
      description: 'LinkedIn profile URL of the decision maker, or "" if not confirmed.',
    },
    public_email: {
      type: 'string',
      description:
        'An email address the business or its owner publishes for contact, exactly as published, or "" if none was found.',
    },
    public_email_source: {
      type: 'string',
      description: 'URL of the page where public_email was found, or "".',
    },
    confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: 'How certain you are that the decision maker belongs to this exact business.',
    },
    reasoning: {
      type: 'string',
      description: 'One or two sentences on which sources tie the findings to this business.',
    },
  },
  required: [
    'decision_maker_found',
    'first_name',
    'last_name',
    'role',
    'linkedin_url',
    'public_email',
    'public_email_source',
    'confidence',
    'reasoning',
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
 * Turns a business found on Google Maps into the research brief sent to Parallel.
 * A business without a website of its own is researched from its name, address
 * and phone, since those are all Google Maps knows about it.
 * @param lead The business to research.
 * @returns The plain-language task input.
 */
export const buildDecisionMakerInput = (lead: DecisionMakerTarget) => {
  const known = [
    ['Business name', lead.company],
    ['Category', lead.category],
    ['Address', lead.address],
    ['City', lead.city],
    ['Phone', lead.phone],
    [lead.hasWebsite ? 'Website' : 'Page listed as website', lead.website],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const knownLines = known.map(([label, value]) => `- ${label}: ${value}`).join('\n');

  return [
    'Identify who decides on purchases for this Italian business, and how to email them.',
    '',
    'Known details from Google Maps:',
    knownLines,
    '',
    'Rules:',
    '- The decision maker is the owner, CEO, managing partner or equivalent. For a sole trader it is the owner.',
    `- ${lead.hasWebsite ? 'Start from the website, then' : 'The business has no website of its own, so'} check the Facebook and Instagram pages, PagineGialle, industry directories, LinkedIn and the Italian business register.`,
    '- public_email is any address the business or its owner publishes for contact, including a Gmail or similar personal address. Never guess or construct an address.',
    '- Only report a person you can tie to this exact business, using the address, phone or name. Namesakes are common.',
    '- Leave a field as an empty string rather than guessing. An empty field is more useful than a wrong one.',
  ].join('\n');
};

/**
 * Starts a Parallel task run.
 * @param options The call options.
 * @param options.input The plain-language task input.
 * @param options.jsonSchema The shape of the output Parallel must return.
 * @param options.processor The Parallel processor tier to run.
 * @returns The identifier of the created run.
 * @throws {Error} When the API key is missing or Parallel rejects the request.
 */
const startRun = async (options: {
  input: string;
  jsonSchema: object;
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
      input: options.input,
      task_spec: {
        output_schema: {
          type: 'json',
          json_schema: options.jsonSchema,
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
}) =>
  await startRun({
    input: buildTaskInput(options.contact),
    jsonSchema: ENRICHMENT_JSON_SCHEMA,
    processor: options.processor,
  });

/**
 * Starts a Parallel task run that finds the decision maker of one business.
 * @param options The call options.
 * @param options.lead The business to research.
 * @param options.processor The Parallel processor tier to run.
 * @returns The identifier of the created run.
 * @throws {Error} When the API key is missing or Parallel rejects the request.
 */
export const createDecisionMakerRun = async (options: {
  lead: DecisionMakerTarget;
  processor: ParallelProcessor;
}) =>
  await startRun({
    input: buildDecisionMakerInput(options.lead),
    jsonSchema: DECISION_MAKER_JSON_SCHEMA,
    processor: options.processor,
  });

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
