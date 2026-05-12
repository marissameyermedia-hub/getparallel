import { useState } from 'react';
import { Sparkles, X, Loader } from 'lucide-react';
import { MESSAGES_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';

interface Props {
  matchId: string;
  /** Timestamp of the last message in the thread. Null = empty conversation (don't show). */
  lastMessageAt: Date | string | null;
  /** Whether feature_unsticker_enabled flag is on. If false, renders nothing. */
  flagEnabled: boolean;
  /** Called when the user taps a starter to use it — fills the message input. */
  onUseStarter: (text: string) => void;
}

type State = 'idle' | 'loading' | 'revealed' | 'dismissed';

const SILENCE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

function isSilent(lastMessageAt: Date | string | null): boolean {
  if (!lastMessageAt) return false;
  const ts = lastMessageAt instanceof Date ? lastMessageAt.getTime() : new Date(lastMessageAt).getTime();
  return Date.now() - ts >= SILENCE_THRESHOLD_MS;
}

export function ConversationUnsticker({ matchId, lastMessageAt, flagEnabled, onUseStarter }: Props) {
  const [state, setState] = useState<State>('idle');
  const [starterText, setStarterText] = useState('');

  // Don't render if: flag off, no messages, or not silent yet
  if (!flagEnabled || !isSilent(lastMessageAt) || state === 'dismissed') return null;

  const handleShowMe = async () => {
    if (state !== 'idle') return;
    setState('loading');
    try {
      const token = await getAccessToken();
      if (!token) { setState('idle'); return; }

      const res = await fetch(`${MESSAGES_FUNCTION_URL}/unsticker?matchId=${encodeURIComponent(matchId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: publicAnonKey,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.starter) {
          setStarterText(data.starter);
          setState('revealed');
          return;
        }
      }
    } catch {
      // fall through to dismiss silently
    }
    // On any failure — hide the chip so it doesn't feel broken
    setState('dismissed');
  };

  return (
    <div className="mb-2 rounded-2xl border border-[#E8E4DE] bg-[#F5F2EE] px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <Sparkles size={13} className="text-[#7B5EA7]" aria-hidden="true" />
          <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Conversation starter</span>
        </div>
        <button
          onClick={() => setState('dismissed')}
          className="p-0.5 hover:bg-black/5 rounded-full transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X size={13} className="text-[#8A8690]" aria-hidden="true" />
        </button>
      </div>

      {state === 'idle' && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-[#8A8690] leading-snug">
            This conversation has been quiet for a bit.
          </p>
          <button
            onClick={handleShowMe}
            className="flex-shrink-0 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity"
          >
            Show me
          </button>
        </div>
      )}

      {state === 'loading' && (
        <div className="mt-2 flex items-center gap-2">
          <Loader size={13} className="text-[#7B5EA7] animate-spin flex-shrink-0" aria-hidden="true" />
          <span className="text-xs text-[#8A8690]">Finding something good…</span>
        </div>
      )}

      {state === 'revealed' && starterText && (
        <button
          onClick={() => { onUseStarter(starterText); setState('dismissed'); }}
          className="mt-2 w-full text-left text-sm text-[#1E1C22] leading-snug hover:text-[#7B5EA7] transition-colors"
          aria-label={`Use starter: ${starterText}`}
        >
          "{starterText}"
          <span className="block text-[10px] text-[#8A8690] mt-1">Tap to use</span>
        </button>
      )}
    </div>
  );
}
