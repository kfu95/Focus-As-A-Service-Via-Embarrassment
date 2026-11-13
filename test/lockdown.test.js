import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('redirects violating tabs but preserves allowed tabs when the helper is missing', async () => {
  const stored = {
    allowList: 'allowed.example',
    contacts: [
      { name: 'Ada', phone: '+14155552671' },
      { name: 'Grace', phone: '+14155552672' },
    ],
  };
  const event = { addListener: vi.fn() };
  const tabs = [
    { id: 1, url: 'https://blocked.example' },
    { id: 2, url: 'https://allowed.example' },
  ];
  const update = vi.fn(async () => {});
  vi.stubGlobal('chrome', {
    tabs: {
      query: async () => tabs,
      update,
      onCreated: event,
      onUpdated: event,
      onRemoved: event,
      onReplaced: event,
    },
    storage: {
      local: {
        get: async (keys) =>
          typeof keys === 'string'
            ? { [keys]: stored[keys] }
            : { ...keys, ...stored },
        set: async (v) => Object.assign(stored, v),
        remove: async () => {},
      },
      onChanged: event,
    },
    runtime: {
      id: 'test',
      getURL: (p) => `chrome-extension://test/${p}`,
      onInstalled: event,
      onStartup: event,
      onMessage: event,
      connectNative: () => {
        throw new Error('Specified native messaging host not found.');
      },
    },
    alarms: { create: async () => {}, onAlarm: event },
    action: { onClicked: event },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Network sends forbidden');
    }),
  );
  const { checkOpenTabs } = await import('../src/background.js');
  await checkOpenTabs();
  expect(update).toHaveBeenCalledWith(1, {
    url: 'chrome-extension://test/src/jail.html',
  });
  expect(update).not.toHaveBeenCalledWith(2, expect.anything());
  expect(stored.lockdown).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
