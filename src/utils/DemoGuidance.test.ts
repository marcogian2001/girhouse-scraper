import { describe, expect, it } from 'vitest';
import { extractLinks } from './DemoGuidance';

describe('Demo guidance', () => {
  describe('Links', () => {
    it('reads each link once, without trailing punctuation', () => {
      const links = extractLinks(
        'Il suo profilo è https://www.instagram.com/puericultrice_roberta, il sito (https://studio.it/chi-sono). Vedi anche https://studio.it/chi-sono',
      );

      expect(links).toStrictEqual([
        'https://www.instagram.com/puericultrice_roberta',
        'https://studio.it/chi-sono',
      ]);
    });

    it('returns no links for empty guidance', () => {
      expect(extractLinks(null)).toStrictEqual([]);
    });
  });
});
