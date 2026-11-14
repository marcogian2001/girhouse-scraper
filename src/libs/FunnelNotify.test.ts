import { describe, expect, it } from 'vitest';
import { funnelReadyTag } from './FunnelNotify';

describe(funnelReadyTag, () => {
  it('names the tag of a funnel in lower case', () => {
    expect(funnelReadyTag('F3')).toBe('demo-f3-pronta');
  });
});
