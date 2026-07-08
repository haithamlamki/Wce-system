import { describe, expect, it } from 'vitest';
import { isAllowedAempOrigin } from './aempSso';

describe('isAllowedAempOrigin', () => {
  it('allows an origin present in the allowlist', () => {
    expect(isAllowedAempOrigin('https://aemp.example.com', ['https://aemp.example.com'])).toBe(true);
  });

  it('rejects an origin not present in the allowlist', () => {
    expect(isAllowedAempOrigin('https://evil.example.com', ['https://aemp.example.com'])).toBe(false);
  });

  it('fails closed when the allowlist is empty', () => {
    expect(isAllowedAempOrigin('https://aemp.example.com', [])).toBe(false);
  });

  it('matches one of multiple allowed origins', () => {
    const allowed = ['https://aemp.example.com', 'https://staging.aemp.example.com'];
    expect(isAllowedAempOrigin('https://staging.aemp.example.com', allowed)).toBe(true);
    expect(isAllowedAempOrigin('https://other.example.com', allowed)).toBe(false);
  });
});
