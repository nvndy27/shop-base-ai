export const LANGUAGE_KEY = 'shopbase-language';
const normalize = value => value === 'en' ? 'en' : 'vi';

export function createLanguageStore(browser) {
  let language = 'vi';
  const listeners = new Set();
  try { language = normalize(browser.localStorage.getItem(LANGUAGE_KEY)); } catch { /* Storage may be blocked. */ }
  const update = value => {
    language = normalize(value);
    browser.document.documentElement.lang = language;
    listeners.forEach(listener => listener());
  };
  update(language);
  browser.addEventListener('storage', event => {
    if (event.key === LANGUAGE_KEY || event.key === null) {
      try { if (event.storageArea === browser.localStorage) update(event.newValue); } catch { /* Keep this visit's choice. */ }
    }
  });
  return {
    getSnapshot: () => language,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setLanguage(value) {
      update(value);
      try { browser.localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Still switch for this visit. */ }
    },
  };
}
export const languageStore = typeof window === 'undefined' ? null : createLanguageStore(window);
