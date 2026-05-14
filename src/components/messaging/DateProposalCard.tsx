import { CalendarDays, MapPin } from 'lucide-react';

export const DATE_PROPOSAL_PREFIX = '__DATE_PROPOSAL__';
export const DATE_RESPONSE_PREFIX = '__DATE_RESPONSE__';

export interface ProposalSlot {
  label: string;       // "Friday evening"
  shortLabel: string;  // "Fri 16 · Eve"
  dateIso: string;
  period: 'afternoon' | 'evening';
}

export interface DateProposalData {
  venueName: string;
  venueAddress?: string;
  mapsUrl?: string;
  whyItFits?: string;
  photoUrl?: string;
  slots: ProposalSlot[];
}

export interface DateResponseData {
  label: string;
  shortLabel: string;
  dateIso: string;
  period: 'afternoon' | 'evening';
}

interface Props {
  data: DateProposalData;
  isMe: boolean;
  matchName: string;
  responseData?: DateResponseData | null;
  onRespond?: (slot: DateResponseData) => void;
}

export function DateProposalCard({ data, isMe, matchName, responseData, onRespond }: Props) {
  const matchFirstName = matchName.trim().split(/\s+/)[0] ?? 'them';

  // After a day is picked — compact confirmed state for both users
  if (responseData) {
    return (
      <div className="w-full rounded-2xl border border-[#E2D5F5] bg-[#F8F4FD] px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <CalendarDays size={13} className="text-[#7B5EA7]" aria-hidden="true" />
          <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Day confirmed</span>
        </div>
        <p className="text-xs font-semibold text-[#1E1C22] leading-tight">{data.venueName}</p>
        <p className="text-[11px] text-[#8A8690] mt-0.5 capitalize">{responseData.label}</p>
      </div>
    );
  }

  // Sender view — suggestion in flight
  if (isMe) {
    return (
      <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <CalendarDays size={13} className="text-[#7B5EA7]" aria-hidden="true" />
          <span className="text-[11px] font-medium text-[#7B5EA7] tracking-wide">Suggestion sent</span>
        </div>
        <p className="text-xs font-semibold text-[#1E1C22] leading-tight">{data.venueName}</p>
        {data.whyItFits && (
          <p className="text-[11px] text-[#8A8690] mt-0.5 leading-snug line-clamp-1">{data.whyItFits}</p>
        )}
        <p className="text-[11px] text-[#8A8690] mt-1">Waiting for {matchFirstName} to pick a day…</p>
      </div>
    );
  }

  // Recipient view — interactive day picker
  return (
    <div className="w-full rounded-2xl border border-[#E2D5F5] bg-[#F8F4FD] overflow-hidden">
      {/* Venue header */}
      <div className="flex overflow-hidden">
        {data.photoUrl && (
          <div className="w-20 h-20 flex-shrink-0 bg-gray-100">
            <img
              src={data.photoUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={e => { const el = e.currentTarget.parentElement; if (el) el.style.display = 'none'; }}
            />
          </div>
        )}
        <div className="flex-1 px-4 py-3 min-w-0">
          <p className="text-[10px] font-medium text-[#7B5EA7] uppercase tracking-wide mb-0.5">Parallel's suggestion</p>
          <p className="text-sm font-semibold text-[#1E1C22] leading-tight">{data.venueName}</p>
          {data.mapsUrl && (
            <a
              href={data.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-[#7B5EA7] mt-0.5"
              onClick={e => e.stopPropagation()}
            >
              <MapPin size={9} aria-hidden="true" />
              View on Maps →
            </a>
          )}
        </div>
      </div>

      {/* Why it fits — the personalized reason */}
      {data.whyItFits && (
        <div className="px-4 py-2.5 border-t border-[#E2D5F5]/60 bg-white/60">
          <p className="text-[11px] text-[#2E2A36] leading-snug">{data.whyItFits}</p>
          <p className="text-[10px] text-[#C0BAC8] mt-1">Matched based on your shared interests &amp; location</p>
        </div>
      )}

      {/* Day picker */}
      <div className="px-4 pt-2.5 pb-3 border-t border-[#E2D5F5]/60">
        <p className="text-[11px] text-[#8A8690] mb-2">When works for you?</p>
        <div className="flex flex-wrap gap-2 mb-2.5">
          {data.slots.map((slot, i) => (
            <button
              key={i}
              onClick={() => onRespond?.({ label: slot.label, shortLabel: slot.shortLabel, dateIso: slot.dateIso, period: slot.period })}
              className="text-xs font-semibold px-4 py-2 rounded-full bg-[#7B5EA7] text-[#F5F2EE] hover:opacity-90 transition-opacity active:scale-95"
            >
              {slot.shortLabel}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[#C0BAC8]">Different time? Just reply ↓</p>
      </div>
    </div>
  );
}
