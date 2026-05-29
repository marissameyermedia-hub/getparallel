import { useState, useEffect } from 'react';
import { MapPin, Briefcase, GraduationCap, Instagram, Heart, X, Flag, Ban, ChevronLeft, MoreVertical, Wine, Cigarette, PawPrint, Church, Vote, ShieldCheck, UserMinus, Lock, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { Match } from '../types';
import { EDGE_FUNCTION_URL, MATCHES_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';
import { useModalA11y } from '../utils/useModalA11y';
import { ParallelWordmark } from './ParallelWordmark';

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
  onMatch: (matchId: string) => Promise<{ isMutual: boolean }> | void;
  onPass: (matchId: string) => void;
  accessToken?: string | null;
  isLiked?: boolean;
  passFeedbackOpen?: boolean;
  /**
   * When true, the user is viewing the profile of someone they've already
   * matched with (arriving from inbox or messaging). The bottom Like/Pass
   * action bar is replaced with a "Message" button that returns to chat.
   * Defaults to false (normal browse-from-home behavior).
   */
  alreadyMatched?: boolean;
  /**
   * When true, the user is previewing their *own* profile. Changes the UX
   * in five ways so they don't think the example data is real:
   *   1. Sticky banner at top: "Preview mode — compatibility scores are example data"
   *   2. Score badge text: "Preview / Sample score" (instead of e.g. "100% / Exceptional Match")
   *   3. Compatibility Breakdown gets an italic disclaimer noting bars are illustrative
   *   4. Instagram unlocks (so they can verify their own handle is right)
   *   5. Bottom Pass/Like action bar replaced with single "Edit Profile" button
   * Also hides the safety menu (block/report/unmatch don't apply to yourself).
   */
  isPreview?: boolean;
  /**
   * Called when the user taps the "Edit Profile" button in preview mode.
   * Required when isPreview=true; ignored otherwise.
   */
  onEditProfile?: () => void;
  /** @deprecated — shared hobbies now come from matchDetails.sharedHobbies */
  myHobbies?: string[];
}

function normalizePronouns(val: string): string {
  const trimmed = val.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.includes('/')) return trimmed.replace(/\s*\/\s*/g, '/');
  return trimmed.replace(/\s+/g, '/');
}

// 8-category display order + bar colors
const CATEGORY_ORDER = [
  'Attachment & Emotional Health',
  'Communication & Conflict',
  'Life Goals',
  'Values & Beliefs',
  'Financial & Career',
  'Connection Style',
  'Lifestyle Behaviors',
  'Social & Shared Life',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'Attachment & Emotional Health': 'bg-parallel-purple',
  'Communication & Conflict':      'bg-purple-700',
  'Life Goals':                    'bg-violet-600',
  'Values & Beliefs':              'bg-purple-900',
  'Financial & Career':            'bg-violet-500',
  'Connection Style':         'bg-parallel-soft-violet',
  'Lifestyle Behaviors':           'bg-purple-600',
  'Social & Shared Life':          'bg-parallel-stone',
};

