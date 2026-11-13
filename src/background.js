import { getTabViolation, parseDomainList } from './matcher.js';
import {
  getSettings,
  normalizeCheckEveryMinutes,
  normalizeGracePeriodHours,
  normalizeSessionDurationHours,
} from './settings.js';
import { getAlertRecipients } from './contacts.js';
import { helperRequest, validateNativeRequest, verifySend } from './native.js';

const ALARM_NAME = 'jail-check-tabs';
const jailURL = chrome.runtime.getURL('src/jail.html');
let checkTail = Promise.resolve();
let sending = null;

async function configureAlarm() {
  const { checkEveryMinutes } = await getSettings();
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: normalizeCheckEveryMinutes(checkEveryMinutes),
  });
}

async function confineViolatingTabs(tabs) {
  const results = await Promise.allSettled(
    tabs.map((tab) => chrome.tabs.update(tab.id, { url: jailURL })),
  );
  for (const result of results) {
    if (result.status === 'rejected')
      console.error('Jail could not redirect a tab:', result.reason);
  }
}

async function sendAlert(episode) {
  try {
    const response = await helperRequest({ type: 'send-group', episode });
    verifySend(response, episode);
    const { gracePeriodHours } = await getSettings();
    const hours = normalizeGracePeriodHours(gracePeriodHours ?? 24);
    const gracePeriodUntil = hours > 0 ? Date.now() + hours * 3600 * 1000 : 0;
    await chrome.storage.local.set({
      lockdown: null,
      lastSendError: '',
      gracePeriodUntil,
    });
    await updateIconState();
  } catch (error) {
    await chrome.storage.local.set({ lastSendError: error.message });
    throw error;
  }
}

function startSend(episode) {
  if (sending) return sending;
  sending = sendAlert(episode).finally(() => {
    sending = null;
  });
  return sending;
}

function createEpisode(id, settings) {
  const episode = {
    id,
    recipients: getAlertRecipients(
      settings.contacts,
      settings.contactMessageTemplate,
    ),
    setupError: '',
  };
  validateNativeRequest({ type: 'send-group', episode });
  return episode;
}

async function evaluateOpenTabs() {
  const { lockdown, gracePeriodUntil, sessionExpiresAt } =
    await chrome.storage.local.get([
      'lockdown',
      'gracePeriodUntil',
      'sessionExpiresAt',
    ]);
  if (gracePeriodUntil && Date.now() < gracePeriodUntil) {
    return;
  }
  if (sessionExpiresAt && Date.now() > sessionExpiresAt) {
    return;
  }
  const settings = await getSettings();
  const allowList = parseDomainList(settings.allowList);
  const blockList = parseDomainList(settings.blockList);
  const tabs = await chrome.tabs.query({});
  const violatingTabs = tabs.filter((tab) =>
    getTabViolation(tab.pendingUrl || tab.url, allowList, blockList),
  );

  if (violatingTabs.length > 0) {
    await confineViolatingTabs(violatingTabs);
  }
  if (lockdown || violatingTabs.length === 0) {
    return;
  }
  const id = crypto.randomUUID();
  let episode;
  try {
    episode = createEpisode(id, settings);
  } catch (error) {
    episode = { id, recipients: [], setupError: error.message };
  }
  await chrome.storage.local.set({
    lockdown: episode,
    lastSendError: episode.setupError,
  });
  if (!episode.setupError) startSend(episode).catch(console.error);
}

export function checkOpenTabs() {
  const check = checkTail.then(evaluateOpenTabs);
  checkTail = check.catch((error) =>
    console.error('Jail tab check failed:', error),
  );
  return check;
}

async function retryAlert() {
  await checkTail;
  let { lockdown } = await chrome.storage.local.get('lockdown');
  if (!lockdown) return { ok: true };
  let rebuild = Boolean(lockdown.setupError);
  if (!rebuild) {
    try {
      validateNativeRequest({ type: 'send-group', episode: lockdown });
    } catch {
      rebuild = true;
    }
  }
  if (rebuild) {
    const settings = await getSettings();
    lockdown = createEpisode(lockdown.id, settings);
    await chrome.storage.local.set({ lockdown });
  }
  await evaluateOpenTabs();
  await startSend(lockdown);
  return { ok: true };
}

