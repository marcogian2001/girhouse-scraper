import { describe, expect, it } from 'vitest';
import type { CalendarAppointment, PipelineOpportunity } from '@/services/GoHighLevel';
import { toGhlOutcomes } from './GhlOutcomes';

const stageNames = new Map([
  ['positive', 'Risposto Positivo (Email)'],
  ['not-scheduled', 'Interessato, Chiamata Non Schedulata'],
  ['scheduled', 'Chiamata Schedulata'],
  ['completed', 'Chiamata Completata (In Trattativa)'],
  ['no-show', 'No Show'],
  ['closed', 'Chiuso'],
  ['disqualified', 'Squalificato'],
]);

const opportunity = (overrides: Partial<PipelineOpportunity>): PipelineOpportunity => ({
  contactId: 'contact-1',
  pipelineStageId: 'positive',
  status: 'open',
  monetaryValue: 97,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastStageChangeAt: '2026-10-05T10:00:00.000Z',
  lastStatusChangeAt: '2026-10-01T10:00:00.000Z',
  contact: { email: 'Lead@Example.it' },
  ...overrides,
});

const appointment = (overrides: Partial<CalendarAppointment>): CalendarAppointment => ({
  contactId: 'contact-1',
  appointmentStatus: 'confirmed',
  dateAdded: '2026-10-03T10:00:00.000Z',
  dateUpdated: '2026-10-03T10:00:00.000Z',
  deleted: false,
  ...overrides,
});

describe('GHL outcomes', () => {
  describe(toGhlOutcomes, () => {
    it('counts a call for a lead in a stage past the booking', () => {
      const outcomes = toGhlOutcomes({
        opportunities: [opportunity({ pipelineStageId: 'completed' })],
        stageNames,
        appointments: [],
      });

      expect(outcomes.get('lead@example.it')).toStrictEqual({
        email: 'lead@example.it',
        callBookedAt: new Date('2026-10-05T10:00:00.000Z'),
        noShowAt: null,
        wonAt: null,
        wonValue: null,
      });
    });

    it('leaves out a lead interested without a scheduled call', () => {
      expect(
        toGhlOutcomes({
          opportunities: [opportunity({ pipelineStageId: 'not-scheduled' })],
          stageNames,
          appointments: [],
        }).size,
      ).toBe(0);
    });

    it('counts a call for a disqualified lead with an appointment', () => {
      const outcomes = toGhlOutcomes({
        opportunities: [opportunity({ pipelineStageId: 'disqualified' })],
        stageNames,
        appointments: [appointment({})],
      });

      expect(outcomes.get('lead@example.it')?.callBookedAt).toStrictEqual(
        new Date('2026-10-03T10:00:00.000Z'),
      );
    });

    it('ignores a cancelled appointment', () => {
      expect(
        toGhlOutcomes({
          opportunities: [opportunity({})],
          stageNames,
          appointments: [appointment({ appointmentStatus: 'cancelled' })],
        }).size,
      ).toBe(0);
    });

    it('ignores an appointment of a contact outside the pipeline', () => {
      expect(
        toGhlOutcomes({
          opportunities: [opportunity({})],
          stageNames,
          appointments: [appointment({ contactId: 'contact-2' })],
        }).size,
      ).toBe(0);
    });

    it('marks a no show from the stage or the appointment', () => {
      const outcomes = toGhlOutcomes({
        opportunities: [
          opportunity({ pipelineStageId: 'no-show' }),
          opportunity({ contactId: 'contact-2', contact: { email: 'other@example.it' } }),
        ],
        stageNames,
        appointments: [
          appointment({
            contactId: 'contact-2',
            appointmentStatus: 'noshow',
            dateUpdated: '2026-10-06T10:00:00.000Z',
          }),
        ],
      });

      expect(outcomes.get('lead@example.it')?.noShowAt).toStrictEqual(
        new Date('2026-10-05T10:00:00.000Z'),
      );
      expect(outcomes.get('other@example.it')?.noShowAt).toStrictEqual(
        new Date('2026-10-06T10:00:00.000Z'),
      );
    });

    it('records a sale with its value from a won status or the closed stage', () => {
      const outcomes = toGhlOutcomes({
        opportunities: [
          opportunity({ status: 'won', lastStatusChangeAt: '2026-10-08T10:00:00.000Z' }),
          opportunity({
            contactId: 'contact-2',
            pipelineStageId: 'closed',
            monetaryValue: null,
            contact: { email: 'other@example.it' },
          }),
        ],
        stageNames,
        appointments: [],
      });

      expect(outcomes.get('lead@example.it')).toMatchObject({
        wonAt: new Date('2026-10-08T10:00:00.000Z'),
        wonValue: 97,
      });
      expect(outcomes.get('other@example.it')).toMatchObject({
        wonAt: new Date('2026-10-05T10:00:00.000Z'),
        wonValue: null,
      });
    });

    it('keeps the earliest booking of a lead with several opportunities', () => {
      const outcomes = toGhlOutcomes({
        opportunities: [
          opportunity({ pipelineStageId: 'scheduled' }),
          opportunity({
            contactId: 'contact-2',
            pipelineStageId: 'scheduled',
            lastStageChangeAt: '2026-10-02T10:00:00.000Z',
          }),
        ],
        stageNames,
        appointments: [],
      });

      expect(outcomes.get('lead@example.it')?.callBookedAt).toStrictEqual(
        new Date('2026-10-02T10:00:00.000Z'),
      );
    });
  });
});
