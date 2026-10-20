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

/**
 * Creates the lead as a GHL contact, or updates the one with the same email or phone.
 * @param options The contact.
 * @param options.phone The WhatsApp number in E.164, when the lead gave one.
 * @param options.email The email the lead replied from.
 * @param options.name Who the call is with, the business name when no person is known.
 * @param options.companyName The business name.
 * @param options.tags Tags that start GHL workflows.
 * @returns The GHL contact id.
 * @throws {Error} When GHL is not configured or rejects the request.
 */
export const upsertContact = async (options: {
  phone: string | null;
  email: string;
  name: string;
  companyName: string;
  tags: string[];
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
        tags: options.tags,
        ...(options.phone ? { phone: options.phone } : {}),
      },
    }),
  );

  return contact.id;
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
