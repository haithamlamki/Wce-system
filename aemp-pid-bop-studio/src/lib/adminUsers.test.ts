import { describe, expect, it } from 'vitest';
import { validateNewUser, validatePassword } from './adminUsers';

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('Abc@123')).toMatch(/at least 8/);
  });
  it('accepts an 8+ character password', () => {
    expect(validatePassword('sample-pass-1')).toBeNull();
  });
  it('rejects a mismatched confirmation', () => {
    expect(validatePassword('sample-pass-1', 'sample-pass-2')).toMatch(/match/);
  });
  it('accepts a matching confirmation', () => {
    expect(validatePassword('sample-pass-1', 'sample-pass-1')).toBeNull();
  });
});

describe('validateNewUser', () => {
  it('rejects a malformed email', () => {
    expect(validateNewUser('not-an-email', 'sample-pass-1')).toMatch(/valid email/);
  });
  it('trims surrounding whitespace before checking the email', () => {
    expect(validateNewUser('  user@example.com ', 'sample-pass-1')).toBeNull();
  });
  it('still enforces the password rule', () => {
    expect(validateNewUser('user@example.com', 'short')).toMatch(/at least 8/);
  });
});
