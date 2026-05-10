import { useState, useEffect, useCallback, useRef } from 'react';
import { EDGE_FUNCTION_URL, MATCHES_FUNCTION_URL, MESSAGES_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';
import { InboxSkeleton } from './Skeletons';
import { progress } from './NavigationProgress';
import { SetupChecklist } from './SetupChecklist';

interface Message {
  matchId: string;
  matchName: string;
  matchPhoto: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  compatibilityScore: number;
  mutualMatch?: boolean;
  hasMessages?: boolean; // true if conversation has at least 1 message
}

interface WaitingMutual {
  id: string;
  name: string;
  photo: string;
  compatibilityScore: number;
}

interface InboxViewProps {
  messages: Message[];
  onOpenChat: (matchId: string) => void;
  onViewProfile: (matchId: string) => void;
  hasActivated?: boolean;
  // Whether the backend has returned at least one match. Forwarded to
  // SetupChecklist to gate subscribe/verify rows consistently with Home.
  hasMatches?: boolean;
  onNavigateToPayment?: () => void;
  // Plumbing for the SetupChecklist card at the top of Inbox. Mirrors what
  // MatchesView already passes — both views share state via localStorage +
  // backend, so dismissing/completing on one auto-syncs to the other.
  accessToken?: string | null;
  emailVerified?: boolean;
  isVerified?: boolean;
  onOpenInstallPrompt?: () => void;
  onOpenNotifications?: () => void;
}

export function InboxView({
  messages: propMessages,
  onOpenChat,
  onViewProfile,
  hasActivated = false,
  hasMatches,
  onNavigateToPayment,
  accessToken = null,
  emailVerified = true,
  isVerified = false,
  onOpenInstallPrompt,
  onOpenNotifications,
}: InboxViewProps) {
  const [localMessages, setLocalMessages] = useState<Message[]>(propMessages);
  const [waiting, setWaiting] = useState<WaitingMutual[]>([]);
  // Initial load tracker. Subsequent polls (every 5s) don't re-trigger the
  // skeleton — they just update silently in the background.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async (isInitial: boolean) => {
    const token = await getAccessToken();
    if (!token) {
      // No token = can't load. Still mark loaded so we don't show skeleton forever.
      if (isInitial) setHasLoadedOnce(true);
      return;
    }
    // Tie initial load into the global progress bar so the user sees feedback
    // even if the skeleton itself is missed somehow. Background polls don't
    // trigger the bar (would feel jittery if it flashed every 5 seconds).
    if (isInitial) progress.start();
    try {
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey };
      const [convoRes, mutualRes, waitingRes] = await Promise.all([
        fetch(`${MESSAGES_FUNCTION_URL}/conversations`, { headers }),
        fetch(`${MATCHES_FUNCTION_URL}/mutual`, { headers }),
        fetch(`${MATCHES_FUNCTION_URL}/mutual-waiting`, { headers }),
      ]);
      if (!convoRes.ok) return;
      const convoData = await convoRes.json();
      const mutualData = mutualRes.ok ? await mutualRes.json() : {};
      const waitingData = waitingRes.ok ? await waitingRes.json() : { waiting: [] };

      const mutualIds = new Set<string>(mutualData.mutualMatches || mutualData.mutualMatchIds || []);
      const userId = localStorage.getItem('parallel_user_id') || '';
      const conversations = convoData.conversations || [];

      const built: Message[] = conversations.map((convo: any) => {
        const otherUser = convo.user_id_1 === userId ? convo.user2 : convo.user1;
        const otherId = convo.user_id_1 === userId ? convo.user_id_2 : convo.user_id_1;
        const existing = propMessages.find(m => m.matchId === otherId);
        const hasMessages = !!convo.last_message_at;
        return {
          matchId: otherId,
          matchName: otherUser?.name || existing?.matchName || 'Unknown',
          matchPhoto: otherUser?.photoUrl || existing?.matchPhoto || '',
          lastMessage: convo.last_message || existing?.lastMessage || 'You matched! Say hello 👋',
          timestamp: convo.last_message_at || convo.created_at || new Date().toISOString(),
          unread: existing?.unread ?? false,
          compatibilityScore: existing?.compatibilityScore || 0,
          mutualMatch: mutualIds.has(otherId) || !!convo.last_message_at,
          hasMessages,
        };
      });

      setLocalMessages(built);
      setWaiting(waitingData.waiting || []);
    } catch (err) {
      console.error('InboxView: failed to fetch', err);
    } finally {
      if (isInitial) {
        setHasLoadedOnce(true);
        progress.done();
      }
    }
  }, [propMessages]);

  useEffect(() => {
    fetchAll(true);
    // Background poll every 5s. Doesn't trigger the skeleton — the user keeps
    // seeing real content while we silently refresh.
    const interval = setInterval(() => fetchAll(false), 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    setLocalMessages(prev => {
      const merged = [...prev];
      for (const pm of propMessages) {
        const idx = merged.findIndex(m => m.matchId === pm.matchId);
        if (idx >= 0) merged[idx] = { ...merged[idx], ...pm };
        else merged.push(pm);
      }
      return merged;
    });
  }, [propMessages]);

  // Conversations list = mutual matches WITH at least one message.
  // Waiting mutuals (no messages) live in the row at top, not the list.
  const activeConversations = localMessages
    .filter(m => m.mutualMatch === true && m.hasMessages !== false)
    .filter(m => m.lastMessage && m.lastMessage !== 'You matched! Say hello 👋');
  // Secondary safety filter: if hasMessages flag is missing (older clients),
  // fall back to checking that the placeholder text isn't there.

  const unreadCount = activeConversations.filter(m => m.unread).length;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Defensive: handle null/undefined/empty names so this can never crash the
  // inbox the way it did when /mutual-waiting returned bare UUIDs without name.
  const getInitials = (name: string | null | undefined) => {
    if (!name || typeof name !== 'string') return '?';
    return name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || '?';
  };

  const hasAnything = waiting.length > 0 || activeConversations.length > 0;

  // Show skeleton on first load. Subsequent updates render in place.
  if (!hasLoadedOnce) {
    return <InboxSkeleton />;
  }

  return (
    <div className="flex flex-col bg-parallel-cream" style={{ height: '100dvh' }}>

      {/* Header */}
      <div className="flex-shrink-0 bg-parallel-cream border-b border-gray-100 px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          {unreadCount > 0 && (
            <span className="text-sm text-gray-500 font-medium">
              {unreadCount} unread
            </span>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">

        {/* Setup checklist — same card that lives on Home. Auto-hides when all
            actionable items are done (email verified, SMS opted in, PWA done).
            Collapsed/dismissed state is shared via localStorage so hiding it
            on one screen hides it on the other. */}
        <SetupChecklist
          accessToken={accessToken}
          emailVerified={emailVerified}
          identityVerified={isVerified}
          hasActivated={hasActivated}
          hasMatches={hasMatches}
          onOpenInstallPrompt={onOpenInstallPrompt || (() => {
            try { window.dispatchEvent(new CustomEvent('parallel:open-install-prompt')); } catch { /* noop */ }
          })}
          onOpenNotifications={onOpenNotifications}
        />

        {/* "Mutual matches waiting" horizontal row — only shows if there are waiting mutuals.
            Waiting circles split into two tap zones: tap photo → profile, tap name → chat. */}
        {waiting.length > 0 && (
          <div className="border-b border-gray-100 py-4">
            <div className="px-5 mb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                You matched — say hi
              </p>
            </div>
            <div className="overflow-x-auto -mx-1 px-4 pb-1 scrollbar-hide">
              <div className="flex gap-3">
                {waiting.map((w) => (
                  <div
                    key={w.id}
                    className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16"
                  >
                    {/* Photo button → opens full profile */}
                    <button
                      onClick={() => onViewProfile(w.id)}
                      aria-label={`View ${w.name || 'match'}'s profile`}
                      className="relative active:opacity-60 transition-opacity"
                    >
                      {w.photo ? (
                        <img
                          src={w.photo}
                          alt={w.name || 'Match'}
                          className="w-16 h-16 rounded-full object-cover ring-2 ring-black/5"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center ring-2 ring-black/5" aria-hidden="true">
                          <span className="text-parallel-cream text-base font-semibold">
                            {getInitials(w.name)}
                          </span>
                        </div>
                      )}
                      {/* Subtle "new" dot */}
                      <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-parallel-void rounded-full border-2 border-white" aria-hidden="true" />
                    </button>
                    {/* Name button → opens chat */}
                    <button
                      onClick={() => onOpenChat(w.id)}
                      aria-label={`Open chat with ${w.name || 'match'}`}
                      className="text-xs text-gray-700 truncate w-full text-center active:opacity-60 transition-opacity"
                    >
                      {w.name || 'Match'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Active conversations.
            Row split: tap photo → profile, tap rest of row → chat. */}
        {activeConversations.length > 0 && (
          <div>
            {activeConversations.map((message, index) => (
              <div key={message.matchId}>
                <div className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 transition-colors">
                  {/* Photo → opens full profile */}
                  <button
                    onClick={() => onViewProfile(message.matchId)}
                    aria-label={`View ${message.matchName || 'match'}'s profile`}
                    className="relative flex-shrink-0 active:opacity-60 transition-opacity"
                  >
                    {message.matchPhoto ? (
                      <img
                        src={message.matchPhoto}
                        alt={message.matchName || 'Match'}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center" aria-hidden="true">
                        <span className="text-parallel-cream text-base font-semibold">
                          {getInitials(message.matchName)}
                        </span>
                      </div>
                    )}
                    {message.unread && (
                      <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-parallel-void rounded-full border-2 border-white" aria-hidden="true" />
                    )}
                  </button>

                  {/* Rest of row → opens chat */}
                  <button
                    onClick={() => onOpenChat(message.matchId)}
                    aria-label={`Open chat with ${message.matchName || 'match'}`}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-base truncate ${message.unread ? 'font-semibold text-parallel-void' : 'font-medium text-gray-800'}`}>
                        {message.matchName}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2 tabular-nums">
                        {formatTimestamp(message.timestamp)}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${message.unread ? 'text-parallel-void font-medium' : 'text-gray-500'}`}>
                      {message.lastMessage}
                    </p>
                  </button>
                </div>
                {index < activeConversations.length - 1 && (
                  <div className="ml-[76px] h-px bg-gray-100" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty state — only when neither row nor list has anything */}
        {!hasAnything && (
          <div className="flex flex-col items-center justify-center px-8 text-center" style={{ minHeight: '60vh' }}>
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No messages yet</h3>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[260px]">
              When you and a match both like each other, they'll appear at the top so you can say hi.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