async function handleMessage(message) {
  switch (message.type) {
    case 'helper-status':
      return helperRequest({ type: 'status' });
    case 'read-contacts':
      return helperRequest({ type: 'contacts' });
    case 'retry-alert':
      return retryAlert();
    case 'end-grace-period':
      await chrome.storage.local.set({ gracePeriodUntil: 0 });
      await updateIconState();
      await evaluateOpenTabs();
      return { ok: true };
    case 'send-test-alert':
      return helperRequest({
        type: 'send-test',
        phone: message.phone,
        message: message.message || 'Jail test: permissions enabled.',
      });
    case 'update-active-icon':
      await updateIconState();
      return { ok: true };
    case 'start-session': {
      const { sessionDurationHours } = await getSettings();
      const hours = normalizeSessionDurationHours(
        message.hours ?? sessionDurationHours,
      );
      const sessionExpiresAt = hours > 0 ? Date.now() + hours * 3600 * 1000 : 0;
      await chrome.storage.local.set({ sessionExpiresAt });
      await updateIconState();
      await evaluateOpenTabs();
      return { ok: true, sessionExpiresAt };
    }
    default:
      throw new Error('Unknown Jail request.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const allowed = ['src/options.html', 'src/jail.html'].map((p) =>
    chrome.runtime.getURL(p),
  );
  if (
    sender.id !== chrome.runtime.id ||
    !allowed.includes(sender.url?.split('?')[0])
  )
    return undefined;
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

export async function updateIconState() {
  if (!chrome.action) return;
  const settings = await getSettings();
  const { gracePeriodUntil, sessionExpiresAt } = await chrome.storage.local.get(
    ['gracePeriodUntil', 'sessionExpiresAt'],
  );
  const inGrace = Boolean(gracePeriodUntil && Date.now() < gracePeriodUntil);
  const sessionExpired = Boolean(
    sessionExpiresAt && Date.now() > sessionExpiresAt,
  );
  const blockList = parseDomainList(settings.blockList);
  const isConfigured = blockList.length > 0 && settings.contacts?.length >= 2;

  if (isConfigured && !inGrace && !sessionExpired) {
    if (chrome.action.setIcon) {
      await chrome.action
        .setIcon({
          path: {
            16: 'icons/icon-16-active.png',
            32: 'icons/icon-32-active.png',
            48: 'icons/icon-48-active.png',
            128: 'icons/icon-128-active.png',
          },
        })
        .catch(console.error);
    }
    if (chrome.action.setBadgeBackgroundColor) {
      await chrome.action
        .setBadgeBackgroundColor({ color: '#dc2626' })
        .catch(console.error);
    }
    if (chrome.action.setBadgeText) {
      await chrome.action.setBadgeText({ text: 'ON' }).catch(console.error);
    }
  } else {
    if (chrome.action.setIcon) {
      await chrome.action
        .setIcon({
          path: {
            16: 'icons/icon-16.png',
            32: 'icons/icon-32.png',
            48: 'icons/icon-48.png',
            128: 'icons/icon-128.png',
          },
        })
        .catch(console.error);
    }
    if (chrome.action.setBadgeText) {
      const badgeText = inGrace ? 'PAUSE' : sessionExpired ? 'OFF' : '';
      await chrome.action
        .setBadgeText({ text: badgeText })
        .catch(console.error);
    }
    if (inGrace && chrome.action.setBadgeBackgroundColor) {
      await chrome.action
        .setBadgeBackgroundColor({ color: '#f59e0b' })
        .catch(console.error);
    }
  }
}

function configureUninstallURL() {
  if (chrome.runtime?.setUninstallURL) {
    chrome.runtime
      .setUninstallURL(
        'https://kfu95.github.io/Focus-As-A-Service-Via-Embarrassment/uninstalled.html',
      )
      .catch(() => {});
  }
}

const requestCheck = () => checkOpenTabs().catch(console.error);
chrome.runtime.onInstalled.addListener(() => {
  configureAlarm().catch(console.error);
  configureUninstallURL();
  chrome.runtime.openOptionsPage().catch(console.error);
  updateIconState().catch(console.error);
  requestCheck();
});
chrome.runtime.onStartup.addListener(() => {
  configureAlarm().catch(console.error);
  configureUninstallURL();
  updateIconState().catch(console.error);
  requestCheck();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) return requestCheck();
});
chrome.tabs.onCreated.addListener(requestCheck);
chrome.tabs.onRemoved.addListener(requestCheck);
chrome.tabs.onReplaced.addListener(requestCheck);
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.status === 'complete') return requestCheck();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.checkEveryMinutes) configureAlarm().catch(console.error);
  if (changes.allowList || changes.blockList) requestCheck();
  if (changes.blockList || changes.contacts || changes.gracePeriodUntil)
    updateIconState().catch(console.error);
});
chrome.action.onClicked.addListener(() =>
  chrome.runtime.openOptionsPage().catch(console.error),
);
