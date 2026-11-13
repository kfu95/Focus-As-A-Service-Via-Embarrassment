import { describe, expect, it } from 'vitest';
import {
  getTabViolation,
  matchesDomain,
  normalizeDomain,
  parseDomainList,
} from '../src/matcher.js';

describe('domain matching', () => {
  it('matches a listed domain and its subdomains only', () => {
    expect(matchesDomain('example.com', 'example.com')).toBe(true);
    expect(matchesDomain('docs.example.com', 'example.com')).toBe(true);
    expect(matchesDomain('notexample.com', 'example.com')).toBe(false);
  });

  it('normalizes one-domain-per-line lists', () => {
    expect(parseDomainList('Example.com.\n*.docs.example.com\n\n')).toEqual([
      'example.com',
      'docs.example.com',
    ]);
  });

  it('canonicalizes terminal DNS root dots', () => {
    expect(normalizeDomain('https://Example.com./path')).toBe('example.com');
    expect(matchesDomain('example.com.', 'example.com')).toBe(true);
    expect(matchesDomain('example.com', 'example.com.')).toBe(true);
  });
});

describe('tab violations', () => {
  it('ignores browser-internal pages', () => {
    expect(
      getTabViolation('chrome://settings', ['example.com'], []),
    ).toBeNull();
    expect(getTabViolation('about:blank', ['example.com'], [])).toBeNull();
  });

  it('flags non-allowed sites when an allow list exists', () => {
    expect(
      getTabViolation('https://news.example', ['example.com'], []),
    ).toEqual({ hostname: 'news.example', reason: 'not-allowed' });
  });

  it('gives the block list priority over the allow list', () => {
    expect(
      getTabViolation(
        'https://social.example.com',
        ['example.com'],
        ['social.example.com'],
      ),
    ).toEqual({ hostname: 'social.example.com', reason: 'blocked' });
  });

  it('canonicalizes root dots before allow and block checks', () => {
    expect(
      getTabViolation('https://blocked.example./', [], ['blocked.example']),
    ).toEqual({ hostname: 'blocked.example', reason: 'blocked' });
    expect(
      getTabViolation('https://allowed.example/', ['allowed.example.'], []),
    ).toBeNull();
  });

  it('allows all non-blocked web pages with an empty allow list', () => {
    expect(getTabViolation('https://news.example', [], [])).toBeNull();
  });
});
