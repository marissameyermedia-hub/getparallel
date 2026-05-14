import { useState, useEffect } from 'react';
import { CalendarClock, X, Loader, Star, RefreshCw, CalendarPlus, Check, ExternalLink, Sparkles } from 'lucide-react';
import { DATE_AGENT_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';
import { DATE_CARD_PREFIX, type DateCardData } from './DateConfirmCard';
import { DATE_PROPOSAL_PREFIX, DATE_RESPONSE_PREFIX, type DateProposalData, type DateResponseData } from './DateProposalCard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimeSlot {
  date: Date;
  period: 'afternoon' | 'evening';
  label: string;       // "Friday evening"
  shortLabel: string;  // "Fri 15 evening"
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
  latitude?: number;
  longitude?: number;
  reservable?: boolean;
}

type Panel = 'trigger' | 'times' | 'loading' | 'venues' | 'confirm' | 'waiting' | 'time-pick' | 'confirmed' | 'dismissed' | 'quick-review';
type Budget = 'any' | '$' | '$$' | '$$$';

interface Props {
  matchId: string;
  matchName: string;
  messageCount: number;
  mutualMatch: boolean;
  flagEnabled: boolean;
  recentMessages: string[];
  dateResponseText?: string;
  onSelectMessage: (msg: string) => void;
  onSendMessage: (msg: string) => void;
}

// ── Concierge readiness detection ─────────────────────────────────────────────

const READINESS_SIGNALS = [
  'free', 'meet', 'weekend', 'this week', 'tonight', 'tomorrow',
  'dinner', 'drinks', 'coffee', 'lunch', 'sometime', "let's", 'lets',
  'hang', 'grab', 'get together', 'catch up', 'go out',
  'would you want', 'want to', 'should we', 'would love',
];

function detectReadiness(messages: string[]): boolean {
  const combined = messages.join(' ').toLowerCase();
  return READINESS_SIGNALS.some(s => combined.includes(s));
}

