const storageKey = 'shopbase-auth-cooldown-until';

export function createAuthCooldown(storage, now = Date.now) {
  let until = 0;
  const read = () => {
    try {
      const value = Number(storage?.getItem(storageKey));
      if (Number.isFinite(value) && value > 0 && value <= now() + 60000) until = Math.max(until, value);
    } catch { /* An in-memory cooldown still works when storage is unavailable. */ }
    return Math.max(0, Math.ceil((until - now()) / 1000));
  };
  return {
    remaining: read,
    start(seconds) {
      read();
      until = Math.max(until, now() + Math.min(60, Math.max(0, seconds)) * 1000);
      try { storage?.setItem(storageKey, String(until)); } catch { /* Optional persistence. */ }
      return read();
    },
  };
}
