import { CalendarPlus, MapPin, X } from 'lucide-react';

export const DATE_CARD_PREFIX = '__DATE_CARD__';

export interface DateCardData {
  venueName: string;
  venueAddress: string;
  mapsUrl: string;
  openTableUrl?: string;
  dateIso: string;
  time: number;
  label: string;       // "Friday at 7pm"
  period: 'afternoon' | 'evening';
}

function openCalendarFromCard(data: DateCardData) {
  const start = new Date(data.dateIso);
  start.setHours(data.time, 0, 0, 0);
  const duration = data.period === 'evening' ? 3 : 2;
  const end = new Date(start);
  end.setHours(data.time + duration);
  const title = `Date at ${data.venueName}`;
  const isApple = /iphone|ipad|macintosh/i.test(navigator.userAgent);
  if (isApple) {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Parallel//EN',
      'BEGIN:VEVENT',
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      `SUMMARY:${title}`,
      `LOCATION:${data.venueAddress || data.venueName}`,
      data.mapsUrl ? `DESCRIPTION:${data.mapsUrl}` : '',
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'date.ics'; a.click();
    URL.revokeObjectURL(url);
  } else {
    const gcal = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${gcal(start)}/${gcal(end)}`,
      location: data.venueAddress || data.venueName,
      details: data.mapsUrl || '',
    });
    window.open(`https://calendar.google.com/calendar/render?${p}`, '_blank', 'noopener');
  }
}

interface DateConfirmCardProps {
  data: DateCardData;
  isMe?: boolean;
  onCancel?: () => void;
}

export function DateConfirmCard({ data, isMe, onCancel }: DateConfirmCardProps) {
  const dateObj = new Date(data.dateIso);
  const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="w-full rounded-2xl border border-[#E2D5F5] bg-[#F8F4FD] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <CalendarPlus size={13} className="text-[#7B5EA7]" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-[#7B5EA7] tracking-wide">Date confirmed</span>
        </div>
        {isMe && onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 text-[10px] text-[#C0BAC8] hover:text-[#8A8690] transition-colors"
            aria-label="Cancel this date"
          >
            <X size={10} aria-hidden="true" />
            Cancel
          </button>
        )}
      </div>

      {/* Venue + time */}
      <div className="px-4 pb-3">
        <p className="text-sm font-semibold text-[#1E1C22] leading-tight">{data.venueName}</p>
        <p className="text-[11px] text-[#8A8690] mt-0.5 capitalize">{displayDate} · {data.label.split(' at ')[1] ?? data.label}</p>
        {data.venueAddress && (
          <p className="text-[10px] text-[#C0BAC8] mt-0.5 truncate">{data.venueAddress}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t border-[#E2D5F5]">
        {data.mapsUrl && (
          <button
            onClick={() => window.open(data.mapsUrl, '_blank', 'noopener')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium text-[#7B5EA7] border-r border-[#E2D5F5] hover:bg-[#EDE8F8] transition-colors"
          >
            <MapPin size={11} aria-hidden="true" />
            View on Maps
          </button>
        )}
        <button
          onClick={() => openCalendarFromCard(data)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold text-[#7B5EA7] hover:bg-[#EDE8F8] transition-colors"
        >
          <CalendarPlus size={11} aria-hidden="true" />
          Add to Calendar
        </button>
      </div>
    </div>
  );
}
