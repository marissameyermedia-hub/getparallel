import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Check, CheckCheck, MoreVertical, Flag, Ban, UserMinus, Sparkles, X, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, EDGE_FUNCTION_URL, MATCHES_FUNCTION_URL, MESSAGES_FUNCTION_URL, MISC_FUNCTION_URL, FEEDBACK_PROCESSOR_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';
import { MessagingSkeleton } from './Skeletons';
import { progress } from './NavigationProgress';
import { ConversationUnsticker } from './messaging/ConversationUnsticker';
import { DatePlannerCard, type DatePlannerCardHandle } from './messaging/DatePlannerCard';
import { DateConfirmCard, DATE_CARD_PREFIX } from './messaging/DateConfirmCard';
import { DateProposalCard, DATE_PROPOSAL_PREFIX, DATE_RESPONSE_PREFIX, type DateResponseData, type ProposalSlot } from './messaging/DateProposalCard';
import { RecoverySignalSheet } from './messaging/RecoverySignalSheet';
import { DateResponseBanner } from './messaging/DateResponseBanner';

const FADE_REASONS = [
  { id: 'values_felt_off',              label: "Values didn't align" },
  { id: 'lifestyle_mismatch',           label: 'Lifestyle mismatch' },
  { id: 'not_physical_type',            label: 'Not the right physical fit' },
  { id: 'too_far_away',                 label: 'Too far away' },
  { id: 'attachment_style_concern',     label: 'Different emotional style' },
  { id: 'communication_style_felt_off', label: 'Communication felt off' },
  { id: 'life_stage_mismatch',          label: 'Different life stage' },
  { id: 'just_not_feeling_it',          label: 'Just not feeling it' },
];

const FADE_ADJUST = [
  { id: 'more_similar_values',    label: 'More similar values' },
  { id: 'closer_location',        label: 'Closer location' },
  { id: 'different_lifestyle',    label: 'Different lifestyle' },
  { id: 'stronger_physical',      label: 'Stronger physical attraction' },
  { id: 'different_life_stage',   label: 'Different life stage' },
];

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
  onConfirmMet?: (matchId: string, source?: 'banner' | 'kebab') => void;
  hasConfirmedMet?: boolean;
  bothConfirmedMet?: boolean;
  onOpenDateReview?: (matchId: string) => void;
  sharedHobbies?: string[];
  sharedValues?: string[];
  lastActiveAt?: string | null;
  /** When true, shows the AI conversation un-sticker after 48h silence. */
  featureUnsticker?: boolean;
  /** When true, shows the AI date suggestion button after 5+ messages. */
  featureDateAgent?: boolean;
  /** When true, shows the recovery signal sheet after unmatch or 14-day silence. */
  featureRecoverySignal?: boolean;
  /** When true, shows the chat outcome chip after 5-day silence with 5+ messages. */
  featureFeedbackLoop?: boolean;
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

// Generic fallback starters — used when we don't have shared hobbies for the
// match, or as filler if there are fewer than 4 hobby-based prompts. Kept on
// the lighter side intentionally — no "what are you looking for" / values /
// dealbreaker territory. The point is to start a conversation, not screen.
const FALLBACK_STARTERS = [
  "What's something you're really into right now?",
  "Best trip you've ever taken?",
  "What does a perfect Sunday look like for you?",
  "Recommend me something — book, show, podcast, anything.",
];

// Build a small bank of hobby-flavored openers from the shared-hobbies list.
// Pulls 1-2 hobbies in to make it feel personal without being an interview.
// Hobbies come from Q3.9 and are user-typed strings ("hiking", "cooking"),
// so we lowercase + trim before splicing them into copy.
function buildHobbyStarters(hobbies: string[]): string[] {
  if (!hobbies || hobbies.length === 0) return [];
  const cleaned = hobbies
    .map(h => (h || '').toString().trim())
    .filter(h => h.length > 0 && h.length < 40);
  if (cleaned.length === 0) return [];

  // Use lowercase for in-sentence usage but keep the original casing for the
  // "you both like X" lead. Many hobby labels are already lowercase.
  const lower = (s: string) => s.toLowerCase();

  const starters: string[] = [];
  const top = cleaned.slice(0, 3);

  // Each template references one hobby. Light, low-stakes, easy to answer.
  if (top[0]) {
    starters.push(`Looks like we both like ${lower(top[0])} — what got you into it?`);
    starters.push(`What's your go-to ${lower(top[0])} spot or recommendation?`);
  }
  if (top[1]) {
    starters.push(`We've both got ${lower(top[1])} on our profiles — when's the last time you did that?`);
  }
  if (top[2]) {
    starters.push(`${top[2].charAt(0).toUpperCase() + top[2].slice(1)} or ${lower(top[0])} — which would you pick this weekend?`);
  }

  return starters;
}

