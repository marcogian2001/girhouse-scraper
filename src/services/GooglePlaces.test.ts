import { describe, expect, it } from 'vitest';
import { parseAutocompleteResponse, parseTextSearchResponse } from './GooglePlaces';

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
