import { describe, expect, it } from 'vitest';
import { buildThread, needsAction } from './MailThread';

const at = (time: string) => new Date(`2026-10-20T${time}:00Z`);

const reply = (id: string, time: string) => ({ message: { id, receivedAt: at(time) } });

const email = (options: { id: string; kind: string; status: string; sentAt?: string }) => ({
  id: options.id,
  kind: options.kind,
  status: options.status,
  sentAt: options.sentAt ? at(options.sentAt) : null,
  scheduledFor: null,
  createdAt: at('08:00'),
});

describe('MailThread', () => {
  describe(buildThread, () => {
    it('orders replies and emails by when they were written', () => {
      const thread = buildThread({
        messages: [reply('lead-1', '09:00'), reply('lead-2', '12:00')],
        outbound: [
          email({ id: 'answer', kind: 'reply', status: 'sent', sentAt: '09:30' }),
          email({ id: 'follow-up', kind: 'follow_up', status: 'sent', sentAt: '11:00' }),
        ],
        whatsappHandoff: null,
      });

      expect(thread.map((item) => item.id)).toStrictEqual([
        'lead-1',
        'answer',
        'follow-up',
        'lead-2',
      ]);
    });

    it('numbers the follow-ups in the order they went out', () => {
      const thread = buildThread({
        messages: [],
        outbound: [
          email({ id: 'second', kind: 'follow_up', status: 'sent', sentAt: '11:00' }),
          email({ id: 'first', kind: 'follow_up', status: 'sent', sentAt: '10:00' }),
          email({ id: 'closing', kind: 'closing', status: 'draft' }),
        ],
        whatsappHandoff: null,
      });

      expect(
        thread.map((item) => (item.kind === 'outbound' ? item.followUpNumber : undefined)),
      ).toStrictEqual([null, 1, 2]);
    });

    it('puts the WhatsApp hand-off after every email', () => {
      const thread = buildThread({
        messages: [reply('lead', '09:00')],
        outbound: [email({ id: 'closing', kind: 'closing', status: 'sent', sentAt: '15:00' })],
        whatsappHandoff: {
          id: 'whatsapp',
          status: 'sent',
          sentAt: at('10:00'),
          createdAt: at('10:00'),
        },
      });

      expect(thread.at(-1)?.kind).toBe('whatsapp');
    });
  });

  describe(needsAction, () => {
    it('flags drafts and failed sends', () => {
      const [draft, failed, sent] = buildThread({
        messages: [],
        outbound: [
          email({ id: 'draft', kind: 'reply', status: 'draft', sentAt: '09:00' }),
          email({ id: 'failed', kind: 'reply', status: 'failed', sentAt: '10:00' }),
          email({ id: 'sent', kind: 'reply', status: 'sent', sentAt: '11:00' }),
        ],
        whatsappHandoff: null,
      });

      expect([draft, failed, sent].map((item) => item && needsAction(item))).toStrictEqual([
        true,
        true,
        false,
      ]);
    });
  });
});
