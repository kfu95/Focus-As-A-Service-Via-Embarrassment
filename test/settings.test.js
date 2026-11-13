import { describe, expect, it } from 'vitest';
import {
  normalizeCheckEveryMinutes,
  normalizeGracePeriodHours,
  validateDomain,
} from '../src/settings.js';

describe('grace period normalization', () => {
  it('normalizes valid hours', () => {
    expect(normalizeGracePeriodHours(24)).toBe(24);
    expect(normalizeGracePeriodHours('0')).toBe(0);
    expect(normalizeGracePeriodHours(200)).toBe(168);
  });

  it.each(['not-a-number', '', '-1'])('rejects invalid hours %j', (value) => {
    expect(() => normalizeGracePeriodHours(value)).toThrow(
      'Grace period must be a non-negative number of hours.',
    );
  });
});

describe('check interval normalization', () => {
  it('normalizes positive numeric input', () => {
    expect(normalizeCheckEveryMinutes('2.5')).toBe(2.5);
    expect(normalizeCheckEveryMinutes('0.25')).toBe(0.5);
  });

  it.each(['not-a-number', '', '0', '-1'])(
    'rejects invalid input %j',
    (value) => {
      expect(() => normalizeCheckEveryMinutes(value)).toThrow(
        'Check interval must be a positive number.',
      );
    },
  );
});

describe('domain validation', () => {
  it('uses the existing domain normalization', () => {
    expect(validateDomain(' *.Example.COM. ')).toBe('example.com');
    expect(validateDomain('https://example.com/path')).toBe('example.com');
  });

  it.each(['', 'bad domain', '-bad.example', 'bad..example'])(
    'rejects invalid domain %j',
    (value) =>
      expect(() => validateDomain(value)).toThrow('Enter a valid domain.'),
  );
});
