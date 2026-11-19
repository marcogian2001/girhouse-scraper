/**
 * Picks the GHL inbound webhook an Instantly event is relayed to.
 * @param options The call options.
 * @param options.eventType The Instantly event type.
 * @param options.replyHook The hook for every reply.
 * @param options.interestedHook The hook for leads marked interested.
 * @returns The hook URL, or undefined when the event is not relayed.
 */
export const ghlHookFor = (options: {
  eventType: string;
  replyHook: string | undefined;
  interestedHook: string | undefined;
}) => {
  if (options.eventType === 'reply_received') {
    return options.replyHook;
  }

  return options.eventType === 'lead_interested' ? options.interestedHook : undefined;
};
