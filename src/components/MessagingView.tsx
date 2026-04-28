import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Check, CheckCheck, MoreVertical, Flag, Ban, UserMinus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import { EDGE_FUNCTION_URL, MATCHES_FUNCTION_URL, MESSAGES_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';

function getAuthHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': publicAnonKey,
  };
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date | string;
  read?: boolean;
}

interface MessagingViewProps {
  matchName: string;
  matchPhoto: string;
  matchId: string;
  onBack: () => void;
  compatibilityScore?: number;
  mutualMatch?: boolean;
  onConfirmMet?: (matchId: string) => void;
  hasConfirmedMet?: boolean;
  bothConfirmedMet?: boolean;
  onOpenDateReview?: (matchId: string) => void;
  sharedHobbies?: string[];
  sharedValues?: string[];
  lastActiveAt?: string | null;
  /**
   * Whether the current user has verified their email. When false, the send
   * input is disabled and an inline banner explains why. The user can still
   * read existing messages and view the match's profile — only outbound
   * messaging is gated. Defaults to true so legacy callers (and the dev
   * gallery) aren't affected.
   */
  emailVerified?: boolean;
  /**
   * Optional handler — when provided, tapping the match's photo or name in the
   * chat header opens their full profile (the same MatchProfileView shown from
   * the matches/home view). When omitted, the photo/name are non-interactive.
   */
  onViewProfile?: (matchId: string) => void;
}

const STARTERS = [
  "What's something you're really into right now?",
  "Best trip you've ever taken?",
  "What does a perfect Sunday look like for you?",
  "What made you want to try Parallel?",
];

function formatLastActive(lastActiveAt: string | null | undefined): string {
  if (!lastActiveAt) return 'Active recently';
  const date = new Date(lastActiveAt);
  if (isNaN(date.getTime())) return 'Active recently';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 5) return 'Active now';
  if (diffMins < 60) return `Active ${diffMins}m ago`;
  if (diffHours < 24) return `Active ${diffHours}h ago`;
  if (diffDays === 1) return 'Active yesterday';
  if (diffDays < 7) return `Active ${diffDays}d ago`;
  return 'Active recently';
}

function getInitials(name: string | null | undefined) {
  if (!name || typeof name !== 'string') return '?';
  return name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || '?';
}

