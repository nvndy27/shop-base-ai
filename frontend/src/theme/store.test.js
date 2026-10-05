import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThemeStore, THEME_KEY } from './store.js';

function browserFixture(saved, blocked = false) {
  const events = {};
  const values = new Map([[THEME_KEY, saved]]);
  const media = { matches: false, addEventListener: (_, handler) => { events.media = handler; } };
  const browser = {
    document: { documentElement: { dataset: {} } },
    matchMedia: () => media,
    localStorage: {
      getItem: key => { if (blocked) throw new Error('Blocked'); return values.get(key); },
      setItem: (key, value) => { if (blocked) throw new Error('Blocked'); values.set(key, value); },
    },
    addEventListener: (name, handler) => { events[name] = handler; },
  };
  return { browser, media, events, values };
}

test('system changes follow the device, while an explicit choice survives device changes and reload', () => {
  const { browser, media, events } = browserFixture('system');
  const store = createThemeStore(browser);
  media.matches = true;
  events.media();
  assert.equal(browser.document.documentElement.dataset.theme, 'dark');
  store.setPreference('light');
  events.media();
  assert.equal(browser.document.documentElement.dataset.theme, 'light');
  assert.equal(createThemeStore(browser).getSnapshot(), 'light');
});

test('invalid or unavailable storage falls back safely and manual switching still works', () => {
  for (const fixture of [browserFixture('invalid'), browserFixture('dark', true)]) {
    const store = createThemeStore(fixture.browser);
    assert.equal(store.getSnapshot(), 'system');
    assert.doesNotThrow(() => store.setPreference('dark'));
    assert.equal(fixture.browser.document.documentElement.dataset.theme, 'dark');
  }
});

test('another tab updates the choice; unrelated storage and unsubscribed observers stay isolated', () => {
  const { browser, events } = browserFixture('light');
  const store = createThemeStore(browser);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  events.storage({ key: 'unrelated', newValue: 'dark', storageArea: browser.localStorage });
  assert.equal(notifications, 0);
  events.storage({ key: THEME_KEY, newValue: 'dark', storageArea: browser.localStorage });
  assert.equal(store.getSnapshot(), 'dark');
  assert.equal(notifications, 1);
  unsubscribe();
  events.storage({ key: null, newValue: null, storageArea: browser.localStorage });
  assert.equal(store.getSnapshot(), 'system');
  assert.equal(notifications, 1);
});
