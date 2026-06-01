import { useState } from 'react';
import { CalendarX } from 'lucide-react';

export const DATE_CANCELLATION_PREFIX = '__DATE_CANCEL__';

export interface DateCancellationData {
  cancelledByUserId: string;
  cancelledByName: string;
  venueName: string;
  dateLabel: string;
}

const intentKey = (matchId: string) => `parallel_cancel_intent_${matchId}`;

interface Props {
  data: DateCancellationData;
  currentUserId: string;
  matchName: string;
  matchId: string;
  onReschedule: () => void;
  onRemoveMatch: () => void;
}

export function DateCancellationCard({ data, currentUserId, matchName, matchId, onReschedule, onRemoveMatch }: Props) {
  const iCancelled = data.cancelledByUserId === currentUserId;
  const [intent, setIntent] = useState<'reschedule' | 'remove' | null>(
    () => localStorage.getItem(intentKey(matchId)) as 'reschedule' | 'remove' | null,
  );

  const handleReschedule = () => {
    localStorage.setItem(intentKey(matchId), 'reschedule');
    setIntent('reschedule');
    onReschedule();
  };

  const handleRemove = () => {
    localStorage.setItem(intentKey(matchId), 'remove');
    setIntent('remove');
    onRemoveMatch();
  };

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <CalendarX size={13} className="text-gray-400" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-gray-400 tracking-wide uppercase">
          Date cancelled
        </span>
      </div>

      <div className="px-4 pb-3">
        <p className="text-sm font-medium text-gray-700 leading-snug">
          {iCancelled
            ? `You cancelled your date at ${data.venueName}.`
            : `${data.cancelledByName} had to cancel your date at ${data.venueName}.`}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {intent === 'reschedule'
            ? 'You chose to reschedule — use the date planner to find a new time.'
            : iCancelled
              ? `Do you want to reschedule with ${matchName}?`
              : 'Would you like to reschedule?'}
        </p>
      </div>

      {intent === null && (
        <div className="flex border-t border-gray-200">
          <button
            onClick={handleReschedule}
            className="flex-1 py-2.5 text-[12px] font-semibold text-[#7B5EA7] hover:bg-[#F5F0FF] transition-colors border-r border-gray-200"
          >
            Reschedule
          </button>
          <button
            onClick={handleRemove}
            className="flex-1 py-2.5 text-[12px] font-medium text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Remove match
          </button>
        </div>
      )}
    </div>
  );
}
