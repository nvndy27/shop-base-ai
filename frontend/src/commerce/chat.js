// Chat data layer: request builders plus pure thread-state transitions.
// Kept free of React so loading/switching/paging can be tested without a DOM.

export const EMPTY_THREAD = { loading: false, items: [], hasMore: false, error: '' };

export const newClientMessageId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// Builders are pure: `api` is the only injected dependency, so the same module serves the
// app (commerceApi) and the tests (a fake that records calls).
export function chatRequests(api) {
  return {
    list: (signal) => api('/api/v1/chat/conversations', signal ? { signal } : {}),
    open: (shopId) => api('/api/v1/chat/conversations', { method: 'POST', body: { shop_id: shopId } }),
    // `signal` lets the caller cancel a page that is no longer wanted, e.g. after switching
    // conversation; the caller must still ignore a response that arrives after the switch.
    thread: (id, before, { limit = 30, signal } = {}) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (before) query.set('before_seq', String(before));
      return api(`/api/v1/chat/conversations/${id}?${query}`, signal ? { signal } : {});
    },
    send: (id, body, clientMessageId) =>
      api(`/api/v1/chat/conversations/${id}/messages`, { method: 'POST', body: { body, client_message_id: clientMessageId } }),
    read: (id, upToSeq) =>
      api(`/api/v1/chat/conversations/${id}/read`, { method: 'POST', body: { up_to_seq: upToSeq } }),
  };
}

// Starting a load: the first page replaces the thread, paging older keeps what is shown.
export function threadLoading(thread, before) {
  return before ? { ...thread, loading: true, error: '' } : { ...EMPTY_THREAD, loading: true };
}

// The same server row can reach the UI twice: a send result and a thread reload overlap when the
// user leaves a conversation and comes back before the send resolves (A -> B -> A), and a paged
// response can overlap the page already shown. Merge by id — the field React keys on — so a
// message is never rendered twice. Returns the original array when nothing was added, which keeps
// state updates free of needless re-renders.
function mergeUnique(base, extra, prepend) {
  const seen = new Set(base.map((message) => message.id));
  const fresh = [];
  for (const message of extra) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    fresh.push(message);
  }
  if (fresh.length === 0) return base;
  return prepend ? [...fresh, ...base] : [...base, ...fresh];
}

// `before` pages prepend; the initial page replaces, so switching never mixes two threads.
export function threadPage(thread, page, before) {
  return {
    loading: false,
    hasMore: Boolean(page.has_more),
    error: '',
    items: before ? mergeUnique(thread.items, page.items, true) : page.items,
  };
}

export function threadFailed(thread, message) {
  return { ...thread, loading: false, error: message };
}

export function threadAppended(thread, message) {
  const items = mergeUnique(thread.items, [message], false);
  return items === thread.items ? thread : { ...thread, items };
}

// Reuse the key when retrying the exact same text, so a lost response cannot duplicate a message.
export function pendingKey(pending, body) {
  return pending.body === body && pending.key ? pending.key : newClientMessageId();
}
