import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createElement(value = '') {
  const listeners = {};
  return {
    append: vi.fn(),
    replaceChildren: vi.fn(),
    setAttribute: vi.fn(),
    addEventListener: vi.fn((type, listener) => {
      listeners[type] = listener;
    }),
    className: '',
    hidden: true,
    listeners,
    textContent: '',
    value,
  };
}

function createOptionsEnvironment(overrides = {}) {
  const stored = {
    allowList: 'allowed.example',
    blockList: 'blocked.example',
    checkEveryMinutes: 1,
    contacts: [
      { name: 'Ada', phone: '+14155552671' },
      { name: 'Grace', phone: '+14155552672' },
    ],
    message: 'Browsing rule violated',
    gracePeriodHours: 24,
    ...overrides,
  };
  const elements = {
    '#contact-drop': createElement(),
    '#mac-picker': createElement(),
    '#contact-search': createElement(),
    '#load-mac-contacts': createElement(),
    '#contact-files': createElement(),
    '#allowList': createElement(),
    '#allow-list-domains': createElement(),
    '#allow-list-error': createElement(),
    '#add-domain': createElement(),
    '#contacts': createElement(),
    '#contact-previews': createElement(),
    '#contacts-error': createElement(),
    '#contacts-csv': createElement(),
    '#contactMessageTemplate': createElement(),
    '#add-contact': createElement(),
    '#import-contacts': createElement(),
    '#blockList': createElement(),
    '#checkEveryMinutes': createElement(),
    '#gracePeriodHours': createElement(),
    '#grace-period-notice': createElement(),
    '#grace-status': createElement(),
    '#end-grace-period': createElement(),
    '#incognito-warning': createElement(),
    '#message': createElement(),
    '#send-status': createElement(),
    '#settings-form': createElement(),
    '#status': createElement(),
  };
  let storageListener;
  const readStorage = (keys) => {
    if (typeof keys === 'string') return { [keys]: stored[keys] };
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        stored[key] ?? fallback,
      ]),
    );
  };
  const chrome = {
    extension: {
      isAllowedIncognitoAccess: vi.fn(async () => true),
    },
    runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
    storage: {
      local: {
        get: vi.fn(async (keys) => readStorage(keys)),
        set: vi.fn(async (values) => Object.assign(stored, values)),
      },
      onChanged: {
        addListener: vi.fn((listener) => {
          storageListener = listener;
        }),
      },
    },
  };
  const document = {
    createElement: vi.fn(() => createElement()),
    querySelector: vi.fn((selector) => elements[selector]),
  };
  return {
    chrome,
    document,
    elements,
    get storageListener() {
      return storageListener;
    },
    readStorage,
    stored,
  };
}

async function loadOptions(environment) {
  vi.stubGlobal('chrome', environment.chrome);
  vi.stubGlobal('document', environment.document);
  await import('../src/options.js');
  await vi.waitFor(() =>
    expect(environment.elements['#checkEveryMinutes'].value).toBe(
      environment.stored.checkEveryMinutes,
    ),
  );
}

