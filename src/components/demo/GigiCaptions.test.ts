import { describe, expect, it } from 'vitest';
import { sentenceStarts, splitSentences } from './GigiCaptions';
import { parseHighlights } from './Highlights';

const text = (sentence: { text: string }[]) => sentence.map((segment) => segment.text).join('');

describe('GigiCaptions', () => {
  describe('Sentences', () => {
    it('splits a line after each sentence end', () => {
      const sentences = splitSentences(
        parseHighlights('Ciao! Come va? Bene… e tu. Premi «Avanti».'),
      );

      expect(sentences.map(text)).toStrictEqual([
        'Ciao! ',
        'Come va? ',
        'Bene… ',
        'e tu. ',
        'Premi «Avanti».',
      ]);
    });

    it('keeps the highlights across a sentence end', () => {
      const sentences = splitSentences(parseHighlights('Uno <b>due. tre</b> quattro.'));

      expect(sentences).toStrictEqual([
        [
          { text: 'Uno ', style: 'plain' },
          { text: 'due. ', style: 'bold' },
        ],
        [
          { text: 'tre', style: 'bold' },
          { text: ' quattro.', style: 'plain' },
        ],
      ]);
    });

    it('leaves numbers with a dot in one piece', () => {
      expect(splitSentences(parseHighlights('Costa 2.000 euro. No.')).map(text)).toStrictEqual([
        'Costa 2.000 euro. ',
        'No.',
      ]);
    });
  });

  describe('Starts', () => {
    const sentences = splitSentences(parseHighlights('Aaaa aaaa. Bbbb bbbb. Cccc cccc.'));

    it('spreads the sentences by length without pauses', () => {
      expect(sentenceStarts({ sentences, duration: 32, pauses: [] })).toStrictEqual([0, 11, 22]);
    });

    it('moves a sentence onto the closest pause', () => {
      expect(sentenceStarts({ sentences, duration: 32, pauses: [10, 12.2, 23] })).toStrictEqual([
        0, 10, 23,
      ]);
    });

    it('ignores pauses too far from the sentence', () => {
      expect(sentenceStarts({ sentences, duration: 32, pauses: [5] })).toStrictEqual([0, 11, 22]);
    });
  });
});
