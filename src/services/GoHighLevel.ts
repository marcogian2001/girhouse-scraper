import * as z from 'zod';
import { Env } from '@/libs/Env';
import { AppConfig } from '@/utils/AppConfig';
import { requireEnv } from '@/utils/Helpers';

const GHL_API_URL = 'https://services.leadconnectorhq.com';

/** GHL versions each API family separately. */
const API_VERSIONS = {
  calendars: '2021-04-15',
  contacts: '2021-07-28',
  opportunities: '2021-07-28',
  locations: '2021-07-28',
} as const;

const freeSlotsSchema = z.record(z.string(), z.unknown());

const daySlotsSchema = z.object({ slots: z.array(z.string()) });

const calendarSchema = z.object({
  calendar: z.object({
    slotDuration: z.number(),
    slotDurationUnit: z.string().optional(),
  }),
});

const upsertContactSchema = z.object({ contact: z.object({ id: z.string() }) });

const appointmentSchema = z.object({ id: z.string() });

const duplicateContactSchema = z.object({ contact: z.object({ id: z.string() }).nullish() });

const opportunitySchema = z.object({ opportunity: z.object({ id: z.string() }) });

const opportunitySearchSchema = z.object({
  opportunities: z.array(z.object({ id: z.string(), assignedTo: z.string().nullish() })),
});

