import { useState } from 'react';
import { CalendarClock, X, ChevronRight, Loader, Star, RefreshCw, CalendarPlus } from 'lucide-react';
import { DATE_AGENT_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimeSlot {
  date: Date;
  period: 'morning' | 'afternoon' | 'evening';
  label: string;       // "Saturday afternoon"
  shortLabel: string;  // "Sat afternoon"
}

interface VenueCard {
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
}

interface AreaInfo {
  key: 'you' | 'them' | 'middle';
  tagline: string;
}

type Panel = 'trigger' | 'times' | 'loading' | 'venues' | 'confirm' | 'calendar' | 'dismissed';
type Budget = 'any' | '$' | '$$' | '$$$';

interface Props {
  matchId: string;
  messageCount: number;
  mutualMatch: boolean;
  flagEnabled: boolean;
  onSelectMessage: (msg: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERIODS = ['morning', 'afternoon', 'evening'] as const;
const PERIOD_LABELS: Record<typeof PERIODS[number], string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};
const AREA_LABELS: Record<string, string> = {
  you: 'Near you',
  them: 'Near them',
  middle: 'In the middle',
};

function getUpcomingDays(count = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const short = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const full = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : full[d.getDay()];
    const shortLabel = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : short[d.getDay()];
    return { date: d, label, shortLabel };
  });
}

function slotKey(dayLabel: string, period: string) {
  return `${dayLabel}::${period}`;
}

