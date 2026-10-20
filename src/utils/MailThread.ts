type InboundLike = { message: { id: string; receivedAt: Date } };

type OutboundLike = {
  id: string;
  kind: string;
  status: string;
  sentAt: Date | null;
  scheduledFor: Date | null;
  createdAt: Date;
};

type HandoffLike = { id: string; status: string; sentAt: Date | null; createdAt: Date };

/** One message of a conversation's thread, whoever wrote it, at the time it was written. */
export type ThreadItem<I, O, W> =
  | { kind: 'inbound'; id: string; at: Date; entry: I }
  | { kind: 'outbound'; id: string; at: Date; email: O; followUpNumber: number | null }
  | { kind: 'whatsapp'; id: string; at: Date; handoff: W };

/**
 * Puts the lead's replies and the emails to them in the order they were written, and the
 * WhatsApp hand-off last, since it always comes after the emails.
 * @param options The conversation's messages.
 * @param options.messages The lead's replies.
 * @param options.outbound The emails to the lead.
 * @param options.whatsappHandoff The WhatsApp hand-off, if one was prepared.
 * @returns The thread, oldest first, with each follow-up numbered.
 */
export const buildThread = <
  I extends InboundLike,
  O extends OutboundLike,
  W extends HandoffLike,
>(options: {
  messages: I[];
  outbound: O[];
  whatsappHandoff: W | null;
}) => {
  const inbound: ThreadItem<I, O, W>[] = options.messages.map((entry) => ({
    kind: 'inbound',
    id: entry.message.id,
    at: entry.message.receivedAt,
    entry,
  }));
  const emails: ThreadItem<I, O, W>[] = options.outbound.map((email) => ({
    kind: 'outbound',
    id: email.id,
    at: email.sentAt ?? email.scheduledFor ?? email.createdAt,
    email,
    followUpNumber: null,
  }));
  const thread = [...inbound, ...emails].toSorted((a, b) => a.at.getTime() - b.at.getTime());
  let followUps = 0;

  // Numbered in the order the lead got them
  const numbered = thread.map((item) => {
    if (item.kind !== 'outbound' || item.email.kind !== 'follow_up') {
      return item;
    }

    followUps += 1;

    return { ...item, followUpNumber: followUps };
  });
  const handoff = options.whatsappHandoff;

  if (!handoff) {
    return numbered;
  }

  const whatsapp: ThreadItem<I, O, W> = {
    kind: 'whatsapp',
    id: handoff.id,
    at: handoff.sentAt ?? handoff.createdAt,
    handoff,
  };

  return [...numbered, whatsapp];
};

/**
 * Tells whether a message of the thread waits for a person.
 * @param item The message.
 * @returns True for drafts and failed sends.
 */
export const needsAction = <I, O extends OutboundLike, W extends HandoffLike>(
  item: ThreadItem<I, O, W>,
) => {
  if (item.kind === 'outbound') {
    return item.email.status === 'draft' || item.email.status === 'failed';
  }

  return item.kind === 'whatsapp' && item.handoff.status === 'draft';
};
