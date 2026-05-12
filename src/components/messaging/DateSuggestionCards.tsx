import { useState } from 'react';
import { CalendarDays, Loader, X, Star, MapPin, ExternalLink } from 'lucide-react';
import { DATE_AGENT_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';

interface DateCard {
  name: string;
  category: string;
  priceLevel: string;
  rating: number | null;
  address: string;
  mapsUrl: string;
  whyItFits: string;
  suggestionMessage?: string;
}

interface Props {
  matchId: string;
  /** Total messages in the conversation — button only appears when ≥5. */
  messageCount: number;
  /** Whether the conversation is a confirmed mutual match. */
  mutualMatch: boolean;
  /** Whether feature_date_agent_enabled flag is on. */
  flagEnabled: boolean;
  /** Called when the user taps a venue card — receives a ready-to-send message draft. */
  onSelectVenue?: (message: string) => void;
}

type Panel = 'trigger' | 'loading' | 'cards' | 'dismissed';

export function DateSuggestionCards({ matchId, messageCount, mutualMatch, flagEnabled, onSelectVenue }: Props) {
  const [panel, setPanel] = useState<Panel>('trigger');
  const [cards, setCards] = useState<DateCard[]>([]);
  if (!flagEnabled || !mutualMatch || messageCount < 5 || panel === 'dismissed') return null;

  const handleGenerate = async () => {
    setPanel('loading');
    try {
      const token = await getAccessToken();
      if (!token) { setPanel('trigger'); return; }

      const res = await fetch(
        `${DATE_AGENT_FUNCTION_URL}/generate?matchId=${encodeURIComponent(matchId)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey },
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setCards(data.suggestions);
          setPanel('cards');
          return;
        }
      }
    } catch {
      // fall through — reset to trigger so the user can retry
    }
    setPanel('trigger');
  };

  const handleSelectCard = (card: DateCard) => {
    const msg = card.suggestionMessage ||
      `${card.name} looks like a good spot for us${card.address ? ' on ' + card.address.split(',')[0] : ''}. Worth checking out?`;
    onSelectVenue?.(msg);
    setPanel('dismissed');
  };

  if (panel === 'trigger') {
    return (
      <div className="mb-2 flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border border-[#E8E4DE] bg-[#F5F2EE]">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays size={14} className="text-[#7B5EA7] flex-shrink-0" aria-hidden="true" />
          <p className="text-xs text-[#1E1C22] leading-snug">Want date ideas near you both?</p>
        </div>
        <button
          onClick={handleGenerate}
          className="flex-shrink-0 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity"
        >
          Get ideas
        </button>
      </div>
    );
  }

  if (panel === 'loading') {
    return (
      <div className="mb-2 flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-[#E8E4DE] bg-[#F5F2EE]">
        <Loader size={13} className="text-[#7B5EA7] animate-spin flex-shrink-0" aria-hidden="true" />
        <span className="text-xs text-[#8A8690]">Finding spots near you both…</span>
      </div>
    );
  }

  // panel === 'cards'
  return (
    <div className="mb-2 rounded-2xl border border-[#E8E4DE] bg-[#F5F2EE] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <CalendarDays size={13} className="text-[#7B5EA7]" aria-hidden="true" />
          <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Date ideas</span>
        </div>
        <button
          onClick={() => setPanel('dismissed')}
          className="p-0.5 hover:bg-black/5 rounded-full transition-colors"
          aria-label="Dismiss date ideas"
        >
          <X size={13} className="text-[#8A8690]" aria-hidden="true" />
        </button>
      </div>
      <p className="px-4 pb-2 text-[10px] text-[#8A8690]">Tap a spot to draft a message</p>

      {/* Cards */}
      <div className="px-3 pb-3 space-y-2">
        {cards.map((card, i) => (
          <button
            key={i}
            onClick={() => handleSelectCard(card)}
            className="w-full text-left bg-white rounded-xl px-3.5 py-3 border border-[#E8E4DE] active:bg-gray-50 transition-colors"
            aria-label={`Draft a message about ${card.name}`}
          >
            {/* Venue name + meta + Maps link */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1E1C22] leading-tight">{card.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-[#8A8690]">{card.category}</span>
                  <span className="text-[#E8E4DE]">·</span>
                  <span className="text-[11px] text-[#8A8690]">{card.priceLevel}</span>
                  {card.rating !== null && (
                    <>
                      <span className="text-[#E8E4DE]">·</span>
                      <span className="flex items-center gap-0.5 text-[11px] text-[#8A8690]">
                        <Star size={9} className="fill-[#8A8690] text-[#8A8690]" aria-hidden="true" />
                        {card.rating}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* Maps link — stops propagation so it doesn't trigger card select */}
              {card.mapsUrl && (
                <a
                  href={card.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 flex items-center gap-1 text-[11px] font-medium text-[#7B5EA7] hover:opacity-70 transition-opacity mt-0.5"
                  aria-label={`Open ${card.name} in Maps`}
                >
                  <ExternalLink size={11} aria-hidden="true" />
                  Maps
                </a>
              )}
            </div>

            {/* Address */}
            {card.address && (
              <div className="flex items-start gap-1 mb-1.5">
                <MapPin size={10} className="text-[#8A8690] mt-0.5 flex-shrink-0" aria-hidden="true" />
                <p className="text-[11px] text-[#8A8690] leading-snug line-clamp-1">{card.address}</p>
              </div>
            )}

            {/* Why it fits */}
            {card.whyItFits && (
              <p className="text-xs text-[#2E2A36] leading-relaxed">{card.whyItFits}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
