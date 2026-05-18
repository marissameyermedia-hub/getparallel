import { useState } from 'react';
import { CalendarDays, Clock, RefreshCw } from 'lucide-react';
import { DATE_AGENT_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';
import type { ProposalSlot, DateResponseData } from './DateProposalCard';

interface DateResponseBannerProps {
  proposalSlots: ProposalSlot[];
  matchName: string;
  recentMessages: string[];
  onAccept: (slot: DateResponseData) => void;
  onDeclineMessage: (message: string) => void;
  onProposeNewTimes: () => void;
}

type State = 'idle' | 'loading-decline' | 'declining';

const STATIC_DECLINES = [
  "I appreciate you asking! I'm not quite ready to meet just yet — can we keep chatting a bit more first?",
  "The timing isn't perfect for me right now — maybe another week or two?",
  "I'd love to eventually, but let's keep getting to know each other a little longer first.",
];

export function DateResponseBanner({
  proposalSlots,
  matchName,
  recentMessages,
  onAccept,
  onDeclineMessage,
  onProposeNewTimes,
}: DateResponseBannerProps) {
  const [state, setState] = useState<State>('idle');
  const [declineOptions, setDeclineOptions] = useState<string[]>([]);
  const matchFirstName = matchName.trim().split(/\s+/)[0] ?? 'them';
  const firstSlot = proposalSlots[0];

  const handleNotQuite = async () => {
    setState('loading-decline');
    try {
      const token = await getAccessToken();
      if (token) {
        const res = await fetch(`${DATE_AGENT_FUNCTION_URL}/decline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
          body: JSON.stringify({ messages: recentMessages.slice(-10), matchName }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.options) && data.options.length >= 2) {
            setDeclineOptions(data.options.slice(0, 3));
            setState('declining');
            return;
          }
        }
      }
    } catch { /* fall through to static */ }
    setDeclineOptions(STATIC_DECLINES);
    setState('declining');
  };

  if (state === 'loading-decline') {
    return (
      <div className="mb-2 rounded-2xl border border-[#E2D5F5] bg-[#F8F4FD] px-4 py-3 flex items-center justify-center gap-2">
        <RefreshCw size={12} className="animate-spin text-[#7B5EA7]" aria-hidden="true" />
        <span className="text-[11px] text-[#7B5EA7]">Thinking of a kind response…</span>
      </div>
    );
  }

  if (state === 'declining') {
    return (
      <div className="mb-2 rounded-2xl border border-[#E2D5F5] bg-[#F8F4FD] px-4 py-3">
        <p className="text-[11px] font-medium text-[#7B5EA7] mb-2">Choose a response to send</p>
        <div className="space-y-1.5 mb-2.5">
          {declineOptions.map((option, i) => (
            <button
              key={i}
              onClick={() => onDeclineMessage(option)}
              className="w-full text-left text-[12px] text-[#1E1C22] bg-white border border-[#E2D5F5] rounded-xl px-3 py-2 hover:bg-[#F8F4FD] transition-colors leading-snug"
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onProposeNewTimes}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-[#E2D5F5] text-[#7B5EA7] text-[11px] font-medium rounded-full hover:bg-[#EDE8F8] transition-colors"
          >
            <Clock size={11} aria-hidden="true" />
            Suggest new times
          </button>
          <button
            onClick={() => setState('idle')}
            className="px-4 py-2 text-[#8A8690] text-[11px] rounded-full hover:bg-gray-100 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // idle state
  return (
    <div className="mb-2 rounded-2xl border border-[#E2D5F5] bg-[#F8F4FD] px-4 py-3">
      <p className="text-[11px] font-medium text-[#7B5EA7] mb-2.5">
        {matchFirstName} proposed a date — you in?
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => firstSlot && onAccept({
            label: firstSlot.label,
            shortLabel: firstSlot.shortLabel,
            dateIso: firstSlot.dateIso,
            period: firstSlot.period,
          })}
          disabled={!firstSlot}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#7B5EA7] text-white text-xs font-semibold rounded-full hover:bg-[#7B5EA7]/90 transition-colors disabled:opacity-40"
        >
          <CalendarDays size={12} aria-hidden="true" />
          Yes, I'm in!
        </button>
        <button
          onClick={handleNotQuite}
          className="flex-1 flex items-center justify-center py-2.5 border border-[#E2D5F5] text-[#7B5EA7] text-xs font-medium rounded-full hover:bg-[#EDE8F8] transition-colors"
        >
          Not quite →
        </button>
      </div>
    </div>
  );
}