// Pick 4 starters total: hobby-based first (up to 3), padded with generic
// lighter prompts. Keeps the UI consistent at 4 chips regardless of how
// many shared hobbies the backend returns.
function getStartersFor(sharedHobbies?: string[]): string[] {
  const hobbyBased = buildHobbyStarters(sharedHobbies || []).slice(0, 3);
  const remaining = 4 - hobbyBased.length;
  return [...hobbyBased, ...FALLBACK_STARTERS.slice(0, remaining)];
}

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

function renderWithLinks(text: string, isMe: boolean) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    const isMaps = part.includes('maps.google.com') || part.includes('goo.gl/maps');
    return (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline font-medium ${isMe ? 'text-parallel-cream/90' : 'text-blue-600'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {isMaps ? 'View on Maps →' : part}
      </a>
    );
  });
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
  featureUnsticker = false,
  featureDateAgent = false,
  featureRecoverySignal = false,
  featureFeedbackLoop = false,
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
  // Initial-load gate. Skeleton shows until the first load completes (success
  // or fail). Background polls don't toggle this — they update messages silently.
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [showFadeNudge, setShowFadeNudge] = useState(false);
  // 0 = closed, 1 = "what felt off", 2 = "would you adjust"
  const [fadeStep, setFadeStep] = useState<0 | 1 | 2>(0);
  const [fadeSelectedReasons, setFadeSelectedReasons] = useState<string[]>([]);
  const [fadeSelectedAdjust, setFadeSelectedAdjust] = useState<string[]>([]);
  const [showRecoverySheet, setShowRecoverySheet] = useState(false);
  const [recoveryTrigger, setRecoveryTrigger] = useState<'unmatch' | 'conversation_death_14d'>('unmatch');
  const [showChatOutcomeChip, setShowChatOutcomeChip] = useState(false);

  // ── Met-banner state ──────────────────────────────────────────────
  // Fetched once on mount. null = loading/unknown (banner hidden).
  const [metBannerEligibility, setMetBannerEligibility] = useState<{
    eligible: boolean;
    reason: string | null;
    snoozeUntil: string | null;
  } | null>(null);
  const [metBannerHidden, setMetBannerHidden] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const safetyMenuRef = useRef<HTMLDivElement>(null);
  const datePlannerRef = useRef<DatePlannerCardHandle>(null);
  const lastSendMs = useRef(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
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
    datePlannerRef.current?.dismiss();
    setTimeout(() => {
      const c = messagesContainerRef.current;
      if (c) c.scrollTop = c.scrollHeight;
      window.scrollTo(0, 0);
    }, 300);
  };

  // fetchMessages handles the "messages list" call only. Used both by the
  // initial parallel load and by the 8s background poll.
  const fetchMessages = useCallback(async (token?: string) => {
    if (!mutualMatch) return;
    const tk = token || (await getAccessToken());
    if (!tk) return;
    try {
      const res = await fetch(`${MESSAGES_FUNCTION_URL}/${matchId}`, {
        headers: getAuthHeaders(tk),
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
    if (!mutualMatch) {
      // Not a mutual match yet — nothing to load. Drop the skeleton immediately.
      setIsInitialLoading(false);
      return;
    }

    // Reset starters so switching conversations always starts fresh
    setShowStarters(false);

    let realtimeChannel: any = null;
    let cancelled = false;

    // Initial load: fire all 3 fetches in parallel instead of sequentially.
    // On a cold network this turns ~1.5s of waterfall into ~500ms.
    // Wired into the global progress bar so the user sees a top-of-screen
    // indicator even if the skeleton is missed.
    progress.start();
    (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) {
        if (!cancelled) { setIsInitialLoading(false); setShowStarters(true); }
        progress.done();
        return;
      }

      // Fetch messages first, then mark read after they're displayed.
      // realtime-config and met-banner-eligibility can run in parallel with the fetch.
      const fetchMessagesPromise = fetchMessages(token);
      // mark-read fires after messages load so we don't mark unread before the user sees them
      fetchMessagesPromise.then(() => {
        fetch(`${MESSAGES_FUNCTION_URL}/mark-read`, {
          method: 'POST',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ matchId }),
        }).catch(() => {});
      });
      const markReadPromise = Promise.resolve();
      const realtimeConfigPromise = fetch(`${MESSAGES_FUNCTION_URL}/realtime-config?matchId=${matchId}`, {
        headers: getAuthHeaders(token),
      }).catch(() => null);
      const eligibilityPromise = fetch(
        `${MESSAGES_FUNCTION_URL}/met-banner-eligibility?matchId=${matchId}`,
        { headers: getAuthHeaders(token) }
      ).then(r => r.ok ? r.json() : null).catch(() => null);

      // Wait for all four. We only really BLOCK on fetchMessages — that's the
      // one that determines whether the user sees content. The others can
      // resolve in their own time without holding up render.
      const [_, __, realtimeRes, eligData] = await Promise.all([
        fetchMessagesPromise,
        markReadPromise,
        realtimeConfigPromise,
        eligibilityPromise,
      ]);

      if (cancelled) return;

      // Spin up realtime channel from the config response.
      if (realtimeRes && realtimeRes.ok) {
        try {
          const config = await realtimeRes.json();
          const { conversationId: convId, filter } = config;
          if (convId && !cancelled) {
            setConversationId(convId);
            realtimeChannel = supabase
              .channel('messages-' + convId)
              .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (payload) => {
                const newMsg = { id: payload.new.id, senderId: payload.new.sender_id, text: payload.new.text, timestamp: payload.new.created_at };
                setMessages(prev => {
                  if (prev.some(m => m.id === payload.new.id)) return prev;
                  // Replace matching optimistic message to avoid duplicate
                  const tempIdx = prev.findIndex(
                    m => m.id.startsWith('temp-') && m.senderId === payload.new.sender_id && m.text === payload.new.text
                  );
                  if (tempIdx >= 0) {
                    const next = [...prev];
                    next[tempIdx] = newMsg;
                    return next;
                  }
                  return [...prev, newMsg];
                });
              })
              .subscribe();
          }
        } catch (err) {
          console.error('Failed to set up realtime:', err);
        }
      }

      if (eligData) setMetBannerEligibility(eligData);
      setIsInitialLoading(false);
      setShowStarters(true);
      progress.done();
    })();

    // 8-second background poll as a safety net in case realtime drops.
    // Doesn't touch isInitialLoading — these are silent updates.
    const pollInterval = setInterval(() => fetchMessages(), 8000);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
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

  // Detect conversation fade: last message > 72h ago and nudge not yet dismissed.
  // Suppressed when a more targeted prompt will handle the same window:
  //   - featureFeedbackLoop active + 5+ days → chat outcome chip handles it
  //   - featureRecoverySignal active + 14+ days → recovery sheet handles it
  useEffect(() => {
    if (!mutualMatch || messages.length === 0) return;
    const dismissKey = `parallel_fade_nudge_${matchId}`;
    if (localStorage.getItem(dismissKey)) return;
    const lastMsg = messages[messages.length - 1];
    const lastTime = new Date(lastMsg.timestamp as string).getTime();
    if (isNaN(lastTime)) return;
    const hoursAgo = (Date.now() - lastTime) / 3600000;
    const daysAgo = hoursAgo / 24;
    if (featureRecoverySignal && daysAgo >= 14) return;
    if (featureFeedbackLoop && daysAgo >= 5) return;
    if (hoursAgo >= 72) setShowFadeNudge(true);
  }, [messages, matchId, mutualMatch, featureRecoverySignal, featureFeedbackLoop]);

  // 14-day silence → recovery signal sheet. Fires once per conversation per device.
  useEffect(() => {
    if (!featureRecoverySignal || !mutualMatch || isInitialLoading || messages.length === 0) return;
    const seenKey = `parallel_14d_${matchId}`;
    if (localStorage.getItem(seenKey)) return;
    const lastMsg = messages[messages.length - 1];
    const lastTime = new Date(lastMsg.timestamp as string).getTime();
    if (isNaN(lastTime)) return;
    const daysAgo = (Date.now() - lastTime) / 86400000;
    if (daysAgo >= 14) {
      localStorage.setItem(seenKey, '1');
      setRecoveryTrigger('conversation_death_14d');
      setShowRecoverySheet(true);
    }
  }, [messages, matchId, mutualMatch, isInitialLoading, featureRecoverySignal]);

  // 5–14-day silence + 5+ messages → chat outcome chip. Fires once per conversation.
  useEffect(() => {
    if (!featureFeedbackLoop || !mutualMatch || isInitialLoading || messages.length < 5) return;
    const seenKey = `parallel_chat_outcome_${matchId}`;
    if (localStorage.getItem(seenKey)) return;
    const lastMsg = messages[messages.length - 1];
    const lastTime = new Date(lastMsg.timestamp as string).getTime();
    if (isNaN(lastTime)) return;
    const daysAgo = (Date.now() - lastTime) / 86400000;
    if (daysAgo >= 5 && daysAgo < 14) {
      setShowChatOutcomeChip(true);
    }
  }, [messages, matchId, mutualMatch, isInitialLoading, featureFeedbackLoop]);

  useEffect(() => {
    if (isInitialLoading) return;
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isTyping, viewportHeight, isInitialLoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
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

  const handleSend = async (textOverride?: string) => {
    // Debounce: onTouchEnd + onClick both fire on iOS — ignore the second within 400ms
    if (!textOverride) {
      const now = Date.now();
      if (now - lastSendMs.current < 400) return;
      lastSendMs.current = now;
    }
    // Read directly from DOM so iOS autocorrect doesn't leave React state stale
    const domValue = textareaRef.current?.value ?? '';
    const text = (textOverride ?? domValue).trim();
    if (!domValue.trim() && !textOverride) setNewMessage(''); // sync state if DOM is empty
    if (!text) return;
    if (!emailVerified) {
      toast.error('Verify your email to send messages.');
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      toast.error('Session expired. Please refresh the page.');
      return;
    }
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      senderId: currentUserId,
      text,
      timestamp: new Date(),
      read: false,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    if (!textOverride) setNewMessage('');
    setShowStarters(false);
    try {
      const res = await fetch(`${MESSAGES_FUNCTION_URL}/send`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ matchId, text: optimisticMsg.text }),
      });
      if (!res.ok) throw new Error('send failed');
      // Replace the temp ID with the real message ID so the realtime INSERT
      // dedup check matches and doesn't append a second copy.
      try {
        const data = await res.json();
        const realId = data.id || data.messageId;
        if (realId) {
          setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, id: realId } : m));
        }
      } catch {} // response may not include an ID — realtime text-match dedup handles it
      // When a confirmed date card is sent, persist it so the reminder cron can fire
      if (text.startsWith(DATE_CARD_PREFIX) && conversationId) {
        try {
          const cardData = JSON.parse(text.slice(DATE_CARD_PREFIX.length));
          await supabase.from('scheduled_dates').insert({
            conversation_id: conversationId,
            proposer_id: currentUserId,
            venue_name: cardData.venueName,
            venue_address: cardData.venueAddress ?? null,
            maps_url: cardData.mapsUrl ?? null,
            date_iso: cardData.dateIso,
            time_hour: cardData.time ?? null,
            label: cardData.label ?? null,
            period: cardData.period ?? null,
          });
        } catch {} // non-critical — reminder is best-effort
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      if (!textOverride) setNewMessage(optimisticMsg.text);
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
    if (featureRecoverySignal) {
      setRecoveryTrigger('unmatch');
      setShowRecoverySheet(true);
    } else {
      onBack();
    }
  };

  const dismissFadeNudge = () => {
    localStorage.setItem(`parallel_fade_nudge_${matchId}`, '1');
    setShowFadeNudge(false);
  };

  const handleChatOutcomeStillInTouch = () => {
    localStorage.setItem(`parallel_chat_outcome_${matchId}`, '1');
    setShowChatOutcomeChip(false);
  };

  const handleChatOutcomeRanCourse = async () => {
    localStorage.setItem(`parallel_chat_outcome_${matchId}`, '1');
    setShowChatOutcomeChip(false);
    const token = await getAccessToken();
    if (!token) return;
    fetch(`${MATCHES_FUNCTION_URL}/feedback/structured`, {
      method: 'POST', headers: getAuthHeaders(token),
      body: JSON.stringify({ matchedUserId: matchId, feedbackType: 'after_chat' }),
    }).catch(() => {});
    fetch(`${FEEDBACK_PROCESSOR_URL}/process-user`, {
      method: 'POST', headers: getAuthHeaders(token),
      body: JSON.stringify({ userId: currentUserId }),
    }).catch(() => {});
  };

  // Fire-and-forget banner action for non-confirmed responses.
  // 'not-yet' snoozes 7 days; 'dismissed' snoozes 3 days.
  const handleMetBannerAction = async (action: 'not-yet' | 'dismissed') => {
    setMetBannerHidden(true);
    const token = await getAccessToken();
    if (!token) return;
    fetch(`${MESSAGES_FUNCTION_URL}/met-banner-action`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify({ matchId, action }),
    }).catch(err => console.error('Met banner action failed:', err));
  };

  const handleFadeSheetSubmit = async () => {
    setFadeStep(0);
    dismissFadeNudge();
    const token = await getAccessToken();
    if (!token) return;
    fetch(`${MATCHES_FUNCTION_URL}/feedback/structured`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify({
        matchedUserId: matchId,
        feedbackType: 'conversation_fade',
        passReasons: fadeSelectedReasons,
        wouldAdjust: fadeSelectedAdjust,
      }),
    }).catch(err => console.error('Fade feedback failed:', err));
    // Fire-and-forget weight recompute
    fetch(`${FEEDBACK_PROCESSOR_URL}/process-user`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify({ userId: currentUserId }),
    }).catch(() => {});
    setFadeSelectedReasons([]);
    setFadeSelectedAdjust([]);
  };

  const toggleFadeReason = (id: string) =>
    setFadeSelectedReasons(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleFadeAdjust = (id: string) =>
    setFadeSelectedAdjust(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const fadeChipClass = (selected: boolean) =>
    `px-3 py-1.5 rounded-full border transition-all text-sm ${
      selected
        ? 'bg-parallel-void text-parallel-cream border-parallel-void'
        : 'bg-parallel-cream text-gray-700 border-gray-300 hover:border-gray-400'
    }`;

  const isLocked = false;
  const messagingDisabled = !emailVerified;

  const matchFirstName = matchName.trim().split(/\s+/)[0] ?? 'them';
  // Only the most recent suggestion card should render; older ones are replaced by the latest
  const lastProposalMsgId = messages.reduce<string | null>(
    (last, m) => m.text.startsWith(DATE_PROPOSAL_PREFIX) ? m.id : last,
    null
  );
  // Only treat a DATE_RESPONSE as belonging to the current proposal — must follow it in the thread
  const lastProposalMsgIndex = lastProposalMsgId
    ? messages.findIndex(m => m.id === lastProposalMsgId)
    : -1;
  const dateResponseMsg = lastProposalMsgIndex >= 0
    ? messages.slice(lastProposalMsgIndex + 1).find(m => m.text.startsWith(DATE_RESPONSE_PREFIX))
    : null;
  const dateResponseData: DateResponseData | null = dateResponseMsg ? (() => {
    try { return JSON.parse(dateResponseMsg.text.slice(DATE_RESPONSE_PREFIX.length)); } catch { return null; }
  })() : null;

  // Show recipient banner when the latest proposal came from the match and has no response yet
  const lastProposalMsg = lastProposalMsgId ? messages.find(m => m.id === lastProposalMsgId) : null;
  const showResponseBanner = !!(
    featureDateAgent &&
    lastProposalMsg &&
    lastProposalMsg.senderId !== currentUserId &&
    !dateResponseMsg &&
    !messages.some(m => m.text.startsWith(DATE_CARD_PREFIX))
  );
  const pendingProposalSlots: ProposalSlot[] = showResponseBanner && lastProposalMsg ? (() => {
    try {
      const d = JSON.parse(lastProposalMsg.text.slice(DATE_PROPOSAL_PREFIX.length));
      return Array.isArray(d.slots) ? d.slots : [];
    } catch { return []; }
  })() : [];

  // "Both online now" nudge — show when match is active now and no date confirmed
  const isMatchActiveNow = formatLastActive(lastActiveAt) === 'Active now';
  const hasConfirmedDate = messages.some(m => m.text.startsWith(DATE_CARD_PREFIX));
  const showBothOnlineNudge = !!(
    featureDateAgent &&
    isMatchActiveNow &&
    !hasConfirmedDate &&
    !showResponseBanner &&
    messages.length >= 5
  );

  // Show a skeleton while the initial load is in flight. This is the worst
  // single perceived-lag moment in the app — opening a chat hits 3 fetches
  // (messages, mark-read, realtime-config) and on a cold edge worker that
  // can stall for 1-3 seconds. The skeleton matches the real layout exactly.
  if (isInitialLoading) {
    return <MessagingSkeleton />;
  }

  return (
    <div
      className="fixed left-0 right-0 top-0 flex flex-col bg-parallel-cream overflow-hidden z-[60]"
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

      {/* Conversation fade follow-up sheet — 2-step */}
      {fadeStep > 0 && (
        <>
          <div
            className="fixed inset-0 bg-parallel-void/40 z-[75]"
            onClick={() => setFadeStep(0)}
            aria-hidden="true"
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-parallel-cream rounded-t-3xl z-[80] max-h-[80vh] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fade-sheet-title"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
              <h3 id="fade-sheet-title" className="text-base font-semibold">
                {fadeStep === 1 ? 'What felt off?' : 'What would you change?'}
              </h3>
              <button onClick={() => setFadeStep(0)} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {fadeStep === 1 && (
                <div className="flex flex-wrap gap-2">
                  {FADE_REASONS.map(r => (
                    <button
                      key={r.id}
                      onClick={() => toggleFadeReason(r.id)}
                      aria-pressed={fadeSelectedReasons.includes(r.id)}
                      className={fadeChipClass(fadeSelectedReasons.includes(r.id))}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
              {fadeStep === 2 && (
                <div className="flex flex-wrap gap-2">
                  {FADE_ADJUST.map(a => (
                    <button
                      key={a.id}
                      onClick={() => toggleFadeAdjust(a.id)}
                      aria-pressed={fadeSelectedAdjust.includes(a.id)}
                      className={fadeChipClass(fadeSelectedAdjust.includes(a.id))}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex-shrink-0 pb-8 flex gap-2">
              {fadeStep === 1 ? (
                <>
                  <button
                    onClick={() => setFadeStep(2)}
                    className="flex-1 px-4 py-3 rounded-full bg-parallel-void text-parallel-cream font-medium hover:bg-parallel-void/90 transition-all text-sm"
                  >
                    Next
                  </button>
                  <button onClick={() => setFadeStep(0)} className="px-4 py-3 rounded-full text-gray-500 hover:bg-gray-100 transition-all text-sm">
                    Skip
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleFadeSheetSubmit}
                    className="flex-1 px-4 py-3 rounded-full bg-parallel-void text-parallel-cream font-medium hover:bg-parallel-void/90 transition-all text-sm"
                  >
                    Done
                  </button>
                  <button onClick={() => setFadeStep(1)} className="px-4 py-3 rounded-full text-gray-500 hover:bg-gray-100 transition-all text-sm">
                    Back
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Recovery signal sheet — shown after unmatch or 14-day silence */}
      {showRecoverySheet && (
        <RecoverySignalSheet
          matchId={matchId}
          triggerType={recoveryTrigger}
          onClose={() => {
            setShowRecoverySheet(false);
            if (recoveryTrigger === 'unmatch') onBack();
          }}
        />
      )}

      {/* Unmatch Modal */}
      {showUnmatchModal && (
        <div
          className="fixed inset-0 bg-parallel-void/50 z-[100] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="messaging-unmatch-title"
        >
          <div className="bg-parallel-cream rounded-3xl p-6 max-w-sm w-full">
            <h2 id="messaging-unmatch-title" className="text-lg font-semibold mb-2">Unmatch {matchName}?</h2>
            <p className="text-gray-500 mb-6 text-sm leading-relaxed">
              This conversation will end and they'll be removed from your matches. This can't be undone.
            </p>
            <div className="space-y-3">
              <button onClick={handleUnmatch} className="w-full py-3 bg-parallel-purple text-parallel-cream rounded-full font-medium">Unmatch</button>
              <button onClick={() => setShowUnmatchModal(false)} className="w-full py-3 border border-gray-200 rounded-full text-gray-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header - fixed at top */}
      <div className="flex-shrink-0 bg-parallel-cream border-b border-gray-200 px-4 py-3 z-10">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            aria-label="Back to inbox"
            className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>

          {/* Photo + name → open profile if onViewProfile is provided.
              Split into two adjacent buttons so layout doesn't shift. */}
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
                    <span className="text-parallel-cream text-sm font-semibold">{getInitials(matchName)}</span>
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
                    <span className="text-parallel-cream text-sm font-semibold">{getInitials(matchName)}</span>
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
              <div className="w-48 bg-parallel-cream rounded-2xl shadow-xl border border-gray-200 absolute right-0 top-10 z-50 overflow-hidden" role="menu">
                <button
                  onClick={() => { setShowSafetyMenu(false); setShowUnmatchModal(true); }}
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <UserMinus size={16} className="text-gray-500" aria-hidden="true" /><span className="text-sm">Unmatch</span>
                </button>
                {onConfirmMet && !bothConfirmedMet && (
                  <button
                    onClick={() => { setShowSafetyMenu(false); onConfirmMet(matchId, 'kebab'); }}
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
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
        role="log"
        aria-label={`Conversation with ${matchName}`}
        aria-live="polite"
      >
        {/* Conversation starters - more compact.
            Hobby-tailored when we have sharedHobbies, generic light prompts
            otherwise. Always 4 chips so the layout is stable. */}
        {messages.length === 0 && showStarters && mutualMatch && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={11} className="text-gray-500" aria-hidden="true" />
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Conversation starters</span>
            </div>
            <div className="space-y-1.5">
              {getStartersFor(sharedHobbies).map((starter, i) => (
                <button
                  key={i}
                  onClick={() => handleUseStarter(starter)}
                  className="w-full text-left px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-gray-900 hover:bg-parallel-cream transition-all"
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

            if (message.text.startsWith(DATE_CARD_PREFIX)) {
              try {
                const cardData = JSON.parse(message.text.slice(DATE_CARD_PREFIX.length));
                const isMySend = message.senderId === currentUserId;
                return (
                  <div key={message.id} className="px-2 my-2">
                    <DateConfirmCard
                      data={cardData}
                      isMe={isMySend}
                      onCancel={() => {
                        const cancelMsg = `Hey, something came up and I need to cancel our plans at ${cardData.venueName}. So sorry — can we reschedule?`;
                        setNewMessage(cancelMsg);
                        setTimeout(() => textareaRef.current?.focus(), 50);
                      }}
                      onReschedule={() => {
                        const rescheduleMsg = `Hey, I'm so sorry — something came up and I need to reschedule. Can we find another time that works?`;
                        setNewMessage(rescheduleMsg);
                        setTimeout(() => textareaRef.current?.focus(), 50);
                      }}
                    />
                    {isLast && (
                      <p className="text-[10px] text-center text-gray-500 mt-1">{formatTime(message.timestamp)}</p>
                    )}
                  </div>
                );
              } catch { /* fall through to normal bubble */ }
            }

            if (message.text.startsWith(DATE_PROPOSAL_PREFIX)) {
              // Skip older suggestion cards — only the latest renders; earlier ones become invisible
              // (the preceding text message still gives context)
              if (message.id !== lastProposalMsgId) return null;
              try {
                const proposalData = JSON.parse(message.text.slice(DATE_PROPOSAL_PREFIX.length));
                return (
                  <div key={message.id} className="px-2 my-2">
                    <DateProposalCard
                      data={proposalData}
                      isMe={isMe}
                      matchName={matchName}
                      responseData={dateResponseData}
                      onRespond={isMe ? undefined : (slot) => handleSend(`${DATE_RESPONSE_PREFIX}${JSON.stringify(slot)}`)}
                    />
                    {isLast && (
                      <p className="text-[10px] text-center text-gray-500 mt-1">{formatTime(message.timestamp)}</p>
                    )}
                  </div>
                );
              } catch { /* fall through to normal bubble */ }
            }

            if (message.text.startsWith(DATE_RESPONSE_PREFIX)) {
              try {
                const responseData = JSON.parse(message.text.slice(DATE_RESPONSE_PREFIX.length)) as DateResponseData;
                const systemText = isMe
                  ? `You picked ${responseData.label}`
                  : `${matchFirstName} picked ${responseData.label}`;
                return (
                  <div key={message.id} className="py-2 px-4">
                    <p className="text-[11px] text-center text-[#8A8690]">{systemText}</p>
                  </div>
                );
              } catch { /* fall through to normal bubble */ }
            }

            return (
              <div key={message.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${showSenderChange && index > 0 ? 'mt-3' : 'mt-0.5'}`}>
                <div className={`max-w-[80%] ${
                  isMe
                    ? 'bg-parallel-purple text-parallel-cream rounded-[18px] rounded-br-[4px]'
                    : 'bg-gray-100 text-gray-900 rounded-[18px] rounded-bl-[4px]'
                } px-3 py-2`}>
                  <p className="text-sm leading-snug whitespace-pre-line">{renderWithLinks(message.text, isMe)}</p>
                  {isLast && (
                    <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <p className={`text-[10px] ${isMe ? 'text-gray-500' : 'text-gray-500'}`}>{formatTime(message.timestamp)}</p>
                      {isMe && <CheckCheck size={10} className="text-gray-500" aria-label="Sent" />}
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
        className="flex-shrink-0 bg-parallel-cream border-t border-gray-200 px-3 py-2"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        {/* Recipient banner — shown when match proposed a date and we haven't responded */}
        {showResponseBanner && (
          <DateResponseBanner
            proposalSlots={pendingProposalSlots}
            matchName={matchName}
            recentMessages={messages.slice(-10).map(m => m.text)}
            onAccept={(slot) => handleSend(`${DATE_RESPONSE_PREFIX}${JSON.stringify(slot)}`)}
            onDeclineMessage={(msg) => { setNewMessage(msg); setTimeout(() => textareaRef.current?.focus(), 50); }}
            onProposeNewTimes={() => datePlannerRef.current?.open()}
          />
        )}

        {/* "Both online now" nudge — shown when match is active and no date planned */}
        {showBothOnlineNudge && (
          <div className="mb-2 rounded-2xl border border-[#E2D5F5] bg-[#F8F4FD] px-4 py-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-[#7B5EA7] font-medium">You're both here — plan a date?</p>
            <button
              onClick={() => datePlannerRef.current?.open()}
              className="flex-shrink-0 text-[11px] font-semibold text-[#F5F2EE] bg-[#7B5EA7] px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity"
            >
              Plan it →
            </button>
          </div>
        )}

        {/* Date planner — pick times + venue + calendar in one flow, flag-gated */}
        <DatePlannerCard
          ref={datePlannerRef}
          matchId={matchId}
          matchName={matchName}
          messageCount={messages.length}
          mutualMatch={!!mutualMatch}
          flagEnabled={!!featureDateAgent}
          recentMessages={messages.slice(-20).map(m => m.text)}
          dateResponseText={dateResponseMsg?.text}
          onSelectMessage={(msg) => setNewMessage(msg)}
          onSendMessage={(msg) => handleSend(msg)}
        />

        {/* AI conversation un-sticker — shown after 48h silence, flag-gated */}
        <ConversationUnsticker
          matchId={matchId}
          lastMessageAt={messages.length > 0 ? messages[messages.length - 1].timestamp : null}
          flagEnabled={featureUnsticker}
          onUseStarter={(text) => setNewMessage(text)}
        />

        {/* 5–14-day chat outcome chip */}
        {showChatOutcomeChip && (
          <div className="mb-2 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 bg-[#F5F2EE] border border-[#E8E4DE]">
            <p className="text-xs text-[#1E1C22] flex-1 leading-snug">How did this conversation go?</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleChatOutcomeStillInTouch}
                className="rounded-full px-3 py-1.5 text-xs font-medium bg-white border border-[#E8E4DE] text-[#0D0D0F] hover:bg-gray-50 transition-colors"
              >
                Still in touch
              </button>
              <button
                onClick={handleChatOutcomeRanCourse}
                className="rounded-full px-3 py-1.5 text-xs font-medium bg-[#0D0D0F] text-[#F5F2EE] hover:opacity-80 transition-opacity"
              >
                It ran its course
              </button>
            </div>
          </div>
        )}

        {/* 72h conversation fade nudge — hidden if a higher-priority prompt is active */}
        {showFadeNudge && !showChatOutcomeChip && !showRecoverySheet && (
          <div className="mb-2 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 bg-gray-50 border border-gray-200">
            <p className="text-xs text-gray-700 flex-1">
              <span className="font-medium">This conversation went quiet.</span>{' '}
              <span className="text-gray-500">How did it go?</span>
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setFadeStep(1)}
                className="rounded-full px-3 py-1.5 text-xs font-medium bg-parallel-void text-parallel-cream hover:opacity-80 transition-opacity"
              >
                Tell us
              </button>
              <button onClick={dismissFadeNudge} aria-label="Dismiss" className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ── "Did you meet up?" banner ─────────────────────────────────
            Only rendered when the backend signals eligibility — gated on
            real conversation signals (contact-share, quiet after engagement,
            sustained chemistry, etc.). Never fires on message count alone.
            Both the banner and the kebab "We Met in Person" route through
            /messages/met-banner-action so they share one source of truth. */}
        {metBannerEligibility?.eligible && !metBannerHidden && !hasConfirmedMet && !bothConfirmedMet && (
          <div className="mb-2 rounded-2xl px-4 py-3"
            style={{ background: '#EEEDFE', border: '0.5px solid #A98FD0' }}>
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <p className="text-xs leading-snug flex-1" style={{ color: '#3C3489' }}>
                <span className="font-medium">
                  {metBannerEligibility.reason === 'moved-offline-detected'
                    ? "Looks like you two might be chatting elsewhere — did you meet up?"
                    : "Did you meet up?"}
                </span>{' '}
                <span style={{ color: '#534AB7' }}>Let us know how it went — it helps us improve your matches.</span>
              </p>
              <button
                onClick={() => handleMetBannerAction('dismissed')}
                aria-label="Dismiss"
                className="p-0.5 hover:bg-white/50 rounded-full transition-colors flex-shrink-0 mt-0.5"
              >
                <X className="w-3.5 h-3.5" style={{ color: '#534AB7' }} aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { onConfirmMet?.(matchId, 'banner'); setMetBannerHidden(true); }}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: '#7B5EA7', color: '#F5F2EE' }}
              >
                We met ✓
              </button>
              <button
                onClick={() => handleMetBannerAction('not-yet')}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors border hover:bg-white/40"
                style={{ color: '#3C3489', borderColor: '#A98FD0', background: 'transparent' }}
              >
                Not yet
              </button>
            </div>
          </div>
        )}

        {/* Waiting state — I confirmed, waiting for them */}
        {onConfirmMet && !bothConfirmedMet && hasConfirmedMet && (
          <div className="mb-2 rounded-2xl px-4 py-2.5 flex items-center gap-2"
            style={{ background: '#F5F5F0', border: '0.5px solid #E8E4DE' }}>
            <p className="text-xs" style={{ color: '#8A8690' }}>
              You confirmed you met. Waiting for them to confirm too.
            </p>
          </div>
        )}

        {onOpenDateReview && bothConfirmedMet && (
          <div className="mb-2">
            <button
              onClick={() => onOpenDateReview(matchId)}
              className="w-full flex items-center justify-center gap-2 bg-parallel-purple text-parallel-cream px-5 py-2.5 rounded-full text-sm font-medium"
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
          {/* Schedule-a-date icon — always available when feature is on */}
          {featureDateAgent && (
            <button
              onClick={() => datePlannerRef.current?.open()}
              className="flex-shrink-0 p-2 text-[#C0BAC8] hover:text-[#7B5EA7] transition-colors"
              aria-label="Schedule a date"
            >
              <CalendarClock size={18} aria-hidden="true" />
            </button>
          )}
          <div className={`flex-1 rounded-full border px-3.5 py-2 transition-colors ${
            messagingDisabled
              ? 'bg-gray-100 border-gray-200 opacity-60'
              : 'bg-gray-50 border-gray-200 focus-within:bg-parallel-cream focus-within:border-gray-300'
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
            onTouchEnd={(e) => {
              e.preventDefault();
              const domText = textareaRef.current?.value?.trim() ?? '';
              if (!domText || messagingDisabled) return;
              void handleSend();
            }}
            onClick={handleSend}
            disabled={!newMessage.trim() || messagingDisabled}
            aria-label="Send message"
            className="bg-parallel-purple text-parallel-cream p-2.5 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 active:scale-95"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
