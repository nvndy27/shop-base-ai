// SDK-owned storage. Browser storage is JavaScript-readable, NOT HttpOnly.
export function tabStorage(storage) {
  return {
    getItem(key) { return storage.getItem(key); },
    setItem(key, value) { storage.setItem(key, value); },
    removeItem(key) { storage.removeItem(key); },
  };
}

export function deviceStorage(storage, legacyStorage, storageKey) {
  const migratedKey = `${storageKey}-device-storage-migrated`;
  const migrated = storage.getItem(migratedKey) === '1';
  // Move only this project's SDK keys. Never scan or copy unrelated browser data.
  for (const key of [storageKey, `${storageKey}-code-verifier`, `${storageKey}-user`]) {
    if (!migrated && storage.getItem(key) === null) {
      const previous = legacyStorage.getItem(key);
      if (previous !== null) storage.setItem(key, previous);
    }
    legacyStorage.removeItem(key);
  }
  // Prevent another old tab from restoring its stale session after logout.
  storage.setItem(migratedKey, '1');
  return tabStorage(storage);
}
