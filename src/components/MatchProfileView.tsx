import { useState, useEffect } from 'react';
import { MapPin, Briefcase, GraduationCap, Instagram, Heart, X, Flag, Ban, ChevronLeft, MoreVertical, Wine, Cigarette, PawPrint, Church, Vote, ShieldCheck, UserMinus, Lock } from 'lucide-react';
import { Match } from '../types';
import { EDGE_FUNCTION_URL, MATCHES_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';

function getAuthHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': publicAnonKey,
  };
}

interface MatchProfileViewProps {
  match: Match;
  onBack: () => void;
  onOpenChat: (matchId: string) => void;
  onMatch: (matchId: string) => void;
  onPass: (matchId: string) => void;
  accessToken?: string | null;
  isLiked?: boolean;
  passFeedbackOpen?: boolean;
  /** @deprecated — shared hobbies now come from matchDetails.sharedHobbies */
  myHobbies?: string[];
}

// 8-category display order + bar colors
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

export function MatchProfileView({
  match,
  onBack,
  onOpenChat,
  onMatch,
  onPass,
  isLiked = false,
}: MatchProfileViewProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showSafetyMenu, setShowSafetyMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showUnmatchModal, setShowUnmatchModal] = useState(false);
  const [showReportSuccess, setShowReportSuccess] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  const { user, compatibilityScore, matchDetails } = match;
  const photos = user.photos?.length ? user.photos : (user.photoUrl ? [user.photoUrl] : []);
  const politics = (user as any).politics as string | null | undefined;
  const religion = (user as any).religion as string | null | undefined;
  const locationDisplay = (user as any).locationDisplay as string | null | undefined;

  // Hobbies: shared come from backend (matchDetails.sharedHobbies),
  // other comes from their full hobby list minus the shared ones.
  const allTheirHobbies = ((user as any).hobbies as string[] | null | undefined) ?? [];
  const sharedHobbies = matchDetails?.sharedHobbies ?? [];
  const sharedSet = new Set(sharedHobbies);
  const otherHobbies = allTheirHobbies.filter(h => !sharedSet.has(h));
  const hasAnyHobbies = allTheirHobbies.length > 0;

  const breakdown = (matchDetails?.breakdown ?? {}) as Record<string, number | undefined>;
  // Count categories with a real score to decide whether to render the whole section
  const categoriesWithData = CATEGORY_ORDER.filter(
    (label) => typeof breakdown[label] === 'number' && (breakdown[label] as number) > 0
  );
  const showBreakdownSection = categoriesWithData.length > 0;

  const getCompatibilityLabel = (score: number) => {
    if (score >= 90) return 'Exceptional Match';
    if (score >= 80) return 'Strong Match';
    if (score >= 70) return 'Good Compatibility';
    if (score >= 60) return 'Moderate Compatibility';
    return 'Some Potential';
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (showSafetyMenu && !(e.target as HTMLElement).closest('.safety-menu-container')) {
        setShowSafetyMenu(false);
      }
    }
    if (showSafetyMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSafetyMenu]);

  const handlePass = () => { onPass(user.id); };

  const handleMatch = async () => {
    if (isLiked || isLiking) return;
    setIsLiking(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`${MATCHES_FUNCTION_URL}/action`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ matchUserId: user.id, action: 'like' }),
      });
      if (res.ok) {
        const data = await res.json();
        onMatch(user.id);
        if (data.isMutual === true) {
          setIsMutual(true);
          setTimeout(() => { onOpenChat(user.id); }, 1500);
        } else {
          onBack();
        }
      }
    } catch (err) {
      console.error('Failed to like match:', err);
      onBack();
    } finally {
      setIsLiking(false);
    }
  };

  const handleUnmatch = async () => {
    const token = await getAccessToken();
    if (token) {
      try {
        await fetch(`${MATCHES_FUNCTION_URL}/action`, {
          method: 'POST',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ matchUserId: user.id, action: 'pass' }),
        });
      } catch (e) {}
    }
    setShowUnmatchModal(false);
    onBack();
  };

  const profileDetails = [
    user.education ? { icon: GraduationCap, label: 'Education', value: user.education } : null,
    user.career ? { icon: Briefcase, label: 'Career', value: user.career } : null,
    religion ? { icon: Church, label: 'Religion', value: religion } : null,
    politics ? { icon: Vote, label: 'Politics', value: politics } : null,
    (user as any).drinking ? { icon: Wine, label: 'Drinking', value: (user as any).drinking } : null,
    (user as any).smoking ? { icon: Cigarette, label: 'Smoking', value: (user as any).smoking } : null,
    (user as any).pets ? { icon: PawPrint, label: 'Pets', value: (user as any).pets } : null,
  ].filter(Boolean) as { icon: any; label: string; value: string }[];

  return (
    <div className="min-h-screen bg-white pt-20 pb-32">

      {/* Header */}
      <div className="max-w-2xl mx-auto px-4 mb-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors flex items-center gap-1"
        >
          <ChevronLeft size={20} />
          <span className="text-sm text-gray-600">Matches</span>
        </button>
        <div className="relative safety-menu-container">
          <button
            onClick={() => setShowSafetyMenu(!showSafetyMenu)}
            className="p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-full transition-colors"
          >
            <MoreVertical size={20} />
          </button>
          {showSafetyMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSafetyMenu(false)} />
              <div className="absolute right-0 top-12 w-52 bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden z-50">
                <button
                  onClick={() => { setShowSafetyMenu(false); setShowUnmatchModal(true); }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors"
                >
                  <UserMinus size={18} className="text-gray-600" />
                  <span>Unmatch</span>
                </button>
                <button
                  onClick={() => { setShowSafetyMenu(false); setShowReportModal(true); }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-t border-gray-100"
                >
                  <Flag size={18} className="text-gray-600" />
                  <span>Report User</span>
                </button>
                <button
                  onClick={() => { setShowSafetyMenu(false); setShowBlockModal(true); }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-t border-gray-100 text-red-600"
                >
                  <Ban size={18} />
                  <span>Block User</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Unmatch Modal */}
      {showUnmatchModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full">
            <h2 className="mb-3">Unmatch {user.name}?</h2>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              They'll be removed from your matches and won't be able to contact you. You can unblock them anytime from Privacy & Safety in your account.
            </p>
            <div className="space-y-3">
              <button onClick={handleUnmatch} className="w-full py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-colors font-medium">Unmatch</button>
              <button onClick={() => setShowUnmatchModal(false)} className="w-full py-3 border-2 border-gray-200 rounded-full hover:border-gray-400 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full">
            <h2 className="mb-4">Report {user.name}</h2>
            {!showReportSuccess ? (
              <>
                <p className="text-gray-600 mb-4 text-sm">Help us keep Parallel safe. Select the reason for your report.</p>
                <div className="space-y-2 mb-4">
                  {['Inappropriate photos', 'Fake profile', 'Harassment or hateful language', 'Spam or scam', 'Other'].map(reason => (
                    <button key={reason}
                      className="w-full p-3 text-left rounded-xl border-2 border-gray-200 hover:border-black transition-colors text-sm"
                      onClick={async () => {
                        const token = await getAccessToken();
                        if (token) {
                          try {
                            await fetch(`${MISC_FUNCTION_URL}/safety/report`, {
                              method: 'POST', headers: getAuthHeaders(token),
                              body: JSON.stringify({ reportedUserId: user.id, reason, feelsUnsafe: false }),
                            });
                          } catch (e) {}
                        }
                        setShowReportSuccess(true);
                        setTimeout(() => { setShowReportModal(false); setShowReportSuccess(false); }, 2500);
                      }}
                    >{reason}</button>
                  ))}
                </div>
                <button
                  className="w-full p-3 text-left rounded-xl border-2 border-red-200 bg-red-50 hover:border-red-400 transition-colors text-sm text-red-700 font-medium"
                  onClick={async () => {
                    const token = await getAccessToken();
                    if (token) {
                      try {
                        await fetch(`${MISC_FUNCTION_URL}/safety/report`, {
                          method: 'POST', headers: getAuthHeaders(token),
                          body: JSON.stringify({ reportedUserId: user.id, reason: 'Safety concern — user feels unsafe', feelsUnsafe: true }),
                        });
                      } catch (e) {}
                    }
                    setShowReportSuccess(true);
                    setTimeout(() => { setShowReportModal(false); setShowReportSuccess(false); }, 2500);
                  }}
                >I feel unsafe</button>
                <button onClick={() => setShowReportModal(false)} className="w-full py-3 mt-3 border-2 border-gray-200 rounded-full hover:border-gray-400 transition-colors">Cancel</button>
              </>
            ) : (
              <div className="py-4 text-center space-y-2">
                <p className="text-gray-700 font-medium">✓ Report submitted</p>
                <p className="text-sm text-gray-500">Our team will review it as soon as possible.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full">
            <h2 className="mb-4">Block {user.name}?</h2>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">They won't be able to see your profile or message you.</p>
            <div className="space-y-3">
              <button onClick={async () => {
                const token = await getAccessToken();
                if (token) {
                  try { await fetch(`${MISC_FUNCTION_URL}/safety/block`, { method: 'POST', headers: getAuthHeaders(token), body: JSON.stringify({ blockedUserId: user.id }) }); } catch (e) {}
                }
                setShowBlockModal(false); onBack();
              }} className="w-full py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors font-medium">Block User</button>
              <button onClick={() => setShowBlockModal(false)} className="w-full py-3 border-2 border-gray-200 rounded-full hover:border-gray-400 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 space-y-5">

        {/* Photo carousel */}
        <div>
          <div className="relative aspect-[4/5] rounded-3xl overflow-hidden border-2 border-gray-200">
            {photos[photoIndex] ? (
              <img src={photos[photoIndex]} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                <p className="text-gray-400">No photo</p>
              </div>
            )}
            {photos.length > 1 && (
              <>
                <div className="absolute left-0 top-0 w-1/3 h-full z-10 cursor-pointer" onClick={() => setPhotoIndex(i => Math.max(0, i - 1))} />
                <div className="absolute right-0 top-0 w-1/3 h-full z-10 cursor-pointer" onClick={() => setPhotoIndex(i => Math.min(photos.length - 1, i + 1))} />
                <div className="absolute top-3 left-0 right-0 flex justify-center gap-1 z-20">
                  {photos.map((_, idx) => (
                    <div key={idx} className={`h-1 rounded-full transition-all ${idx === photoIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`} />
                  ))}
                </div>
              </>
            )}
            {user.isVerified && (
              <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-blue-500 text-white px-3 py-1.5 rounded-full shadow-lg">
                <ShieldCheck size={13} /><span className="text-xs font-medium">Verified</span>
              </div>
            )}
            <div className="absolute bottom-3 right-3 z-20 bg-white rounded-full px-3 py-1.5 shadow-lg border-2 border-gray-200">
              <div className="text-center">
                <div className="text-base font-bold leading-none">{compatibilityScore}%</div>
                <div className="text-xs text-gray-500 whitespace-nowrap mt-0.5">{getCompatibilityLabel(compatibilityScore)}</div>
              </div>
            </div>
          </div>
          {photos.length > 1 && (
            <p className="text-center text-xs text-gray-400 mt-2">Photo {photoIndex + 1} of {photos.length} — tap sides to browse</p>
          )}
        </div>

        {/* Name / age / height / location / pronouns — no pills, no life stage */}
        <div>
          <h1 className="text-2xl font-bold">
            {user.name}, {user.age}{(user as any).height ? ` · ${(user as any).height}` : ''}
          </h1>
          {(locationDisplay || user.pronouns) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-gray-500 text-sm">
              {locationDisplay && (
                <div className="flex items-center gap-1"><MapPin size={13} /><span>{locationDisplay}</span></div>
              )}
              {user.pronouns && <span>{user.pronouns}</span>}
            </div>
          )}
        </div>

        {/* Bio as prose (no gray card wrapper) */}
        {user.bio && (
          <p className="text-[15px] text-gray-700 leading-relaxed">{user.bio}</p>
        )}

        {/* Compatibility Breakdown — all 8 bars always rendered.
            Static for now. Categories with no score show "Not enough data yet". */}
        {showBreakdownSection && (
          <div className="p-4 bg-white rounded-2xl border-2 border-gray-200">
            <h3 className="text-sm font-semibold mb-4">Compatibility Breakdown</h3>
            <div className="space-y-3.5">
              {CATEGORY_ORDER.map((label) => {
                const raw = breakdown[label];
                const hasScore = typeof raw === 'number' && raw > 0;
                const score = hasScore ? (raw as number) : 0;
                const barColor = CATEGORY_COLORS[label] || 'bg-black';

                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm ${hasScore ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
                      {hasScore ? (
                        <span className="text-sm font-medium text-gray-800">{score}%</span>
                      ) : (
                        <span className="text-xs italic text-gray-400">Not enough data yet</span>
                      )}
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      {hasScore && (
                        <div
                          className={`h-full ${barColor} rounded-full transition-all`}
                          style={{ width: `${score}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hobbies — shared first (black), others below (gray).
            Section is hidden only if they have zero hobbies at all. */}
        {hasAnyHobbies && (
          <div className="p-4 bg-white rounded-2xl border-2 border-gray-200">
            <h3 className="text-sm font-semibold mb-3">Hobbies &amp; Interests</h3>
            {sharedHobbies.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">You both enjoy</p>
                <div className="flex flex-wrap gap-2">
                  {sharedHobbies.map((hobby) => (
                    <span key={hobby} className="text-xs px-3 py-1.5 bg-black text-white rounded-full font-medium">
                      {hobby}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {otherHobbies.length > 0 && (
              <div>
                {sharedHobbies.length > 0 && (
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Also into</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {otherHobbies.map((hobby) => (
                    <span key={hobby} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full">
                      {hobby}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Profile Basics */}
        {profileDetails.length > 0 && (
          <div className="p-4 bg-white rounded-2xl border-2 border-gray-200">
            <h3 className="text-sm font-semibold mb-3">Profile Basics</h3>
            <div className="grid grid-cols-1 gap-3">
              {profileDetails.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm text-gray-800">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instagram */}
        {user.instagram && !isMutual && (
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              <Lock size={14} className="text-gray-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700">Instagram</p>
              <p className="text-xs text-gray-400">Unlocks after you both like each other</p>
            </div>
          </div>
        )}
        {user.instagram && isMutual && (
          <div className="flex items-center gap-1.5 text-gray-500 text-sm px-1">
            <Instagram size={13} />
            <span>@{user.instagram}</span>
          </div>
        )}

        <div className="h-8" />
      </div>

      {/* Fixed bottom action bar */}
      {isMutual ? (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4 pb-8 z-[60]">
          <div className="max-w-md mx-auto p-4 bg-black text-white rounded-2xl text-center">
            <p className="text-lg font-medium">🎉 It's a mutual match!</p>
            <p className="text-gray-300 text-sm mt-1">Taking you to messaging with {user.name}…</p>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 px-4 pt-4 pb-8 z-[60]">
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            <button
              onClick={handlePass}
              className="w-14 h-14 border-2 border-gray-300 bg-white rounded-full hover:border-gray-400 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm flex-shrink-0"
            >
              <X className="w-5 h-5 text-gray-500" />
              <span className="text-[10px] text-gray-400">Pass</span>
            </button>
            <button
              onClick={handleMatch}
              disabled={isLiked || isLiking}
              className={`flex-1 h-14 rounded-full transition-all flex items-center justify-center gap-2 font-medium shadow-lg ${
                isLiked ? 'bg-red-500 text-white cursor-default'
                : isLiking ? 'bg-gray-400 text-white cursor-wait'
                : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span>{isLiked ? 'Liked ✓' : 'Like'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}