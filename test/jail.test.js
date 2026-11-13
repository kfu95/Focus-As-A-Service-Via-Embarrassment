import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createElement(value = '') {
  const listeners = {};
  return {
    append: vi.fn(),
    replaceChildren: vi.fn(),
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: vi.fn((type, listener) => {
      listeners[type] = listener;
    }),
    className: '',
    hidden: false,
    open: false,
    showModal: vi.fn(),
    close: vi.fn(),
    listeners,
    textContent: '',
    value,
  };
}

function createJailEnvironment(overrides = {}) {
  const stored = {
    lockdown: { id: 'episode-1' },
    lastSendError: '',
    gracePeriodUntil: 0,
    ...overrides,
  };
  const elements = {
    '#heading': createElement(),
    '#explanation': createElement(),
    '#delivery': createElement(),
    '#helper-status': createElement(),
    '#retry': createElement(),
    '#grace-period-banner': createElement(),
    '#grace-period-text': createElement(),
    '#end-grace-period': createElement(),
    '#result': createElement(),
    '#bottom-helper-text': createElement(),
    '#alert-popup': createElement(),
    '#popup-title': createElement(),
    '#popup-body': createElement(),
    '#popup-ok-btn': createElement(),
  };
  let storageListener;
  const chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg) => {
        if (msg.type === 'helper-status') return { ok: true };
        return { ok: true };
      }),
    },
    storage: {
      local: {
        get: vi.fn(async (keys) => {
          if (typeof keys === 'string') return { [keys]: stored[keys] };
          return Object.fromEntries(
            Object.entries(keys).map(([k, fallback]) => [
              k,
              stored[k] ?? fallback,
            ]),
          );
        }),
        set: vi.fn(async (vals) => Object.assign(stored, vals)),
      },
      onChanged: {
        addListener: vi.fn((listener) => {
          storageListener = listener;
        }),
      },
    },
  };
  const document = {
    querySelector: vi.fn((selector) => elements[selector]),
  };
  return {
    chrome,
    document,
    elements,
    stored,
    get storageListener() {
      return storageListener;
    },
  };
}

describe('jail lockdown page', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('renders sending state with popup and keeps bottom text while sending', async () => {
    const env = createJailEnvironment({
      lockdown: { id: 'test-lock' },
    });
    vi.stubGlobal('chrome', env.chrome);
    vi.stubGlobal('document', env.document);

    await import('../src/jail.js');

    await vi.waitFor(() => {
      expect(env.elements['#heading'].textContent).toBe(
        'Your browsing is locked.',
      );
    });
    expect(env.elements['#bottom-helper-text'].hidden).toBe(false);
    expect(env.elements['#alert-popup'].showModal).toHaveBeenCalledOnce();
    expect(env.elements['#popup-title'].textContent).toBe('Alert sending');
    expect(env.elements['#popup-body'].textContent).toContain(
      'group alert is sending in the background',
    );
  });

  it('renders consoling sent message and removes bottom text once sent', async () => {
    const env = createJailEnvironment({
      lockdown: null,
      gracePeriodUntil: Date.now() + 86400000,
    });
    vi.stubGlobal('chrome', env.chrome);
    vi.stubGlobal('document', env.document);

    await import('../src/jail.js');

    await vi.waitFor(() => {
      expect(env.elements['#heading'].textContent).toBe(
        "So you messed up, and it's been sent. Good luck.",
      );
    });
    expect(env.elements['#bottom-helper-text'].hidden).toBe(true);
    expect(env.elements['#retry'].hidden).toBe(true);
    expect(env.elements['#alert-popup'].showModal).toHaveBeenCalledOnce();
    expect(env.elements['#popup-title'].textContent).toBe('Alert sent');
    expect(env.elements['#popup-body'].textContent).toBe(
      "So you messed up, and it's been sent. Good luck.",
    );

    // Clicking OK closes the popup
    env.elements['#popup-ok-btn'].listeners.click();
    expect(env.elements['#alert-popup'].close).toHaveBeenCalled();
  });
});
