import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function environment() {
  const stored = {
    allowList: 'allowed.example',
    contacts: [
      { name: 'Ada Lovelace', phone: '+14155552671' },
      { name: 'Grace Hopper', phone: '+14155552672' },
    ],
  };
  let tabs = [
    { id: 1, url: 'https://blocked.example' },
    { id: 2, url: 'https://allowed.example' },
  ];
  const listeners = {};
  const event = (name) => ({
    addListener: (fn) => {
      listeners[name] = fn;
    },
  });
  const chrome = {
    runtime: {
      id: 'test',
      getURL: (p) => `chrome-extension://test/${p}`,
      onMessage: event('message'),
      onInstalled: event('installed'),
      onStartup: event('startup'),
      openOptionsPage: vi.fn(async () => {}),
      sendNativeMessage: vi.fn(async (_host, request) => {
        if (request.type !== 'send-group') return { version: 1, ok: true };
        const { episode } = request;
        return {
          version: 1,
          ok: true,
          episodeId: episode.id,
          chatId: 'group',
          groupVerified: true,
          participants: episode.recipients.map((c) => c.phone),
          results: episode.recipients.map((c) => ({
            phone: c.phone,
            ok: true,
          })),
        };
      }),
    },
    tabs: {
      query: vi.fn(async () => tabs),
      update: vi.fn(async (id, change) => {
        tabs = tabs.map((t) => (t.id === id ? { ...t, ...change } : t));
      }),
      onCreated: event('created'),
      onUpdated: event('updated'),
      onRemoved: event('removed'),
      onReplaced: event('replaced'),
    },
    alarms: { create: vi.fn(async () => {}), onAlarm: event('alarm') },
    action: {
      onClicked: event('clicked'),
      setIcon: vi.fn(async () => {}),
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
    storage: {
      local: {
        get: vi.fn(async (keys) =>
          typeof keys === 'string'
            ? { [keys]: stored[keys] }
            : { ...keys, ...stored },
        ),
        set: vi.fn(async (value) => Object.assign(stored, value)),
      },
      onChanged: event('storage'),
    },
  };
  chrome.runtime.connectNative = () => {
    let onMessage, onDisconnect;
    return {
      onMessage: {
        addListener: (fn) => {
          onMessage = fn;
        },
      },
      onDisconnect: {
        addListener: (fn) => {
          onDisconnect = fn;
        },
      },
      disconnect: () => {},
      postMessage: (request) => {
        chrome.runtime
          .sendNativeMessage('com.digitaljail.helper', request)
          .then(onMessage)
          .catch((error) => {
            chrome.runtime.lastError = error;
            onDisconnect();
            delete chrome.runtime.lastError;
          });
      },
    };
  };
  return {
    stored,
    chrome,
    listeners,
    setTabs: (next) => {
      tabs = next;
    },
    message: (msg) =>
      new Promise((resolve) =>
        listeners.message(
          typeof msg === 'string' ? { type: msg } : msg,
          { id: 'test', url: 'chrome-extension://test/src/options.html' },
          resolve,
        ),
      ),
  };
}
async function load(env) {
  vi.stubGlobal('chrome', env.chrome);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Real sends forbidden');
    }),
  );
  return import('../src/background.js');
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('persistent Messages lockdown', () => {
  it('confines violating tabs before sending, and renders first names', async () => {
    const env = environment();
    const { checkOpenTabs } = await load(env);
    env.chrome.runtime.sendNativeMessage.mockImplementation(
      async (_host, request) => {
        expect(env.stored.lockdown.id).toBe(request.episode.id);
        expect(env.chrome.tabs.update).toHaveBeenCalledTimes(1);
        expect(env.chrome.tabs.update).toHaveBeenCalledWith(1, {
          url: 'chrome-extension://test/src/jail.html',
        });
        expect(request.episode.recipients.map((c) => c.message)).toEqual([
          'Hi Ada, I miss you',
          'Hi Grace, I miss you',
        ]);
        throw new Error('Helper missing');
      },
    );
    await checkOpenTabs();
    await flush();
    expect(env.stored.lockdown).toBeTruthy();
    expect(env.stored.lastSendError).toContain('Helper missing');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps new violating tabs locked while the send waits, and preserves allowed tabs', async () => {
    const env = environment();
    let finish;
    env.chrome.runtime.sendNativeMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { checkOpenTabs } = await load(env);
    await checkOpenTabs();
    await flush();
    env.chrome.tabs.update.mockClear();
    env.setTabs([{ id: 3, url: 'https://allowed.example' }]);
    await env.listeners.created();
    expect(env.chrome.tabs.update).not.toHaveBeenCalled();
    env.setTabs([{ id: 4, url: 'https://blocked.example' }]);
    await env.listeners.created();
    expect(env.chrome.tabs.update).toHaveBeenCalledWith(4, {
      url: 'chrome-extension://test/src/jail.html',
    });
    finish({ version: 1, ok: false, error: 'Denied' });
    await flush();
    expect(env.stored.lockdown).toBeTruthy();
  });
  it('unlocks only after every result and exact membership are confirmed', async () => {
    const env = environment();
    const { checkOpenTabs } = await load(env);
    await checkOpenTabs();
    await flush();
    expect(env.stored.lockdown).toBeNull();
    expect(env.stored.gracePeriodUntil).toBeGreaterThan(Date.now());
    await checkOpenTabs();
    expect(env.chrome.runtime.sendNativeMessage).toHaveBeenCalledOnce();
    env.setTabs([{ id: 3, url: 'https://blocked.example' }]);
    await env.listeners.created();
    await flush();
    expect(env.chrome.runtime.sendNativeMessage).toHaveBeenCalledOnce();
    expect(await env.message('end-grace-period')).toEqual({ ok: true });
    expect(env.stored.gracePeriodUntil).toBe(0);
    await flush();
    expect(env.chrome.runtime.sendNativeMessage).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ok: true },
    { groupVerified: false },
    { participants: ['+14155552671'] },
    { participants: ['+14155552671', '+14155552672', '+14155552673'] },
    {
      results: [
        { phone: '+14155552671', ok: true },
        { phone: '+14155552672', ok: false },
      ],
    },
    { episodeId: 'wrong' },
  ])('rejects unproven success %j', async (override) => {
    const env = environment();
    const original =
      env.chrome.runtime.sendNativeMessage.getMockImplementation();
    env.chrome.runtime.sendNativeMessage.mockImplementation(async (...args) =>
      override.ok
        ? { version: 1, ok: true }
        : { ...(await original(...args)), ...override },
    );
    const { checkOpenTabs } = await load(env);
    await checkOpenTabs();
    await flush();
    expect(env.stored.lockdown).toBeTruthy();
    expect(env.stored.lastSendError).toContain('verified');
  });
  it('persists through worker restarts and rule changes; retry uses the frozen recipients', async () => {
    const env = environment();
    const original =
      env.chrome.runtime.sendNativeMessage.getMockImplementation();
    env.chrome.runtime.sendNativeMessage.mockRejectedValue(
      new Error('Missing'),
    );
    const first = await load(env);
    await first.checkOpenTabs();
    await flush();
    env.stored.contacts = [];
    env.stored.allowList = '';
    env.stored.blockList = 'blocked.example';
    vi.resetModules();
    const second = await load(env);
    env.chrome.tabs.update.mockClear();
    env.setTabs([{ id: 4, url: 'https://blocked.example' }]);
    await second.checkOpenTabs();
    expect(env.chrome.tabs.update).toHaveBeenCalledWith(4, {
      url: 'chrome-extension://test/src/jail.html',
    });
    env.chrome.runtime.sendNativeMessage.mockImplementation(original);
    expect(await env.message('retry-alert')).toEqual({ ok: true });
    expect(
      env.chrome.runtime.sendNativeMessage.mock.calls.at(-1)[1].episode
        .recipients,
    ).toHaveLength(2);
  });
  it('does not let a legacy notice preference disable jail', async () => {
    const env = environment();
    env.stored.helperNoticeAccepted = false;
    const { checkOpenTabs } = await load(env);
    await checkOpenTabs();
    await flush();
    expect(env.chrome.tabs.update).toHaveBeenCalled();
    expect(env.chrome.runtime.sendNativeMessage).toHaveBeenCalledOnce();
  });
  it('rejects oversized alerts before freezing and rebuilds them on retry', async () => {
    const env = environment();
    env.stored.contactMessageTemplate = 'Hello';
    env.stored.contacts[0].name = 'A'.repeat(1_000_000);
    const { checkOpenTabs } = await load(env);
    await checkOpenTabs();
    expect(env.stored.lockdown.setupError).toContain('1 MB');
    expect(env.stored.lockdown.recipients).toEqual([]);
    expect(env.chrome.runtime.sendNativeMessage).not.toHaveBeenCalled();
    env.stored.contacts[0].name = 'Ada';
    expect(await env.message('retry-alert')).toEqual({ ok: true });
    expect(env.stored.lockdown).toBeNull();
    expect(env.chrome.runtime.sendNativeMessage).toHaveBeenCalledOnce();
  });
  it('rebuilds legacy oversized frozen alerts before retrying', async () => {
    const env = environment();
    env.stored.lockdown = {
      id: crypto.randomUUID(),
      recipients: [
        {
          name: 'A'.repeat(1_000_000),
          phone: '+14155552671',
          message: 'Hello',
        },
      ],
      setupError: '',
    };
    await load(env);
    expect(await env.message('retry-alert')).toEqual({ ok: true });
    expect(env.stored.lockdown).toBeNull();
    expect(
      env.chrome.runtime.sendNativeMessage.mock.calls[0][1].episode.recipients,
    ).toHaveLength(2);
  });
  it('refuses requests from web content', async () => {
    const env = environment();
    await load(env);
    expect(
      env.listeners.message(
        { type: 'helper-status' },
        { id: 'test', url: 'https://evil.example' },
        vi.fn(),
      ),
    ).toBeUndefined();
    expect(env.chrome.runtime.sendNativeMessage).not.toHaveBeenCalled();
  });
  it('handles send-test-alert message and updates icon state', async () => {
    const env = environment();
    const { updateIconState } = await load(env);
    expect(
      await env.message({
        type: 'send-test-alert',
        phone: '+14155551234',
        message: 'Test text',
      }),
    ).toEqual({
      version: 1,
      ok: true,
    });
    expect(env.chrome.runtime.sendNativeMessage).toHaveBeenCalledWith(
      'com.digitaljail.helper',
      expect.objectContaining({
        type: 'send-test',
        phone: '+14155551234',
        message: 'Test text',
      }),
    );

    // Test icon update when configured
    env.stored.blockList = 'blocked.example';
    env.stored.contacts = [
      { name: 'Ada', phone: '+14155552671' },
      { name: 'Grace', phone: '+14155552672' },
    ];
    await updateIconState();
    expect(env.chrome.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({
          16: 'icons/icon-16-active.png',
        }),
      }),
    );
    expect(env.chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'ON' });
    expect(env.chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#dc2626',
    });
  });
});
