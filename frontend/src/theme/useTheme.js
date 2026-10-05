import { useSyncExternalStore } from 'react';
import { themeStore } from './store';

export function useTheme() {
  const preference = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot);
  return [preference, themeStore.setPreference];
}
