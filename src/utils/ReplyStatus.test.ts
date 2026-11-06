import { describe, expect, it } from 'vitest';
import { replyCategoryEnum } from '@/models/Schema';
import { categoriesShowing, toReplyStatus } from './ReplyStatus';

describe('ReplyStatus', () => {
  describe('Status', () => {
    it('shows a positive reply as interested', () => {
      expect(toReplyStatus('classified', 'interested')).toBe('interested');
    });

    it('shows an open reply as interested', () => {
      expect(toReplyStatus('demo_sent', 'question')).toBe('interested');
    });

    it('shows an objection as not interested', () => {
      expect(toReplyStatus('classified', 'objection')).toBe('not_interested');
    });

    it('shows an unclassifiable reply as interested', () => {
      expect(toReplyStatus('manual_review', 'other')).toBe('interested');
    });

    it('shows an automatic reply as not interested', () => {
      expect(toReplyStatus('auto_reply', 'auto_reply')).toBe('not_interested');
    });

    it('shows an unclassified stop as not interested', () => {
      expect(toReplyStatus('stop', null)).toBe('not_interested');
    });

    it('shows an unclassified reply as pending', () => {
      expect(toReplyStatus('replied', null)).toBe('pending');
    });
  });

  describe('Filter', () => {
    it('matches the positive and open categories for interested', () => {
      expect(
        categoriesShowing({ status: 'interested', categories: replyCategoryEnum.enumValues }),
      ).toStrictEqual(['interested', 'question', 'not_now', 'other']);
    });

    it('matches the rest for not interested', () => {
      expect(
        categoriesShowing({ status: 'not_interested', categories: replyCategoryEnum.enumValues }),
      ).toStrictEqual([
        'objection',
        'not_interested',
        'stop',
        'out_of_office',
        'auto_reply',
        'wrong_person',
      ]);
    });
  });
});
