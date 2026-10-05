import translations from './ui.json';
import { useSyncExternalStore } from 'react';
import { languageStore } from './store';
export function useLanguage() {
  const language = useSyncExternalStore(languageStore.subscribe, languageStore.getSnapshot);
  return [language, languageStore.setLanguage];
}

export function useText() {
  const [language] = useLanguage();
  return value => language === 'en' ? translations[value] || value : value;
}
