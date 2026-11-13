import { setupContactImport } from './contact-import.js';
import {
  getAlertRecipients,
  parseContactsCsv,
  renderContactMessages,
  validateContact,
} from './contacts.js';
import { parseDomainList } from './matcher.js';
import {
  DEFAULT_SETTINGS,
  getSettings,
  normalizeCheckEveryMinutes,
  normalizeGracePeriodHours,
  saveSettings,
  validateDomain,
} from './settings.js';

const form = document.querySelector('#settings-form');
const status = document.querySelector('#status');
const sendStatus = document.querySelector('#send-status');
const incognitoWarning = document.querySelector('#incognito-warning');
const fields = Object.keys(DEFAULT_SETTINGS).filter(
  (field) =>
    !['contacts', 'allowList', 'blockList', 'message'].includes(field),
);
const contactsElement = document.querySelector('#contacts');
const previews = document.querySelector('#contact-previews');
const contactsError = document.querySelector('#contacts-error');
const domainInput = document.querySelector('#allowList');
const domainsElement = document.querySelector('#allow-list-domains');
const domainError = document.querySelector('#allow-list-error');
const blockedDomainInput = document.querySelector('#blockListInput');
const blockedDomainsElement = document.querySelector('#block-list-domains');
const blockedDomainError = document.querySelector('#block-list-error');
const addBlockDomainButton = document.querySelector('#add-block-domain');
const graceNotice = document.querySelector('#grace-period-notice');
const graceStatus = document.querySelector('#grace-status');
const endGraceButton = document.querySelector('#end-grace-period');
const selfPhoneInput = document.querySelector('#self-phone');
const sendTestButton = document.querySelector('#send-test-text');
const selfTestStatus = document.querySelector('#self-test-status');
const editSettingsBtn = document.querySelector('#edit-settings-btn');
const testAgainBtn = document.querySelector('#test-again-btn');
const helperCommandPre = document.querySelector('#helper-install-command');
const copyInstallBtn = document.querySelector('#copy-install-cmd');
const checkHelperBtn = document.querySelector('#check-helper-btn');
const helperInstallStatus = document.querySelector('#helper-install-status');

let domains = [];
let blockedDomains = [];
let contacts = [];
export let currentStep = 1;
const INCOGNITO_WARNING =
  'Incognito tabs are not monitored. Open chrome://extensions, select Jail, and turn on “Allow in Incognito”.';
let sendStatusRevision = 0;

function showStatus(message, type) {
  if (!status) return;
  status.textContent = message;
  status.className = type;
}

function showSendStatus(message, type) {
  if (!sendStatus) return;
  sendStatusRevision += 1;
  sendStatus.textContent = message;
  sendStatus.className = type;
}

export function setStep(stepNumber) {
  currentStep = stepNumber;
  const stepIds = [
    '#step-helper',
    '#step-allow',
    '#step-block',
    '#step-contacts',
    '#step-message',
    '#step-permissions',
    '#step-active',
  ];
  stepIds.forEach((id, idx) => {
    const el = document.querySelector(id);
    if (el) el.hidden = idx + 1 !== stepNumber;
  });
  if (document.querySelectorAll) {
    document.querySelectorAll('.step-tab').forEach((tab) => {
      const isCurrent = Number(tab.dataset?.step) === stepNumber;
      tab.classList?.toggle('active', isCurrent);
      tab.setAttribute?.('aria-selected', isCurrent ? 'true' : 'false');
    });
  }
  if (stepNumber === 7) {
    renderActiveSummary();
  }
}

function renderActiveSummary() {
  const container = document.querySelector('#active-summary');
  if (!container) return;
  container.replaceChildren();

  const card = document.createElement('div');
  card.className = 'summary-card';

  const blockHeading = document.createElement('h3');
  blockHeading.textContent = `Blocked sites (${blockedDomains.length})`;
  const blockListUl = document.createElement('ul');
  blockedDomains.forEach((d) => {
    const li = document.createElement('li');
    li.textContent = d;
    blockListUl.append(li);
  });

  const allowHeading = document.createElement('h3');
  allowHeading.textContent = domains.length
    ? `Allowed sites (${domains.length})`
    : 'Allowed sites: All sites not blocked';
  const allowListUl = document.createElement('ul');
  domains.forEach((d) => {
    const li = document.createElement('li');
    li.textContent = d;
    allowListUl.append(li);
  });

  const contactsHeading = document.createElement('h3');
  contactsHeading.textContent = `Emergency contacts (${contacts.length})`;
  const contactsUl = document.createElement('ul');
  contacts.forEach((c) => {
    const li = document.createElement('li');
    li.textContent = `${c.name || 'Unnamed'} (${c.phone})`;
    contactsUl.append(li);
  });

  card.append(
    blockHeading,
    blockListUl,
    allowHeading,
    allowListUl,
    contactsHeading,
    contactsUl,
  );
  container.append(card);
}

