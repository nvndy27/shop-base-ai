import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Chat.css';

// Mock data for chats
const mockChats = [
  { id: 1, name: 'Cửa hàng B', lastMessage: 'Cảm ơn bạn đã mua hàng!', time: '10:30', unread: 2, avatar: 'https://picsum.photos/seed/shopbase-v/40/40' },
  { id: 2, name: 'Khách hàng A', lastMessage: 'Bạn có thể gửi thêm hình sản phẩm không?', time: '09:15', unread: 0, avatar: 'https://picsum.photos/seed/shopbase-v/40/40' },
  { id: 3, name: 'Hỗ trợ ShopBase', lastMessage: 'Chúng tôi đã nhận được yêu cầu của bạn.', time: '08:00', unread: 0, avatar: 'https://picsum.photos/seed/shopbase-v/40/40' },
];

const mockMessages = [
  { id: 1, text: 'Xin chào, tôi cần pomoc với đơn hàng #123.', sender: 'user', time: '09:00' },
  { id: 2, text: 'Chào bạn, mình là nhân viên hỗ trợ. Bạn có thể cung cấp thêm chi tiết không?', sender: 'other', time: '09:05' },
  { id: 3, text: 'Đơn hàng #123 của bạn đang được xử lý và sẽ ships trong 2 ngày.', sender: 'other', time: '09:10' },
  { id: 4, text: 'Cảm ơn bạn!', sender: 'user', time: '09:15' },
];

export default function Chat() {
  const navigate = useNavigate();
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const sendMessageTimeoutRef = useRef(null);
  const replyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (sendMessageTimeoutRef.current) {
        clearTimeout(sendMessageTimeoutRef.current);
      }
      if (replyTimeoutRef.current) {
        clearTimeout(replyTimeoutRef.current);
      }
    };
  }, []);

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
    // In real app, fetch messages for this chat
    setMessages(mockMessages);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setLoading(true);
    // Simulate sending message
    if (sendMessageTimeoutRef.current) {
      clearTimeout(sendMessageTimeoutRef.current);
    }
    sendMessageTimeoutRef.current = setTimeout(() => {
      const newMessage = {
        id: Date.now(),
        text: inputValue,
        sender: 'user',
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, newMessage]);
      setInputValue('');
      setLoading(false);
      // Simulate receiving a reply after a short delay
      if (replyTimeoutRef.current) {
        clearTimeout(replyTimeoutRef.current);
      }
      replyTimeoutRef.current = setTimeout(() => {
        const reply = {
          id: Date.now() + 1,
          text: 'Cảm ơn bạn đã liên hệ. Chúng tôi sẽ hỗ trợ bạn sớm nhất có thể.',
          sender: 'other',
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, reply]);
      }, 1500);
    }, 500);
  };

  if (loading && messages.length === 0) {
    setMessages(mockMessages); // for demo, show mock messages while loading
  }

  return (
    <div className="container">
      <Link to="/" className="page-back-link"><span aria-hidden="true">←</span> Về trang chủ</Link>

      <div className="chat-wrapper">
        <div className="chat-sidebar">
          <h2>Tin nhắn</h2>
          <div className="chat-search">
            <input type="text" placeholder="Tìm kiếm cuộc trò chuyện..." />
          </div>
          <div className="chat-list">
            {mockChats.map(chat => (
              <div
                key={chat.id}
                className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                onClick={() => handleSelectChat(chat.id)}
              >
                <div className="chat-item-avatar">
                  <img src={chat.avatar} alt={chat.name} />
                </div>
                <div className="chat-item-info">
                  <h3 className="chat-item-name">{chat.name}</h3>
                  <p className="chat-item-last-message">{chat.lastMessage}</p>
                </div>
                <div className="chat-item-meta">
                  <p className="chat-item-time">{chat.time}</p>
                  {chat.unread > 0 && (
                    <span className="chat-item-unread">{chat.unread}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Link to="/conversations" className="button-link">
            Xem tất cả tin nhắn
          </Link>
        </div>

        {activeChatId ? (
          <div className="chat-main">
            <div className="chat-header">
              <div className="chat-header-left">
                <button className="button-link" onClick={() => setActiveChatId(null)}>
                  ← Quay lại danh sách
                </button>
                <img src={mockChats.find(c => c.id === activeChatId)?.avatar || 'https://picsum.photos/seed/shopbase-v/40/40'} alt="avatar" />
              </div>
              <div className="chat-header-info">
                <h3>{mockChats.find(c => c.id === activeChatId)?.name || 'Cuộc trò chuyện'}</h3>
                <p className="chat-status">Đang hoạt động</p>
              </div>
            </div>
            <div className="chat-messages">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`chat-message ${message.sender === 'user' ? 'message-sent' : message.sender === 'other' ? 'message-received' : 'message-system'}`}
                >
                  <div className="chat-message-content">
                    <p>{message.text}</p>
                    <span className="chat-message-time">{message.time}</span>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="chat-input-form">
              <div className="chat-input-group">
                <input
                  type="text"
                  placeholder="Nhập tin nhắn..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={loading}
                />
                <button type="submit" className="button-primary" disabled={loading || !inputValue.trim()}>
                  {loading ? 'Đang gửi...' : 'Gửi'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="chat-empty">
            <h3>Bạn chưa có cuộc trò chuyện nào</h3>
            <p>Bắt đầu một cuộc trò chuyện mới bằng cách nhấn vào một cửa hàng hoặc sản phẩm.</p>
            <Link to="/" className="button-outline">Về trang chủ</Link>
          </div>
        )}
      </div>
    </div>
  );
}