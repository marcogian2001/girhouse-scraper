import type { DemoSnapshot } from '@/models/Schema';

/**
 * Finds the appointment time the example customer picked in the chat.
 * @param data The demo snapshot.
 * @returns The chosen option, if the chat has one.
 */
export const chosenSlotOf = (data: DemoSnapshot) => {
  const options = new Set(data.chat.messages.flatMap((message) => message.options));

  return (
    data.chat.messages.find((message) => message.from === 'customer' && options.has(message.text))
      ?.text ?? null
  );
};

/**
 * Formats the example clock time of a chat message, as the WhatsApp step shows it.
 * @param index The message position.
 * @returns A time such as 10:02, one minute per two messages.
 */
export const chatTimeOf = (index: number) =>
  `10:${String(2 + Math.floor(index / 2)).padStart(2, '0')}`;
