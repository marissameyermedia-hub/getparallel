import { useState } from 'react';
import { CalendarDays, Loader, X, Star, MapPin, ExternalLink, RefreshCw } from 'lucide-react';
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
  areaKey?: 'you' | 'them' | 'middle';
  photoUrl?: string;
  atmosphereTags?: string[];
}

interface AreaInfo {
  key: 'you' | 'them' | 'middle';
  tagline: string;
}

interface Props {
  matchId: string;
  messageCount: number;
  mutualMatch: boolean;
  flagEnabled: boolean;
  onSelectVenue?: (message: string) => void;
}

type Panel = 'trigger' | 'loading' | 'cards' | 'dismissed';
type Budget = 'any' | '$' | '$$' | '$$$';

const AREA_LABELS: Record<string, string> = {
  you: 'Near you',
  them: 'Near them',
  middle: 'Meet in the middle',
};

export function DateSuggestionCards({ matchId, messageCount, mutualMatch, flagEnabled, onSelectVenue }: Props) {
  const [panel, setPanel] = useState<Panel>('trigger');
  const [cards, setCards] = useState<DateCard[]>([]);
  const [areas, setAreas] = useState<AreaInfo[]>([]);
  const [budget, setBudget] = useState<Budget>('any');
  const [selectedArea, setSelectedArea] = useState<'you' | 'them' | 'middle'>('you');
  const [selectedCategory, setSelectedCategory] = useState('All');

  if (!flagEnabled || !mutualMatch || messageCount < 5 || panel === 'dismissed') return null;

  const handleGenerate = async (force = false) => {
    setPanel('loading');
    try {
      const token = await getAccessToken();
      if (!token) { setPanel('trigger'); return; }

      const params = new URLSearchParams({ matchId });
      if (budget !== 'any') params.set('maxPrice', budget);
      if (force) params.set('force', 'true');

      const res = await fetch(
        `${DATE_AGENT_FUNCTION_URL}/generate?${params}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey },
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setCards(data.suggestions);
          const loadedAreas: AreaInfo[] = data.areas ?? [];
          setAreas(loadedAreas);
          setSelectedArea(loadedAreas[0]?.key ?? 'you');
          setSelectedCategory('All');
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
    const raw = card.suggestionMessage ||
      `${card.name} looks like a good spot for us. Worth checking out?`;
    // Strip any trailing Maps URL — clean compose box, share location after she says yes
    const msg = raw.replace(/\nhttps?:\/\/\S+/g, '').trim();
    onSelectVenue?.(msg);
    setPanel('dismissed');
  };

  if (panel === 'trigger') {
    return (
      <div className="mb-2 rounded-2xl border border-[#E8E4DE] bg-[#F5F2EE] px-4 py-3">
        <div className="flex items-center gap-2 mb-2.5">
          <CalendarDays size={14} className="text-[#7B5EA7] flex-shrink-0" aria-hidden="true" />
          <p className="text-xs text-[#1E1C22] leading-snug">Want date ideas near you both?</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {(['any', '$', '$$', '$$$'] as Budget[]).map(level => (
              <button
                key={level}
                onClick={() => setBudget(level)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  budget === level
                    ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                    : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
                }`}
              >
                {level === 'any' ? 'Any' : level}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleGenerate()}
            className="flex-shrink-0 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity"
          >
            Get ideas
          </button>
        </div>
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
  const showLocationSection = areas.length > 1;
  const areaCards = showLocationSection
    ? cards.filter(c => (c.areaKey ?? 'you') === selectedArea)
    : cards;

  const uniqueCategories = [...new Set(areaCards.map(c => c.category))];

  const getDisplayCards = (): DateCard[] => {
    const pool = selectedCategory === 'All'
      ? areaCards
      : areaCards.filter(c => c.category === selectedCategory);

    if (selectedCategory === 'All') {
      // Best one per category, up to 3
      const seen = new Set<string>();
      const result: DateCard[] = [];
      for (const card of pool) {
        if (result.length >= 3) break;
        if (!seen.has(card.category)) {
          seen.add(card.category);
          result.push(card);
        }
      }
      return result;
    }
    return pool.slice(0, 3);
  };

  const displayCards = getDisplayCards();

  return (
    <div className="mb-2 rounded-2xl border border-[#E8E4DE] bg-[#F5F2EE] overflow-x-hidden overflow-y-auto max-h-[72vh]">
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

      {/* Location radio list — only when users are in different cities */}
      {showLocationSection && (
        <div className="px-4 pb-3 space-y-1.5">
          {areas.map(area => {
            const isSelected = selectedArea === area.key;
            return (
              <button
                key={area.key}
                onClick={() => { setSelectedArea(area.key); setSelectedCategory('All'); }}
                className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl border transition-colors ${
                  isSelected
                    ? 'border-[#7B5EA7] bg-[#7B5EA7]/[0.06]'
                    : 'border-[#E8E4DE] bg-white hover:border-[#7B5EA7]/40'
                }`}
              >
                <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  isSelected ? 'border-[#7B5EA7]' : 'border-[#C0BAC8]'
                }`}>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#7B5EA7]" />}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold leading-tight ${isSelected ? 'text-[#1E1C22]' : 'text-[#8A8690]'}`}>
                    {AREA_LABELS[area.key]}
                  </p>
                  <p className="text-[10px] text-[#8A8690] leading-snug mt-0.5">{area.tagline}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Category chips */}
      {uniqueCategories.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 pb-2 flex-wrap">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-colors ${
              selectedCategory === 'All'
                ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
            }`}
          >
            All
          </button>
          {uniqueCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                  : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      <div className="px-3 pb-2 space-y-2">
        {displayCards.map((card, i) => (
          <button
            key={i}
            onClick={() => handleSelectCard(card)}
            className="w-full text-left bg-white rounded-xl overflow-hidden border border-[#E8E4DE] active:bg-gray-50 transition-colors"
            aria-label={`Draft a message about ${card.name}`}
          >
            {/* Photo */}
            {card.photoUrl && (
              <div className="w-full h-28 bg-[#E8E4DE] overflow-hidden">
                <img
                  src={card.photoUrl}
                  alt={card.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const el = e.currentTarget.parentElement;
                    if (el) el.style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="px-3.5 py-3">
              <div className="flex items-start justify-between gap-2 mb-1">
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

              {card.address && (
                <div className="flex items-start gap-1 mb-1.5">
                  <MapPin size={10} className="text-[#8A8690] mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <p className="text-[11px] text-[#8A8690] leading-snug line-clamp-1">{card.address}</p>
                </div>
              )}

              {/* Atmosphere tags */}
              {card.atmosphereTags && card.atmosphereTags.length > 0 && (
                <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                  {card.atmosphereTags.map((tag, ti) => (
                    <span
                      key={ti}
                      className="text-[10px] text-[#7B5EA7] bg-[#7B5EA7]/[0.08] px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {card.whyItFits && (
                <p className="text-xs text-[#2E2A36] leading-relaxed">{card.whyItFits}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Refresh */}
      <div className="px-4 pb-3 pt-1 flex justify-center">
        <button
          onClick={() => handleGenerate(true)}
          className="flex items-center gap-1.5 text-[11px] text-[#8A8690] hover:text-[#7B5EA7] transition-colors"
        >
          <RefreshCw size={11} aria-hidden="true" />
          Try different spots
        </button>
      </div>
    </div>
  );
}
