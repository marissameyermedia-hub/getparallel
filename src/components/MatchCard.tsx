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
  const { user, compatibilityScore, distanceMiles } = match;

  const locationDisplay = (user as any).locationDisplay as string | null | undefined;
  const heightDisplay = (user as any).height as string | null | undefined;
  const photos = user.photos?.length ? user.photos : (user.photoUrl ? [user.photoUrl] : []);
  const primaryPhoto = photos[0];

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
    if (!hasActivated) { onUnlock?.(); return; }
    onViewProfile(user.id);
  };

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
  const handleViewProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewProfile(user.id);
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
      className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden cursor-pointer transition-all active:scale-[0.99] hover:border-gray-300"
    >
      {/* Photo zone — fixed dvh height so it never overflows the viewport */}
      <div className="relative h-[52dvh] w-full bg-gray-100">
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
              <Lock size={48} className="text-white" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 z-10">
              <p className="text-white text-xl font-semibold">{user.age} years old</p>
              <p className="text-white/70 text-sm mt-0.5">Subscribe to unlock your matches →</p>
            </div>
          </div>
        ) : (
          <>
            {primaryPhoto ? (
              <img src={primaryPhoto} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                <div className="w-20 h-20 bg-gray-400 rounded-full flex items-center justify-center text-white text-2xl font-semibold">
                  {getInitials(user.name)}
                </div>
              </div>
            )}

            {/* Verified badge — top left */}
            {user.isVerified && (
              <div className="absolute top-3 left-3 bg-parallel-purple rounded-full p-1.5 shadow-lg z-20">
                <ShieldCheck size={16} className="text-white" />
              </div>
            )}

            {/* "Interested in you" chip */}
            {hasLikedMe && !user.isVerified && (
              <div className="absolute top-3 left-3 bg-white text-parallel-void text-xs font-medium px-2 py-1 rounded-full z-10">
                ❤️ Interested in you
              </div>
            )}

            {/* Name, age, height, location overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 z-10">
              <p className="text-white text-xl font-semibold leading-tight">
                {user.name}, {user.age}{heightDisplay ? ` · ${heightDisplay}` : ''}
              </p>
              {locationLine && (
                <div className="flex items-center gap-1 mt-1">
                  <MapPin size={12} className="text-white/70 flex-shrink-0" />
                  <p className="text-white/80 text-xs">{locationLine}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Compatibility badge — top right */}
        <div className="absolute top-3 right-3 bg-white rounded-full px-3 py-1.5 shadow-lg border-2 border-[#7B5EA7] z-20">
          <div className="text-center">
            <div className="text-base font-bold leading-none text-[#7B5EA7]">{compatibilityScore}%</div>
            <div className="text-xs text-[#7B5EA7] whitespace-nowrap mt-0.5">{getMatchLabel(compatibilityScore)}</div>
          </div>
        </div>
      </div>

      {/* Seamless purple "View full profile" band — flush against photo */}
      {hasActivated && (
        <button
          onClick={handleViewProfileClick}
          aria-label={`View ${user.name}'s full profile`}
          className="w-full py-3 bg-parallel-purple text-white text-sm font-medium text-center hover:bg-parallel-purple/90 transition-colors active:opacity-80"
        >
          View full profile →
        </button>
      )}

      {/* Unlock CTA (non-activated) */}
      {!hasActivated && (
        <div className="p-4">
          <button
            onClick={handleUnlockClick}
            className="w-full bg-parallel-purple text-white rounded-full hover:bg-parallel-purple/90 transition-all font-medium text-base py-4 px-6"
          >
            Unlock who's waiting for you →
          </button>
        </div>
      )}

      {/* Pass + Like */}
      {hasActivated && (
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={handlePassClick}
            className="w-12 h-12 border-2 border-gray-200 rounded-full hover:border-gray-400 transition-all flex flex-col items-center justify-center gap-0.5 flex-shrink-0"
            aria-label="Pass"
          >
            <X size={16} className="text-gray-500" aria-hidden="true" />
            <span className="text-[10px] text-gray-500">Pass</span>
          </button>
          <button
            onClick={handleLikeClick}
            disabled={isLiked}
            className={`flex-1 h-12 rounded-full transition-all flex items-center justify-center gap-2 font-medium ${
              isLiked ? 'bg-red-500 text-white cursor-default' : 'bg-parallel-purple text-white hover:bg-parallel-purple/90'
            }`}
          >
            <Heart size={18} className={isLiked ? 'fill-current' : ''} />
            <span className="text-sm">{isLiked ? 'Liked ✓' : 'Like'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
