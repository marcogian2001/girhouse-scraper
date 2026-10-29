import { describe, expect, it } from 'vitest';
import type { DemoSnapshot } from '@/models/Schema';
import type { VslScene } from './VslScript';
import {
  buildVslScenes,
  spokenDurationMs,
  vslLineMarkup,
  vslLineOf,
  vslLinesToVoice,
  vslSceneMinimumMs,
} from './VslScript';

const data: DemoSnapshot = {
  version: 3,
  company: 'Autofficina Rossi',
  city: 'Taranto',
  address: null,
  phone: '+39 099 1234567',
  category: 'Autofficina',
  categories: [],
  openingHours: [],
  website: null,
  placeId: null,
  rating: 4.8,
  reviewsCount: 120,
  logoUrl: null,
  primaryColor: '#24336b',
  landing: {
    headline: 'Autofficina a Taranto',
    subheadline: 'Preventivi su WhatsApp',
    about: null,
    ctaLabel: 'Chiedi un preventivo',
    services: [{ name: 'Revisione', description: null }],
  },
  chat: {
    customerName: 'Luca',
    service: 'Revisione',
    note: null,
    messages: [
      { from: 'customer', text: 'Mi fate un preventivo?', options: [] },
      { from: 'business', text: 'Certo Luca! Per cosa?', options: [] },
      { from: 'customer', text: 'Un rumore ai freni', options: [] },
      {
        from: 'business',
        text: 'Quale preferisci?',
        options: ['Martedì alle 9:00', 'Giovedì alle 15:00'],
      },
      { from: 'customer', text: 'Martedì alle 9:00', options: [] },
      { from: 'business', text: 'Fissato!', options: [] },
    ],
  },
};

const chat = (upTo: number): VslScene => ({ step: 2, kind: 'chat', upTo, line: 'chat_slots' });

const translate = {
  fixed: (line: string) => `fixed:${line}`,
  tour: (line: string) => `tour:${line}`,
};

describe('VslScript', () => {
  describe('Scenes', () => {
    it('puts the reminder right after the booked chat', () => {
      const scenes = buildVslScenes({ data, hasReviews: false });
      const booked = scenes.findIndex((scene) => scene.line === 'chat_booked');

      expect(scenes[booked + 1]).toStrictEqual({ step: 2, kind: 'reminder', line: 'reminder' });
    });

    it('ends on the booking', () => {
      expect(buildVslScenes({ data, hasReviews: false }).at(-1)?.kind).toBe('booking');
    });

    it('names the booking line after its phase', () => {
      expect(vslLineOf({ step: 6, kind: 'booking', line: 'booking' }, 'slots')).toBe(
        'booking_slots',
      );
    });
  });

  describe('Lines', () => {
    it('says the line the AI wrote, with its highlights as marks', () => {
      expect(
        vslLineMarkup({
          line: 'chat_start',
          vsl: { lines: { chat_start: 'Ecco <hl>Luca</hl>' } },
          translate,
        }),
      ).toBe('Ecco <mark>Luca</mark>');
    });

    it('falls back to version A for a scene the AI left empty', () => {
      expect(vslLineMarkup({ line: 'crm_inbox', vsl: { lines: {} }, translate })).toBe(
        'tour:crm_inbox',
      );
    });

    it('falls back to the fixed line for the intro and the reminder', () => {
      expect(
        vslLineMarkup({ line: 'reminder', vsl: { lines: { reminder: ' ' } }, translate }),
      ).toBe('fixed:reminder');
    });

    it('says the fixed line on the price whatever the AI wrote', () => {
      expect(
        vslLineMarkup({
          line: 'pricing_price',
          vsl: { lines: { pricing_price: 'Costa poco' } },
          translate,
        }),
      ).toBe('fixed:pricing_price');
    });

    it('lists every line to voice once, the booking phases included', () => {
      const lines = vslLinesToVoice(buildVslScenes({ data, hasReviews: false }));

      expect(new Set(lines).size).toBe(lines.length);
      expect(lines).toContain('reminder');
      expect(lines).toContain('booking_unavailable');
    });

    it('times a line without a voice by its visible characters', () => {
      expect(spokenDurationMs('<b>Ciao</b>')).toBe(spokenDurationMs('Ciao'));
    });
  });

  describe('Scene minimum', () => {
    it('waits only for the messages a chat scene adds', () => {
      expect(vslSceneMinimumMs({ scene: chat(4), previous: chat(2), reminderMessages: 0 })).toBe(
        3000,
      );
    });

    it('waits for every reminder message', () => {
      expect(
        vslSceneMinimumMs({
          scene: { step: 2, kind: 'reminder', line: 'reminder' },
          previous: chat(6),
          reminderMessages: 4,
        }),
      ).toBe(6000);
    });

    it('lets a scene without animation go as soon as Gigi is done', () => {
      expect(
        vslSceneMinimumMs({
          scene: { step: 3, kind: 'crm', part: 1, line: 'crm_contact' },
          previous: undefined,
          reminderMessages: 0,
        }),
      ).toBe(0);
    });
  });
});
