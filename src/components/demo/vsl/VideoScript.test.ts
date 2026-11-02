import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import messages from '@/locales/it.json';
import type { DemoSnapshot } from '@/models/Schema';
import { toSpokenText } from '@/utils/GigiVoice';
import type { VideoLine } from './VideoScript';
import {
  buildVideoScenes,
  findBannedWords,
  pickVideoClosing,
  VIDEO_CLOSINGS,
  videoLineMarkup,
  videoLinesToVoice,
} from './VideoScript';
import { vslLineValues, vslSceneMinimumMs } from './VslScript';

const data: DemoSnapshot = {
  version: 3,
  company: 'Studio Rossi',
  city: 'Treviso',
  address: null,
  phone: null,
  category: 'Nutrizionista',
  categories: [],
  openingHours: [],
  website: null,
  placeId: null,
  rating: null,
  reviewsCount: null,
  logoUrl: null,
  primaryColor: '#24336b',
  landing: {
    headline: 'Nutrizionista a Treviso',
    subheadline: 'Visite su appuntamento',
    about: null,
    ctaLabel: 'Prenota',
    services: [{ name: 'Visita', description: null }],
  },
  chat: {
    customerName: 'Luca',
    service: null,
    note: null,
    messages: [
      { from: 'customer', text: 'Buongiorno', options: [] },
      { from: 'business', text: 'Buongiorno Luca', options: [] },
      { from: 'customer', text: 'Martedì', options: [] },
    ],
  },
};

const scenes = buildVideoScenes({ data, closing: 'both' });

const t = createTranslator({ locale: 'it', messages, namespace: 'DemoPage' });

const values = vslLineValues({
  company: 'Studio Rossi',
  customer: 'Luca',
  reviews: { source: 'Google', rating: null, count: null },
  price: 97,
  slots: 10,
});

const fixedLine = (line: VideoLine) =>
  videoLineMarkup({
    line,
    vsl: { lines: {} },
    translate: (key) => t.markup(key, values),
  });

const allLines = VIDEO_CLOSINGS.flatMap((closing) =>
  videoLinesToVoice(buildVideoScenes({ data, closing }), closing),
);

describe('VideoScript', () => {
  describe('Scenes', () => {
    it('walks the four stretches of the path in order', () => {
      expect(scenes.flatMap((scene) => (scene.kind === 'loss' ? [scene.loss] : []))).toStrictEqual([
        'not_found',
        'not_chosen',
        'lost',
        'social',
        'not_back',
      ]);
    });

    it('ends on the closing of the demo', () => {
      expect(scenes.at(-1)).toMatchObject({ kind: 'closing', closing: 'both', step: 6 });
    });

    it('leaves out the services scene for a business without services', () => {
      const bare = {
        ...data,
        landing: { ...data.landing, services: [] },
      };

      expect(
        buildVideoScenes({ data: bare, closing: 'call' }).map((scene) => scene.line),
      ).not.toContain('video_line_site_services');
    });

    it('gives the price in the call for the closing that only books', () => {
      expect(buildVideoScenes({ data, closing: 'call' }).map((scene) => scene.line)).toContain(
        'video_line_offer_price_call',
      );
    });

    it('waits for the review request to play', () => {
      const request = scenes.find((scene) => scene.kind === 'review_request');

      expect(
        request && vslSceneMinimumMs({ scene: request, previous: undefined, reminderMessages: 0 }),
      ).toBe(4500);
    });
  });

  describe('Lines', () => {
    it('skips the booking lines of a video that only sells', () => {
      expect(
        videoLinesToVoice(buildVideoScenes({ data, closing: 'purchase' }), 'purchase'),
      ).not.toContain('video_line_booking_phone');
    });

    it('says the line the AI wrote, with its highlights as marks', () => {
      expect(
        videoLineMarkup({
          line: 'video_line_google',
          vsl: { lines: { video_line_google: 'Su <hl>Google</hl>' } },
          translate: () => 'fixed',
        }),
      ).toBe('Su <mark>Google</mark>');
    });

    it('says the fixed offer whatever the AI wrote', () => {
      expect(
        videoLineMarkup({
          line: 'video_line_offer_guarantee',
          vsl: { lines: { video_line_offer_guarantee: 'Costa poco' } },
          translate: () => 'fixed',
        }),
      ).toBe('fixed');
    });

    it('states the guarantee in the words of the plan', () => {
      expect(toSpokenText(fixedLine('video_line_offer_guarantee'))).toContain(
        'Se entro 30 giorni non ti piace, ti ridiamo tutti i soldi senza farti nessuna domanda',
      );
    });

    it('keeps the words to avoid out of every fixed line', () => {
      const lines = Object.fromEntries(allLines.map((line) => [line, fixedLine(line)]));

      expect(findBannedWords(lines)).toStrictEqual([]);
    });
  });

  describe('Words to avoid', () => {
    it('finds the jargon the customer should not hear', () => {
      expect(findBannedWords({ a: 'Il tuo CRM e le automazioni, con la AI' })).toStrictEqual([
        'CRM',
        'automazioni',
        'AI',
      ]);
    });

    it('keeps the Italian preposition "ai" out of the words found', () => {
      expect(findBannedWords({ a: 'Parla ai clienti' })).toStrictEqual([]);
    });
  });

  describe('Closing', () => {
    it('picks the same closing for the same demo', () => {
      const id = '6f9619ff-8b86-4d01-b42d-00c04fc964ff';

      expect(pickVideoClosing(id)).toBe(pickVideoClosing(id));
    });

    it('shares the demos among the three closings', () => {
      const picked = new Set(
        Array.from({ length: 30 }, (_unused, index) => pickVideoClosing(`demo-${index}`)),
      );

      expect(picked).toStrictEqual(new Set(VIDEO_CLOSINGS));
    });
  });
});
