import { normalizeDomain } from './matcher.js';

export const DEFAULT_SETTINGS = {
  allowList: '',
  contacts: [],
  contactMessageTemplate: 'Hi {name}, I miss you',
  blockList: '',
  message: 'A browsing rule was violated.',
  checkEveryMinutes: 1,
  gracePeriodHours: 24,
  sessionDurationHours: 0,
};

export function normalizeSessionDurationHours(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0)
    throw new Error('Session duration must be a non-negative number of hours.');
  return Math.min(168, Math.max(0, hours));
}

export function normalizeGracePeriodHours(value) {
  if (typeof value === 'string' && !value.trim()) {
    throw new Error('Grace period must be a non-negative number of hours.');
  }
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0)
    throw new Error('Grace period must be a non-negative number of hours.');
  return Math.min(168, Math.max(0, hours));
}

export function normalizeCheckEveryMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0)
    throw new Error('Check interval must be a positive number.');
  return Math.max(0.5, minutes);
}

export async function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...(await chrome.storage.local.get(DEFAULT_SETTINGS)),
  };
}

export async function getRuleSettings() {
  return chrome.storage.local.get({
    allowList: DEFAULT_SETTINGS.allowList,
    blockList: DEFAULT_SETTINGS.blockList,
  });
}

export async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
}

export function validateDomain(value) {
  const domain = normalizeDomain(value);
  if (
    !value.trim() ||
    /\s/.test(value.trim()) ||
    !domain ||
    domain.length > 253 ||
    !domain
      .split('.')
      .every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))
  )
    throw new Error('Enter a valid domain.');
  return domain;
}
