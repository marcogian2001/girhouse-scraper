import { describe, expect, it } from 'vitest';
import { findInstagramHandle } from './Instagram';

describe('Instagram', () => {
  describe('Handle', () => {
    it('finds the account a research citation links to', () => {
      const handle = findInstagramHandle([
        'CONTATTI: puericultriceroberta@gmail.com [](https://www.instagram.com/puericultrice_roberta)',
      ]);

      expect(handle).toBe('puericultrice_roberta');
    });

    it('picks the account cited most and ignores post links', () => {
      const handle = findInstagramHandle([
        'https://instagram.com/p/Cx12ab/ and https://instagram.com/Studio.Rossi/',
        'https://www.instagram.com/studio.rossi',
        'https://www.instagram.com/altro_profilo',
      ]);

      expect(handle).toBe('studio.rossi');
    });

    it('returns null when no account is linked', () => {
      expect(findInstagramHandle([null, 'https://www.facebook.com/studio'])).toBeNull();
    });
  });
});
