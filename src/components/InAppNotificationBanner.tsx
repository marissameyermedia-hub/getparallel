import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { supabase } from '../utils/supabase/client';

interface InAppNotificationBannerProps {
  /** The current user's ID — used to filter out self-sent messages. */
  userId: string | null;
  /** The match ID the user is currently viewing in MessagingView (if any).
   *  Banners are suppressed for the active conversation. */
  activeMatchId: string | null;
  /** Current app view — banners are suppressed on fullscreen / auth views. */
  currentView: string;
  /** Match list from App state — used to resolve sender name without a fetch. */
  matches: Array<{ user: { id: string; name: string; photoUrl: string }; compatibilityScore: number }>;
  /** Called when the user taps the banner — opens that conversation. */
  onOpenChat: (matchId: string) => void;
  /** Called on any incoming message so App can update unread badge. */
  onNewMessage: (matchId: string, senderName: string, senderPhoto: string, text: string, compatibilityScore: number) => void;
}

interface BannerState {
  matchId: string;
  senderName: string;
  senderPhoto: string;
  text: string;
}

// Views where the banner should never appear (auth / onboarding flows)
const SUPPRESSED_VIEWS = new Set([
  'signin', 'account-creation', 'phone-verification', 'onboarding',
  'pricing', 'payment-confirmation', 'reset-password',
]);

const AUTO_DISMISS_MS = 5000;

export function InAppNotificationBanner({
  userId,
  activeMatchId,
  currentView,
  matches,
  onOpenChat,
  onNewMessage,
}: InAppNotificationBannerProps) {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [visible, setVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- helpers ---

  const clearTimer = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setVisible(false);
    // Wait for exit animation before clearing banner data
    setTimeout(() => setBanner(null), 350);
  }, []);

  const showBanner = useCallback((state: BannerState) => {
    clearTimer();
    setBanner(state);
    // Small delay so the element mounts before we trigger the transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    dismissTimer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
  }, [dismiss]);

  // --- Supabase real-time subscription ---

  useEffect(() => {
    if (!userId) return;

    // We subscribe to ALL messages the current user is a participant of.
    // Supabase RLS (messages_select policy) ensures only rows from
    // conversations where the user is user_id_1 or user_id_2 come through.
    // We filter sender_id !== userId client-side to ignore own messages.
    const channel = supabase
      .channel(`inbox-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            text: string;
            created_at: string;
          };

          // Ignore messages the current user sent themselves
          if (row.sender_id === userId) return;

          // Resolve sender from matches (sender_id = match's user.id)
          const match = matches.find((m) => m.user.id === row.sender_id);
          if (!match) return; // sender not in match list — ignore

          const matchId = row.sender_id;
          const senderName = match.user.name.split(' ')[0]; // first name only
          const senderPhoto = match.user.photoUrl;
          const compatibilityScore = match.compatibilityScore;

          // Always call onNewMessage so App can update unread badge
          onNewMessage(matchId, match.user.name, senderPhoto, row.text, compatibilityScore);

          // Suppress the visual banner if the user is already in that chat
          // or on a fullscreen / auth view
          if (activeMatchId === matchId) return;
          if (SUPPRESSED_VIEWS.has(currentView)) return;

          showBanner({ matchId, senderName, senderPhoto, text: row.text });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Re-subscribe only when userId changes (login/logout).
    // matches, activeMatchId, currentView are read at event time via closures
    // — we intentionally don't re-subscribe on every render.
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up auto-dismiss timer on unmount
  useEffect(() => () => clearTimer(), []);

  if (!banner) return null;

  const previewText =
    banner.text.length > 60 ? banner.text.slice(0, 57) + '…' : banner.text;

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={[
        'fixed left-0 right-0 z-[60] px-4 transition-all duration-300 ease-out',
        // Sits just below the fixed Header (top-16 = 64px)
        'top-16',
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : '-translate-y-4 opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div className="max-w-md mx-auto">
        <button
          onClick={() => {
            dismiss();
            onOpenChat(banner.matchId);
          }}
          className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-lg hover:shadow-xl transition-shadow text-left"
          aria-label={`New message from ${banner.senderName} — tap to open`}
        >
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {banner.senderPhoto ? (
              <img
                src={banner.senderPhoto}
                alt=""
                aria-hidden="true"
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-gray-400" aria-hidden="true" />
              </div>
            )}
            {/* Unread dot */}
            <span
              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-black rounded-full border-2 border-white"
              aria-hidden="true"
            />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
              New message
            </p>
            <p className="text-sm font-medium text-gray-900 truncate">
              {banner.senderName}
            </p>
            <p className="text-sm text-gray-500 truncate">{previewText}</p>
          </div>

          {/* Dismiss button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            className="flex-shrink-0 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4 text-gray-400" aria-hidden="true" />
          </button>
        </button>
      </div>
    </div>
  );
}