function syncBlockListHidden() {
  const blockListHidden = document.querySelector('#blockList');
  if (blockListHidden) blockListHidden.value = blockedDomains.join('\n');
}

function renderBlockedDomains() {
  if (!blockedDomainsElement) return;
  blockedDomainsElement.replaceChildren();
  blockedDomains.forEach((domain, index) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = domain;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${domain}`);
    remove.addEventListener('click', () => {
      blockedDomains.splice(index, 1);
      renderBlockedDomains();
    });
    item.append(name, remove);
    blockedDomainsElement.append(item);
  });
  syncBlockListHidden();
}

function addBlockedDomain() {
  if (!blockedDomainInput) return;
  try {
    const domain = validateDomain(blockedDomainInput.value);
    if (blockedDomains.includes(domain))
      throw new Error('Domain already added.');
    blockedDomains.push(domain);
    blockedDomainInput.value = '';
    if (blockedDomainError) blockedDomainError.textContent = '';
    renderBlockedDomains();
  } catch (error) {
    if (blockedDomainError) blockedDomainError.textContent = error.message;
  }
}

if (addBlockDomainButton) {
  addBlockDomainButton.addEventListener('click', addBlockedDomain);
}
if (blockedDomainInput) {
  blockedDomainInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addBlockedDomain();
  });
}

if (copyInstallBtn && helperCommandPre) {
  copyInstallBtn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(helperCommandPre.textContent || '');
        const prev = copyInstallBtn.textContent;
        copyInstallBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyInstallBtn.textContent = prev;
        }, 2000);
      }
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  });
}

async function verifyHelperStatus() {
  if (helperInstallStatus) {
    helperInstallStatus.textContent = 'Checking…';
    helperInstallStatus.className = '';
  }
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'helper-status' });
    if (resp?.ok) {
      if (helperInstallStatus) {
        helperInstallStatus.textContent =
          'Helper and group shortcut are installed.';
        helperInstallStatus.className = 'success';
      }
      return true;
    }
    throw new Error(resp?.error || 'Helper returned an error.');
  } catch (err) {
    if (helperInstallStatus) {
      helperInstallStatus.textContent = err.message;
      helperInstallStatus.className = 'error';
    }
    return false;
  }
}

if (checkHelperBtn) {
  checkHelperBtn.addEventListener('click', verifyHelperStatus);
}

async function load() {
  if (helperCommandPre && chrome.runtime?.id) {
    helperCommandPre.textContent = `bash native/install.sh ${chrome.runtime.id}`;
  }

  const settings = await getSettings();
  for (const field of fields) {
    const el = document.querySelector(`#${field}`);
    if (el) el.value = settings[field];
  }
  domains = parseDomainList(settings.allowList);
  renderDomains();
  blockedDomains = parseDomainList(settings.blockList);
  renderBlockedDomains();
  contacts = settings.contacts.map((contact) => ({ ...contact }));
  renderContacts();

  const revision = sendStatusRevision;
  const { lastSendError } = await chrome.storage.local.get('lastSendError');
  if (lastSendError && revision === sendStatusRevision)
    showSendStatus(lastSendError, 'error');
  const { selfPhone, selfTestCompleted } =
    await chrome.storage.local.get(['selfPhone', 'selfTestCompleted']);
  if (selfPhone && selfPhoneInput) selfPhoneInput.value = selfPhone;

  if (chrome.extension?.isAllowedIncognitoAccess) {
    const incognitoAllowed = await chrome.extension.isAllowedIncognitoAccess();
    if (incognitoWarning) {
      incognitoWarning.hidden = incognitoAllowed;
      incognitoWarning.textContent = incognitoAllowed ? '' : INCOGNITO_WARNING;
    }
  }
  await renderGracePeriod();

  // Check helper status in background
  verifyHelperStatus().catch(() => {});

  if (selfTestCompleted && blockedDomains.length > 0 && contacts.length >= 2) {
    setStep(7);
  } else {
    setStep(1);
  }
}

async function renderGracePeriod() {
  if (!graceNotice) return;
  const { gracePeriodUntil } =
    await chrome.storage.local.get('gracePeriodUntil');
  const inGrace = Boolean(gracePeriodUntil && Date.now() < gracePeriodUntil);
  graceNotice.hidden = !inGrace;
  if (inGrace && graceStatus) {
    const timeStr = new Date(gracePeriodUntil).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    graceStatus.textContent = `Browsing rules are paused until ${timeStr}. You can end the grace period to resume enforcement immediately.`;
  }
}

