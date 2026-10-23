/**
 * Accented letters and the plain letters they fold to, position by position. Shared with
 * SQL `translate()`, so a search folds the same way in the database as in JavaScript.
 */
export const ACCENTED_LETTERS = 'àáâãäåèéêëìíîïòóôõöùúûüçñ';

export const PLAIN_LETTERS = 'aaaaaaeeeeiiiiooooouuuucn';

/** More words than this narrow nothing useful and only make the query heavier. */
const MAX_SEARCH_TERMS = 5;

/**
 * Lower-cases text and strips its accents, so "Caffè" and "caffe" compare equal.
 * @param text The text to fold.
 * @returns The folded text.
 */
export const foldText = (text: string) =>
  text
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Splits a search into folded words, each of which must match somewhere.
 * @param search What the user typed.
 * @returns The words, without empties and capped in number.
 */
export const splitSearchTerms = (search: string) =>
  foldText(search).split(/\s+/u).filter(Boolean).slice(0, MAX_SEARCH_TERMS);

/**
 * Turns a search word into a `like` pattern that matches it anywhere, taking `%`, `_` and
 * backslashes literally.
 * @param term One folded search word.
 * @returns The pattern.
 */
export const toLikePattern = (term: string) => `%${term.replaceAll(/[\\%_]/gu, '\\$&')}%`;

/**
 * Tells whether text contains every search word, ignoring case and accents.
 * @param options The text and the words.
 * @param options.text The text to search in.
 * @param options.terms The folded words, as returned by `splitSearchTerms`.
 * @returns True when each word appears in the text.
 */
export const matchesAllTerms = (options: { text: string; terms: string[] }) => {
  const folded = foldText(options.text);

  return options.terms.every((term) => folded.includes(term));
};
