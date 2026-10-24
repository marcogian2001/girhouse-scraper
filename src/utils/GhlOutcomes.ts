import type { CalendarAppointment, PipelineOpportunity } from '@/services/GoHighLevel';

/** What GHL knows of a lead, as the campaign tests count it. */
export type GhlOutcome = {
  email: string;
  callBookedAt: Date | null;
  noShowAt: Date | null;
  wonAt: Date | null;
  wonValue: number | null;
};

/**
 * The stages of the cold email pipeline a lead only reaches after booking a call, by
 * the start of their lower-cased name. "Chiamata Non Schedulata" is not one of them.
 */
const BOOKED_STAGES = ['chiamata schedulata', 'chiamata completata', 'no show', 'chiuso'];

const NO_SHOW_STAGE = 'no show';

const WON_STAGE = 'chiuso';

/** Appointment statuses that are not a booked call. */
const VOID_APPOINTMENTS = new Set(['cancelled', 'invalid']);

/**
 * Picks the earliest of two times.
 * @param a A time, if any.
 * @param b Another time, if any.
 * @returns The earliest, or null when both are missing.
 */
const earliest = (a: Date | null, b: Date | null) => {
  if (a && b) {
    return a < b ? a : b;
  }

  return a ?? b;
};

/**
 * Reads a GHL time.
 * @param value An ISO time, if any.
 * @returns The date, or null.
 */
const toDate = (value: string | null | undefined) => (value ? new Date(value) : null);

/**
 * Reads what one opportunity says of its lead: a call when it reached a stage past the
 * booking, a no show and a sale by their stage, and a sale also by its won status.
 * @param opportunity The opportunity.
 * @param stageName The name of its stage.
 * @returns The outcome, without the email.
 */
const opportunityOutcome = (opportunity: PipelineOpportunity, stageName: string) => {
  const stage = stageName.trim().toLowerCase();
  const stageChangedAt = toDate(opportunity.lastStageChangeAt ?? opportunity.createdAt);
  const isWon = opportunity.status === 'won' || stage.startsWith(WON_STAGE);
  const isBooked = isWon || BOOKED_STAGES.some((booked) => stage.startsWith(booked));

  return {
    callBookedAt: isBooked ? stageChangedAt : null,
    noShowAt: stage.startsWith(NO_SHOW_STAGE) ? stageChangedAt : null,
    wonAt: isWon
      ? toDate(
          opportunity.status === 'won'
            ? (opportunity.lastStatusChangeAt ?? opportunity.lastStageChangeAt)
            : opportunity.lastStageChangeAt,
        )
      : null,
    wonValue: isWon ? (opportunity.monetaryValue ?? null) : null,
  };
};

/**
 * Reads what one appointment says of its lead: any appointment not cancelled is a booked
 * call, booked when it was added, and one marked "noshow" a missed call.
 * @param appointment The appointment.
 * @returns The outcome, without the email, or null when it is not a call.
 */
const appointmentOutcome = (appointment: CalendarAppointment) => {
  const status = appointment.appointmentStatus ?? '';

  if (appointment.deleted || VOID_APPOINTMENTS.has(status)) {
    return null;
  }

  return {
    callBookedAt: toDate(appointment.dateAdded),
    noShowAt: status === 'noshow' ? toDate(appointment.dateUpdated ?? appointment.dateAdded) : null,
    wonAt: null,
    wonValue: null,
  };
};

/**
 * Turns the cold email pipeline and the calendar into each lead's outcome: who booked
 * a call, missed it or bought. Only the pipeline's contacts count, and a contact with
 * several opportunities or appointments keeps the earliest time of each.
 * @param options What GHL holds.
 * @param options.opportunities The pipeline's opportunities.
 * @param options.stageNames The name of each stage, by its id.
 * @param options.appointments The calendar's appointments.
 * @returns The outcome of each lead with at least a booked call, by lower-cased email.
 */
export const toGhlOutcomes = (options: {
  opportunities: PipelineOpportunity[];
  stageNames: Map<string, string>;
  appointments: CalendarAppointment[];
}) => {
  const emails = new Map(
    options.opportunities.flatMap((opportunity) => {
      const email = opportunity.contact?.email?.trim().toLowerCase();

      return email ? [[opportunity.contactId, email] as const] : [];
    }),
  );
  const facts = [
    ...options.opportunities.map((opportunity) => ({
      contactId: opportunity.contactId,
      outcome: opportunityOutcome(
        opportunity,
        options.stageNames.get(opportunity.pipelineStageId) ?? '',
      ),
    })),
    ...options.appointments.map((appointment) => ({
      contactId: appointment.contactId ?? '',
      outcome: appointmentOutcome(appointment),
    })),
  ];
  const outcomes = new Map<string, GhlOutcome>();

  for (const fact of facts) {
    const email = emails.get(fact.contactId);

    if (!email || !fact.outcome?.callBookedAt) {
      continue;
    }

    const current = outcomes.get(email);

    outcomes.set(email, {
      email,
      callBookedAt: earliest(current?.callBookedAt ?? null, fact.outcome.callBookedAt),
      noShowAt: earliest(current?.noShowAt ?? null, fact.outcome.noShowAt),
      wonAt: earliest(current?.wonAt ?? null, fact.outcome.wonAt),
      wonValue: fact.outcome.wonValue ?? current?.wonValue ?? null,
    });
  }

  return outcomes;
};
