import { describe, expect, it } from 'vitest';
import { buildWhatsappPrompt, checkWhatsappMessage, describeDemoBehavior } from './WhatsappWriter';

describe('WhatsappWriter', () => {
  describe('Demo behaviour', () => {
    it('names a demo never opened', () => {
      expect(describeDemoBehavior({ behavior: 'not_opened', maxStep: 0 })).toBe('Non aperta');
    });

    it('names how far a lead went', () => {
      expect(describeDemoBehavior({ behavior: 'partial', maxStep: 3 })).toBe(
        'Vista fino al passo 3 di 6',
      );
    });

    it('names a demo watched to the end', () => {
      expect(describeDemoBehavior({ behavior: 'complete', maxStep: 6 })).toBe('Vista tutta');
    });
  });

  describe('First message rules', () => {
    it('accepts a short message with one question', () => {
      expect(
        checkWhatsappMessage(
          'Ciao Davide, sono Luca di Girhouse.\nTi avevo scritto per la pagina dello studio: ti va di sentirci?',
        ),
      ).toStrictEqual([]);
    });

    it('flags a link', () => {
      expect(checkWhatsappMessage('Ciao Davide, guarda qui https://girhouse.com')).toContain(
        'link',
      );
    });

    it('flags a message too long for a phone', () => {
      expect(checkWhatsappMessage('Riga di testo abbastanza lunga.\n'.repeat(8))).toContain(
        'too_long',
      );
    });
  });

  describe('Prompt', () => {
    it('includes the demo behaviour and the problems of a previous attempt', () => {
      const prompt = buildWhatsappPrompt({
        model: 'claude-opus-5-5',
        offer: 'Offerta',
        lead: {
          company: 'Studio Rossi',
          contactName: null,
          city: 'Roma',
          category: null,
          description: null,
          website: null,
          rating: null,
          reviewsCount: null,
        },
        thread: [{ direction: 'inbound', sentAt: null, text: 'Sì, mi interessa' }],
        demoBehavior: 'Vista tutta',
        issues: ['link'],
      });

      expect(prompt).toContain('## How they went through their page\nVista tutta');
      expect(prompt).toContain('## Fix these problems of the previous attempt\nlink');
    });
  });
});