function getCategoryInsight(label: string, score: number): string {
  const t = (a: string, b: string, c: string, d: string, e: string) =>
    score >= 90 ? a : score >= 76 ? b : score >= 56 ? c : score >= 31 ? d : e;

  switch (label) {
    case 'Attachment & Emotional Health':
      return t(
        'Deep emotional alignment — you approach closeness and vulnerability in compatible ways.',
        'Good emotional fit. Similar approaches to intimacy and emotional connection.',
        'Some differences in how you handle emotional closeness. Worth exploring early.',
        'Different attachment styles — you may need each other in ways the other finds challenging.',
        'Significant differences in emotional needs. The most important category to discuss openly.',
      );
    case 'Communication & Conflict':
      return t(
        'You handle disagreements the same way — both willing to work through things and repair quickly.',
        'Good communication fit. Similar approaches to conflict and resolution.',
        'Some differences in communication style. One of you may go quiet when the other wants to talk it out.',
        'You process conflict differently. Doesn\'t have to be a dealbreaker — but get this on the table early.',
        'Very different conflict styles. One tends toward avoidance, the other toward confrontation — be honest about this.',
      );
    case 'Life Goals':
      return t(
        'Aligned on the big stuff — kids, marriage, timing, and relationship type.',
        'Strong alignment on major life goals and timeline.',
        'Mostly aligned on life goals with a few areas worth exploring.',
        'Some meaningful differences in life direction or timeline. Worth an honest conversation.',
        'Significant differences in life goals — kids, marriage, or relationship type may not align.',
      );
    case 'Values & Beliefs':
      return t(
        'Very similar core values and worldview — what matters most to each of you is deeply shared.',
        'Strong values alignment. You see the world in similar ways.',
        'Mostly similar values with some differences in beliefs or priorities.',
        'Some differences in core values. Can work with mutual respect — depends on how central these are to you.',
        'Different foundational values. Requires genuine openness on both sides.',
      );
    case 'Financial & Career':
      return t(
        'Aligned on ambition, money philosophy, and what success looks like.',
        'Good financial and career compatibility — similar outlook on stability and goals.',
        'Some differences in financial or career priorities. These tend to be more negotiable over time.',
        'Different financial philosophies or career orientations. Worth understanding each other\'s approach.',
        'Meaningfully different views on money and ambition. Neither is wrong — but they\'re different.',
      );
    case 'Connection Style':
      return t(
        'Strong compatibility in how you each seek and express closeness.',
        'Good intimacy alignment — similar preferences for how connection is built.',
        'Some differences in intimacy preferences. Usually bridgeable with good communication.',
        'Different needs or styles around physical and emotional intimacy.',
        'Significant differences in intimacy style — an important early conversation.',
      );
    case 'Lifestyle Behaviors':
      return t(
        'Daily life compatibility is high — similar habits, routines, and lifestyle choices.',
        'Good lifestyle fit. Similar day-to-day habits and preferences.',
        'Mostly compatible with a few differences in habits or routines.',
        'Some lifestyle differences that could create friction — drinking, diet, schedules, or tidiness.',
        'Different daily habits and lifestyle choices. Requires real accommodation from both.',
      );
    case 'Social & Shared Life':
      return t(
        'You\'d thrive socially together — similar energy, social needs, and how you recharge.',
        'Good social fit. Aligned on how you like to spend time and energy.',
        'Some differences in social pace. One of you may need more solo time than the other.',
        'Different social rhythms — introvert vs. extrovert tendencies.',
        'Very different social needs. Can work, but requires intentionality.',
      );
    default:
      return 'Tap any category to learn more about what\'s driving this score.';
  }
}