function values() {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      document.querySelector(`#${field}`)?.value ?? '',
    ]),
  );
}

function validatedValues() {
  const settings = values();
  getAlertRecipients(contacts, settings.contactMessageTemplate);
  if (!settings.contactMessageTemplate?.trim())
    throw new Error('Enter a message template.');
  const blockListHidden = document.querySelector('#blockList');
  if (blockedDomains.length === 0 && blockListHidden?.value) {
    blockedDomains = parseDomainList(blockListHidden.value);
  }
  if (blockedDomains.length === 0) {
    throw new Error('Add at least one blocked domain.');
  }
  settings.allowList = domains.join('\n');
  settings.blockList = blockedDomains.join('\n');
  settings.contacts = contacts.map(validateContact);
  settings.checkEveryMinutes = normalizeCheckEveryMinutes(
    settings.checkEveryMinutes,
  );
  settings.gracePeriodHours = normalizeGracePeriodHours(
    settings.gracePeriodHours,
  );
  return settings;
}

async function saveWithStatus(settings) {
  try {
    await saveSettings(settings);
    return true;
  } catch (error) {
    showStatus(`Could not save settings: ${error.message}`, 'error');
    return false;
  }
}

function renderDomains() {
  if (!domainsElement) return;
  domainsElement.replaceChildren();
  domains.forEach((domain, index) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = domain;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${domain}`);
    remove.addEventListener('click', () => {
      domains.splice(index, 1);
      renderDomains();
    });
    item.append(name, remove);
    domainsElement.append(item);
  });
}

function addDomain() {
  if (!domainInput) return;
  try {
    const domain = validateDomain(domainInput.value);
    if (domains.includes(domain)) throw new Error('Domain already added.');
    domains.push(domain);
    domainInput.value = '';
    if (domainError) domainError.textContent = '';
    renderDomains();
  } catch (error) {
    if (domainError) domainError.textContent = error.message;
  }
}

const addDomainBtn = document.querySelector('#add-domain');
if (addDomainBtn) addDomainBtn.addEventListener('click', addDomain);

if (domainInput) {
  domainInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addDomain();
  });
}

function renderPreviews() {
  if (!previews) return;
  previews.replaceChildren();
  const template =
    document.querySelector('#contactMessageTemplate')?.value ?? '';
  const renderedContacts = renderContactMessages(
    contacts.map((contact) => ({
      ...contact,
      name: contact.name.trim() || '(unnamed contact)',
    })),
    template,
  );
  for (const { name, message } of renderedContacts) {
    const preview = document.createElement('p');
    preview.textContent = `${name}: ${message}`;
    previews.append(preview);
  }
}

function renderContacts() {
  if (!contactsElement) return;
  contactsElement.replaceChildren();
  contacts.forEach((contact, index) => {
    const row = document.createElement('div');
    row.className = 'contact-row';
    for (const field of ['name', 'phone']) {
      const label = document.createElement('label');
      label.textContent = field === 'name' ? 'First name' : 'Phone (E.164)';
      const input = document.createElement('input');
      input.value = contact[field];
      input.addEventListener('input', () => {
        contact[field] = input.value;
        renderPreviews();
      });
      label.append(input);
      row.append(label);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${contact.name || 'contact'}`);
    remove.addEventListener('click', () => {
      contacts.splice(index, 1);
      renderContacts();
    });
    row.append(remove);
    contactsElement.append(row);
  });
  renderPreviews();
}

const addContactBtn = document.querySelector('#add-contact');
if (addContactBtn) {
  addContactBtn.addEventListener('click', () => {
    contacts.push({ name: '', phone: '' });
    renderContacts();
  });
}

const importContactsBtn = document.querySelector('#import-contacts');
if (importContactsBtn) {
  importContactsBtn.addEventListener('click', () => {
    const csvInput = document.querySelector('#contacts-csv');
    if (!csvInput) return;
    try {
      contacts.push(...parseContactsCsv(csvInput.value));
      csvInput.value = '';
      if (contactsError) contactsError.textContent = '';
      renderContacts();
    } catch (error) {
      if (contactsError) contactsError.textContent = error.message;
    }
  });
}

const templateEl = document.querySelector('#contactMessageTemplate');
if (templateEl) templateEl.addEventListener('input', renderPreviews);

function handleNextFromBlock() {
  if (blockedDomains.length === 0) {
    if (blockedDomainError)
      blockedDomainError.textContent = 'Add at least one blocked domain.';
    return;
  }
  if (blockedDomainError) blockedDomainError.textContent = '';
  setStep(4);
}

