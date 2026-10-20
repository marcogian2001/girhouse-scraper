import { describe, expect, it } from 'vitest';
import type { objectionSchema } from '@/models/Schema';
import { buildObjectionLibrary, buildReplyPrompt } from './ReplyClassifier';
import type { LeadContext } from './ReplyPrompt';

const objection = (
  overrides: Partial<typeof objectionSchema.$inferSelect> = {},
): typeof objectionSchema.$inferSelect => ({
  id: 'objection-1',
  organizationId: 'organization-1',
  key: 'ho_gia_un_sito',
  title: 'Ho già un sito',
  description: 'Il lead ha già un sito e non vede il motivo di rifarlo.',
  examples: ['abbiamo già il sito', 'il sito ce l’abbiamo'],
  responseAngle: 'Il punto non è il sito ma chi risponde ai contatti.',
  status: 'active',
  sourceMessageId: null,
  updatedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});

const lead: LeadContext = {
  company: 'Pizzeria Da Mario',
  contactName: 'Mario Rossi',
  city: 'Bologna',
  category: 'Pizzeria',
  description: null,
  website: null,
  rating: 4.6,
  reviewsCount: 212,
};

describe('ReplyClassifier', () => {
  describe('Objection library', () => {
    it('lists each objection by key with its examples', () => {
      const library = buildObjectionLibrary([objection()]);

      expect(library).toContain('key: ho_gia_un_sito');
      expect(library).toContain('examples: abbiamo già il sito | il sito ce l’abbiamo');
    });

    it('says when the library is empty', () => {
      expect(buildObjectionLibrary([])).toContain('(empty)');
    });
  });

  describe('Reply prompt', () => {
    const prompt = buildReplyPrompt({
      lead,
      thread: [
        { direction: 'outbound', sentAt: new Date('2026-10-01T09:00:00Z'), text: 'Ciao Mario' },
      ],
      reply: 'Quanto costa?',
      interestLabel: null,
      today: new Date('2026-10-17T10:00:00Z'),
      offeredSlots: [{ key: '2026-10-20T09:00', label: 'martedì 20 ottobre alle 9:00' }],
    });

    it('includes the business, the thread and the reply', () => {
      expect(prompt).toContain('Business: Pizzeria Da Mario');
      expect(prompt).toContain('Google rating: 4.6 (212 reviews)');
      expect(prompt).toContain('### Girhouse (2026-10-01)\nCiao Mario');
      expect(prompt).toContain('## Latest reply to classify\nQuanto costa?');
    });

    it('states today in the app time zone', () => {
      expect(prompt).toContain('Today is 2026-10-17.');
    });

    it('lists the call times Girhouse offered', () => {
      expect(prompt).toContain('- 2026-10-20T09:00 (martedì 20 ottobre alle 9:00)');
    });

    it('omits fields the platform does not know', () => {
      expect(prompt).not.toContain('Website:');
      expect(prompt).toContain('## Instantly label\nnone');
    });
  });
});
