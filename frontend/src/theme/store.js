export const THEME_KEY = 'shopbase-theme';
const normalize = value => ['light', 'dark', 'system'].includes(value) ? value : 'system';

export function createThemeStore(browser) {
  let preference = 'system';
  const listeners = new Set();
  const media = browser.matchMedia('(prefers-color-scheme: dark)');
  try { preference = normalize(browser.localStorage.getItem(THEME_KEY)); } catch { /* Storage may be unavailable. */ }
  const apply = () => {
    browser.document.documentElement.dataset.theme = preference === 'system'
      ? (media.matches ? 'dark' : 'light') : preference;
  };
  const update = value => {
    preference = normalize(value);
    apply();
    listeners.forEach(listener => listener());
  };
  apply();
  media.addEventListener('change', apply);
  browser.addEventListener('storage', event => {
    if (event.key === THEME_KEY || event.key === null) {
      try {
        if (event.storageArea === browser.localStorage) update(event.newValue);
      } catch { /* Keep the current choice when storage is blocked. */ }
    }
  });
  return {
    getSnapshot: () => preference,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPreference(value) {
      update(value);
      try { browser.localStorage.setItem(THEME_KEY, preference); } catch { /* Still apply for this visit. */ }
    },
  };
}

export const themeStore = typeof window === 'undefined' ? null : createThemeStore(window);
