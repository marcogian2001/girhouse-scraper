import { describe, expect, it } from 'vitest';
import { conversationStateEnum, replyCategoryEnum } from '@/models/Schema';
import { replyStatusFilter, toReplyStatus } from './ReplyStatus';

const filter = (status: Parameters<typeof replyStatusFilter>[0]['status']) =>
  replyStatusFilter({
    status,
    states: conversationStateEnum.enumValues,
    categories: replyCategoryEnum.enumValues,
  });

describe('ReplyStatus', () => {
  describe('Status', () => {
    it('shows the category of a classified reply', () => {
      expect(toReplyStatus('classified', 'not_interested')).toBe('not_interested');
    });

    it('shows the category of a paused conversation', () => {
      expect(toReplyStatus('paused', 'interested')).toBe('interested');
    });

    it('shows an unclassified reply as pending', () => {
      expect(toReplyStatus('paused', null)).toBe('pending');
    });

    it('sends an unclassifiable reply to manual review', () => {
      expect(toReplyStatus('classified', 'other')).toBe('manual_review');
    });

    it('shows a closed lead as not interested', () => {
      expect(toReplyStatus('closed_not_interested', 'not_interested')).toBe('not_interested');
    });

    it('keeps the state once the conversation moved on', () => {
      expect(toReplyStatus('demo_sent', 'interested')).toBe('demo_sent');
    });
  });

  describe('Filter', () => {
    it('matches closed and classified negative leads', () => {
      expect(filter('not_interested')).toStrictEqual({
        states: ['closed_not_interested'],
        categories: ['not_interested'],
        unclassified: false,
      });
    });

    it('matches unclassified replies for pending', () => {
      expect(filter('pending')).toStrictEqual({ states: [], categories: [], unclassified: true });
    });

    it('matches both the state and the category for manual review', () => {
      expect(filter('manual_review')).toStrictEqual({
        states: ['manual_review'],
        categories: ['other'],
        unclassified: false,
      });
    });
  });
});
