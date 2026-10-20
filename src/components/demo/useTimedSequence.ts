import { useEffect, useState } from 'react';

/**
 * Counts up to a target one tick at a time, so a step can reveal its parts in order.
 * Raising the target continues from where the count is; a new `restartKey` starts over.
 * Visitors who prefer reduced motion get the target at once.
 * @param options The sequence.
 * @param options.target How many parts should end up shown.
 * @param options.intervalMs The pause between two parts.
 * @param options.restartKey Changes when the sequence must start again from zero.
 * @returns How many parts are shown now.
 */
export const useTimedSequence = (options: {
  target: number;
  intervalMs: number;
  restartKey?: string | number;
}) => {
  const [state, setState] = useState({ key: options.restartKey, shown: 0 });
  const shown = state.key === options.restartKey ? state.shown : 0;

  if (state.key !== options.restartKey) {
    setState({ key: options.restartKey, shown: 0 });
  }

  // The only timer of the tour: every animated reveal goes through here
  useEffect(() => {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer =
      shown < options.target
        ? setTimeout(
            () => {
              setState({ key: options.restartKey, shown: isReduced ? options.target : shown + 1 });
            },
            isReduced ? 0 : options.intervalMs,
          )
        : undefined;

    return () => {
      clearTimeout(timer);
    };
  }, [shown, options.target, options.intervalMs, options.restartKey]);

  return Math.min(shown, options.target);
};

/**
 * Re-reads the clock on an interval, for a live countdown.
 * @param intervalMs How often to tick.
 * @returns The current time.
 */
export const useNow = (intervalMs: number) => {
  const [now, setNow] = useState(() => new Date());

  // The countdown's own clock, the other timer of the tour
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
};
