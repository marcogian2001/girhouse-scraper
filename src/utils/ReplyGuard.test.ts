import { describe, expect, it } from 'vitest';
import {
  checkReply,
  cleanReply,
  DEMO_LINK_PLACEHOLDER,
  fillDemoLink,
  fillSlots,
  SLOTS_PLACEHOLDER,
} from './ReplyGuard';

const prices = [97, 197];

const body = [
  'Ciao Mario,',
  'capisco, il sito ce l’hai già.',
  'Noi lavoriamo su chi risponde quando un cliente scrive o chiama.',
  'Costa 97€ al mese e la prima settimana è gratis.',
  'Ti va se ti mando una pagina con la tua attività?',
  'Luca',
].join('\n');

describe('ReplyGuard', () => {
  describe('Cleaning', () => {
    it('turns an em dash into a comma', () => {
      expect(cleanReply('Ciao Mario — tutto bene?')).toBe('Ciao Mario, tutto bene?');
    });

    it('keeps a range as a hyphen', () => {
      expect(cleanReply('dalle 9–18')).toBe('dalle 9-18');
    });
  });

  describe('Rules', () => {
    it('accepts a short reply with the configured price', () => {
      expect(checkReply({ body, prices })).toStrictEqual([]);
    });

    it('flags a price that is not configured', () => {
      expect(checkReply({ body: body.replace('97€', '49 euro'), prices })).toStrictEqual([
        'unknown_price',
      ]);
    });

    it('flags a link', () => {
      expect(checkReply({ body: `${body}\nhttps://example.com`, prices })).toContain('link');
    });

    it('accepts the demo link once filled in', () => {
      const demoUrl = 'https://app.girhouse.com/it/demo/pizzeria-da-mario-a1B2c3D4e5';
      const filled = fillDemoLink(`${body}\n${DEMO_LINK_PLACEHOLDER}`, demoUrl);

      expect(filled).toContain(demoUrl);
      expect(checkReply({ body: filled, prices, allowedLinks: [demoUrl] })).toStrictEqual([]);
    });

    it('still flags another link next to the demo link', () => {
      const demoUrl = 'https://app.girhouse.com/it/demo/x';

      expect(
        checkReply({
          body: `${body}\n${demoUrl}\nhttps://example.com.`,
          prices,
          allowedLinks: [demoUrl],
        }),
      ).toContain('link');
    });

    it('flags the demo placeholder', () => {
      expect(checkReply({ body: `${body}\n${DEMO_LINK_PLACEHOLDER}`, prices })).toContain(
        'demo_link_missing',
      );
    });

    it('flags the call times placeholder', () => {
      expect(checkReply({ body: `${body}\nSono libero ${SLOTS_PLACEHOLDER}.`, prices })).toContain(
        'slots_missing',
      );
    });

    it('accepts the call times once filled in', () => {
      const filled = fillSlots(
        `${body}\nSono libero ${SLOTS_PLACEHOLDER}.`,
        'martedì 20 ottobre alle 9:00 oppure mercoledì 21 ottobre alle 16:30',
      );

      expect(filled).toContain('alle 9:00 oppure mercoledì');
      expect(checkReply({ body: filled, prices })).toStrictEqual([]);
    });

    it('flags a reply that is too long', () => {
      expect(checkReply({ body: `${body}\n${body}`, prices })).toContain('too_long');
    });

    it('flags a one-line reply', () => {
      expect(checkReply({ body: 'Ok.', prices })).toContain('too_short');
    });
  });
});