function handleNextFromContacts() {
  if (contacts.length < 2) {
    if (contactsError)
      contactsError.textContent =
        'Add at least 2 contacts for the group alert.';
    return;
  }
  try {
    contacts.forEach(validateContact);
    if (contactsError) contactsError.textContent = '';
    setStep(5);
  } catch (error) {
    if (contactsError) contactsError.textContent = error.message;
  }
}

if (document.querySelectorAll) {
  document.querySelectorAll('.step-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const step = Number(tab.dataset.step);
      if (step === 4 && blockedDomains.length === 0) {
        if (blockedDomainError)
          blockedDomainError.textContent = 'Add at least one blocked domain.';
        setStep(3);
        return;
      }
      if (step >= 5 && contacts.length < 2) {
        if (contactsError)
          contactsError.textContent =
            'Add at least 2 contacts for the group alert.';
        setStep(4);
        return;
      }
      setStep(step);
    });
  });

  document.querySelectorAll('.btn-next').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextStep = Number(btn.dataset.next);
      if (nextStep === 4) {
        handleNextFromBlock();
      } else if (nextStep === 5) {
        handleNextFromContacts();
      } else {
        setStep(nextStep);
      }
    });
  });

  document.querySelectorAll('.btn-prev').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prevStep = Number(btn.dataset.prev);
      setStep(prevStep);
    });
  });
}

if (editSettingsBtn) {
  editSettingsBtn.addEventListener('click', () => setStep(1));
}
if (testAgainBtn) {
  testAgainBtn.addEventListener('click', () => setStep(6));
}

if (sendTestButton) {
  sendTestButton.addEventListener('click', async () => {
    const phone = selfPhoneInput ? selfPhoneInput.value.trim() : '';
    if (!phone) {
      if (selfTestStatus) {
        selfTestStatus.textContent =
          'Enter your phone number in E.164 format (+1XXXXXXXXXX).';
        selfTestStatus.className = 'error';
      }
      return;
    }
    try {
      validateContact({ name: 'Self', phone });
    } catch (err) {
      if (selfTestStatus) {
        selfTestStatus.textContent = err.message;
        selfTestStatus.className = 'error';
      }
      return;
    }
    sendTestButton.disabled = true;
    if (selfTestStatus) {
      selfTestStatus.textContent =
        'Sending text to your number... check for macOS permission prompts and click "Always Allow".';
      selfTestStatus.className = '';
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'send-test-alert',
        phone,
        message:
          'Jail test: permissions enabled. Future alerts will send automatically.',
      });
      if (!response?.ok)
        throw new Error(response?.error || 'Could not send test text.');
      if (selfTestStatus) {
        selfTestStatus.textContent =
          'Text sent successfully! macOS permissions are granted.';
        selfTestStatus.className = 'success';
      }
      await chrome.storage.local.set({
        selfPhone: phone,
        selfTestCompleted: true,
      });
      await chrome.runtime
        .sendMessage({ type: 'update-active-icon' })
        .catch(() => {});
      setTimeout(() => setStep(7), 1200);
    } catch (error) {
      if (selfTestStatus) {
        selfTestStatus.textContent = `Could not send test text: ${error.message}`;
        selfTestStatus.className = 'error';
      }
    } finally {
      sendTestButton.disabled = false;
    }
  });
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let settings;
    try {
      settings = validatedValues();
    } catch (error) {
      showStatus(error.message, 'error');
      return;
    }
    if (!(await saveWithStatus(settings))) return;
    showStatus('Settings saved.', 'success');
    await chrome.runtime
      .sendMessage({ type: 'update-active-icon' })
      .catch(() => {});
    setStep(6);
  });
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.lastSendError) {
      const message = changes.lastSendError.newValue;
      showSendStatus(message || '', message ? 'error' : '');
    }
    if (changes.gracePeriodUntil) {
      renderGracePeriod().catch(console.error);
    }
  });
}

if (endGraceButton) {
  endGraceButton.addEventListener('click', async () => {
    endGraceButton.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: 'end-grace-period' });
    } finally {
      endGraceButton.disabled = false;
      await renderGracePeriod();
    }
  });
}

setupContactImport(
  (imported) => {
    for (const contact of imported) {
      if (!contacts.some((c) => c.phone === contact.phone))
        contacts.push(contact);
    }
    renderContacts();
  },
  (message) => {
    if (contactsError) contactsError.textContent = message;
  },
);

load().catch((error) =>
  showStatus(`Could not load settings: ${error.message}`, 'error'),
);
