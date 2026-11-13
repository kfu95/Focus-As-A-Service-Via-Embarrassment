import { getTabViolation, parseDomainList } from './matcher.js';
import { getSettings, normalizeCheckEveryMinutes } from './settings.js';
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
    await chrome.storage.local.set({
      lockdown: null,
      lastSendError: '',
    });
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
  const settings = await getSettings();
  const allowList = parseDomainList(settings.allowList);
  const blockList = parseDomainList(settings.blockList);
  const tabs = await chrome.tabs.query({});
  const violatingTabs = tabs.filter((tab) =>
    getTabViolation(tab.pendingUrl || tab.url, allowList, blockList),
  );

  const { lockdown } = await chrome.storage.local.get('lockdown');
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
    default:
      throw new Error('Unknown Jail request.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const allowed = ['src/options.html', 'src/jail.html', 'src/install.html'].map(
    (p) => chrome.runtime.getURL(p),
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

const requestCheck = () => checkOpenTabs().catch(console.error);
chrome.runtime.onInstalled.addListener(() => {
  configureAlarm().catch(console.error);
  chrome.runtime.openOptionsPage().catch(console.error);
  requestCheck();
});
chrome.runtime.onStartup.addListener(() => {
  configureAlarm().catch(console.error);
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
});
chrome.action.onClicked.addListener(() =>
  chrome.runtime.openOptionsPage().catch(console.error),
);
