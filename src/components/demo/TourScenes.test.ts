import { describe, expect, it } from 'vitest';
import type { DemoSnapshot } from '@/models/Schema';
import { buildTourScenes, firstSceneOf, landingSectionsFor, nextTapAction } from './TourScenes';

const data = (overrides: Partial<DemoSnapshot> = {}): DemoSnapshot => ({
  version: 3,
  company: 'Studio Michienzi',
  city: 'Roma',
  address: null,
  phone: '+39 06 1234567',
  category: 'Osteopata',
  categories: [],
  openingHours: [],
  website: null,
  placeId: null,
  rating: 4.9,
  reviewsCount: 946,
  logoUrl: null,
  primaryColor: '#24336b',
  landing: {
    headline: 'Osteopatia a Roma',
    subheadline: 'Prenota su WhatsApp',
    about: null,
    ctaLabel: 'Prenota una visita',
    services: [{ name: 'Osteopatia pediatrica', description: null }],
  },
  chat: {
    customerName: 'Giulia',
    service: null,
    note: null,
    messages: [
      { from: 'customer', text: 'Vorrei prenotare', options: [] },
      { from: 'business', text: 'Certo! Per cosa?', options: [] },
      { from: 'customer', text: 'Mal di schiena', options: [] },
      {
        from: 'business',
        text: 'Quale preferisce?',
        options: ['Martedì alle 10:00', 'Giovedì alle 17:30'],
      },
      { from: 'customer', text: 'Martedì alle 10:00', options: [] },
      { from: 'business', text: 'Fissato!', options: [] },
    ],
  },
  ...overrides,
});

describe('TourScenes', () => {
  describe('Landing sections', () => {
    it('shows only the sections the business has data for', () => {
      expect(landingSectionsFor({ data: data(), hasReviews: false })).toStrictEqual([
        'hero',
        'services',
        'funnel',
        'contact',
      ]);
    });

    it('adds the reviews when Google returned some', () => {
      expect(landingSectionsFor({ data: data(), hasReviews: true })).toContain('reviews');
    });
  });

  describe('Tour', () => {
    const scenes = buildTourScenes({ data: data(), hasReviews: true });

    it('starts with the intro and ends with the booking', () => {
      expect(scenes.at(0)?.kind).toBe('intro');
      expect(scenes.at(-1)?.kind).toBe('booking');
    });

    it('plays the chat up to the reply, the times, then the booking', () => {
      const chat = scenes.flatMap((scene) => (scene.kind === 'chat' ? [scene.upTo] : []));

      expect(chat).toStrictEqual([2, 4, 6]);
    });

    it('reveals the landing one section at a time', () => {
      const landing = scenes.flatMap((scene) =>
        scene.kind === 'landing' ? [scene.sections.length] : [],
      );

      expect(landing).toStrictEqual([1, 2, 3, 4, 5]);
    });

    it('plays the pricing video before the price', () => {
      const pricing = scenes.filter((scene) => scene.step === 5).map((scene) => scene.kind);

      expect(pricing).toStrictEqual(['video', 'pricing', 'pricing', 'pricing']);
    });

    it('opens a linked step at its first scene', () => {
      expect(scenes[firstSceneOf(scenes, 4)]?.step).toBe(4);
      expect(firstSceneOf(scenes, 9)).toBe(0);
    });
  });
});

describe('Next button', () => {
  it('finishes the line before moving on', () => {
    expect(nextTapAction({ typed: 10, total: 40 })).toBe('finish');
    expect(nextTapAction({ typed: 40, total: 40 })).toBe('advance');
  });
});
