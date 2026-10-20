import { describe, expect, it } from 'vitest';
import { InstantlyPushValidation } from './InstantlyPushValidation';

const push = { emailList: ['team@girhouse.com'], timezone: 'Europe/Rome' };

describe('Instantly push validation', () => {
  it('leaves the campaign to the sales reps when the bot is not chosen', () => {
    expect(InstantlyPushValidation.parse(push).botManaged).toBeFalsy();
  });

  it('keeps the bot when it is chosen at launch', () => {
    expect(InstantlyPushValidation.parse({ ...push, botManaged: true }).botManaged).toBeTruthy();
  });
});