export function MessagingView({
  matchName,
  matchPhoto,
  matchId,
  onBack,
  compatibilityScore = 85,
  mutualMatch = false,
  onConfirmMet,
  hasConfirmedMet = false,
  bothConfirmedMet = false,
  onOpenDateReview,
  sharedHobbies,
  sharedValues,
  lastActiveAt,
  emailVerified = true,
  onViewProfile,
}: MessagingViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSafetyMenu, setShowSafetyMenu] = useState(false);
  const [showUnmatchModal, setShowUnmatchModal] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showStarters, setShowStarters] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportOffsetTop, setViewportOffsetTop] = useState<number>(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const safetyMenuRef = useRef<HTMLDivElement>(null);
  const currentUserId = localStorage.getItem('parallel_user_id') || '';
  const lastActiveText = formatLastActive(lastActiveAt);

  // Track visualViewport height AND offsetTop so the container shrinks
  // correctly when the iOS keyboard opens and the viewport shifts up.
  // - height: shrinks when keyboard appears → container shrinks, input stays visible
  // - offsetTop: how far the visual viewport has shifted from the layout viewport top
  //   → we translate the container down by this amount so it stays anchored correctly
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setViewportHeight(Math.round(vv.height));
      setViewportOffsetTop(Math.round(vv.offsetTop));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Lock body scroll while messaging view is open — prevents iOS from
  // scrolling the entire document when the input is focused.
  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevPos = document.body.style.position;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = prev;
      document.body.style.position = prevPos;
      document.body.style.width = '';
    };
  }, []);

  // Escape-to-close for the unmatch modal. We don't use the shared
  // useModalA11y hook here because this view already manages body scroll
  // and the visualViewport, and double-locking would break the iOS
  // keyboard handling above.
  useEffect(() => {
    if (!showUnmatchModal) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setShowUnmatchModal(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showUnmatchModal]);

  // Escape-to-close for the safety popover menu.
  useEffect(() => {
    if (!showSafetyMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSafetyMenu(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showSafetyMenu]);

  // When input gains focus, scroll messages to bottom instead of letting
  // iOS auto-scroll the page (which hides the header).
  const handleInputFocus = () => {
    // Delay to let keyboard animation start, then pin messages to bottom.
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
      // Force window scroll back to top to counteract iOS auto-scroll
      window.scrollTo(0, 0);
    }, 300);
  };

  const fetchMessages = useCallback(async () => {
    if (!mutualMatch) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${MESSAGES_FUNCTION_URL}/${matchId}`, {
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setMessages(data.messages.map((m: any) => ({ ...m, timestamp: new Date(m.created_at || m.timestamp) })));
          if (data.conversationId) setConversationId(data.conversationId);
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  }, [matchId, mutualMatch]);

  useEffect(() => {
    if (!mutualMatch) return;
    fetchMessages();
    const pollInterval = setInterval(fetchMessages, 8000);

    (async () => {
      const token = await getAccessToken();
      if (token) {
        fetch(`${MESSAGES_FUNCTION_URL}/mark-read`, {
          method: 'POST',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ matchId }),
        }).catch(() => {});
      }
    })();

    let realtimeChannel: any = null;
    const setupRealtime = async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const res = await fetch(`${MESSAGES_FUNCTION_URL}/realtime-config?matchId=${matchId}`, {
          headers: getAuthHeaders(token),
        });
        if (res.ok) {
          const config = await res.json();
          const { supabaseUrl, supabaseAnonKey, conversationId: convId, filter } = config;
          if (convId) {
            setConversationId(convId);
            const supabase = createClient(supabaseUrl, supabaseAnonKey);
            realtimeChannel = supabase
              .channel('messages-' + convId)
              .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (payload) => {
                setMessages(prev => {
                  if (prev.some(m => m.id === payload.new.id)) return prev;
                  return [...prev, { id: payload.new.id, senderId: payload.new.sender_id, text: payload.new.text, timestamp: payload.new.created_at }];
                });
              })
              .subscribe();
          }
        }
      } catch (err) {
        console.error('Failed to set up realtime:', err);
      }
    };
    setupRealtime();

    const starterTimer = setTimeout(() => setShowStarters(true), 800);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(starterTimer);
      if (realtimeChannel) realtimeChannel.unsubscribe();
    };
  }, [matchId, mutualMatch, fetchMessages]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (safetyMenuRef.current && !safetyMenuRef.current.contains(event.target as Node)) {
        setShowSafetyMenu(false);
      }
    }
    if (showSafetyMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSafetyMenu]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, viewportHeight]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [newMessage]);

  const formatTime = (timestamp: Date | string) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleSend = async () => {
    if (!newMessage.trim() || conversationId === null) return;
    if (!emailVerified) {
      toast.error('Verify your email to send messages.');
      return;
    }
    const token = await getAccessToken();
    if (!token) return;
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      senderId: currentUserId,
      text: newMessage.trim(),
      timestamp: new Date(),
      read: false,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage('');
    setShowStarters(false);
    try {
      await fetch(`${MESSAGES_FUNCTION_URL}/send`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ matchId, text: optimisticMsg.text }),
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      toast.error('Failed to send. Please try again.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleUseStarter = (starter: string) => {
    setNewMessage(starter);
    setShowStarters(false);
    textareaRef.current?.focus();
  };

  const handleReportUser = async () => {
    setShowSafetyMenu(false);
    const token = await getAccessToken();
    if (token) {
      try {
        await fetch(`${MISC_FUNCTION_URL}/safety/report`, {
          method: 'POST', headers: getAuthHeaders(token),
          body: JSON.stringify({ reportedUserId: matchId, reason: 'user_report_from_messaging' }),
        });
      } catch (err) {}
    }
    toast('Report submitted. Our team will review within 24 hours.');
  };

  const handleBlockUser = async () => {
    setShowSafetyMenu(false);
    const token = await getAccessToken();
    if (token) {
      try {
        await fetch(`${MISC_FUNCTION_URL}/safety/block`, {
          method: 'POST', headers: getAuthHeaders(token),
          body: JSON.stringify({ blockedUserId: matchId }),
        });
      } catch (err) {}
    }
    toast('User blocked.');
    onBack();
  };

  const handleUnmatch = async () => {
    const token = await getAccessToken();
    if (token) {
      try {
        await fetch(`${MATCHES_FUNCTION_URL}/action`, {
          method: 'POST', headers: getAuthHeaders(token),
          body: JSON.stringify({ matchUserId: matchId, action: 'pass' }),
        });
      } catch (err) {}
    }
    setShowUnmatchModal(false);
    onBack();
  };

  const isLocked = conversationId === null;
  // Email verification gate: read existing messages freely, but disable sending
  // until the user verifies their email. We need a verified email to send them
  // notifications about replies (no push notifications on the web app).
  const messagingDisabled = isLocked || !emailVerified;

  return (
    <div
      className="fixed left-0 right-0 top-0 flex flex-col bg-white overflow-hidden z-[60]"
      style={{
        // height = visual viewport height (shrinks when keyboard opens on iOS)
        // transform = shift down by offsetTop so we stay anchored to the
        //   visual viewport when iOS Safari scrolls the layout viewport up
        //   to make room for the keyboard. Together these two keep the input
        //   bar pinned just above the keyboard at all times.
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
        transform: viewportOffsetTop ? `translateY(${viewportOffsetTop}px)` : undefined,
        paddingTop: viewportOffsetTop ? 0 : 'env(safe-area-inset-top)',
      }}
    >

      {/* Unmatch Modal */}
      {showUnmatchModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="messaging-unmatch-title"
        >
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full">
            <h2 id="messaging-unmatch-title" className="text-lg font-semibold mb-2">Unmatch {matchName}?</h2>
            <p className="text-gray-500 mb-6 text-sm leading-relaxed">
              This conversation will end and they'll be removed from your matches. This can't be undone.
            </p>
            <div className="space-y-3">
              <button onClick={handleUnmatch} className="w-full py-3 bg-black text-white rounded-full font-medium">Unmatch</button>
              <button onClick={() => setShowUnmatchModal(false)} className="w-full py-3 border border-gray-200 rounded-full text-gray-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header - fixed at top */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            aria-label="Back to inbox"
            className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>

          {/* Photo + name → open profile if onViewProfile is provided.
              We split into two adjacent buttons so the visual layout doesn't
              shift; one handles the photo tap, one handles the name tap. */}
          {onViewProfile ? (
            <>
              <button
                onClick={() => onViewProfile(matchId)}
                aria-label={`View ${matchName || 'match'}'s profile`}
                className="flex-shrink-0 active:opacity-60 transition-opacity"
              >
                {matchPhoto ? (
                  <img src={matchPhoto} alt={matchName} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center" aria-hidden="true">
                    <span className="text-white text-sm font-semibold">{getInitials(matchName)}</span>
                  </div>
                )}
              </button>

              <button
                onClick={() => onViewProfile(matchId)}
                aria-label={`View ${matchName || 'match'}'s profile`}
                className="flex-1 min-w-0 text-left active:opacity-60 transition-opacity"
              >
                <h2 className="text-base font-semibold truncate leading-tight">{matchName}</h2>
                <p className="text-xs text-gray-500 leading-tight">{lastActiveText}</p>
              </button>
            </>
          ) : (
            <>
              <div className="flex-shrink-0">
                {matchPhoto ? (
                  <img src={matchPhoto} alt={matchName} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center" aria-hidden="true">
                    <span className="text-white text-sm font-semibold">{getInitials(matchName)}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold truncate leading-tight">{matchName}</h2>
                <p className="text-xs text-gray-500 leading-tight">{lastActiveText}</p>
              </div>
            </>
          )}

          <div className="relative flex-shrink-0" ref={safetyMenuRef}>
            <button
              onClick={() => setShowSafetyMenu(!showSafetyMenu)}
              aria-label="More options"
              aria-expanded={showSafetyMenu}
              aria-haspopup="menu"
              className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
            >
              <MoreVertical size={20} aria-hidden="true" />
            </button>
            {showSafetyMenu && (
              <div className="w-48 bg-white rounded-2xl shadow-xl border border-gray-200 absolute right-0 top-10 z-50 overflow-hidden" role="menu">
                <button
                  onClick={() => { setShowSafetyMenu(false); setShowUnmatchModal(true); }}
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <UserMinus size={16} className="text-gray-500" aria-hidden="true" /><span className="text-sm">Unmatch</span>
                </button>
                {onConfirmMet && !bothConfirmedMet && (
                  <button
                    onClick={() => { setShowSafetyMenu(false); onConfirmMet(matchId); }}
                    disabled={hasConfirmedMet}
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 transition-colors border-t border-gray-100 disabled:opacity-50 text-left"
                  >
                    <Check size={16} className="text-gray-500" aria-hidden="true" />
                    <span className="text-sm">{hasConfirmedMet ? 'Waiting for them…' : 'We Met in Person'}</span>
                  </button>
                )}
                <button
                  onClick={handleReportUser}
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 transition-colors border-t border-gray-100 text-left"
                >
                  <Flag size={16} className="text-gray-500" aria-hidden="true" /><span className="text-sm">Report</span>
                </button>
                <button
                  onClick={handleBlockUser}
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 transition-colors border-t border-gray-100 text-left text-red-600"
                >
                  <Ban size={16} aria-hidden="true" /><span className="text-sm">Block</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages area - ONLY this scrolls */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
        role="log"
        aria-label={`Conversation with ${matchName}`}
        aria-live="polite"
      >
        {/* Conversation starters - more compact */}
        {messages.length === 0 && showStarters && mutualMatch && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={11} className="text-gray-500" aria-hidden="true" />
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Conversation starters</span>
            </div>
            <div className="space-y-1.5">
              {STARTERS.map((starter, i) => (
                <button
                  key={i}
                  onClick={() => handleUseStarter(starter)}
                  className="w-full text-left px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-gray-900 hover:bg-white transition-all"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Locked empty state */}
        {!mutualMatch && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Messaging locked</p>
            <p className="text-xs text-gray-500 leading-relaxed max-w-[220px]">
              Both of you need to like each other before messaging unlocks.
            </p>
          </div>
        )}

        {/* Message bubbles - tighter spacing */}
        <div className="space-y-0.5">
          {messages.map((message, index) => {
            const isMe = message.senderId === currentUserId;
            const isLast = index === messages.length - 1;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showSenderChange = !prevMsg || prevMsg.senderId !== message.senderId;

            return (
              <div key={message.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${showSenderChange && index > 0 ? 'mt-3' : 'mt-0.5'}`}>
                <div className={`max-w-[80%] ${
                  isMe
                    ? 'bg-black text-white rounded-[18px] rounded-br-[4px]'
                    : 'bg-gray-100 text-gray-900 rounded-[18px] rounded-bl-[4px]'
                } px-3 py-2`}>
                  <p className="text-sm leading-snug whitespace-pre-line">{message.text}</p>
                  {isLast && (
                    <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <p className={`text-[10px] ${isMe ? 'text-gray-400' : 'text-gray-500'}`}>{formatTime(message.timestamp)}</p>
                      {isMe && <CheckCheck size={10} className="text-gray-400" aria-label="Sent" />}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex justify-start mt-1.5" aria-live="polite" aria-label={`${matchName} is typing`}>
              <div className="bg-gray-100 rounded-[18px] rounded-bl-[4px] px-3 py-2">
                <div className="flex gap-1 items-center" aria-hidden="true">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar - more compact */}
      <div
        className="flex-shrink-0 bg-white border-t border-gray-200 px-3 py-2"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        {onOpenDateReview && bothConfirmedMet && (
          <div className="mb-2">
            <button
              onClick={() => onOpenDateReview(matchId)}
              className="w-full flex items-center justify-center gap-2 bg-black text-white px-5 py-2.5 rounded-full text-sm font-medium"
            >
              <Check size={14} aria-hidden="true" />
              Leave a Date Review
            </button>
          </div>
        )}

        {/* Email verification gate notice — shown only when convo is unlocked
            but user hasn't verified their email yet. We suppress this when the
            convo itself is locked (mutual match required) so we don't stack
            two competing "you can't message" reasons. */}
        {!isLocked && !emailVerified && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200" role="status">
            <p className="text-xs text-amber-900 leading-snug">
              <span className="font-medium">Verify your email to send messages.</span>
              <span className="text-amber-800"> Tap "Resend" in the banner above to receive your verification link.</span>
            </p>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className={`flex-1 rounded-full border px-3.5 py-2 transition-colors ${
            messagingDisabled
              ? 'bg-gray-100 border-gray-200 opacity-60'
              : 'bg-gray-50 border-gray-200 focus-within:bg-white focus-within:border-gray-300'
          }`}>
            <label htmlFor="message-input" className="sr-only">Message {matchName}</label>
            <textarea
              id="message-input"
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={handleInputFocus}
              placeholder={
                isLocked
                  ? 'Messaging locked...'
                  : !emailVerified
                  ? 'Verify your email to send...'
                  : `Message ${matchName}...`
              }
              className="w-full bg-transparent resize-none outline-none text-sm leading-snug disabled:cursor-not-allowed"
              rows={1}
              disabled={messagingDisabled}
              style={{ maxHeight: '100px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || messagingDisabled}
            aria-label="Send message"
            className="bg-black text-white p-2.5 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 active:scale-95"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
