import { describe, expect, it } from 'vitest';
import { summarizeDemo } from './DemoStats';

describe('DemoStats', () => {
  it('reports a demo nobody opened', () => {
    expect(summarizeDemo([]).behavior).toBe('not_opened');
  });

  it('reports a demo left halfway, with the time spent', () => {
    const summary = summarizeDemo([
      { type: 'open', step: null },
      { type: 'step', step: 1 },
      { type: 'step', step: 3 },
      { type: 'heartbeat', step: null },
      { type: 'heartbeat', step: null },
    ]);

    expect(summary).toMatchObject({ behavior: 'partial', maxStep: 3, secondsOnPage: 30 });
  });

  it('reports a demo watched to the last step', () => {
    const summary = summarizeDemo([
      { type: 'open', step: null },
      { type: 'step', step: 6 },
      { type: 'phone_submitted', step: null },
    ]);

    expect(summary).toMatchObject({
      behavior: 'complete',
      phoneLeft: true,
      whatsappClicked: false,
    });
  });
});
