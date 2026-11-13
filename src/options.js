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
  saveSettings,
  validateDomain,
} from './settings.js';

const form = document.querySelector('#settings-form');
const status = document.querySelector('#status');
const sendStatus = document.querySelector('#send-status');
const incognitoWarning = document.querySelector('#incognito-warning');
const fields = Object.keys(DEFAULT_SETTINGS).filter(
  (field) => !['contacts', 'allowList', 'message'].includes(field),
);
const contactsElement = document.querySelector('#contacts');
const previews = document.querySelector('#contact-previews');
const contactsError = document.querySelector('#contacts-error');
const domainInput = document.querySelector('#allowList');
const domainsElement = document.querySelector('#allow-list-domains');
const domainError = document.querySelector('#allow-list-error');
let domains = [];
let contacts = [];
const INCOGNITO_WARNING =
  'Incognito tabs are not monitored. Open chrome://extensions, select Jail, and turn on “Allow in Incognito”.';
let sendStatusRevision = 0;

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
}

function showSendStatus(message, type) {
  sendStatusRevision += 1;
  sendStatus.textContent = message;
  sendStatus.className = type;
}

async function load() {
  const settings = await getSettings();
  for (const field of fields)
    document.querySelector(`#${field}`).value = settings[field];
  domains = parseDomainList(settings.allowList);
  renderDomains();
  contacts = settings.contacts.map((contact) => ({ ...contact }));
  renderContacts();
  const revision = sendStatusRevision;
  const { lastSendError } = await chrome.storage.local.get('lastSendError');
  if (lastSendError && revision === sendStatusRevision)
    showSendStatus(lastSendError, 'error');
  const incognitoAllowed = await chrome.extension.isAllowedIncognitoAccess();
  incognitoWarning.hidden = incognitoAllowed;
  incognitoWarning.textContent = incognitoAllowed ? '' : INCOGNITO_WARNING;
}

function values() {
  return Object.fromEntries(
    fields.map((field) => [field, document.querySelector(`#${field}`).value]),
  );
}

function validatedValues() {
  const settings = values();
  getAlertRecipients(contacts, settings.contactMessageTemplate);
  if (!settings.contactMessageTemplate.trim())
    throw new Error('Enter a message template.');
  settings.allowList = domains.join('\n');
  settings.contacts = contacts.map(validateContact);
  settings.checkEveryMinutes = normalizeCheckEveryMinutes(
    settings.checkEveryMinutes,
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
  try {
    const domain = validateDomain(domainInput.value);
    if (domains.includes(domain)) throw new Error('Domain already added.');
    domains.push(domain);
    domainInput.value = '';
    domainError.textContent = '';
    renderDomains();
  } catch (error) {
    domainError.textContent = error.message;
  }
}

document.querySelector('#add-domain').addEventListener('click', addDomain);
domainInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  addDomain();
});

function renderPreviews() {
  previews.replaceChildren();
  const renderedContacts = renderContactMessages(
    contacts.map((contact) => ({
      ...contact,
      name: contact.name.trim() || '(unnamed contact)',
    })),
    document.querySelector('#contactMessageTemplate').value,
  );
  for (const { name, message } of renderedContacts) {
    const preview = document.createElement('p');
    preview.textContent = `${name}: ${message}`;
    previews.append(preview);
  }
}

function renderContacts() {
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

document.querySelector('#add-contact').addEventListener('click', () => {
  contacts.push({ name: '', phone: '' });
  renderContacts();
});
document.querySelector('#import-contacts').addEventListener('click', () => {
  try {
    contacts.push(
      ...parseContactsCsv(document.querySelector('#contacts-csv').value),
    );
    document.querySelector('#contacts-csv').value = '';
    contactsError.textContent = '';
    renderContacts();
  } catch (error) {
    contactsError.textContent = error.message;
  }
});
document
  .querySelector('#contactMessageTemplate')
  .addEventListener('input', renderPreviews);

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
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.lastSendError) return;
  const message = changes.lastSendError.newValue;
  showSendStatus(message || '', message ? 'error' : '');
});

setupContactImport(
  (imported) => {
    for (const contact of imported) {
      if (!contacts.some((c) => c.phone === contact.phone))
        contacts.push(contact);
    }
    renderContacts();
  },
  (message) => {
    contactsError.textContent = message;
  },
);

load().catch((error) =>
  showStatus(`Could not load settings: ${error.message}`, 'error'),
);
