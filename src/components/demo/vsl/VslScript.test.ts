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

const chat = (upTo: number): VslScene => ({
  step: 1,
  kind: 'chat',
  upTo,
  line: 'chat_slots',
  chapter: 'solution',
  cues: [],
});

const translate = {
  fixed: (line: string) => `fixed:${line}`,
  tour: (line: string) => `tour:${line}`,
};

const scenes = buildVslScenes({ data, hasReviews: false });

describe('VslScript', () => {
  describe('Scenes', () => {
    it('opens on the intro, then straight on the first problem', () => {
      expect(scenes.slice(0, 3).map((scene) => scene.kind)).toStrictEqual([
        'intro',
        'problem',
        'missed_call',
      ]);
    });

    it('follows each problem with its solution', () => {
      const solutions = scenes.flatMap((scene, index) =>
        scene.kind === 'problem' ? [scenes[index + 1]?.kind] : [],
      );

      expect(solutions).toStrictEqual(['missed_call', 'chat', 'reminder', 'followup', 'reviews']);
    });

    it('plays each problem under its own music, opened by a sound', () => {
      const problem = scenes.find((scene) => scene.kind === 'problem');

      expect(problem?.chapter).toBe('problem');
      expect(problem?.cues.at(0)).toStrictEqual({ atMs: 0, sound: 'ring' });
    });

    it('shows the new page after the dream, without its review system', () => {
      const dream = scenes.findIndex((scene) => scene.kind === 'dream');
      const landing = scenes.findIndex((scene) => scene.kind === 'landing');

      expect(landing).toBeGreaterThan(dream);
      const sections = scenes.flatMap((scene) =>
        scene.kind === 'landing' ? scene.sections.map(String) : [],
      );

      expect(sections).not.toContain('funnel');
    });

    it('ends on the booking', () => {
      expect(scenes.at(-1)?.kind).toBe('booking');
    });

    it('names the booking line after its phase', () => {
      const booking = scenes.at(-1);

      expect(booking && vslLineOf(booking, 'slots')).toBe('booking_slots');
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

    it('falls back to version A for a scene both versions have', () => {
      expect(vslLineMarkup({ line: 'crm_inbox', vsl: { lines: {} }, translate })).toBe(
        'tour:crm_inbox',
      );
    });

    it('falls back to its fixed line for a scene only version B has', () => {
      expect(
        vslLineMarkup({
          line: 'problem_reviews',
          vsl: { lines: { problem_reviews: ' ' } },
          translate,
        }),
      ).toBe('fixed:problem_reviews');
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
      const lines = vslLinesToVoice(scenes);

      expect(new Set(lines).size).toBe(lines.length);
      expect(lines).toContain('problem_missed_call');
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

    it('waits for the missed call to ring and its chat to play', () => {
      const missedCall = scenes.find((scene) => scene.kind === 'missed_call');

      expect(
        missedCall &&
          vslSceneMinimumMs({ scene: missedCall, previous: undefined, reminderMessages: 0 }),
      ).toBeGreaterThan(6000);
    });

    it('lets a problem go as soon as the voice is done', () => {
      const problem = scenes.find((scene) => scene.kind === 'problem');

      expect(
        problem && vslSceneMinimumMs({ scene: problem, previous: undefined, reminderMessages: 0 }),
      ).toBe(0);
    });
  });
});