const pipelineListSchema = z.object({
  pipelines: z.array(
    z.object({
      id: z.string(),
      stages: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
});

const pipelineOpportunitySchema = z.object({
  contactId: z.string(),
  pipelineStageId: z.string(),
  status: z.string(),
  monetaryValue: z.number().nullish(),
  createdAt: z.string(),
  lastStageChangeAt: z.string().nullish(),
  lastStatusChangeAt: z.string().nullish(),
  contact: z.object({ email: z.string().nullish() }).nullish(),
});

const opportunityPageSchema = z.object({
  opportunities: z.array(pipelineOpportunitySchema),
  // A number on the first page and text on the next ones
  meta: z.object({ nextPage: z.coerce.number().nullish() }),
});

const calendarEventSchema = z.object({
  contactId: z.string().nullish(),
  appointmentStatus: z.string().nullish(),
  dateAdded: z.string().nullish(),
  dateUpdated: z.string().nullish(),
  deleted: z.boolean().nullish(),
});

const calendarEventListSchema = z.object({ events: z.array(calendarEventSchema) });

const customFieldSchema = z.object({ id: z.string(), name: z.string(), fieldKey: z.string() });

const customFieldListSchema = z.object({ customFields: z.array(customFieldSchema) });

const customFieldCreatedSchema = z.object({ customField: customFieldSchema });

/** The ids of the contact fields already found or created, by key, for this process. */
const contactFieldIds = new Map<string, string>();

/**
 * Tells whether the calendar booking is configured.
 * @returns True when the token, location and calendar are all set.
 */
export const isGhlConfigured = () =>
  Boolean(Env.GHL_API_TOKEN && Env.GHL_LOCATION_ID && Env.GHL_CALENDAR_ID);

/**
 * Tells whether booked calls also land in the sales pipeline.
 * @returns True when the pipeline and its "call booked" stage are set.
 */
export const isPipelineConfigured = () => Boolean(Env.GHL_PIPELINE_ID && Env.GHL_PIPELINE_STAGE_ID);

/**
 * Calls the GHL API and fails loudly on a non-2xx response.
 * @param options The call options.
 * @param options.path The API path.
 * @param options.family Which API family the path belongs to, for the version header.
 * @param options.body The JSON body, sent as a POST unless another method is given.
 * @param options.method The HTTP method, when the body goes with a PUT.
 * @returns The parsed JSON response.
 * @throws {Error} When the token is missing or GHL rejects the request.
 */
const request = async (options: {
  path: string;
  family: keyof typeof API_VERSIONS;
  body?: Record<string, unknown>;
  method?: 'PUT';
}): Promise<unknown> => {
  const token = requireEnv('GHL_API_TOKEN', Env.GHL_API_TOKEN);

  const response = await fetch(`${GHL_API_URL}${options.path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSIONS[options.family],
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: options.body && JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`GHL ${options.path} failed with ${response.status}: ${await response.text()}`);
  }

  return await response.json();
};

/**
 * Reads the free slots out of a GHL response, which keys each day by its date
 * and mixes in a `traceId`.
 * @param body The parsed JSON response.
 * @returns The free start times of each day, days in order.
 */
export const parseFreeSlots = (body: unknown) =>
  Object.entries(freeSlotsSchema.parse(body))
    .flatMap(([date, value]) => {
      const day = daySlotsSchema.safeParse(value);

      return /^\d{4}-\d{2}-\d{2}$/u.test(date) && day.success && day.data.slots.length > 0
        ? [{ date, slots: day.data.slots }]
        : [];
    })
    .toSorted((a, b) => a.date.localeCompare(b.date));

/**
 * Lists the calendar's free slots in Italian time.
 * @param options The range.
 * @param options.from The first instant to look at.
 * @param options.to The last instant to look at.
 * @returns The free start times, grouped by day.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const getFreeSlots = async (options: { from: Date; to: Date }) => {
  const calendarId = requireEnv('GHL_CALENDAR_ID', Env.GHL_CALENDAR_ID);
  const query = new URLSearchParams({
    startDate: String(options.from.getTime()),
    endDate: String(options.to.getTime()),
    timezone: AppConfig.timeZone,
  });

  return parseFreeSlots(
    await request({
      path: `/calendars/${calendarId}/free-slots?${query.toString()}`,
      family: 'calendars',
    }),
  );
};

/**
 * Reads how long one call on the calendar lasts.
 * @returns The slot duration in minutes.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const getSlotMinutes = async () => {
  const calendarId = requireEnv('GHL_CALENDAR_ID', Env.GHL_CALENDAR_ID);
  const { calendar } = calendarSchema.parse(
    await request({ path: `/calendars/${calendarId}`, family: 'calendars' }),
  );

  return calendar.slotDurationUnit === 'hours' ? calendar.slotDuration * 60 : calendar.slotDuration;
};

/** A value for one of the contact's custom fields, by the field's GHL id. */
export type CustomFieldValue = { id: string; value: string };

/**
 * Creates the lead as a GHL contact, or updates the one with the same email or phone.
 * Tags are added apart with `addContactTags`: here they would replace the contact's own.
 * @param options The contact.
 * @param options.phone The WhatsApp number in E.164, when the lead gave one.
 * @param options.email The email the lead replied from.
 * @param options.name Who the call is with, the business name when no person is known.
 * @param options.companyName The business name.
 * @param options.customFields Custom field values to set, when there are any.
 * @returns The GHL contact id.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const upsertContact = async (options: {
  phone: string | null;
  email: string;
  name: string;
  companyName: string;
  customFields?: CustomFieldValue[];
}) => {
  const locationId = requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID);
  const { contact } = upsertContactSchema.parse(
    await request({
      path: '/contacts/upsert',
      family: 'contacts',
      body: {
        locationId,
        source: 'Girhouse demo',
        email: options.email,
        name: options.name,
        companyName: options.companyName,
        ...(options.phone ? { phone: options.phone } : {}),
        ...(options.customFields
          ? {
              customFields: options.customFields.map((field) => ({
                id: field.id,
                field_value: field.value,
              })),
            }
          : {}),
      },
    }),
  );

  return contact.id;
};

/**
 * Adds tags to a contact, keeping the ones it has. A tag can start a GHL workflow.
 * @param contactId The GHL contact.
 * @param tags The tags to add.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const addContactTags = async (contactId: string, tags: string[]) => {
  await request({ path: `/contacts/${contactId}/tags`, family: 'contacts', body: { tags } });
};

/**
 * Books a call on the calendar. GHL checks the slot is still free and sends its confirmations.
 * @param options The appointment.
 * @param options.contactId The GHL contact the call is with.
 * @param options.startTime When the call starts, as returned by `getFreeSlots`.
 * @param options.minutes How long the call lasts.
 * @param options.title The calendar event title.
 * @returns The GHL appointment id.
 * @throws {Error} When GHL is not configured, the slot is taken, or GHL rejects the request.
 */
export const createAppointment = async (options: {
  contactId: string;
  startTime: string;
  minutes: number;
  title: string;
}) => {
  const end = new Date(new Date(options.startTime).getTime() + options.minutes * 60_000);

  const appointment = appointmentSchema.parse(
    await request({
      path: '/calendars/events/appointments',
      family: 'calendars',
      body: {
        calendarId: requireEnv('GHL_CALENDAR_ID', Env.GHL_CALENDAR_ID),
        locationId: requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID),
        contactId: options.contactId,
        startTime: options.startTime,
        endTime: end.toISOString(),
        title: options.title,
        appointmentStatus: 'confirmed',
      },
    }),
  );

  return appointment.id;
};

/**
 * Finds the GHL contact with this email, without creating one.
 * @param email The lead's email.
 * @returns The contact id, or null when GHL has no such contact.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const findContactByEmail = async (email: string) => {
  const query = new URLSearchParams({
    locationId: requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID),
    email,
  });
  const { contact } = duplicateContactSchema.parse(
    await request({ path: `/contacts/search/duplicate?${query.toString()}`, family: 'contacts' }),
  );

  return contact?.id ?? null;
};

/**
 * Marks a contact Do Not Disturb, so GHL sends it nothing more on any channel.
 * @param contactId The GHL contact.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const setContactDnd = async (contactId: string) => {
  await request({
    path: `/contacts/${contactId}`,
    family: 'contacts',
    method: 'PUT',
    body: { dnd: true },
  });
};

/**
 * Puts the lead's opportunity in the "call booked" stage of the sales pipeline,
 * creating it when the contact has none there yet.
 * @param options The opportunity.
 * @param options.contactId The GHL contact.
 * @param options.name The opportunity name, the business name.
 * @returns The GHL opportunity id.
 * @throws {Error} When GHL or the pipeline is not configured, or GHL rejects the request.
 */
export const upsertBookedOpportunity = async (options: { contactId: string; name: string }) => {
  const { opportunity } = opportunitySchema.parse(
    await request({
      path: '/opportunities/upsert',
      family: 'opportunities',
      body: {
        locationId: requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID),
        pipelineId: requireEnv('GHL_PIPELINE_ID', Env.GHL_PIPELINE_ID),
        pipelineStageId: requireEnv('GHL_PIPELINE_STAGE_ID', Env.GHL_PIPELINE_STAGE_ID),
        contactId: options.contactId,
        name: options.name,
        status: 'open',
      },
    }),
  );

  return opportunity.id;
};

/**
 * Assigns a contact to a GHL user, creating the contact from its email when GHL has none.
 * Only the email and the owner are sent, so the name and tags GHL holds stay as they are.
 * @param options The contact.
 * @param options.email The email the lead replied from.
 * @param options.userId The GHL user who owns the contact.
 * @returns The GHL contact id.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const assignContact = async (options: { email: string; userId: string }) => {
  const { contact } = upsertContactSchema.parse(
    await request({
      path: '/contacts/upsert',
      family: 'contacts',
      body: {
        locationId: requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID),
        email: options.email,
        assignedTo: options.userId,
      },
    }),
  );

  return contact.id;
};

/**
 * Finds a contact's opportunity in the sales pipeline.
 * @param contactId The GHL contact.
 * @returns The opportunity and who it is assigned to, or undefined when it has none there.
 * @throws {Error} When GHL or the pipeline is not configured, or GHL rejects the request.
 */
export const findPipelineOpportunity = async (contactId: string) => {
  const query = new URLSearchParams({
    location_id: requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID),
    pipeline_id: requireEnv('GHL_PIPELINE_ID', Env.GHL_PIPELINE_ID),
    contact_id: contactId,
  });
  const { opportunities } = opportunitySearchSchema.parse(
    await request({ path: `/opportunities/search?${query.toString()}`, family: 'opportunities' }),
  );

  return opportunities[0];
};

/**
 * Assigns an opportunity to a GHL user.
 * @param options The assignment.
 * @param options.opportunityId The GHL opportunity.
 * @param options.userId The GHL user who owns it.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const assignOpportunity = async (options: { opportunityId: string; userId: string }) => {
  await request({
    path: `/opportunities/${options.opportunityId}`,
    family: 'opportunities',
    method: 'PUT',
    body: { assignedTo: options.userId },
  });
};

/**
 * Reads the names of the sales pipeline's stages.
 * @returns Each stage's name, by its id.
 * @throws {Error} When GHL or the pipeline is not configured, or GHL rejects the request.
 */
export const getPipelineStageNames = async () => {
  const pipelineId = requireEnv('GHL_PIPELINE_ID', Env.GHL_PIPELINE_ID);
  const query = new URLSearchParams({
    locationId: requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID),
  });
  const { pipelines } = pipelineListSchema.parse(
    await request({
      path: `/opportunities/pipelines?${query.toString()}`,
      family: 'opportunities',
    }),
  );
  const pipeline = pipelines.find((candidate) => candidate.id === pipelineId);

  return new Map(pipeline?.stages.map((stage) => [stage.id, stage.name]));
};

/** An opportunity of the sales pipeline, with its contact's email. */
export type PipelineOpportunity = z.infer<typeof pipelineOpportunitySchema>;

/**
 * Lists every opportunity of the sales pipeline, open, won, lost and abandoned.
 * @returns The opportunities.
 * @throws {Error} When GHL or the pipeline is not configured, or GHL rejects the request.
 */
export const listPipelineOpportunities = async () => {
  const opportunities: PipelineOpportunity[] = [];
  let page: number | null | undefined = 1;

  while (page) {
    const query = new URLSearchParams({
      location_id: requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID),
      pipeline_id: requireEnv('GHL_PIPELINE_ID', Env.GHL_PIPELINE_ID),
      limit: '100',
      page: String(page),
    });
    const body = opportunityPageSchema.parse(
      // oxlint-disable-next-line no-await-in-loop
      await request({ path: `/opportunities/search?${query.toString()}`, family: 'opportunities' }),
    );

    opportunities.push(...body.opportunities);
    page = body.meta.nextPage;
  }

  return opportunities;
};

/** An appointment on the calendar, with its status as GHL names it. */
export type CalendarAppointment = z.infer<typeof calendarEventSchema>;

/**
 * Lists the calendar's appointments in a range, cancelled ones included.
 * @param options The range.
 * @param options.from The first start time to look at.
 * @param options.to The last start time to look at.
 * @returns The appointments.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const listCalendarAppointments = async (options: { from: Date; to: Date }) => {
  const query = new URLSearchParams({
    locationId: requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID),
    calendarId: requireEnv('GHL_CALENDAR_ID', Env.GHL_CALENDAR_ID),
    startTime: String(options.from.getTime()),
    endTime: String(options.to.getTime()),
  });
  const { events } = calendarEventListSchema.parse(
    await request({ path: `/calendars/events?${query.toString()}`, family: 'calendars' }),
  );

  return events;
};

/** A custom field the platform writes on GHL contacts, by its key without the `contact.` prefix. */
export type ContactFieldSpec = { key: string; name: string; dataType: 'TEXT' | 'LARGE_TEXT' };

/**
 * Makes sure the contact custom fields exist on the location, creating the missing ones,
 * so GHL workflows can read them as `{{contact.<key>}}`.
 * @param fields The fields the platform writes.
 * @returns The GHL id of each field, by key.
 * @throws {Error} When GHL is not configured or the token lacks the custom fields scopes.
 */
export const ensureContactFields = async (fields: ContactFieldSpec[]) => {
  const missing = fields.filter((field) => !contactFieldIds.has(field.key));

  if (missing.length > 0) {
    const locationId = requireEnv('GHL_LOCATION_ID', Env.GHL_LOCATION_ID);
    const { customFields } = customFieldListSchema.parse(
      await request({
        path: `/locations/${locationId}/customFields?model=contact`,
        family: 'locations',
      }),
    );

    for (const field of missing) {
      const existing = customFields.find(
        (candidate) =>
          candidate.fieldKey === `contact.${field.key}` || candidate.name === field.name,
      );
      const id =
        existing?.id ??
        customFieldCreatedSchema.parse(
          // oxlint-disable-next-line no-await-in-loop
          await request({
            path: `/locations/${locationId}/customFields`,
            family: 'locations',
            body: { name: field.name, dataType: field.dataType, model: 'contact' },
          }),
        ).customField.id;

      contactFieldIds.set(field.key, id);
    }
  }

  return new Map(fields.map((field) => [field.key, contactFieldIds.get(field.key) ?? '']));
};

/**
 * Pairs the values to write with the GHL ids of their fields, skipping fields without an id.
 * @param ids The GHL id of each field, by key.
 * @param values The value of each field, by key.
 * @returns The custom field values for `upsertContact`.
 */
export const toCustomFieldValues = (ids: Map<string, string>, values: Record<string, string>) =>
  Object.entries(values).flatMap(([key, value]) => {
    const id = ids.get(key);

    return id ? [{ id, value }] : [];
  });
