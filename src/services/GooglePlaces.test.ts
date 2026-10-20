import { describe, expect, it } from 'vitest';
import { parseAutocompleteResponse, parseTextSearchResponse, pickReviews } from './GooglePlaces';

describe('Google Places', () => {
  describe('Autocomplete response', () => {
    it('returns the id and full label of each suggested place', () => {
      const suggestions = parseAutocompleteResponse({
        suggestions: [
          {
            placePrediction: {
              place: 'places/ChIJ1',
              placeId: 'ChIJ1',
              text: { text: 'Bergamo, Provincia di Bergamo, Italia', matches: [] },
              structuredFormat: { mainText: { text: 'Bergamo' } },
            },
          },
        ],
      });

      expect(suggestions).toStrictEqual([
        { placeId: 'ChIJ1', label: 'Bergamo, Provincia di Bergamo, Italia' },
      ]);
    });

    it('skips suggestions that are not places', () => {
      const suggestions = parseAutocompleteResponse({
        suggestions: [{ queryPrediction: { text: { text: 'bergamo alta' } } }],
      });

      expect(suggestions).toStrictEqual([]);
    });

    it('returns no suggestions when nothing matched', () => {
      expect(parseAutocompleteResponse({})).toStrictEqual([]);
    });
  });

  describe('Text search response', () => {
    it('returns the place ids and the next page token', () => {
      const page = parseTextSearchResponse({
        places: [{ id: 'ChIJ1' }, { id: 'ChIJ2' }],
        nextPageToken: 'token',
      });

      expect(page).toStrictEqual({ placeIds: ['ChIJ1', 'ChIJ2'], nextPageToken: 'token' });
    });

    it('returns no places and no token on the last empty page', () => {
      expect(parseTextSearchResponse({})).toStrictEqual({ placeIds: [], nextPageToken: null });
    });
  });
});

const review = (rating: number, text: string, author = 'Anna') => ({
  rating,
  text: { text },
  authorAttribution: { displayName: author },
  relativePublishTimeDescription: '2 mesi fa',
});

describe('Google Places reviews', () => {
  it('keeps only positive reviews with something to read, best first', () => {
    const picked = pickReviews([
      review(3, 'Servizio lento, pizza fredda e personale distratto per tutta la sera.'),
      review(5, 'Ottima'),
      review(4, 'Pizza buona e personale gentile, torneremo sicuramente con gli amici.', 'Luca'),
      review(
        5,
        'La migliore pizza della zona, impasto leggero e ingredienti freschissimi.',
        'Sara',
      ),
    ]);

    expect(picked.map((item) => item.author)).toStrictEqual(['Sara', 'Luca']);
  });

  it('trims a long review at a word boundary', () => {
    const [picked] = pickReviews([review(5, 'parola '.repeat(80))]);

    expect(picked?.text.length).toBeLessThanOrEqual(321);
    expect(picked?.text.endsWith('…')).toBeTruthy();
  });
});
