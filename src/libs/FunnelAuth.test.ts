import { describe, expect, it } from 'vitest';
import { isFunnelCaller } from './FunnelAuth';

const SECRET = 'funnel-secret-for-tests';

const requestWith = (header?: string) =>
  new Request('https://example.com/api/funnel/demo', {
    method: 'POST',
    headers: header ? { 'x-funnel-secret': header } : {},
  });

describe(isFunnelCaller, () => {
  it('accepts the request carrying the secret', () => {
    expect(isFunnelCaller(requestWith(SECRET), SECRET)).toBeTruthy();
  });

  it('rejects a wrong secret', () => {
    expect(isFunnelCaller(requestWith('another-secret-value'), SECRET)).toBeFalsy();
  });

  it('rejects a request without the header', () => {
    expect(isFunnelCaller(requestWith(), SECRET)).toBeFalsy();
  });

  it('rejects everyone when no secret is set', () => {
    expect(isFunnelCaller(requestWith(SECRET))).toBeFalsy();
  });
});
