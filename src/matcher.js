function stripRootDot(value) {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

export function normalizeDomain(value) {
  const candidate = value.trim().toLowerCase().replace(/^\*\./, '');
  if (!candidate) return '';

  try {
    const hostname = new URL(
      candidate.includes('://') ? candidate : `https://${candidate}`,
    ).hostname;
    return stripRootDot(hostname);
  } catch {
    return stripRootDot(candidate.split('/')[0]);
  }
}

export function parseDomainList(text) {
  return text.split(/\r?\n/).map(normalizeDomain).filter(Boolean);
}

export function matchesDomain(hostname, entry) {
  const host = normalizeDomain(hostname);
  const domain = normalizeDomain(entry);
  return Boolean(
    host && domain && (host === domain || host.endsWith(`.${domain}`)),
  );
}

export function getTabViolation(url, allowList, blockList) {
  let hostname;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    hostname = normalizeDomain(parsed.hostname);
  } catch {
    return null;
  }

  const blocked = blockList.some((entry) => matchesDomain(hostname, entry));
  if (blocked) return { hostname, reason: 'blocked' };

  const allowed = allowList.some((entry) => matchesDomain(hostname, entry));
  if (allowList.length > 0 && !allowed)
    return { hostname, reason: 'not-allowed' };
  return null;
}