export function MatchProfileView({
  match,
  onBack,
  onOpenChat,
  onMatch,
  onPass,
  isLiked = false,
  alreadyMatched = false,
  isPreview = false,
  onEditProfile,
}: MatchProfileViewProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showSafetyMenu, setShowSafetyMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showUnmatchModal, setShowUnmatchModal] = useState(false);
  const [showReportSuccess, setShowReportSuccess] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  // Wire Escape-to-close + body-scroll-lock + focus restore for all 3 modals.
  useModalA11y(showUnmatchModal, () => setShowUnmatchModal(false));
  useModalA11y(showReportModal, () => setShowReportModal(false));
  useModalA11y(showBlockModal, () => setShowBlockModal(false));

  const { user, compatibilityScore, matchDetails } = match;
  const photos = user.photos?.length ? user.photos : (user.photoUrl ? [user.photoUrl] : []);
  const politics = user.politics ?? undefined;
  const religion = user.religion ?? undefined;
  const locationDisplay = (user as any).locationDisplay as string | null | undefined;

  // Hobbies: shared come from backend (matchDetails.sharedHobbies),
  // other comes from their full hobby list minus the shared ones.
  const allTheirHobbies = user.hobbies ?? [];
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

  // Close the safety popover menu on Escape.
  useEffect(() => {
    if (!showSafetyMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSafetyMenu(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showSafetyMenu]);

  const handlePass = () => { onPass(user.id); };

  const handleMatch = async () => {
    if (isLiked || isLiking) return;
    setIsLiking(true);
    try {
      const result = await onMatch(user.id);
      const isMutualResult = result?.isMutual === true;
      if (isMutualResult) {
        setIsMutual(true);
        setTimeout(() => { onBack(); }, 1500);
      } else {
        onBack();
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

  const fv = user.fieldVisibility ?? {};
  const fvVisible = (key: string) => fv[key] !== false;
  const profileDetails = [
    (user.education && fvVisible('education')) ? { icon: GraduationCap, label: 'Education', value: user.education } : null,
    (user.career && fvVisible('career')) ? { icon: Briefcase, label: 'Career', value: user.career } : null,
    (religion && fvVisible('religion')) ? { icon: Church, label: 'Religion', value: religion } : null,
    (politics && fvVisible('politics')) ? { icon: Vote, label: 'Politics', value: politics } : null,
    (user.drinking && fvVisible('drinking')) ? { icon: Wine, label: 'Drinking', value: user.drinking } : null,
    (user.smoking && fvVisible('smoking')) ? { icon: Cigarette, label: 'Smoking', value: user.smoking } : null,
    (user.pets && fvVisible('pets')) ? { icon: PawPrint, label: 'Pets', value: user.pets } : null,
  ].filter(Boolean) as { icon: any; label: string; value: string }[];

  return (
    <div className="min-h-screen bg-white pt-0 pb-40">

      {/* Preview-mode banner — sticky just under the header so it stays
          visible whether the user is on photos, breakdown, or basics.
          Renders only when isPreview=true. */}
      {isPreview && (
        <div
          className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 px-4 py-2"
          role="status"
        >
          <p className="max-w-2xl mx-auto text-xs text-amber-900 leading-snug">
            <span className="font-semibold">Preview mode</span> — this is how matches see your profile. Compatibility scores shown are example data.
          </p>
        </div>
      )}

      {/* Branded header — logo centered, back chevron left, menu right */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between relative">
          <button
            onClick={onBack}
            aria-label={isPreview ? 'Back to account' : 'Back to matches'}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors z-10"
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <div className="absolute left-1/2 -translate-x-1/2">
            <ParallelWordmark sizeClassName="text-2xl" />
          </div>
          {!isPreview && (
          <div className="relative safety-menu-container z-10">
          <button
            onClick={() => setShowSafetyMenu(!showSafetyMenu)}
            aria-label="More options"
            aria-expanded={showSafetyMenu}
            aria-haspopup="menu"
            className="p-2 text-gray-600 hover:text-parallel-void hover:bg-gray-100 rounded-full transition-colors"
          >
            <MoreVertical size={20} aria-hidden="true" />
          </button>
          {showSafetyMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSafetyMenu(false)} aria-hidden="true" />
              <div className="absolute right-0 top-12 w-52 bg-parallel-cream rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden z-50" role="menu">
                {alreadyMatched && (
                  <button
                    onClick={() => { setShowSafetyMenu(false); setShowUnmatchModal(true); }}
                    role="menuitem"
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors"
                  >
                    <UserMinus size={18} className="text-gray-600" aria-hidden="true" />
                    <span>Unmatch</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowSafetyMenu(false); setShowReportModal(true); }}
                  role="menuitem"
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors ${alreadyMatched ? 'border-t border-gray-100' : ''}`}
                >
                  <Flag size={18} className="text-gray-600" aria-hidden="true" />
                  <span>Report User</span>
                </button>
                <button
                  onClick={() => { setShowSafetyMenu(false); setShowBlockModal(true); }}
                  role="menuitem"
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-t border-gray-100 text-red-600"
                >
                  <Ban size={18} aria-hidden="true" />
                  <span>Block User</span>
                </button>
              </div>
            </>
          )}
          </div>
          )}
          {isPreview && <div className="w-10 z-10" />}
        </div>
      </div>

      {/* Unmatch Modal */}
      {showUnmatchModal && (
        <div
          className="fixed inset-0 bg-parallel-void/50 z-[100] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unmatch-modal-title"
        >
          <div className="bg-parallel-cream rounded-3xl p-6 max-w-md w-full">
            <h2 id="unmatch-modal-title" className="mb-3">Unmatch {user.name}?</h2>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              They'll be removed from your matches and won't be able to contact you. You can unblock them anytime from Privacy & Safety in your account.
            </p>
            <div className="space-y-3">
              <button onClick={handleUnmatch} className="w-full py-3 bg-parallel-purple text-parallel-cream rounded-full hover:bg-parallel-purple/90 transition-colors font-medium">Unmatch</button>
              <button onClick={() => setShowUnmatchModal(false)} className="w-full py-3 border-2 border-gray-200 rounded-full hover:border-gray-400 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div
          className="fixed inset-0 bg-parallel-void/50 z-[100] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
        >
          <div className="bg-parallel-cream rounded-3xl p-6 max-w-md w-full">
            <h2 id="report-modal-title" className="mb-4">Report {user.name}</h2>
            {!showReportSuccess ? (
              <>
                <p className="text-gray-600 mb-4 text-sm">Help us keep Parallel safe. Select the reason for your report.</p>
                <div className="space-y-2 mb-4">
                  {['Inappropriate photos', 'Fake profile', 'Harassment or hateful language', 'Spam or scam', 'Other'].map(reason => (
                    <button key={reason}
                      className="w-full p-3 text-left rounded-xl border-2 border-gray-200 hover:border-parallel-void transition-colors text-sm"
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
              <div className="py-4 text-center space-y-2" role="status">
                <p className="text-gray-700 font-medium">✓ Report submitted</p>
                <p className="text-sm text-gray-500">Our team will review it as soon as possible.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && (
        <div
          className="fixed inset-0 bg-parallel-void/50 z-[100] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-modal-title"
        >
          <div className="bg-parallel-cream rounded-3xl p-6 max-w-md w-full">
            <h2 id="block-modal-title" className="mb-4">Block {user.name}?</h2>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">They won't be able to see your profile or message you.</p>
            <div className="space-y-3">
              <button onClick={async () => {
                const token = await getAccessToken();
                if (token) {
                  try { await fetch(`${MISC_FUNCTION_URL}/safety/block`, { method: 'POST', headers: getAuthHeaders(token), body: JSON.stringify({ blockedUserId: user.id }) }); } catch (e) {}
                }
                setShowBlockModal(false); onBack();
              }} className="w-full py-3 bg-red-600 text-parallel-cream rounded-full hover:bg-red-700 transition-colors font-medium">Block User</button>
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
              <img src={photos[photoIndex]} alt={`${user.name}, photo ${photoIndex + 1} of ${photos.length}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                <p className="text-gray-500">No photo</p>
              </div>
            )}
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-0 top-0 w-1/3 h-full z-10 cursor-pointer"
                  onClick={() => setPhotoIndex(i => Math.max(0, i - 1))}
                  aria-label="Previous photo"
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 w-1/3 h-full z-10 cursor-pointer"
                  onClick={() => setPhotoIndex(i => Math.min(photos.length - 1, i + 1))}
                  aria-label="Next photo"
                />
                <div className="absolute top-3 left-0 right-0 flex justify-center gap-1 z-20" aria-hidden="true">
                  {photos.map((_, idx) => (
                    <div key={idx} className={`h-1 rounded-full transition-all ${idx === photoIndex ? 'w-5 bg-parallel-cream' : 'w-1.5 bg-parallel-cream/50'}`} />
                  ))}
                </div>
              </>
            )}
            {user.isVerified && (
              <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-parallel-purple text-parallel-cream px-3 py-1.5 rounded-full shadow-lg">
                <ShieldCheck size={13} aria-hidden="true" /><span className="text-xs font-medium">Verified</span>
              </div>
            )}
            <div className="absolute bottom-3 right-3 z-20 bg-parallel-cream rounded-full px-3 py-1.5 shadow-lg border-2 border-gray-200">
              <div className="text-center">
                {isPreview ? (
                  <>
                    <div className="text-base font-bold leading-none">Preview</div>
                    <div className="text-xs text-gray-500 whitespace-nowrap mt-0.5">Sample score</div>
                  </>
                ) : (
                  <>
                    <div className="text-base font-bold leading-none">{compatibilityScore}%</div>
                    <div className="text-xs text-gray-500 whitespace-nowrap mt-0.5">{getCompatibilityLabel(compatibilityScore)}</div>
                  </>
                )}
              </div>
            </div>
          </div>
          {photos.length > 1 && (
            <p className="text-center text-xs text-gray-500 mt-2">Photo {photoIndex + 1} of {photos.length} — tap sides to browse</p>
          )}
        </div>

        {/* Name / age / height / location / pronouns — no pills, no life stage */}
        <div>
          <h1 className="text-2xl font-bold">
            {user.name}, {user.age}{(user as any).height ? ` · ${(user as any).height}` : ''}
          </h1>
          {(locationDisplay || (user.pronouns && fvVisible('pronouns')) || ((isPreview || isMutual || alreadyMatched) && user.instagram)) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-gray-500 text-sm">
              {locationDisplay && (
                <div className="flex items-center gap-1"><MapPin size={13} aria-hidden="true" /><span>{locationDisplay}</span></div>
              )}
              {(isPreview || isMutual || alreadyMatched) && user.instagram ? (
                <a
                  href={`https://instagram.com/${user.instagram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-parallel-purple transition-colors"
                >
                  <Instagram size={13} aria-hidden="true" />
                  <span>@{user.instagram.replace(/^@/, '')}{(user.pronouns && fvVisible('pronouns')) ? ` · ${normalizePronouns(user.pronouns)}` : ''}</span>
                </a>
              ) : (
                (user.pronouns && fvVisible('pronouns')) && <span>{normalizePronouns(user.pronouns)}</span>
              )}
            </div>
          )}
        </div>

        {/* Bio as prose (no gray card wrapper) */}
        {user.bio && fvVisible('bio') && (
          <p className="text-[15px] text-gray-700 leading-relaxed">{user.bio}</p>
        )}

        {/* Compatibility Breakdown — all 8 bars always rendered.
            Static for now. Categories with no score show "Not enough data yet". */}
        {showBreakdownSection && (
          <div className="p-4 bg-parallel-cream rounded-2xl border-2 border-gray-200">
            <h3 className="text-sm font-semibold mb-1">Compatibility Breakdown</h3>
            {isPreview && (
              <p className="text-xs italic text-gray-500 mb-4 leading-snug">
                Sample data — actual scores depend on the person viewing your profile.
              </p>
            )}
            {!isPreview && (
              <p className="text-xs text-gray-400 mb-4">Tap any category to learn more.</p>
            )}
            <div className="space-y-1">
              {CATEGORY_ORDER.map((label) => {
                // "Connection Style" was previously stored as "Intimacy & Connection" — fall back for existing match data
                const raw = breakdown[label] ?? (label === 'Connection Style' ? breakdown['Intimacy & Connection'] : undefined);
                const hasScore = typeof raw === 'number' && raw > 0;
                const score = hasScore ? (raw as number) : 0;
                const barColor = CATEGORY_COLORS[label] || 'bg-parallel-void';
                const isExpanded = expandedCategory === label;

                return (
                  <div key={label}>
                    <button
                      type="button"
                      onClick={() => hasScore && setExpandedCategory(isExpanded ? null : label)}
                      className={`w-full text-left rounded-xl px-2 py-2.5 transition-colors ${hasScore ? 'hover:bg-gray-100 active:bg-gray-100' : ''}`}
                      aria-expanded={isExpanded}
                      disabled={!hasScore}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-sm ${hasScore ? 'text-gray-700' : 'text-gray-500'}`}>{label}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {hasScore ? (
                            <>
                              <span className="text-sm font-medium text-gray-800">{score}%</span>
                              {isExpanded
                                ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                              }
                            </>
                          ) : (
                            <span className="text-xs italic text-gray-500">Not enough data yet</span>
                          )}
                        </div>
                      </div>
                      <div
                        className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={score}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${label}${hasScore ? `: ${score} percent` : ': not enough data yet'}`}
                      >
                        {hasScore && (
                          <div
                            className={`h-full ${barColor} rounded-full transition-all`}
                            style={{ width: `${score}%` }}
                          />
                        )}
                      </div>
                    </button>

                    {isExpanded && hasScore && (
                      <div className="mx-2 mb-2 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {getCategoryInsight(label, score)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hobbies — shared first (black), others below (gray).
            Section is hidden only if they have zero hobbies at all. */}
        {hasAnyHobbies && (
          <div className="p-4 bg-parallel-cream rounded-2xl border-2 border-gray-200">
            <h3 className="text-sm font-semibold mb-3">Hobbies &amp; Interests</h3>
            {sharedHobbies.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">You both enjoy</p>
                <div className="flex flex-wrap gap-2">
                  {sharedHobbies.map((hobby) => (
                    <span key={hobby} className="text-xs px-3 py-1.5 bg-parallel-purple text-parallel-cream rounded-full font-medium">
                      {hobby}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {otherHobbies.length > 0 && (
              <div>
                {sharedHobbies.length > 0 && (
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Also into</p>
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
          <div className="p-4 bg-parallel-cream rounded-2xl border-2 border-gray-200">
            <h3 className="text-sm font-semibold mb-3">Profile Basics</h3>
            <div className="grid grid-cols-1 gap-3">
              {profileDetails.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon size={16} className="text-gray-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm text-gray-800">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instagram
            - In preview: always unlocked so the user can verify their own
              handle is correct. If they haven't entered one, show a CTA
              pointing to Edit Profile.
            - For real matches: locked when not yet mutual, visible when
              mutual or already-matched. */}
        {isPreview ? (
          user.instagram ? (
            <a
              href={`https://instagram.com/${user.instagram.replace(/^@/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-600 text-sm px-1 hover:text-parallel-purple transition-colors"
            >
              <Instagram size={13} aria-hidden="true" />
              <span>@{user.instagram.replace(/^@/, '')}</span>
            </a>
          ) : (
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <Instagram size={14} className="text-gray-500" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700">Instagram</p>
                <p className="text-xs text-gray-500">Add your handle in Edit Profile</p>
              </div>
            </div>
          )
        ) : (
          <>
            {user.instagram && !isMutual && !alreadyMatched && (
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <Lock size={14} className="text-gray-500" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-700">Instagram</p>
                  <p className="text-xs text-gray-500">Unlocks after you both like each other</p>
                </div>
              </div>
            )}
            {user.instagram && (isMutual || alreadyMatched) && (
              <a
                href={`https://instagram.com/${user.instagram.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-gray-600 text-sm px-1 hover:text-parallel-purple transition-colors"
              >
                <Instagram size={13} aria-hidden="true" />
                <span>@{user.instagram.replace(/^@/, '')}</span>
              </a>
            )}
          </>
        )}

        <div className="h-8" />
      </div>

      {/* Fixed bottom action bar.
          - isPreview: single "Edit Profile" button — Pass/Like don't apply
            to your own profile and would just be dead UX.
          - alreadyMatched (arrived from inbox/messaging): Message button.
          - isMutual (just liked, became mutual): celebration banner.
          - default (browsing from home): Pass + Like buttons. */}
      {isPreview ? (
        <div className="fixed bottom-0 left-0 right-0 bg-parallel-cream border-t-2 border-gray-200 px-4 pt-4 pb-10 z-[60]">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => onEditProfile?.()}
              aria-label="Edit your profile"
              className="w-full h-14 rounded-full bg-parallel-purple text-parallel-cream font-medium flex items-center justify-center gap-2 hover:bg-parallel-purple/90 transition-colors shadow-lg"
            >
              <Pencil size={18} aria-hidden="true" />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>
      ) : alreadyMatched ? (
        <div className="fixed bottom-0 left-0 right-0 bg-parallel-cream border-t-2 border-gray-200 px-4 pt-4 pb-10 z-[60]">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => onOpenChat(user.id)}
              aria-label={`Message ${user.name}`}
              className="w-full h-14 rounded-full bg-parallel-purple text-parallel-cream font-medium flex items-center justify-center gap-2 hover:bg-parallel-purple/90 transition-colors shadow-lg"
            >
              <span>Message {user.name}</span>
            </button>
          </div>
        </div>
      ) : isMutual ? (
        <div className="fixed bottom-0 left-0 right-0 bg-parallel-cream border-t-2 border-gray-200 p-4 pb-8 z-[60]" role="status" aria-live="polite">
          <div className="max-w-md mx-auto p-4 bg-parallel-purple text-parallel-cream rounded-2xl text-center">
            <p className="text-lg font-medium">🎉 It's a mutual match!</p>
            <p className="text-gray-300 text-sm mt-1">Taking you to messaging with {user.name}…</p>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 bg-parallel-cream border-t-2 border-gray-200 px-4 pt-4 pb-10 z-[60]">
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            <button
              onClick={handlePass}
              aria-label={`Pass on ${user.name}`}
              className="w-14 h-14 border-2 border-gray-300 bg-parallel-cream rounded-full hover:border-gray-400 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm flex-shrink-0"
            >
              <X className="w-5 h-5 text-gray-500" aria-hidden="true" />
              <span className="text-[10px] text-gray-500">Pass</span>
            </button>
            <button
              onClick={handleMatch}
              disabled={isLiked || isLiking}
              aria-label={isLiked ? `Liked ${user.name}` : `Like ${user.name}`}
              className={`flex-1 h-14 rounded-full transition-all flex items-center justify-center gap-2 font-medium shadow-lg ${
                isLiked ? 'bg-parallel-purple text-parallel-cream cursor-default'
                : isLiking ? 'bg-gray-400 text-parallel-cream cursor-wait'
                : 'bg-parallel-purple text-parallel-cream hover:bg-parallel-purple/90'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} aria-hidden="true" />
              <span>{isLiked ? 'Liked ✓' : 'Like'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
