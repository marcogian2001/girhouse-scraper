import { describe, expect, it } from 'vitest';
import { buildReplyPrompt } from './ReplyClassifier';
import type { LeadContext } from './ReplyPrompt';

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
