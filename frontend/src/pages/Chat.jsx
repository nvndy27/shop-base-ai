import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { commerceApi, useCommerceResource } from '../commerce/api';
import { EMPTY_THREAD, chatRequests, pendingKey, threadAppended, threadFailed, threadLoading, threadPage } from '../commerce/chat';
import { subscribeChatChanges } from '../commerce/realtime';
import { client } from '../auth/client';
import { useAuth } from '../auth/context';
import ResourceStatus from '../commerce/ResourceStatus';
import './Chat.css';
import '../commerce/Commerce.css';

const formatTime = (value) => (value ? new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

export default function Chat() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const shop = params.get('shop');
  const list = useCommerceResource('/api/v1/chat/conversations');
  const { reload } = list;
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState(EMPTY_THREAD);
  // Drafts, pending retry keys and send state are keyed by conversation: work done for one
  // thread must never read or write another thread's UI state.
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [openError, setOpenError] = useState('');
  const [sendError, setSendError] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState('disabled');
  const openedRef = useRef('');
  const pendingRef = useRef({});
  // Every async result is checked against these before it may touch state: `aliveRef` for
  // unmount, `loadTokenRef` so only the newest load wins, `activeIdRef` for the open thread.
  const aliveRef = useRef(true);
  const activeIdRef = useRef(null);
  const loadTokenRef = useRef(0);
  const loadAbortRef = useRef(null);
  // commerceApi is a module constant, so this object is stable across renders.
  const requests = useMemo(() => chatRequests(commerceApi), []);

  // The single place that changes the open conversation: it invalidates and aborts whatever
  // was in flight for the previous one, synchronously, before React re-renders.
  const select = useCallback((id) => {
    activeIdRef.current = id;
    loadTokenRef.current += 1;
    loadAbortRef.current?.abort();
    setActiveId(id);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      activeIdRef.current = null;
      loadTokenRef.current += 1;
      loadAbortRef.current?.abort();
    };
  }, []);

  const markRead = useCallback(async (id, upToSeq) => {
    try {
      await requests.read(id, upToSeq);
      reload();
    } catch { /* a stale read cursor must never block the thread */ }
  }, [requests, reload]);

  // Stable: depends only on stable values, so the thread effect below cannot re-fire per render.
  const loadThread = useCallback(async (id, before) => {
    const token = (loadTokenRef.current += 1);
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const stale = () => !aliveRef.current || loadTokenRef.current !== token || activeIdRef.current !== id;

    setThread((current) => threadLoading(current, before));
    try {
      const page = await requests.thread(id, before, { signal: controller.signal });
      if (stale()) return;
      setThread((current) => threadPage(current, page, before));
      const newest = page.items.at(-1);
      if (!before && newest) await markRead(id, newest.sequence);
    } catch (cause) {
      // An aborted fetch is the expected outcome of switching away, not a thread error.
      if (stale() || cause?.name === 'AbortError') return;
      setThread((current) => threadFailed(current, cause.message));
    }
  }, [requests, markRead]);

  useEffect(() => {
    if (!shop || openedRef.current === shop) return;
    openedRef.current = shop;
    requests.open(shop)
      .then(({ conversation }) => {
        // Opening is a mutation and is never retried; a superseded response is just dropped.
        if (!aliveRef.current || openedRef.current !== shop) return;
        select(conversation.id);
        reload();
      })
      .catch((cause) => {
        if (!aliveRef.current || openedRef.current !== shop) return;
        setOpenError(cause.message);
      });
  }, [shop, requests, reload, select]);

  // loadThread resets the thread when it loads the first page, so switching conversations
  // cannot mix two threads. Closing one needs no reset: the message pane is unmounted.
  useEffect(() => {
    if (activeId) loadThread(activeId);
  }, [activeId, loadThread]);

  useEffect(() => {
    if (!import.meta.env.VITE_CHAT_REALTIME_ENABLED) return;
    let timer, refreshThread = false;
    const close = subscribeChatChanges(client, user?.id, id => {
      if (!id || id === activeIdRef.current) refreshThread = true;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        reload();
        if (refreshThread && activeIdRef.current) void loadThread(activeIdRef.current);
        refreshThread = false;
      }, 150);
    }, setRealtimeStatus);
    return () => { clearTimeout(timer); close(); };
  }, [user?.id, loadThread, reload]);

  async function submit(event) {
    event.preventDefault();
    const cid = activeIdRef.current;
    const body = (drafts[cid] ?? '').trim();
    if (!cid || !body || sending.has(cid)) return;
    // Reuse the key when retrying the same text, so a lost response never duplicates a message.
    const key = pendingKey(pendingRef.current[cid] ?? { body: '', key: '' }, body);
    pendingRef.current = { ...pendingRef.current, [cid]: { body, key } };
    setSending((current) => new Set(current).add(cid));
    setSendError((current) => (current?.id === cid ? null : current));
    try {
      const { message } = await requests.send(cid, body, key);
      pendingRef.current = { ...pendingRef.current, [cid]: { body: '', key: '' } };
      // Only the conversation that sent it may change. After a switch the thread is reloaded
      // from the server anyway, so dropping the result cannot lose the message.
      if (aliveRef.current && activeIdRef.current === cid) {
        setThread((current) => threadAppended(current, message));
      }
      // Clear only this conversation's draft, and only if it still holds the text we sent.
      setDrafts((current) => ((current[cid] ?? '').trim() === body ? { ...current, [cid]: '' } : current));
      reload();
    } catch (cause) {
      if (aliveRef.current) setSendError({ id: cid, message: cause.message });
    } finally {
      setSending((current) => { const next = new Set(current); next.delete(cid); return next; });
    }
  }

  const draft = activeId ? (drafts[activeId] ?? '') : '';
  const busy = sending.has(activeId);

  const conversations = (list.data?.items ?? []).filter((item) => item.counterpart_name.toLowerCase().includes(filter.trim().toLowerCase()));
  const active = (list.data?.items ?? []).find((item) => item.id === activeId) ?? null;

  return (
    <div className="container account-page commerce-page">
      <Link to="/" className="page-back-link"><span aria-hidden="true">←</span> Về trang chủ</Link>
      <div className="chat-wrapper">
        <div className="chat-sidebar">
          <h2>Tin nhắn</h2>
          <p role="status">{realtimeStatus === 'connected' ? 'Đang cập nhật trực tiếp' : realtimeStatus === 'connecting' ? 'Đang kết nối cập nhật trực tiếp...' : 'Dùng nút tải lại để cập nhật tin nhắn.'}</p>
          <button type="button" className="button-outline" onClick={() => { reload(); if (activeId) void loadThread(activeId); }}>Tải lại tin nhắn</button>
          <div className="chat-search">
            <input type="search" placeholder="Tìm kiếm cuộc trò chuyện..." value={filter} onChange={(event) => setFilter(event.target.value)} />
          </div>
          <ResourceStatus {...list} />
          <div className="chat-list">
            {conversations.map((item) => (
              <button type="button" key={item.id} className={`chat-item ${activeId === item.id ? 'active' : ''}`} onClick={() => select(item.id)}>
                <span className="chat-item-avatar"><span className="chat-avatar-initial" aria-hidden="true">{initial(item.counterpart_name)}</span></span>
                <span className="chat-item-info">
                  <span className="chat-item-name">{item.counterpart_name}</span>
                  <span className="chat-item-last-message">{item.last_message ? `${item.last_message.mine ? 'Bạn: ' : ''}${item.last_message.body}` : 'Chưa có tin nhắn'}</span>
                </span>
                <span className="chat-item-meta">
                  <span className="chat-item-time">{formatTime(item.last_message_at)}</span>
                  {item.unread_count > 0 && <span className="chat-item-unread">{item.unread_count}</span>}
                </span>
              </button>
            ))}
          </div>
          {!list.loading && !list.error && conversations.length === 0 && (
            <p className="chat-sidebar-empty">{list.data?.items.length ? 'Không tìm thấy cuộc trò chuyện.' : 'Bạn chưa có cuộc trò chuyện nào.'}</p>
          )}
        </div>

        {activeId ? (
          <div className="chat-main">
            <div className="chat-header">
              <div className="chat-header-left">
                <button type="button" className="button-link" onClick={() => select(null)}>← Quay lại</button>
                <span className="chat-avatar-initial" aria-hidden="true">{initial(active?.counterpart_name)}</span>
              </div>
              <div className="chat-header-info">
                <h3>{active?.counterpart_name ?? 'Cuộc trò chuyện'}</h3>
                <p className="chat-status">{active?.last_message ? `Tin nhắn gần nhất ${formatTime(active.last_message_at)}` : 'Chưa có tin nhắn'}</p>
              </div>
            </div>
            <div className="chat-messages">
              {thread.hasMore && <button type="button" className="button-outline" disabled={thread.loading} onClick={() => loadThread(activeId, thread.items[0]?.sequence)}>Tải tin nhắn cũ hơn</button>}
              {thread.loading && thread.items.length === 0 && <p role="status">Đang tải...</p>}
              {thread.error && <p role="alert">{thread.error}</p>}
              {thread.items.map((message) => (
                <div key={message.id} className={`chat-message ${message.mine ? 'chat-message-sent' : 'chat-message-received'}`}>
                  <div className="chat-message-content">
                    <p>{message.body}</p>
                    <span className="chat-message-time">{formatTime(message.created_at)}</span>
                  </div>
                </div>
              ))}
              {!thread.loading && !thread.error && thread.items.length === 0 && <p className="chat-empty-hint">Hãy gửi tin nhắn đầu tiên.</p>}
            </div>
            {openError && <p role="alert">{openError}</p>}
            {sendError?.id === activeId && <p role="alert">{sendError.message}</p>}
            <form onSubmit={submit} className="chat-input-form">
              <div className="chat-input-group">
                <input type="text" placeholder="Nhập tin nhắn..." maxLength={2000} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [activeId]: event.target.value }))} disabled={busy} />
                <button type="submit" className="button-primary" disabled={busy || !draft.trim()}>{busy ? 'Đang gửi...' : 'Gửi'}</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="chat-empty">
            <h3>Chọn một cuộc trò chuyện</h3>
            <p>Mở tin nhắn từ trang sản phẩm để bắt đầu trao đổi với người bán.</p>
            <Link to="/marketplace" className="button-outline">Xem sản phẩm</Link>
          </div>
        )}
      </div>
    </div>
  );
}