function getDefaultSlots(): TimeSlot[] {
  const days = getUpcomingDays(10);
  // Prefer upcoming Fri/Sat/Sun; fall back to days 2–3
  const weekend = days.filter(d => [5, 6, 0].includes(d.date.getDay()));
  const picks = weekend.length >= 2 ? weekend.slice(0, 2) : days.slice(2, 4);
  return picks.map(day => ({
    date: day.date,
    period: 'evening' as const,
    label: `${day.label} evening`,
    shortLabel: `${day.shortLabel} evening`,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERIODS = ['afternoon', 'evening'] as const;
const PERIOD_LABELS: Record<typeof PERIODS[number], string> = {
  afternoon: 'Afternoon',
  evening: 'Evening',
};
const PERIOD_SHORT: Record<typeof PERIODS[number], string> = {
  afternoon: 'Aft',
  evening: 'Eve',
};
const AREA_LABELS: Record<string, string> = {
  you: 'Near you',
  them: 'Near them',
  middle: 'In the middle',
};
// Time options shown in the time-pick panel, keyed by period
const TIME_OPTIONS: Record<typeof PERIODS[number], number[]> = {
  afternoon: [13, 14, 15, 16, 17],
  evening: [17, 18, 19, 20, 21],
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
    const shortLabel = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : `${short[d.getDay()]} ${d.getDate()}`;
    return { date: d, label, shortLabel };
  });
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

// "Friday evening" → "Friday"
function dayName(slot: TimeSlot): string {
  const parts = slot.label.split(' ');
  return parts.slice(0, -1).join(' ');
}

// 19 → "7pm", 13 → "1pm"
function formatHour(h: number): string {
  if (h === 12) return '12pm';
  if (h > 12) return `${h - 12}pm`;
  return `${h}am`;
}

function buildPlanMessage(venue: VenueCard, slots: TimeSlot[]): string {
  const availability = slots.length >= 2
    ? `Are you free ${dayName(slots[0])} or ${dayName(slots[1])}?`
    : slots.length === 1
    ? `Are you free ${dayName(slots[0])}?`
    : null;
  const tail = `Parallel matched us to ${venue.name} — apparently it's our kind of place. Have you been?`;
  const body = availability ? `${availability} ${tail}` : tail;
  return venue.mapsUrl ? `${body}\n${venue.mapsUrl}` : body;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function slotToRange(slot: TimeSlot, exactHour?: number) {
  const d = new Date(slot.date);
  const startHour = exactHour ?? { afternoon: 14, evening: 19 }[slot.period];
  const duration = { afternoon: 2, evening: 3 }[slot.period];
  d.setHours(startHour, 0, 0, 0);
  const end = new Date(d);
  end.setHours(startHour + duration);
  return { start: d, end };
}

function toGcalDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function openCalendar(venue: VenueCard, slot: TimeSlot, initials: string, exactHour?: number) {
  const { start, end } = slotToRange(slot, exactHour);
  const title = initials ? `Date with ${initials} at ${venue.name}` : `Date at ${venue.name}`;
  const isApple = /iphone|ipad|macintosh/i.test(navigator.userAgent);
  if (isApple) {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Parallel//EN',
      'BEGIN:VEVENT',
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      `SUMMARY:${title}`,
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
      text: title,
      dates: `${toGcalDate(start)}/${toGcalDate(end)}`,
      location: venue.address || venue.name,
      details: venue.mapsUrl || '',
    });
    window.open(`https://calendar.google.com/calendar/render?${p}`, '_blank', 'noopener');
  }
}

function buildOpenTableUrl(venue: VenueCard, slot: TimeSlot, exactHour: number): string {
  const d = new Date(slot.date);
  d.setHours(exactHour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(exactHour)}:00:00`;
  const params = new URLSearchParams({ covers: '2', dateTime: dateStr, term: venue.name });
  if (venue.latitude) params.set('latitude', String(venue.latitude));
  if (venue.longitude) params.set('longitude', String(venue.longitude));
  return `https://www.opentable.com/s/?${params}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DatePlannerCard({ matchId, matchName, messageCount, mutualMatch, flagEnabled, recentMessages, dateResponseText, onSelectMessage, onSendMessage }: Props) {
  const [panel, setPanel] = useState<Panel>('trigger');
  const [budget, setBudget] = useState<Budget>('any');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [venues, setVenues] = useState<VenueCard[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueCard | null>(null);
  const [venueIndex, setVenueIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [confirmedSlot, setConfirmedSlot] = useState<TimeSlot | null>(null);
  const [confirmedTime, setConfirmedTime] = useState<number | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  // ── Persistence — restore post-send state across navigation ──────────────────

  useEffect(() => {
    const key = `parallel_date_planner_${matchId}`;
    try {
      const saved = localStorage.getItem(key);
      if (!saved) {
        // Different conversation or never used — reset to clean trigger state
        setPanel('trigger');
        setSlots([]);
        setSelectedVenue(null);
        setMessage('');
        setConfirmedSlot(null);
        setConfirmedTime(null);
        return;
      }
      const s = JSON.parse(saved);
      // quick-review is transient (needs venues in memory) — don't restore it
      if (s.panel && s.panel !== 'quick-review') setPanel(s.panel);
      if (s.selectedVenue) setSelectedVenue(s.selectedVenue);
      if (Array.isArray(s.slots)) setSlots(s.slots.map((sl: { date: string } & Omit<TimeSlot, 'date'>) => ({ ...sl, date: new Date(sl.date) })));
      if (s.message) setMessage(s.message);
      if (s.confirmedSlot) setConfirmedSlot({ ...s.confirmedSlot, date: new Date(s.confirmedSlot.date) });
      if (s.confirmedTime !== undefined && s.confirmedTime !== null) setConfirmedTime(s.confirmedTime);
    } catch { /* corrupt storage — ignore and start fresh */ }
  }, [matchId]);

  useEffect(() => {
    const key = `parallel_date_planner_${matchId}`;
    if (panel === 'dismissed') {
      localStorage.removeItem(key);
      return;
    }
    if ((panel === 'waiting' || panel === 'time-pick' || panel === 'confirmed') && selectedVenue) {
      try {
        localStorage.setItem(key, JSON.stringify({
          panel,
          selectedVenue,
          slots: slots.map(sl => ({ ...sl, date: sl.date.toISOString() })),
          message,
          confirmedSlot: confirmedSlot ? { ...confirmedSlot, date: confirmedSlot.date.toISOString() } : null,
          confirmedTime,
        }));
      } catch { /* storage full — ignore */ }
    }
  }, [panel, selectedVenue, slots, message, confirmedSlot, confirmedTime, matchId]);

  // When the match picks a day via the proposal card, auto-advance from waiting → time-pick
  useEffect(() => {
    if (!dateResponseText || !dateResponseText.startsWith(DATE_RESPONSE_PREFIX)) return;
    try {
      const response = JSON.parse(dateResponseText.slice(DATE_RESPONSE_PREFIX.length)) as DateResponseData;
      setConfirmedSlot({
        date: new Date(response.dateIso),
        period: response.period,
        label: response.label,
        shortLabel: response.shortLabel,
      });
      setConfirmedTime(null);
      setPanel(prev => prev === 'waiting' ? 'time-pick' : prev);
    } catch { /* ignore malformed response */ }
  }, [dateResponseText]);

  if (!flagEnabled || !mutualMatch || messageCount < 10 || panel === 'dismissed') return null;

  const days = getUpcomingDays(7);
  const initials = getInitials(matchName);
  const matchFirstName = matchName.trim().split(/\s+/)[0] ?? 'them';

  // ── Day selection — tap to select (Evening default); tap again to cycle ────────

  const handleDayTap = (day: ReturnType<typeof getUpcomingDays>[0]) => {
    const existing = slots.find(s => s.date.toDateString() === day.date.toDateString());
    if (existing) {
      const nextPeriod: typeof PERIODS[number] = existing.period === 'evening' ? 'afternoon' : 'evening';
      setSlots(prev => prev.map(s =>
        s.date.toDateString() === day.date.toDateString()
          ? { ...s, period: nextPeriod, label: `${day.label} ${nextPeriod}`, shortLabel: `${day.shortLabel} ${nextPeriod}` }
          : s
      ));
    } else {
      const newSlot: TimeSlot = {
        date: day.date,
        period: 'evening',
        label: `${day.label} evening`,
        shortLabel: `${day.shortLabel} evening`,
      };
      setSlots(prev => {
        if (prev.length >= 2) return [prev[1], newSlot];
        return [...prev, newSlot];
      });
    }
  };

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
    onSendMessage(message);
    setPanel('waiting');
  };

  // Concierge send: text message first, then interactive proposal card
  const handleSendConcierge = () => {
    if (!message.trim() || !selectedVenue) return;
    onSendMessage(message);
    const proposalData: DateProposalData = {
      venueName: selectedVenue.name,
      venueAddress: selectedVenue.address,
      mapsUrl: selectedVenue.mapsUrl,
      whyItFits: selectedVenue.whyItFits,
      photoUrl: selectedVenue.photoUrl,
      slots: slots.map(s => {
        const periodShort = s.period === 'evening' ? 'Eve' : 'Aft';
        const dayPart = s.shortLabel.replace(` ${s.period}`, '');
        return {
          label: s.label,
          shortLabel: `${dayPart} · ${periodShort}`,
          dateIso: s.date.toISOString(),
          period: s.period,
        };
      }),
    };
    onSendMessage(`${DATE_PROPOSAL_PREFIX}${JSON.stringify(proposalData)}`);
    setPanel('waiting');
  };

  // One-tap concierge fetch — auto-picks best venue, pre-selects default days
  const fetchVenuesConcierge = async () => {
    setPanel('loading');
    const defaultSlots = getDefaultSlots();
    setSlots(defaultSlots);
    try {
      const token = await getAccessToken();
      if (!token) { setPanel('trigger'); return; }
      const params = new URLSearchParams({ matchId, force: 'true', timeOfDay: 'evening' });
      const res = await fetch(`${DATE_AGENT_FUNCTION_URL}/generate?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          const seen = new Set<string>();
          const top: VenueCard[] = [];
          for (const v of data.suggestions) {
            if (!seen.has(v.name) && top.length < 3) { seen.add(v.name); top.push(v); }
          }
          setVenues(top);
          setVenueIndex(0);
          setSelectedVenue(top[0]);
          setMessage(buildPlanMessage(top[0], defaultSlots));
          setPanel('quick-review');
          return;
        }
      }
    } catch { /* fall through */ }
    setPanel('trigger');
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (panel === 'trigger') {
    const isReady = detectReadiness(recentMessages);
    if (isReady) {
      return (
        <div className="mb-2 rounded-2xl border border-[#E2D5F5] bg-[#F8F4FD] px-4 py-3">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-start gap-2">
              <Sparkles size={13} className="text-[#7B5EA7] mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="text-[11px] font-medium text-[#7B5EA7] leading-tight">Sounds like you two click</p>
                <p className="text-[11px] text-[#8A8690] mt-0.5 leading-snug">Want Parallel to find a spot and draft the invite?</p>
              </div>
            </div>
            <button onClick={() => setPanel('dismissed')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors flex-shrink-0" aria-label="Dismiss">
              <X size={13} className="text-[#8A8690]" aria-hidden="true" />
            </button>
          </div>
          <button
            onClick={fetchVenuesConcierge}
            className="w-full text-xs font-semibold text-[#F5F2EE] bg-[#7B5EA7] py-2 rounded-full hover:opacity-90 transition-opacity"
          >
            Find a spot →
          </button>
        </div>
      );
    }
    // Subtle fallback — no signals yet but conversation is long enough
    return (
      <div className="mb-1.5 flex justify-center">
        <button
          onClick={fetchVenuesConcierge}
          className="flex items-center gap-1.5 text-[11px] text-[#C0BAC8] hover:text-[#7B5EA7] transition-colors py-1"
        >
          <CalendarClock size={11} aria-hidden="true" />
          Plan a date
        </button>
      </div>
    );
  }

  if (panel === 'times') {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">
              When are you free? <span className="text-[#C0BAC8] font-normal">pick up to 2 · tap again to switch Aft/Eve</span>
            </span>
          </div>
          <button
            onClick={() => { setSlots([]); setPanel('trigger'); }}
            className="p-0.5 hover:bg-black/5 rounded-full transition-colors"
            aria-label="Back"
          >
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-1.5 flex-wrap mb-3">
          {days.map(day => {
            const slot = slots.find(s => s.date.toDateString() === day.date.toDateString());
            const isSelected = !!slot;
            return (
              <button
                key={day.label}
                onClick={() => handleDayTap(day)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  isSelected
                    ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                    : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
                }`}
              >
                {isSelected ? `${day.shortLabel} · ${PERIOD_SHORT[slot.period]}` : day.shortLabel}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setSlots([]); setPanel('trigger'); }}
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

  if (panel === 'quick-review' && selectedVenue) {
    const days = getUpcomingDays(7);
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Parallel's pick for you two</span>
          </div>
          <button onClick={() => setPanel('trigger')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Back">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>

        {/* Venue card */}
        <div className="mx-3 mb-3 flex bg-white rounded-xl border border-[#E8E4DE] overflow-hidden">
          {selectedVenue.photoUrl && (
            <div className="w-16 flex-shrink-0 bg-gray-100 self-stretch">
              <img src={selectedVenue.photoUrl} alt="" className="w-full h-full object-cover"
                onError={e => { const el = e.currentTarget.parentElement; if (el) el.style.display = 'none'; }} />
            </div>
          )}
          <div className="flex-1 px-3 py-2.5 min-w-0">
            <p className="text-xs font-semibold text-[#1E1C22] leading-tight">{selectedVenue.name}</p>
            <p className="text-[10px] text-[#8A8690] mt-0.5">
              {selectedVenue.category} · {selectedVenue.priceLevel}
              {selectedVenue.rating !== null ? ` · ★ ${selectedVenue.rating}` : ''}
            </p>
            {selectedVenue.whyItFits && (
              <p className="text-[10px] text-[#2E2A36] leading-snug mt-1 line-clamp-2">{selectedVenue.whyItFits}</p>
            )}
          </div>
        </div>

        {/* Day chips with inline slot+message sync */}
        <div className="px-4 mb-2">
          <p className="text-[10px] text-[#8A8690] mb-1.5">When are you free? <span className="text-[#C0BAC8]">pick up to 2 · tap again to switch Aft/Eve</span></p>
          <div className="flex gap-1.5 flex-wrap">
            {days.map(day => {
              const slot = slots.find(s => s.date.toDateString() === day.date.toDateString());
              const isSelected = !!slot;
              return (
                <button
                  key={day.label}
                  onClick={() => {
                    // Compute new slots synchronously so message rebuilds in the same tick
                    let newSlots: TimeSlot[];
                    if (slot) {
                      const next = slot.period === 'evening' ? 'afternoon' : 'evening';
                      newSlots = slots.map(s => s.date.toDateString() === day.date.toDateString()
                        ? { ...s, period: next, label: `${day.label} ${next}`, shortLabel: `${day.shortLabel} ${next}` }
                        : s);
                    } else {
                      const newSlot: TimeSlot = { date: day.date, period: 'evening', label: `${day.label} evening`, shortLabel: `${day.shortLabel} evening` };
                      newSlots = slots.length >= 2 ? [slots[1], newSlot] : [...slots, newSlot];
                    }
                    setSlots(newSlots);
                    setMessage(buildPlanMessage(selectedVenue, newSlots));
                  }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    isSelected
                      ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                      : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
                  }`}
                >
                  {isSelected ? `${day.shortLabel} · ${PERIOD_SHORT[slot.period]}` : day.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editable message preview */}
        <div className="px-4 mb-3">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            className="w-full bg-white rounded-xl px-3.5 py-2.5 border border-[#E8E4DE] text-xs text-[#2E2A36] leading-relaxed resize-none focus:outline-none focus:border-[#7B5EA7] transition-colors"
            aria-label="Edit your date proposal"
          />
        </div>

        {/* Actions */}
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => {
              const next = (venueIndex + 1) % venues.length;
              setVenueIndex(next);
              setSelectedVenue(venues[next]);
              setMessage(buildPlanMessage(venues[next], slots));
            }}
            disabled={venues.length <= 1}
            className="flex-1 text-xs font-medium text-[#8A8690] border border-[#E8E4DE] py-2 rounded-full hover:border-[#7B5EA7] transition-colors disabled:opacity-40"
          >
            Try another spot
          </button>
          <button
            onClick={handleSendConcierge}
            disabled={!message.trim()}
            className="flex-1 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] py-2 rounded-full hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            Send →
          </button>
        </div>
      </div>
    );
  }

  if (panel === 'waiting' && selectedVenue) {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <CalendarPlus size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Proposal sent ✓</span>
          </div>
          <button onClick={() => setPanel('dismissed')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Dismiss">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>
        <p className="text-[11px] text-[#8A8690] mb-2.5">
          Waiting for {matchFirstName} to choose a day. Or tap a slot below if you've already agreed:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {slots.map(slot => (
            <button
              key={slot.label}
              onClick={() => { setConfirmedSlot(slot); setConfirmedTime(null); setPanel('time-pick'); }}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-[#E8E4DE] text-[#1E1C22] bg-white hover:border-[#7B5EA7] hover:text-[#7B5EA7] transition-colors"
            >
              {slot.shortLabel}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (panel === 'time-pick' && confirmedSlot && selectedVenue) {
    const timeOptions = TIME_OPTIONS[confirmedSlot.period];
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <CalendarPlus size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">
              What time did you agree on?
            </span>
          </div>
          <button onClick={() => setPanel('waiting')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Back">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>

        <p className="text-[11px] text-[#8A8690] mb-2.5">
          {dayName(confirmedSlot)} · {selectedVenue.name}
        </p>

        {/* Time chips */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {timeOptions.map(h => (
            <button
              key={h}
              onClick={() => setConfirmedTime(h)}
              className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-colors ${
                confirmedTime === h
                  ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                  : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
              }`}
            >
              {formatHour(h)}
            </button>
          ))}
        </div>

        {/* Book + Calendar CTAs — appear once a time is chosen */}
        {confirmedTime !== null && (
          <div className="flex gap-2">
            {selectedVenue.reservable !== false ? (
              <button
                onClick={() => window.open(buildOpenTableUrl(selectedVenue, confirmedSlot, confirmedTime), '_blank', 'noopener')}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-[#8A8690] border border-[#E8E4DE] py-2 rounded-full hover:border-[#7B5EA7] hover:text-[#7B5EA7] transition-colors"
              >
                <ExternalLink size={11} aria-hidden="true" />
                Book on OpenTable
              </button>
            ) : selectedVenue.mapsUrl ? (
              <button
                onClick={() => window.open(selectedVenue.mapsUrl, '_blank', 'noopener')}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-[#8A8690] border border-[#E8E4DE] py-2 rounded-full hover:border-[#7B5EA7] hover:text-[#7B5EA7] transition-colors"
              >
                <ExternalLink size={11} aria-hidden="true" />
                View on Maps
              </button>
            ) : null}
            <button
              onClick={() => {
                openCalendar(selectedVenue, confirmedSlot, initials, confirmedTime);
                const cardData: DateCardData = {
                  venueName: selectedVenue.name,
                  venueAddress: selectedVenue.address,
                  mapsUrl: selectedVenue.mapsUrl,
                  openTableUrl: selectedVenue.reservable !== false
                    ? buildOpenTableUrl(selectedVenue, confirmedSlot, confirmedTime)
                    : '',
                  dateIso: confirmedSlot.date.toISOString(),
                  time: confirmedTime,
                  label: `${dayName(confirmedSlot)} at ${formatHour(confirmedTime)}`,
                  period: confirmedSlot.period,
                };
                onSendMessage(`${DATE_CARD_PREFIX}${JSON.stringify(cardData)}`);
                setPanel('confirmed');
              }}
              className="flex-1 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] py-2 rounded-full hover:opacity-80 transition-opacity"
            >
              Add to Calendar
            </button>
          </div>
        )}
      </div>
    );
  }

  if (panel === 'confirmed' && selectedVenue && confirmedSlot) {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Check size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Date planned</span>
          </div>
          <button onClick={() => setPanel('dismissed')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Dismiss">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>
        <p className="text-xs font-semibold text-[#1E1C22] leading-tight">{selectedVenue.name}</p>
        <p className="text-[11px] text-[#8A8690] mt-0.5">
          {dayName(confirmedSlot)}{confirmedTime !== null ? ` at ${formatHour(confirmedTime)}` : ''} · Added to calendar ✓
        </p>
        {confirmedTime !== null && selectedVenue.reservable !== false && (
          <button
            onClick={() => window.open(buildOpenTableUrl(selectedVenue, confirmedSlot, confirmedTime), '_blank', 'noopener')}
            className="mt-2 flex items-center gap-1 text-[11px] text-[#8A8690] hover:text-[#7B5EA7] transition-colors"
          >
            <ExternalLink size={10} aria-hidden="true" />
            Book on OpenTable
          </button>
        )}
        {selectedVenue.reservable === false && selectedVenue.mapsUrl && (
          <button
            onClick={() => window.open(selectedVenue.mapsUrl, '_blank', 'noopener')}
            className="mt-2 flex items-center gap-1 text-[11px] text-[#8A8690] hover:text-[#7B5EA7] transition-colors"
          >
            <ExternalLink size={10} aria-hidden="true" />
            View on Maps
          </button>
        )}
      </div>
    );
  }

  return null;
}
