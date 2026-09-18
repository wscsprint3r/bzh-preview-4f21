import { describe, expect, it } from 'vitest';
import { pickSettings } from './settings';

describe('pickSettings', () => {
  it('picks the single entry', () => {
    const s = { name: 'Parohia', address: 'a', phone: 'b', email: 'c@d.ch' };
    expect(pickSettings([{ id: 'settings', data: s }]).name).toBe('Parohia');
  });

  it('throws naming the settings file when there is none, instead of giving an empty footer', () => {
    // A footer that renders blank looks like a design choice. A build that
    // stops names the file somebody has to create.
    expect(() => pickSettings([])).toThrow(/src\/content\/settings/);
  });

  it('throws when there are two, because then it is not known which is true', () => {
    const s = { name: 'x', address: 'a', phone: 'b', email: 'c@d.ch' };
    expect(() => pickSettings([{ id: 'a', data: s }, { id: 'b', data: s }]))
      .toThrow(/exactly one/);
  });
});
