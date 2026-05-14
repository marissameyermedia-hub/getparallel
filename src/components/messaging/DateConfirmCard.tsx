import { CalendarPlus, ExternalLink } from 'lucide-react';

export const DATE_CARD_PREFIX = '__DATE_CARD__';

export interface DateCardData {
  venueName: string;
  venueAddress: string;
  mapsUrl: string;
  openTableUrl: string;
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

export function DateConfirmCard({ data }: { data: DateCardData }) {
  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <CalendarPlus size={13} className="text-[#7B5EA7]" aria-hidden="true" />
        <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Date confirmed</span>
      </div>
      <p className="text-xs font-semibold text-[#1E1C22] leading-tight">{data.venueName}</p>
      <p className="text-[11px] text-[#8A8690] mt-0.5 mb-2.5 capitalize">{data.label}</p>
      <div className="flex gap-2">
        {data.openTableUrl && (
          <button
            onClick={() => window.open(data.openTableUrl, '_blank', 'noopener')}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-[#8A8690] border border-[#E8E4DE] py-2 rounded-full hover:border-[#7B5EA7] hover:text-[#7B5EA7] transition-colors"
          >
            <ExternalLink size={11} aria-hidden="true" />
            Book table
          </button>
        )}
        <button
          onClick={() => openCalendarFromCard(data)}
          className="flex-1 text-xs font-semibold text-[#F5F2EE] bg-[#0D0D0F] py-2 rounded-full hover:opacity-80 transition-opacity"
        >
          Add to Calendar
        </button>
      </div>
    </div>
  );
}
