import { X, ShieldCheck, Lock, Heart, MapPin } from 'lucide-react';
import { Match } from '../types';

interface MatchCardProps {
  match: Match;
  hasActivated: boolean;
  onPass: (userId: string, userName: string, photoUrl: string) => void;
  onLike: (userId: string) => void;
  onViewProfile: (userId: string) => void;
  onUnlock?: () => void;
  isLiked?: boolean;
  hasLikedMe?: boolean;
}

// 8-category display order + bar colors. Must match MatchProfileView.
const CATEGORY_ORDER = [
  'Attachment & Emotional Health',
  'Communication & Conflict',
  'Life Goals',
  'Values & Beliefs',
  'Financial & Career',
  'Intimacy & Connection',
  'Lifestyle Behaviors',
  'Social & Shared Life',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'Attachment & Emotional Health': 'bg-purple-500',
  'Communication & Conflict': 'bg-indigo-500',
  'Life Goals': 'bg-blue-500',
  'Values & Beliefs': 'bg-cyan-500',
  'Financial & Career': 'bg-amber-500',
  'Intimacy & Connection': 'bg-pink-500',
  'Lifestyle Behaviors': 'bg-green-500',
  'Social & Shared Life': 'bg-orange-400',
};

export function MatchCard({
  match,
  hasActivated,
  onPass,
  onLike,
  onViewProfile,
  onUnlock,
  isLiked = false,
  hasLikedMe = false,
}: MatchCardProps) {
  const { user, compatibilityScore, matchDetails, distanceMiles } = match;

  const locationDisplay = (user as any).locationDisplay as string | null | undefined;
  const heightDisplay = (user as any).height as string | null | undefined;
  const photos = user.photos?.length ? user.photos : (user.photoUrl ? [user.photoUrl] : []);
  const primaryPhoto = photos[0];

  // Single photo on the card — photo carousel lives on the profile view
  // (tap through to see more photos).

  const breakdown = (matchDetails?.breakdown ?? {}) as Record<string, number | undefined>;
  const categoriesWithData = CATEGORY_ORDER.filter(
    (label) => typeof breakdown[label] === 'number' && (breakdown[label] as number) > 0
  );
  const showBreakdown = categoriesWithData.length > 0;

  const formatDistance = (miles?: number) => {
    if (miles === undefined || miles === null) return null;
    if (miles < 1) return 'Less than 1 mile away';
    if (miles > 100) return null;
    return `${Math.round(miles)} miles away`;
  };
  const locationLine = formatDistance(distanceMiles) || locationDisplay || null;

  const getMatchLabel = (score: number) => {
    if (score >= 90) return 'Exceptional';
    if (score >= 80) return 'Strong Match';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Moderate';
    return 'Some Potential';
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const handleCardClick = () => {
    if (!hasActivated) {
      onUnlock?.();
      return;
    }
    onViewProfile(user.id);
  };

  // Like/Pass must stop propagation so they don't also trigger the card's
  // navigate-to-profile behavior.
  const handlePassClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPass(user.id, user.name, primaryPhoto || '');
  };
  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasActivated) { onUnlock?.(); return; }
    if (isLiked) return;
    onLike(user.id);
  };
  const handleUnlockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUnlock?.();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden cursor-pointer transition-all active:scale-[0.99] active:bg-gray-50 hover:border-gray-300"
    >
      {/* Photo zone — single photo, overlay with name/age/height/location,
          compatibility badge top right, verified badge top left */}
      <div className="relative aspect-[3/4] bg-gray-100">
        {!hasActivated ? (
          <div className="w-full h-full relative overflow-hidden">
            {primaryPhoto ? (
              <>
                <img src={primaryPhoto} alt="Match preview" className="w-full h-full object-cover blur-2xl scale-110" />
                <div className="absolute inset-0 bg-gray-900/40" />
              </>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-300 via-gray-200 to-gray-300" />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <Lock size={48} className="text-primary" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 z-10">
              <p className="text-primary text-xl font-semibold">{user.age} years old</p>
              <p className="text-primary/70 text-sm mt-0.5">Subscribe to unlock your matches →</p>
            </div>
          </div>
        ) : (
          <>
            {primaryPhoto ? (
              <img src={primaryPhoto} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                <div className="w-20 h-20 bg-gray-400 rounded-full flex items-center justify-center text-primary text-2xl font-semibold">
                  {getInitials(user.name)}
                </div>
              </div>
            )}

            {/* Verified badge — top left */}
            {user.isVerified && (
              <div className="absolute top-3 left-3 bg-blue-500 rounded-full p-1.5 shadow-lg z-20">
                <ShieldCheck size={16} className="text-primary" />
              </div>
            )}

            {/* "Interested in you" chip — shown only if the other user liked first */}
            {hasLikedMe && !user.isVerified && (
              <div className="absolute top-3 left-3 bg-white text-black text-xs font-medium px-2 py-1 rounded-full z-10">
                ❤️ Interested in you
              </div>
            )}

            {/* Name, age, height, location overlay at bottom of photo */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 z-10">
              <p className="text-primary text-xl font-semibold leading-tight">
                {user.name}, {user.age}{heightDisplay ? ` · ${heightDisplay}` : ''}
              </p>
              {locationLine && (
                <div className="flex items-center gap-1 mt-1">
                  <MapPin size={12} className="text-primary/70 flex-shrink-0" />
                  <p className="text-primary/80 text-xs">{locationLine}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Compatibility badge — top right */}
        <div className="absolute top-3 right-3 bg-white rounded-full px-3 py-1.5 shadow-lg border-2 border-gray-200 z-20">
          <div className="text-center">
            <div className="text-base font-bold leading-none">{compatibilityScore}%</div>
            <div className="text-xs text-gray-500 whitespace-nowrap mt-0.5">{getMatchLabel(compatibilityScore)}</div>
          </div>
        </div>
      </div>

      {/* Card body */}
      {!hasActivated ? (
        <div className="p-5 space-y-3">
          <button
            onClick={handleUnlockClick}
            className="w-full bg-black text-primary rounded-full hover:bg-gray-800 transition-all font-medium text-base py-4 px-6"
          >
            Unlock who's waiting for you →
          </button>
        </div>
      ) : (
        <div className="p-5 space-y-4">

          {/* Bio — full prose, no gray card wrapper */}
          {user.bio && (
            <p className="text-sm text-gray-700 leading-relaxed">{user.bio}</p>
          )}

          {/* 8-category Compatibility Breakdown — always all 8, same bar colors as profile */}
          {showBreakdown && (
            <div>
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                Compatibility Breakdown
              </h4>
              <div className="space-y-2.5">
                {CATEGORY_ORDER.map((label) => {
                  const raw = breakdown[label];
                  const hasScore = typeof raw === 'number' && raw > 0;
                  const score = hasScore ? (raw as number) : 0;
                  const barColor = CATEGORY_COLORS[label] || 'bg-black';

                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs ${hasScore ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
                        {hasScore ? (
                          <span className="text-xs font-medium text-gray-800">{score}%</span>
                        ) : (
                          <span className="text-[10px] italic text-gray-400">Not enough data yet</span>
                        )}
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        {hasScore && (
                          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${score}%` }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons — Pass + Like. Both stop propagation so the card's
              navigate-to-profile behavior doesn't fire when tapping them. */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handlePassClick}
              className="w-12 h-12 border-2 border-gray-200 rounded-full hover:border-gray-400 transition-all flex flex-col items-center justify-center gap-0.5 flex-shrink-0"
              aria-label="Pass"
            >
              <X size={16} className="text-gray-500" />
              <span className="text-[10px] text-gray-400">Pass</span>
            </button>
            <button
              onClick={handleLikeClick}
              disabled={isLiked}
              className={`flex-1 h-12 rounded-full transition-all flex items-center justify-center gap-2 font-medium ${
                isLiked ? 'bg-red-500 text-primary cursor-default' : 'bg-black text-primary hover:bg-gray-800'
              }`}
            >
              <Heart size={18} className={isLiked ? 'fill-current' : ''} />
              <span className="text-sm">{isLiked ? 'Liked ✓' : 'Like'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}