function buildPlanMessage(venue: VenueCard, slots: TimeSlot[]): string {
  const timePart = slots.length >= 2
    ? `I'm free ${slots[0].label} or ${slots[1].label}`
    : slots.length === 1
    ? `I'm free ${slots[0].label}`
    : '';
  const mapsPart = venue.mapsUrl ? `\n${venue.mapsUrl}` : '';
  if (!timePart) return `${venue.name} could be a great spot for us. Worth checking out?${mapsPart}`;
  return `${venue.name} could be a fun spot for us — ${timePart}. Which works better for you?${mapsPart}`;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function slotToRange(slot: TimeSlot) {
  const d = new Date(slot.date);
  const startHour = { morning: 10, afternoon: 14, evening: 19 }[slot.period];
  const duration = { morning: 2, afternoon: 2, evening: 3 }[slot.period];
  d.setHours(startHour, 0, 0, 0);
  const end = new Date(d);
  end.setHours(startHour + duration);
  return { start: d, end };
}

function toGcalDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function openCalendar(venue: VenueCard, slot: TimeSlot) {
  const { start, end } = slotToRange(slot);
  const isApple = /iphone|ipad|macintosh/i.test(navigator.userAgent);
  if (isApple) {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Parallel//EN',
      'BEGIN:VEVENT',
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      `SUMMARY:Date at ${venue.name}`,
      `LOCATION:${venue.address || venue.name}`,
      venue.mapsUrl ? `DESCRIPTION:${venue.mapsUrl}` : '',
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'date.ics'; a.click();
    URL.revokeObjectURL(url);
  } else {
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: `Date at ${venue.name}`,
      dates: `${toGcalDate(start)}/${toGcalDate(end)}`,
      location: venue.address || venue.name,
      details: venue.mapsUrl || '',
    });
    window.open(`https://calendar.google.com/calendar/render?${p}`, '_blank', 'noopener');
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DatePlannerCard({ matchId, messageCount, mutualMatch, flagEnabled, onSelectMessage }: Props) {
  const [panel, setPanel] = useState<Panel>('trigger');
  const [budget, setBudget] = useState<Budget>('any');
  const [activeDay, setActiveDay] = useState<ReturnType<typeof getUpcomingDays>[0] | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [venues, setVenues] = useState<VenueCard[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueCard | null>(null);
  const [message, setMessage] = useState('');
  const [calendarSlot, setCalendarSlot] = useState<TimeSlot | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  if (!flagEnabled || !mutualMatch || messageCount < 10 || panel === 'dismissed') return null;

  const days = getUpcomingDays(7);

  // ── Slot helpers ─────────────────────────────────────────────────────────────

  const hasSlot = (dayLabel: string, period: string) =>
    slots.some(s => slotKey(s.label.split(' ')[0] === 'Today' ? 'Today'
      : s.label.split(' ')[0] === 'Tomorrow' ? 'Tomorrow'
      : s.label.split(' ')[0], s.period) === slotKey(dayLabel, period));

  const toggleSlot = (day: ReturnType<typeof getUpcomingDays>[0], period: typeof PERIODS[number]) => {
    const lbl = `${day.label} ${period}`;
    const shortLbl = `${day.shortLabel} ${PERIOD_LABELS[period].toLowerCase()}`;
    const exists = slots.some(s => s.label === lbl);
    if (exists) {
      setSlots(prev => prev.filter(s => s.label !== lbl));
    } else if (slots.length < 2) {
      setSlots(prev => [...prev, { date: day.date, period, label: lbl, shortLabel: shortLbl }]);
    }
  };

  const isSlotSelected = (day: ReturnType<typeof getUpcomingDays>[0], period: typeof PERIODS[number]) =>
    slots.some(s => s.label === `${day.label} ${period}`);

  // ── Fetch venues ─────────────────────────────────────────────────────────────

  const fetchVenues = async (force = false) => {
    setPanel('loading');
    try {
      const token = await getAccessToken();
      if (!token) { setPanel('times'); return; }

      const skip = force ? (refreshCount + 1) * 3 : 0;
      const params = new URLSearchParams({ matchId, force: 'true' });
      if (budget !== 'any') params.set('maxPrice', budget);
      if (slots[0]?.period) params.set('timeOfDay', slots[0].period);
      if (skip > 0) params.set('skip', String(skip % 18));

      const res = await fetch(`${DATE_AGENT_FUNCTION_URL}/generate?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          // Show top 3 across all areas (deduplicated)
          const seen = new Set<string>();
          const top: VenueCard[] = [];
          for (const v of data.suggestions) {
            if (!seen.has(v.name) && top.length < 3) {
              seen.add(v.name);
              top.push(v);
            }
          }
          setVenues(top);
          if (force) setRefreshCount(c => c + 1);
          setPanel('venues');
          return;
        }
      }
    } catch { /* fall through */ }
    setPanel('times');
  };

  const handlePickVenue = (venue: VenueCard) => {
    setSelectedVenue(venue);
    setMessage(buildPlanMessage(venue, slots));
    setPanel('confirm');
  };

  const handleSend = () => {
    if (!message.trim() || !selectedVenue) return;
    onSelectMessage(message);
    setCalendarSlot(slots[0] ?? null);
    setPanel('calendar');
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (panel === 'trigger') {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Plan a date</span>
          </div>
          <button onClick={() => setPanel('dismissed')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Dismiss">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {(['any', '$', '$$', '$$$'] as Budget[]).map(lvl => (
              <button
                key={lvl}
                onClick={() => setBudget(lvl)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  budget === lvl
                    ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                    : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
                }`}
              >
                {lvl === 'any' ? 'Any' : lvl}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPanel('times')}
            className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity"
          >
            Let's plan <ChevronRight size={11} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (panel === 'times') {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">When are you free? <span className="text-[#C0BAC8] font-normal">pick up to 2</span></span>
          </div>
          <button onClick={() => { setSlots([]); setActiveDay(null); setPanel('trigger'); }} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Back">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>

        {/* Day chips */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {days.map(day => {
            const hasSel = slots.some(s => s.date.toDateString() === day.date.toDateString());
            const isActive = activeDay?.label === day.label;
            return (
              <button
                key={day.label}
                onClick={() => setActiveDay(isActive ? null : day)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  isActive ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                  : hasSel ? 'border-[#7B5EA7] text-[#7B5EA7]'
                  : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
                }`}
              >
                {day.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Period buttons */}
        {activeDay && (
          <div className="flex gap-1.5 mb-3">
            {PERIODS.map(period => {
              const sel = isSlotSelected(activeDay, period);
              const disabled = !sel && slots.length >= 2;
              return (
                <button
                  key={period}
                  onClick={() => toggleSlot(activeDay, period)}
                  disabled={disabled}
                  className={`flex-1 text-[11px] font-medium py-1.5 rounded-full border transition-colors ${
                    sel ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                    : disabled ? 'text-[#C0BAC8] border-[#E8E4DE] cursor-not-allowed'
                    : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
                  }`}
                >
                  {PERIOD_LABELS[period]}
                </button>
              );
            })}
          </div>
        )}

        {/* Selected slot chips */}
        {slots.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {slots.map(slot => (
              <span key={slot.label} className="flex items-center gap-1 text-[11px] bg-[#7B5EA7]/[0.08] text-[#7B5EA7] px-2 py-0.5 rounded-full">
                {slot.shortLabel}
                <button onClick={() => setSlots(prev => prev.filter(s => s.label !== slot.label))} aria-label={`Remove ${slot.label}`}>
                  <X size={9} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => { setSlots([]); setActiveDay(null); setPanel('trigger'); }}
            className="flex-1 text-xs font-medium text-[#8A8690] border border-[#E8E4DE] py-2 rounded-full hover:border-[#7B5EA7] transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={() => fetchVenues()}
            disabled={slots.length === 0}
            className="flex-1 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] py-2 rounded-full hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            Find spots →
          </button>
        </div>
      </div>
    );
  }

  if (panel === 'loading') {
    return (
      <div className="mb-2 flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50">
        <Loader size={13} className="text-[#7B5EA7] animate-spin flex-shrink-0" aria-hidden="true" />
        <span className="text-xs text-[#8A8690]">Finding spots near you both…</span>
      </div>
    );
  }

  if (panel === 'venues') {
    const timeLabel = slots[0] ? `for ${slots[0].shortLabel}` : '';
    const hasMultipleAreas = new Set(venues.map(v => v.areaKey).filter(Boolean)).size > 1;
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">
              Where? {timeLabel && <span className="text-[#C0BAC8] font-normal">· {timeLabel}</span>}
            </span>
          </div>
          <button onClick={() => setPanel('times')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Back to times">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>

        <div className="px-3 pb-2 space-y-2">
          {venues.map((venue, i) => (
            <button
              key={i}
              onClick={() => handlePickVenue(venue)}
              className="w-full text-left flex bg-white rounded-xl border border-[#E8E4DE] overflow-hidden active:bg-gray-50 transition-colors"
              aria-label={`Select ${venue.name}`}
            >
              {/* Square photo thumbnail */}
              {venue.photoUrl && (
                <div className="w-16 flex-shrink-0 bg-gray-100 self-stretch">
                  <img
                    src={venue.photoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const el = e.currentTarget.parentElement;
                      if (el) el.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="flex-1 px-3 py-2.5 min-w-0">
                <div className="flex items-start justify-between gap-1 mb-0.5">
                  <p className="text-xs font-semibold text-[#1E1C22] leading-tight">{venue.name}</p>
                  {hasMultipleAreas && venue.areaKey && (
                    <span className="text-[9px] text-[#8A8690] flex-shrink-0 mt-0.5">{AREA_LABELS[venue.areaKey]}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[#8A8690] mb-1">
                  <span>{venue.category}</span>
                  <span>·</span>
                  <span>{venue.priceLevel}</span>
                  {venue.rating !== null && (
                    <>
                      <span>·</span>
                      <Star size={8} className="fill-[#8A8690] text-[#8A8690]" aria-hidden="true" />
                      <span>{venue.rating}</span>
                    </>
                  )}
                </div>
                {venue.whyItFits && (
                  <p className="text-[10px] text-[#2E2A36] leading-snug line-clamp-2">{venue.whyItFits}</p>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="px-4 pb-3 flex justify-center">
          <button
            onClick={() => fetchVenues(true)}
            className="flex items-center gap-1.5 text-[11px] text-[#8A8690] hover:text-[#7B5EA7] transition-colors"
          >
            <RefreshCw size={11} aria-hidden="true" />
            Try different spots
          </button>
        </div>
      </div>
    );
  }

  if (panel === 'confirm') {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Edit &amp; send</span>
          </div>
          <button onClick={() => setPanel('venues')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Back to venues">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          className="w-full bg-white rounded-xl px-3.5 py-3 mb-3 border border-[#E8E4DE] text-xs text-[#2E2A36] leading-relaxed resize-none focus:outline-none focus:border-[#7B5EA7] transition-colors"
          aria-label="Edit your date proposal"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setPanel('venues')}
            className="flex-1 text-xs font-medium text-[#8A8690] border border-[#E8E4DE] py-2 rounded-full hover:border-[#7B5EA7] transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="flex-1 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] py-2 rounded-full hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  if (panel === 'calendar' && selectedVenue) {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <CalendarPlus size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Add to calendar</span>
          </div>
          <button onClick={() => setPanel('dismissed')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Dismiss">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>
        <p className="text-[11px] text-[#8A8690] mb-2.5">
          {slots.length > 1 ? 'Tap whichever time you agreed on.' : selectedVenue.name}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {slots.length > 1
            ? slots.map(slot => (
                <button
                  key={slot.label}
                  onClick={() => { openCalendar(selectedVenue, slot); setPanel('dismissed'); }}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-[#E8E4DE] text-[#1E1C22] bg-white hover:border-[#7B5EA7] hover:text-[#7B5EA7] transition-colors"
                >
                  {slot.shortLabel}
                </button>
              ))
            : calendarSlot && (
                <button
                  onClick={() => { openCalendar(selectedVenue, calendarSlot); setPanel('dismissed'); }}
                  className="text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity"
                >
                  Add event
                </button>
              )
          }
        </div>
      </div>
    );
  }

  return null;
}
