import { useState } from 'react';
import { CalendarClock, X, ChevronRight } from 'lucide-react';

export interface TimeSlot {
  date: Date;
  period: 'morning' | 'afternoon' | 'evening';
  label: string;       // "Saturday afternoon"
  shortLabel: string;  // "Sat afternoon"
}

type Panel = 'trigger' | 'picking' | 'sent' | 'dismissed';

interface Props {
  messageCount: number;
  mutualMatch: boolean;
  flagEnabled: boolean;
  onSelectMessage: (msg: string) => void;
  onTimeAgreed: (slot: TimeSlot) => void;
}

const PERIODS = ['morning', 'afternoon', 'evening'] as const;
const PERIOD_LABELS: Record<typeof PERIODS[number], string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
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
    const shortLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : short[d.getDay()];
    return { date: d, label, shortLabel };
  });
}

function slotLabel(dayLabel: string, period: string) {
  return `${dayLabel} ${period}`;
}

function buildDraftMessage(slots: TimeSlot[]): string {
  const names = slots.map(s => s.label);
  if (names.length === 1) return `I'm thinking ${names[0]} — does that work for you?`;
  if (names.length === 2) return `I'm thinking ${names[0]} or ${names[1]} — any of those work?`;
  return `I'm free ${names[0]}, ${names[1]}, or ${names[2]} — what works best?`;
}

export function AvailabilityPicker({ messageCount, mutualMatch, flagEnabled, onSelectMessage, onTimeAgreed }: Props) {
  const [panel, setPanel] = useState<Panel>('trigger');
  const [activeDay, setActiveDay] = useState<ReturnType<typeof getUpcomingDays>[0] | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<TimeSlot[]>([]);

  if (!flagEnabled || !mutualMatch || messageCount < 10 || panel === 'dismissed') return null;

  const days = getUpcomingDays(7);

  const toggleSlot = (day: ReturnType<typeof getUpcomingDays>[0], period: typeof PERIODS[number]) => {
    const lbl = slotLabel(day.label, period);
    const exists = selectedSlots.some(s => s.label === lbl);
    if (exists) {
      setSelectedSlots(prev => prev.filter(s => s.label !== lbl));
    } else if (selectedSlots.length < 3) {
      setSelectedSlots(prev => [...prev, {
        date: day.date,
        period,
        label: lbl,
        shortLabel: slotLabel(day.shortLabel, period),
      }]);
    }
  };

  const isSelected = (dayLabel: string, period: string) =>
    selectedSlots.some(s => s.label === slotLabel(dayLabel, period));

  if (panel === 'trigger') {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Ready to plan a date?</span>
          </div>
          <button onClick={() => setPanel('dismissed')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Dismiss">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[#8A8690]">Propose a few times that work for you.</p>
          <button
            onClick={() => setPanel('picking')}
            className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity"
          >
            Pick times <ChevronRight size={11} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (panel === 'picking') {
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={13} className="text-[#7B5EA7]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">When are you free?</span>
          </div>
          <button onClick={() => setPanel('trigger')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Back">
            <X size={13} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>

        {/* Day chips */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {days.map(day => {
            const hasSlot = selectedSlots.some(s => s.label.startsWith(day.label + ' '));
            const isActive = activeDay?.label === day.label;
            return (
              <button
                key={day.label}
                onClick={() => setActiveDay(isActive ? null : day)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  isActive
                    ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                    : hasSlot
                    ? 'border-[#7B5EA7] text-[#7B5EA7]'
                    : 'text-[#8A8690] border-[#E8E4DE] hover:border-[#7B5EA7]'
                }`}
              >
                {day.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Time period buttons — appear when a day is active */}
        {activeDay && (
          <div className="flex gap-1.5 mb-3">
            {PERIODS.map(period => {
              const sel = isSelected(activeDay.label, period);
              const disabled = !sel && selectedSlots.length >= 3;
              return (
                <button
                  key={period}
                  onClick={() => toggleSlot(activeDay, period)}
                  disabled={disabled}
                  className={`flex-1 text-[11px] font-medium py-1.5 rounded-full border transition-colors ${
                    sel
                      ? 'bg-[#7B5EA7] text-[#F5F2EE] border-[#7B5EA7]'
                      : disabled
                      ? 'text-[#C0BAC8] border-[#E8E4DE] cursor-not-allowed'
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
        {selectedSlots.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedSlots.map(slot => (
              <span key={slot.label} className="flex items-center gap-1 text-[11px] bg-[#7B5EA7]/[0.08] text-[#7B5EA7] px-2 py-0.5 rounded-full">
                {slot.shortLabel}
                <button
                  onClick={() => setSelectedSlots(prev => prev.filter(s => s.label !== slot.label))}
                  aria-label={`Remove ${slot.label}`}
                >
                  <X size={9} aria-hidden="true" />
                </button>
              </span>
            ))}
            <span className="text-[10px] text-[#8A8690] self-center">{selectedSlots.length}/3</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setPanel('trigger')}
            className="flex-1 text-xs font-medium text-[#8A8690] border border-[#E8E4DE] py-2 rounded-full hover:border-[#7B5EA7] transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={() => {
              if (selectedSlots.length === 0) return;
              onSelectMessage(buildDraftMessage(selectedSlots));
              setPanel('sent');
            }}
            disabled={selectedSlots.length === 0}
            className="flex-1 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] py-2 rounded-full hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            Draft message
          </button>
        </div>
      </div>
    );
  }

  // panel === 'sent'
  return (
    <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <CalendarClock size={13} className="text-[#7B5EA7]" aria-hidden="true" />
          <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Did you agree on a time?</span>
        </div>
        <button onClick={() => setPanel('dismissed')} className="p-0.5 hover:bg-black/5 rounded-full transition-colors" aria-label="Dismiss">
          <X size={13} className="text-[#8A8690]" aria-hidden="true" />
        </button>
      </div>
      <p className="text-[11px] text-[#8A8690] mb-2.5">Tap whichever time you landed on — it'll unlock venue ideas filtered for that time.</p>
      <div className="flex flex-wrap gap-1.5">
        {selectedSlots.map(slot => (
          <button
            key={slot.label}
            onClick={() => { onTimeAgreed(slot); setPanel('dismissed'); }}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-[#E8E4DE] text-[#1E1C22] bg-white hover:border-[#7B5EA7] hover:text-[#7B5EA7] transition-colors"
          >
            {slot.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