describe('options status', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('loads, adds, validates, removes, and saves allow-list domains', async () => {
    const environment = createOptionsEnvironment({
      allowList: 'Existing.Example\nsecond.example',
    });
    await loadOptions(environment);
    const input = environment.elements['#allowList'];
    const list = environment.elements['#allow-list-domains'];
    const error = environment.elements['#allow-list-error'];
    expect(list.append).toHaveBeenCalledTimes(2);
    expect(
      list.append.mock.calls[0][0].append.mock.calls[0][0].textContent,
    ).toBe('existing.example');

    input.value = ' HTTPS://New.Example/path ';
    input.listeners.keydown({ key: 'Enter', preventDefault: vi.fn() });
    expect(input.value).toBe('');
    input.value = '*.NEW.example';
    environment.elements['#add-domain'].listeners.click();
    expect(error.textContent).toBe('Domain already added.');
    input.value = 'bad domain';
    environment.elements['#add-domain'].listeners.click();
    expect(error.textContent).toBe('Enter a valid domain.');

    const lastRow = list.append.mock.calls.at(-1)[0];
    lastRow.append.mock.calls[0][1].listeners.click();
    await environment.elements['#settings-form'].listeners.submit({
      preventDefault: vi.fn(),
    });
    expect(environment.stored.allowList).toBe(
      'existing.example\nsecond.example',
    );
  });

  it('saves an empty allow list after removing its final domain', async () => {
    const environment = createOptionsEnvironment();
    await loadOptions(environment);
    const row =
      environment.elements['#allow-list-domains'].append.mock.calls[0][0];
    row.append.mock.calls[0][1].listeners.click();
    await environment.elements['#settings-form'].listeners.submit({
      preventDefault: vi.fn(),
    });
    expect(environment.stored.allowList).toBe('');
  });

  it('shows the persisted background send error', async () => {
    const environment = createOptionsEnvironment({
      lastSendError: 'Messages helper could not be reached',
    });

    await loadOptions(environment);

    expect(environment.elements['#send-status'].textContent).toBe(
      'Messages helper could not be reached',
    );
    expect(environment.elements['#send-status'].className).toBe('error');
  });

  it.each([
    {
      allowed: false,
      hidden: false,
      message:
        'Incognito tabs are not monitored. Open chrome://extensions, select Jail, and turn on “Allow in Incognito”.',
    },
    { allowed: true, hidden: true, message: '' },
  ])(
    'renders the Incognito access warning when allowed is $allowed',
    async ({ allowed, hidden, message }) => {
      const environment = createOptionsEnvironment();
      environment.chrome.extension.isAllowedIncognitoAccess.mockResolvedValue(
        allowed,
      );

      await loadOptions(environment);

      await vi.waitFor(() =>
        expect(environment.elements['#incognito-warning'].hidden).toBe(hidden),
      );
      expect(environment.elements['#incognito-warning'].textContent).toBe(
        message,
      );
    },
  );

  it('imports contacts, previews them, and saves them with the template', async () => {
    const environment = createOptionsEnvironment({ contacts: [] });
    await loadOptions(environment);
    environment.elements['#contactMessageTemplate'].value = 'Hello {name}';
    environment.elements['#contacts-csv'].value =
      'name,phone\nAda,+14155552671\nGrace,+14155552672';
    environment.elements['#import-contacts'].listeners.click();

    const preview =
      environment.elements['#contact-previews'].append.mock.calls.at(-1)[0];
    expect(preview.textContent).toBe('Grace: Hello Grace');
    await environment.elements['#settings-form'].listeners.submit({
      preventDefault: vi.fn(),
    });
    expect(environment.stored.contacts).toEqual([
      { name: 'Ada', phone: '+14155552671' },
      { name: 'Grace', phone: '+14155552672' },
    ]);
    expect(environment.stored.contactMessageTemplate).toBe('Hello {name}');

    environment.elements['#contacts-csv'].value = 'Bad,123';
    environment.elements['#import-contacts'].listeners.click();
    expect(environment.elements['#contacts-error'].textContent).toContain(
      'E.164',
    );
    expect(environment.elements['#contacts-csv'].value).toBe('Bad,123');
  });

  it('shows storage failures from save actions', async () => {
    const environment = createOptionsEnvironment();
    await loadOptions(environment);
    const storageError = new Error('Extension context invalidated');

    environment.chrome.storage.local.set.mockRejectedValueOnce(storageError);
    await environment.elements['#settings-form'].listeners.submit({
      preventDefault: vi.fn(),
    });

    expect(environment.elements['#status'].textContent).toBe(
      'Could not save settings: Extension context invalidated',
    );
    expect(environment.elements['#status'].className).toBe('error');
  });

  it('keeps a live error visible until a successful send clears it', async () => {
    const environment = createOptionsEnvironment();
    await loadOptions(environment);

    environment.storageListener(
      { lastSendError: { newValue: 'Forbidden', oldValue: undefined } },
      'local',
    );

    expect(environment.elements['#send-status'].textContent).toBe('Forbidden');
    expect(environment.elements['#send-status'].className).toBe('error');

    environment.storageListener(
      { lastSendError: { newValue: undefined, oldValue: 'Forbidden' } },
      'local',
    );

    expect(environment.elements['#send-status'].textContent).toBe('');
    expect(environment.elements['#send-status'].className).toBe('');
  });

  it('does not overwrite a newer error state while loading', async () => {
    const environment = createOptionsEnvironment({
      lastSendError: 'Old error',
    });
    const errorRead = deferred();
    let errorReadStarted = false;
    environment.chrome.storage.local.get.mockImplementation((keys) => {
      if (keys !== 'lastSendError')
        return Promise.resolve(environment.readStorage(keys));
      errorReadStarted = true;
      const capturedError = environment.readStorage(keys);
      return errorRead.promise.then(() => capturedError);
    });
    vi.stubGlobal('chrome', environment.chrome);
    vi.stubGlobal('document', environment.document);

    await import('../src/options.js');
    await vi.waitFor(() => expect(errorReadStarted).toBe(true));
    delete environment.stored.lastSendError;
    environment.storageListener(
      { lastSendError: { newValue: undefined, oldValue: 'Old error' } },
      'local',
    );
    errorRead.resolve();

    await vi.waitFor(() =>
      expect(
        environment.chrome.extension.isAllowedIncognitoAccess,
      ).toHaveBeenCalledOnce(),
    );
    expect(environment.elements['#send-status'].textContent).toBe('');
    expect(environment.elements['#send-status'].className).toBe('');
  });

  it('shows grace period notice and allows ending it', async () => {
    const environment = createOptionsEnvironment({
      gracePeriodUntil: Date.now() + 86400000,
    });
    environment.chrome.runtime.sendMessage = vi.fn(async () => ({ ok: true }));

    await loadOptions(environment);

    expect(environment.elements['#grace-period-notice'].hidden).toBe(false);
    expect(environment.elements['#grace-status'].textContent).toContain(
      'Browsing rules are paused',
    );

    await environment.elements['#end-grace-period'].listeners.click();
    expect(environment.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'end-grace-period',
    });
  });
});
