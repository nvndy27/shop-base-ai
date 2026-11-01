import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../../frontend/src/auth/api.js';
import {
  EMPTY_THREAD, chatRequests, newClientMessageId, pendingKey,
  threadAppended, threadFailed, threadLoading, threadPage,
} from '../../frontend/src/commerce/chat.js';

const session = { access_token: 'test-access-token', user: { id: 'user-a' } };
function sdk() {
  return { auth: {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  } };
}
function recording() {
  const calls = [];
  const api = vi.fn(async (path, options) => { calls.push([path, options]); return { ok: true }; });
  return { api, calls };
}

describe('chat paths survive the bearer API path guard', () => {
  it('sends the paged thread path together with its query string', async () => {
    const fetcher = vi.fn(async () => Response.json({ items: [], has_more: false }));
    const request = createApi(sdk(), fetcher);
    const path = '/api/v1/chat/conversations/6f1c0f0e-1111-2222-3333-444455556666?limit=30&before_seq=42';
    await request(path);
    expect(fetcher.mock.calls[0][0]).toBe(path);
  });

  it('still rejects a fragment, a space, an encoded bracket or an absolute URL', async () => {
    const fetcher = vi.fn();
    const request = createApi(sdk(), fetcher);
    for (const path of [
      '/api/v1/chat/conversations/a?limit=30#frag',
      '/api/v1/chat/conversations/a?limit=30 1',
      '/api/v1/chat/conversations/a?q=<script>',
      '/api/v1/chat/conversations/a?q="x"',
      'https://evil.test/api/v1/chat/conversations',
    ]) {
      await expect(request(path)).rejects.toThrow('Endpoint không hợp lệ');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('chat request builders', () => {
  it('addresses every operation under /api/v1/chat with the documented method and body', async () => {
    const { api, calls } = recording();
    const requests = chatRequests(api);
    const signal = new AbortController().signal;

    await requests.list(signal);
    await requests.open('shop-a');
    await requests.thread('conv-a');
    await requests.thread('conv-a', 42);
    await requests.thread('conv-a', undefined, { limit: 5 });
    await requests.send('conv-a', 'Xin chào', 'key-a');
    await requests.read('conv-a', 7);

    expect(calls).toEqual([
      ['/api/v1/chat/conversations', { signal }],
      ['/api/v1/chat/conversations', { method: 'POST', body: { shop_id: 'shop-a' } }],
      ['/api/v1/chat/conversations/conv-a?limit=30', {}],
      ['/api/v1/chat/conversations/conv-a?limit=30&before_seq=42', {}],
      ['/api/v1/chat/conversations/conv-a?limit=5', {}],
      ['/api/v1/chat/conversations/conv-a/messages', { method: 'POST', body: { body: 'Xin chào', client_message_id: 'key-a' } }],
      ['/api/v1/chat/conversations/conv-a/read', { method: 'POST', body: { up_to_seq: 7 } }],
    ]);
  });

  it('omits before_seq entirely for the newest page', async () => {
    const { api, calls } = recording();
    await chatRequests(api).thread('conv-a', undefined);
    expect(calls[0][0]).not.toContain('before_seq');
  });

  it('forwards an abort signal so a superseded page can be cancelled', async () => {
    const { api, calls } = recording();
    const controller = new AbortController();
    await chatRequests(api).thread('conv-a', undefined, { signal: controller.signal });
    expect(calls[0][1]).toEqual({ signal: controller.signal });
  });
});

describe('thread state transitions', () => {
  const loaded = { loading: false, hasMore: true, error: '', items: [{ id: 'm1', sequence: 1 }, { id: 'm2', sequence: 2 }] };

  it('clears the previous conversation when a new one is opened', () => {
    const next = threadLoading(loaded, undefined);
    expect(next.items).toEqual([]);
    expect(next.hasMore).toBe(false);
    expect(next.loading).toBe(true);
    expect(loaded.items).toHaveLength(2);
  });

  it('keeps the visible messages while paging older ones', () => {
    const next = threadLoading(loaded, 1);
    expect(next.items).toEqual(loaded.items);
    expect(next.loading).toBe(true);
  });

  it('replaces on the first page and prepends when paging, never mixing two threads', () => {
    const first = threadPage(loaded, { items: [{ id: 'n1', sequence: 9 }], has_more: true }, undefined);
    expect(first.items.map((m) => m.id)).toEqual(['n1']);

    const older = threadPage(first, { items: [{ id: 'o1', sequence: 8 }], has_more: false }, 9);
    expect(older.items.map((m) => m.id)).toEqual(['o1', 'n1']);
    expect(older.hasMore).toBe(false);
    expect(older.loading).toBe(false);
  });

  it('clears a previous error once a page arrives', () => {
    expect(threadPage({ ...loaded, error: 'lỗi cũ' }, { items: [], has_more: false }, undefined).error).toBe('');
  });

  it('keeps loaded messages when a request fails and appends a sent message', () => {
    const failed = threadFailed(loaded, 'Mất kết nối');
    expect(failed.items).toEqual(loaded.items);
    expect(failed.error).toBe('Mất kết nối');
    expect(failed.loading).toBe(false);

    const appended = threadAppended(loaded, { id: 'm3', sequence: 3 });
    expect(appended.items.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(loaded.items).toHaveLength(2);
  });

  it('does not render a message twice when its send result arrives after a reload', () => {
    // A -> B -> A while the send is in flight: the reload already carries the row the send
    // response returns, and appending it again used to duplicate the bubble and React's key.
    const sent = { id: 'srv-1', sequence: 3, body: 'Còn hàng không?' };
    const afterReload = threadPage(loaded, { items: [loaded.items[0], loaded.items[1], sent], has_more: false }, undefined);
    const appended = threadAppended(afterReload, sent);

    expect(appended.items.map((m) => m.id)).toEqual(['m1', 'm2', 'srv-1']);
    expect(appended).toBe(afterReload);
  });

  it('does not duplicate a message when a paged page repeats a shown row', () => {
    // Guard rather than an observed case: the server pages by `seq < before_seq`, so a page
    // should not overlap what is shown. Merging by id keeps that assumption from being load-bearing.
    const older = threadPage(loaded, { items: [{ id: 'm0', sequence: 0 }, loaded.items[0]], has_more: false }, 1);
    expect(older.items.map((m) => m.id)).toEqual(['m0', 'm1', 'm2']);
  });

  it('exposes an empty thread constant that callers can reset to', () => {
    expect(EMPTY_THREAD).toEqual({ loading: false, items: [], hasMore: false, error: '' });
  });
});

describe('idempotent send key', () => {
  it('reuses the key only while retrying the exact same text', () => {
    expect(pendingKey({ body: '', key: '' }, 'Còn hàng không?')).toBeTruthy();
    const key = newClientMessageId();
    expect(pendingKey({ body: 'Còn hàng không?', key }, 'Còn hàng không?')).toBe(key);
    expect(pendingKey({ body: 'Còn hàng không?', key }, 'Giá bao nhiêu?')).not.toBe(key);
  });

  it('mints a distinct key each time', () => {
    expect(newClientMessageId()).not.toBe(newClientMessageId());
  });
});
