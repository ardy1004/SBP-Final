import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router';
import { MessageCircle, Sparkles, X, Send, CheckCircle } from 'lucide-react';
import ChatPropertyCard, { type ChatPropItem } from './ChatPropertyCard';
import Turnstile from './Turnstile';
import { formatRupiah } from '../../lib/api';
import { trackWaClick } from '../../lib/waTrack';

// suppress unused import warning — formatRupiah not used here but exported from api
void formatRupiah;

const WA_HREF = 'https://wa.me/6281391278889?text=Halo%2C%20saya%20tertarik%20dengan%20properti%20di%20Salam%20Bumi%20Property';

type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  properties?: ChatPropItem[];
  leadSubmitted?: boolean;
  waUrl?: string | null;
};

function WaIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="18" height="18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function ChatWidget() {
  const { pathname } = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Sembunyikan di halaman detail properti (sudah punya CTA WA sendiri) dan di
  // seluruh panel admin — G-CHAT adalah widget untuk calon pembeli, tidak ada
  // gunanya mengambang di atas alat kerja internal.
  const shouldHide =
    /^\/(dijual|disewa)\/[^/]+\//.test(pathname) ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (showChat) setTimeout(() => inputRef.current?.focus(), 50);
  }, [showChat]);

  if (shouldHide) return null;

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const isFirstMessage = messages.length === 0;
    const newMessages: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Hasil pencarian terakhir dikirim balik (id + judul) supaya backend bisa
    // memberi tahu model properti mana yang sedang dibahas — property_id lead
    // jadi akurat, bukan karangan model.
    const lastWithProps = [...messages].reverse().find(m => m.role === 'assistant' && (m.properties?.length ?? 0) > 0);
    const contextProperties = lastWithProps?.properties?.map(p => ({ id: p.id, title: p.title })) ?? [];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context_properties: contextProperties.length > 0 ? contextProperties : undefined,
          // Token anti-bot hanya dikirim pada pesan pertama (backend verifikasi di giliran pertama)
          cf_turnstile_token: isFirstMessage ? (turnstileToken || undefined) : undefined,
        }),
      });
      const json = await res.json() as { success: boolean; data?: { reply: string; properties: ChatPropItem[]; leadSubmitted?: boolean; waUrl?: string | null }; error?: string };
      if (json.success && json.data) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: json.data!.reply,
          properties: json.data!.properties ?? [],
          leadSubmitted: json.data!.leadSubmitted ?? false,
          waUrl: json.data!.waUrl ?? null,
        }]);
      } else {
        throw new Error(json.error ?? 'unknown');
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Maaf, terjadi gangguan. Coba lagi sebentar.',
        properties: [],
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* ── Chat window ──────────────────────────────────────────────────────── */}
      {showChat && (
        <div style={{
          position: 'fixed', bottom: 90, right: 24, zIndex: 50,
          width: 340, maxWidth: 'calc(100vw - 32px)', height: 480,
          display: 'flex', flexDirection: 'column',
          background: '#fff', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', background: '#1565C0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Sparkles size={16} color="white" />
            <div>
              <p style={{ margin: 0, color: '#fff', fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>Asisten SBP</p>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.75)', fontSize: 10, lineHeight: 1.3 }}>Tanya properti, gratis &amp; cepat</p>
            </div>
          </div>

          {/* Message list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', textAlign: 'center' }}>
                <Sparkles size={32} color="#1565C0" style={{ marginBottom: 10, opacity: 0.7 }} />
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                  Halo! Saya Asisten SBP 👋<br />
                  Tanya saya tentang properti yang kamu cari — misal <em>&quot;kost dekat UGM budget 1jt&quot;</em> atau <em>&quot;rumah Sleman 3 kamar&quot;</em>.
                </p>
                <div style={{ marginTop: 14 }}>
                  <Turnstile onVerify={setTurnstileToken} onExpire={() => setTurnstileToken('')} />
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
                  {/* Bubble */}
                  <div style={{
                    maxWidth: msg.role === 'user' ? '80%' : '85%',
                    padding: '8px 12px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user' ? '#1565C0' : '#F1F5F9',
                    color: msg.role === 'user' ? '#fff' : '#1e293b',
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                  {/* Property cards row */}
                  {msg.role === 'assistant' && msg.properties && msg.properties.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, width: '100%', maxWidth: 300 }}>
                      {msg.properties.map(p => (
                        <ChatPropertyCard key={p.id} prop={p} />
                      ))}
                    </div>
                  )}
                  {/* Lead confirmation */}
                  {msg.role === 'assistant' && msg.leadSubmitted && msg.waUrl && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 300 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#ecfdf5', color: '#059669',
                        fontSize: 11, fontWeight: 600, padding: '4px 10px',
                        borderRadius: 999, alignSelf: 'flex-start',
                      }}>
                        <CheckCircle size={12} />
                        Data tersimpan
                      </span>
                      <button
                        onClick={() => window.open(msg.waUrl!, '_blank', 'noopener,noreferrer')}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          width: '100%', padding: '8px 0',
                          background: '#25D366', color: '#fff',
                          border: 'none', borderRadius: 8, cursor: 'pointer',
                          fontSize: 13, fontWeight: 600,
                        }}
                      >
                        <WaIcon />
                        Hubungi via WhatsApp
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: '#F1F5F9', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} className="animate-bounce" style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={{ padding: '8px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tulis pertanyaan..."
              disabled={loading}
              style={{
                flex: 1, border: '1px solid #e2e8f0', borderRadius: 999,
                padding: '7px 14px', fontSize: 13, outline: 'none',
                background: loading ? '#f8fafc' : '#fff', color: '#1e293b',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: !input.trim() || loading ? '#e2e8f0' : '#1565C0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                flexShrink: 0, transition: 'background 0.15s',
              }}
              aria-label="Kirim"
            >
              <Send size={15} color={!input.trim() || loading ? '#94a3b8' : '#fff'} />
            </button>
          </div>
        </div>
      )}

      {/* ── FAB container ────────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 50 }}>
        {/* Menu expand — always rendered, fades in/out */}
        <div style={{
          position: 'absolute', bottom: 72, right: 0,
          display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
          opacity: showMenu && !showChat ? 1 : 0,
          transform: showMenu && !showChat ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: showMenu && !showChat ? 'auto' : 'none',
        }}>
          {/* Chat AI */}
          <button
            onClick={() => { setShowChat(true); setShowMenu(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 999,
              background: '#fff', border: '1.5px solid #1565C0', color: '#1565C0',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            }}
          >
            <Sparkles size={14} />
            Chat dengan Asisten AI
          </button>
          {/* WhatsApp */}
          <button
            onClick={() => { trackWaClick('chat_widget'); window.open(WA_HREF, '_blank', 'noopener,noreferrer'); setShowMenu(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 999,
              background: '#25D366', border: 'none', color: '#fff',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: '0 2px 12px rgba(37,211,102,0.35)',
            }}
          >
            <WaIcon />
            WhatsApp Admin
          </button>
        </div>

        {/* Main FAB button */}
        <button
          onClick={() => {
            if (showChat) {
              setShowChat(false);
            } else {
              setShowMenu(prev => !prev);
            }
          }}
          style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none',
            background: '#1565C0',
            boxShadow: '0 4px 16px rgba(21,101,192,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'background 0.2s, transform 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1255A8')}
          onMouseLeave={e => (e.currentTarget.style.background = '#1565C0')}
          aria-label={showChat ? 'Tutup chat' : 'Buka menu kontak'}
        >
          {showChat
            ? <X size={24} color="white" />
            : <MessageCircle size={24} color="white" />
          }
        </button>
      </div>
    </>
  );
}
