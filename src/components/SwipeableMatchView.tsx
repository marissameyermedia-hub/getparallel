import { useState } from 'react';
import { Match } from '../types';
import { Undo2 } from 'lucide-react';
import { MatchCard } from './MatchCard';
import { ParallelIcon } from './ParallelIcon';

interface SwipeableMatchViewProps {
  matches: Match[];
  onMatchInteraction?: (matchId: string) => void;
  hasActivated?: boolean;
  onUnlock?: () => void;
  isVerified?: boolean;
  onVerify?: () => void;
  onPass?: (userId: string, userName: string, photoUrl: string) => void;
  onLike?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
  likedMatchIds?: Set<string>;
  canUndo?: boolean;
  onUndo?: () => void;
}

export function SwipeableMatchView({
  matches,
  onMatchInteraction,
  hasActivated,
  onUnlock,
  isVerified,
  onVerify,
  onPass,
  onLike,
  onViewProfile,
  likedMatchIds,
  canUndo = false,
  onUndo,
}: SwipeableMatchViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const safeIndex = Math.min(currentIndex, Math.max(0, matches.length - 1));
  const currentMatch = matches.length > 0 ? matches[safeIndex] : null;
  const nextMatch = safeIndex < matches.length - 1 ? matches[safeIndex + 1] : null;
  const progress = matches.length > 0 ? ((safeIndex + 1) / matches.length) * 100 : 0;

  if (!matches || matches.length === 0 || !currentMatch) {
    return (
      <div className="min-h-[60vh] bg-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-6">
            <ParallelIcon size={48} className="text-black" />
          </div>
          <h2 className="text-2xl font-medium mb-3">Your match suggestions are on the way</h2>
          <p className="text-gray-600 leading-relaxed">
            We're carefully finding people who align with what matters to you. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  const handlePass = (id: string) => {
    const name = currentMatch.user.name;
    const photo = currentMatch.user.photoUrl || currentMatch.user.photos?.[0] || '';
    onPass?.(id, name, photo);
  };

  const handleLike = (id: string) => {
    onLike?.(id);
    if (safeIndex < matches.length - 1) setCurrentIndex(safeIndex + 1);
  };

  const handleUndo = () => {
    if (safeIndex > 0) setCurrentIndex(safeIndex - 1);
    onUndo?.();
  };

  // Only show counter when there are multiple matches — "1 of 1" is deflating
  const showCounter = matches.length > 1;

  return (
    <div className="bg-white flex flex-col">
      <div className="px-4 pt-4 pb-2 max-w-md mx-auto w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Match Suggestions
          </span>
          {showCounter && (
            <span className="text-xs text-gray-400">
              {safeIndex + 1} of {matches.length}
            </span>
          )}
        </div>
        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-black rounded-full transition-all duration-300"
            style={{ width: showCounter ? `${progress}%` : '100%' }}
          />
        </div>
      </div>

      {canUndo && (
        <div className="flex justify-start px-4 pt-1 pb-0 max-w-md mx-auto w-full">
          <button onClick={handleUndo}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-black transition-colors"
          >
            <Undo2 size={14} />
            <span>Undo last pass</span>
          </button>
        </div>
      )}

      <div className="flex-1 flex items-start justify-center px-4 pt-2 pb-4">
        <div className="w-full max-w-md relative">
          {nextMatch && (
            <div
              className="absolute inset-x-3 top-2 bottom-0 bg-gray-100 rounded-3xl border-2 border-gray-200"
              style={{ zIndex: 0 }}
            />
          )}
          <div className="relative" style={{ zIndex: 1 }}>
            <MatchCard
              match={currentMatch}
              hasActivated={hasActivated ?? false}
              onPass={handlePass}
              onLike={handleLike}
              onViewProfile={id => onViewProfile?.(id)}
              onUnlock={() => {
                if (!hasActivated) onUnlock?.();
                else if (!isVerified) onVerify?.();
              }}
              isLiked={likedMatchIds?.has(currentMatch.user.id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}