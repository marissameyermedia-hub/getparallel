import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, EDGE_FUNCTION_URL } from './utils/supabase/client';
import { publicAnonKey } from './utils/supabase/info';
import { SignInPage } from './components/SignInPage';
import { AccountCreationPage } from './components/AccountCreationPage';
import { PhoneVerificationPage } from './components/PhoneVerificationPage';
import { OnboardingFlow } from './components/OnboardingFlow';
import { PricingPage } from './components/payment/PricingPage';
import { PaymentConfirmation } from './components/payment/PaymentConfirmation';
import { MatchesView } from './components/MatchesView';
import { AccountPage } from './components/AccountPage';
import { QuestionnaireListView } from './components/QuestionnaireListView';
import { MatchProfileView } from './components/MatchProfileView';
import { MessagingView } from './components/MessagingView';
import { Header } from './components/Header';
import { ParallelIcon } from './components/ParallelIcon';
import { BottomNav } from './components/BottomNav';
import { ProfileEditor } from './components/ProfileEditor';
import { PaymentDetailsView } from './components/account/PaymentDetailsView';
import { PrivacySafetyView } from './components/account/PrivacySafetyView';
import { NotificationsView } from './components/account/NotificationsView';
import { PauseProfileView } from './components/account/PauseProfileView';
import { HelpSupportView } from './components/account/HelpSupportView';
import { TermsServiceView } from './components/account/TermsServiceView';
import { RefundPolicyView } from './components/account/RefundPolicyView';
import { PrivacyPolicyView } from './components/account/PrivacyPolicyView';
import { CommunityGuidelinesView } from './components/account/CommunityGuidelinesView';
import { ConsumerHealthDataPolicyView } from './components/account/ConsumerHealthDataPolicyView';
import { DeleteAccountView } from './components/account/DeleteAccountView';
import { Match } from './types/index';
import { Toaster, toast } from 'sonner';
import { InboxView } from './components/InboxView';
import { DateReviewScreen } from './components/DateReviewScreen';
import { PassFeedbackBottomSheet } from './components/PassFeedbackBottomSheet';
import { AppFeedbackBottomSheet } from './components/AppFeedbackBottomSheet';
import { NPSBottomSheet } from './components/NPSBottomSheet';
import { VerificationView } from './components/VerificationView';
import { InviteView } from './components/InviteView';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppFooter } from './components/AppFooter';
import { ChevronLeft } from 'lucide-react';

const getHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
  'apikey': publicAnonKey,
});

function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);
  const [suspensionMessage, setSuspensionMessage] = useState('');
  const [emailConfirmed, setEmailConfirmed] = useState(true); // true by default so existing users aren't gated
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false);
  const [currentView, setCurrentView] = useState<string>('signin');

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [phoneToVerify, setPhoneToVerify] = useState<string>('');
  const [userProfile, setUserProfile] = useState<{
    photos: string[];
    bio: string;
    career: string;
    education: string;
    instagram: string;
    pronouns: string;
  }>({ photos: [], bio: '', career: '', education: '', instagram: '', pronouns: '' });

  const [acceptedMatchIds, setAcceptedMatchIds] = useState<string[]>([]);
  const [declinedMatchIds, setDeclinedMatchIds] = useState<string[]>([]);
  const [mutualMatchIds, setMutualMatchIds] = useState<string[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const totalQuestions = 55;
  const [hasActivated, setHasActivated] = useState(false);
  const [hasVerified, setHasVerified] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [userDateOfBirth, setUserDateOfBirth] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [inboxMessages, setInboxMessages] = useState<Array<{
    matchId: string;
    matchName: string;
    matchPhoto: string;
    lastMessage: string;
    timestamp: string;
    unread: boolean;
    compatibilityScore: number;
    mutualMatch: boolean;
  }>>([]);
  const [dateReviewScreen, setDateReviewScreen] = useState<{
    isOpen: boolean;
    matchId: string;
    matchName: string;
  } | null>(null);
  const [metConfirmations, setMetConfirmations] = useState<Record<string, {
    confirmed: boolean;
    bothConfirmed: boolean;
  }>>({});
  const [passSheet, setPassSheet] = useState<{ matchId: string } | null>(null);
  const [appFeedbackSheet, setAppFeedbackSheet] = useState(false);
  const [npsSheet, setNpsSheet] = useState(false);

  const answerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetchers ─────────────────────────────────────────────

  const fetchMutualMatches = async (token: string) => {
    try {
      const res = await fetch(`${EDGE_FUNCTION_URL}/matches/mutual`, { headers: getHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.mutualMatchIds)) {
          setMutualMatchIds(data.mutualMatchIds);
          return data.mutualMatchIds as string[];
        }
      }
    } catch (err) {
      console.error('Failed to fetch mutual matches:', err);
    }
    return [];
  };

  const fetchUserData = async (token: string) => {
    try {
      const res = await fetch(`${EDGE_FUNCTION_URL}/user/profile`, { headers: getHeaders(token) });
      if (res.status === 403) {
        const data = await res.json();
        if (data.suspended) {
          setIsSuspended(true);
          setSuspensionMessage(data.suspensionMessage || '');
          setIsLoading(false);
          return null;
        }
      }
      if (res.ok) {
        const data = await res.json();
        if (data.name) { setUserName(data.name); }
        if (data.date_of_birth) { setUserDateOfBirth(data.date_of_birth); }
        if (data.has_completed_onboarding) localStorage.setItem('parallel_onboarding_complete', 'true');
        if (data.answers) setUserAnswers(data.answers);
        setUserProfile({
          photos: data.photos || [],
          bio: data.bio || '',
          career: data.career || '',
          education: data.education || '',
          instagram: data.instagram || '',
          pronouns: data.pronouns || ''
        });
        setHasCompletedOnboarding(!!data.has_completed_onboarding);
        setHasActivated(data.hasActivated || false);
        setHasVerified(data.is_verified || false);
        return data;
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
    }
    return null;
  };

  const fetchMatches = async (token: string) => {
    try {
      const [matchesRes] = await Promise.all([
        fetch(`${EDGE_FUNCTION_URL}/matches`, { headers: getHeaders(token) }),
        fetchMutualMatches(token)
      ]);
      if (matchesRes.ok) {
        const data = await matchesRes.json();
        if (Array.isArray(data.matches)) {
          setMatches(data.matches);
        }
        if (data.emailConfirmationRequired === true) {
          setEmailConfirmationRequired(true);
        }
      }
    } catch (err) {
      console.error('Failed to fetch matches:', err);
    }
  };

  const saveAnswersToSupabase = useCallback((answers: Record<string, any>) => {
    if (answerSaveTimer.current) clearTimeout(answerSaveTimer.current);
    answerSaveTimer.current = setTimeout(async () => {
      const token = localStorage.getItem('parallel_access_token');
      if (!token) return;
      try {
        await fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
          method: 'PUT',
          headers: getHeaders(token),
          body: JSON.stringify({ answers })
        });
      } catch (err) {
        console.error('Failed to save answers:', err);
      }
    }, 1500);
  }, []);

  const restoreLocalState = () => {
    const storedProfile = localStorage.getItem('parallel_user_profile');
    const storedAccepted = localStorage.getItem('parallel_accepted_matches');
    const storedDeclined = localStorage.getItem('parallel_declined_matches');
    const storedActivated = localStorage.getItem('parallel_activated');
    if (storedProfile) { try { setUserProfile(JSON.parse(storedProfile)); } catch(e) {} }
    if (storedAccepted) { try { setAcceptedMatchIds(JSON.parse(storedAccepted)); } catch(e) {} }
    if (storedDeclined) { try { setDeclinedMatchIds(JSON.parse(storedDeclined)); } catch(e) {} }
    if (storedActivated) setHasActivated(storedActivated === 'true');
  };

  // ── Session check on mount ────────────────────────────────────

  useEffect(() => {
    const checkSession = async () => {
      // Declare params at function scope so it's available throughout
      const params = new URLSearchParams(window.location.search);
      
      try {
        // ── Handle email verification token ──
        const verifyToken = params.get('verify');
        if (verifyToken) {
          // Show loading screen while validating token
          setIsLoading(true);
          try {
            const response = await fetch(`${EDGE_FUNCTION_URL}/auth/validate-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': publicAnonKey,
              },
              body: JSON.stringify({ token: verifyToken }),
            });

            // Clean URL immediately
            window.history.replaceState({}, '', '/');

            if (response.ok) {
              const data = await response.json();
              if (data.success) {
                // Email confirmed successfully
                setEmailConfirmed(true);
                
                // If user is logged in, navigate to matches
                const storedToken = localStorage.getItem('parallel_access_token');
                if (storedToken) {
                  await fetchUserData(storedToken);
                  await fetchMatches(storedToken);
                  setCurrentView('matches');
                  toast.success(`Email confirmed — welcome, ${data.name || 'back'}!`, { duration: 4000 });
                } else {
                  // Not logged in, go to signin
                  setCurrentView('signin');
                  toast.success('Email confirmed! Please sign in.', { duration: 4000 });
                }
                setIsLoading(false);
                return;
              }
            }

            // Token validation failed
            setIsLoading(false);
            // Show error screen
            setCurrentView('signin');
            toast.error('This verification link has expired. Please request a new one.', { duration: 5000 });
            return;
          } catch (err) {
            console.error('Token validation error:', err);
            window.history.replaceState({}, '', '/');
            setIsLoading(false);
            setCurrentView('signin');
            toast.error('This verification link has expired. Please request a new one.', { duration: 5000 });
            return;
          }
        }

        // ── Handle legacy verified param ──
        if (params.get('verified') === 'true') {
          window.history.replaceState({}, '', '/');
          const storedToken = localStorage.getItem('parallel_access_token');
          if (storedToken) {
            // User is logged in, navigate to matches
            await fetchUserData(storedToken);
            await fetchMatches(storedToken);
            setCurrentView('matches');
            setIsLoading(false);
            return;
          } else {
            // Not logged in, navigate to signin
            setCurrentView('signin');
            setIsLoading(false);
            return;
          }
        }

        // Check for auth tokens in URL hash first
        const hash = window.location.hash;
        if (hash && hash.includes('type=recovery')) {
          setCurrentView('reset-password');
          setIsLoading(false);
          return;
        }
        // Email confirmation link — type=signup in hash means user just clicked verify
        // Supabase JS client automatically exchanges the hash for a session.
        // Set emailConfirmed=true immediately so the user doesn't see the verification gate.
        const isEmailConfirmationLink = hash && hash.includes('type=signup');
        if (isEmailConfirmationLink) {
          setEmailConfirmed(true);
          // Clean the hash from URL immediately
          window.history.replaceState({}, '', window.location.pathname);
        }

        // Handle ?email_confirmed=true redirect from Supabase email link
        if (params.get('email_confirmed') === 'true') {
          const storedToken = localStorage.getItem('parallel_access_token');
          if (storedToken) {
            setEmailConfirmed(true);
            // Clean the URL
            window.history.replaceState({}, '', window.location.pathname);
            // Notify backend to send welcome email (fire and forget)
            fetch(`${EDGE_FUNCTION_URL}/auth/email-confirmed`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${storedToken}`, 'apikey': publicAnonKey },
            }).catch(() => {});
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Check if session came from a recovery flow
          if (session.user?.recovery_sent_at) {
            const urlParams = new URLSearchParams(window.location.search);
            const type = urlParams.get('type');
            if (type === 'recovery') {
              setCurrentView('reset-password');
              setIsLoading(false);
              return;
            }
          }

          setAccessToken(session.access_token);
          setUserId(session.user.id);
          localStorage.setItem('parallel_access_token', session.access_token);
          localStorage.setItem('parallel_user_id', session.user.id);
          restoreLocalState();
          const userData = await fetchUserData(session.access_token);
          if (!userData) {
            // User record doesn't exist (deleted account with stale token)
            localStorage.clear();
            await supabase.auth.signOut();
            setCurrentView('signin');
            setIsLoading(false);
            return;
          }

          // Check email confirmation status from profile response
          // Skip if we just came from a confirmation link — already confirmed above
          if (userData.emailConfirmed === false && !isEmailConfirmationLink) {
            setEmailConfirmed(false);
          }

          // Handle ?email_confirmed=true redirect from Supabase email link
          if (params.get('email_confirmed') === 'true' || isEmailConfirmationLink) {
            setEmailConfirmed(true);
            // Clean the URL
            window.history.replaceState({}, '', window.location.pathname);
            // Notify backend to send welcome email (fire and forget)
            fetch(`${EDGE_FUNCTION_URL}/auth/email-confirmed`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': publicAnonKey },
            }).catch(() => {});
          }

          const onboardingComplete = !!userData?.has_completed_onboarding;
          if (onboardingComplete) {
            await fetchMatches(session.access_token);
            const lastView = localStorage.getItem('parallel_last_view') as any;
            const safeView = ['matches', 'inbox', 'account', 'questionnaire'].includes(lastView) ? lastView : 'matches';
            setCurrentView(safeView);
            if (params.get('email_confirmed') === 'true' || isEmailConfirmationLink) {
              toast.success('Email confirmed! Welcome to Parallel 🎉', { duration: 4000 });
            }
          } else {
            setCurrentView('onboarding');
          }
        } else {
          const storedToken = localStorage.getItem('parallel_access_token');
          const storedUserId = localStorage.getItem('parallel_user_id');
          if (storedToken && storedUserId) {
            try {
              setAccessToken(storedToken);
              setUserId(storedUserId);
              restoreLocalState();
              const userData = await fetchUserData(storedToken);
              if (!userData) {
                toast('Your session expired — please sign back in.', { duration: 4000 });
                localStorage.clear();
                setCurrentView('signin');
                return;
              }

              // Check email confirmation status from profile response
              if (userData.emailConfirmed === false) {
                setEmailConfirmed(false);
              }

              // Handle ?email_confirmed=true redirect from Supabase email link
              if (params.get('email_confirmed') === 'true') {
                setEmailConfirmed(true);
                // Clean the URL
                window.history.replaceState({}, '', window.location.pathname);
                // Notify backend to send welcome email (fire and forget)
                fetch(`${EDGE_FUNCTION_URL}/auth/email-confirmed`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${storedToken}`, 'apikey': publicAnonKey },
                }).catch(() => {});
              }

              const onboardingComplete = !!userData?.has_completed_onboarding;
              if (onboardingComplete) {
                await fetchMatches(storedToken);
                const lastView = localStorage.getItem('parallel_last_view') as any;
                const safeView = ['matches', 'inbox', 'account', 'questionnaire'].includes(lastView) ? lastView : 'matches';
                setCurrentView(safeView);
              } else {
                setCurrentView('onboarding');
              }
            } catch (tokenErr) {
              toast('Your session expired — please sign back in.', { duration: 4000 });
              localStorage.clear();
              setCurrentView('signin');
            }
          } else {
            setCurrentView('signin');
          }
        }
      } catch (e) {
        setCurrentView('signin');
      }

      setIsLoading(false);

      if (params.get('payment') === 'success') {
        window.history.replaceState({}, '', window.location.pathname);
        setHasActivated(true);
        setSelectedMatchId(null);
        localStorage.setItem('parallel_activated', 'true');
        toast.success('Welcome to Parallel Premium! 🎉', { duration: 5000 });
      } else if (params.get('payment') === 'cancelled') {
        window.history.replaceState({}, '', window.location.pathname);
        toast('Payment cancelled — you can upgrade anytime from settings.', { duration: 4000 });
      }
    };
    checkSession();
  }, []);

  // ── Scroll to top on view change ─────────────────────────────

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentView]);

  // ── Persist last view so refresh restores correct screen ──────

  useEffect(() => {
    const RESTORABLE = ['matches', 'inbox', 'account', 'questionnaire'];
    if (RESTORABLE.includes(currentView)) {
      localStorage.setItem('parallel_last_view', currentView);
    }
    // Profile views need selectedMatchId state which doesn't survive refresh
    // — store 'matches' so refresh lands on the safe view
    if (currentView === 'my-profile' || currentView === 'profile') {
      localStorage.setItem('parallel_last_view', 'matches');
    }
  }, [currentView]);

  // ── NPS trigger ───────────────────────────────────────────────

  useEffect(() => {
    if (!hasCompletedOnboarding || !accessToken) return;
    const now = new Date();
    const currentMonthYear = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const lastShown = localStorage.getItem('parallel_nps_last_shown');
    if (lastShown === currentMonthYear) return;
    const onboardingCompleteDate = localStorage.getItem('parallel_onboarding_complete_date');
    if (!onboardingCompleteDate) {
      localStorage.setItem('parallel_onboarding_complete_date', new Date().toISOString());
      return;
    }
    const daysSinceOnboarding = Math.floor((Date.now() - new Date(onboardingCompleteDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceOnboarding < 7) return;
    if (acceptedMatchIds.length === 0) return;
    const timer = setTimeout(() => { setNpsSheet(true); }, 3000);
    return () => clearTimeout(timer);
  }, [hasCompletedOnboarding, accessToken, acceptedMatchIds.length]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleOnboardingComplete = async (answers: Record<string, any>) => {
    setUserAnswers(answers);
    const profileData = {
      photos: answers.photos || [],
      bio: answers.bio || '',
      career: answers.career || '',
      education: answers.education || '',
      instagram: answers.instagram || '',
      pronouns: answers.pronouns || ''
    };
    setUserProfile(prev => ({ ...prev, ...profileData }));
    localStorage.setItem('parallel_user_profile', JSON.stringify(profileData));
    localStorage.setItem('parallel_onboarding_complete', 'true');
    localStorage.setItem('parallel_onboarding_complete_date', new Date().toISOString());
    const token = localStorage.getItem('parallel_access_token');
    if (token) {
      try {
        const response = await fetch(`${EDGE_FUNCTION_URL}/user/complete-onboarding`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ answers, ...profileData })
        });

        // Handle error responses
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Check for location required error
          if (response.status === 400 && errorData.locationRequired === true) {
            return { 
              success: false, 
              error: 'Please set your location before finishing your profile.',
              locationRequired: true 
            };
          }
          
          // Handle other errors
          return { 
            success: false, 
            error: errorData.error || 'Failed to save profile. Please try again.' 
          };
        }

        const data = await response.json();
        if (!data.success) {
          return { 
            success: false, 
            error: data.error || 'Failed to save profile. Please try again.' 
          };
        }

        // Success - fetch matches and navigate
        await fetchMatches(token);
        setHasCompletedOnboarding(true);
        if (!emailConfirmed) {
          // Show the "check your email" gate before entering the app
          setCurrentView('matches'); // gate renders on top of matches when !emailConfirmed
        } else {
          setCurrentView('matches');
          toast.success('Profile saved! Welcome to Parallel 🎉', { duration: 4000 });
        }
        return { success: true };
      } catch (err) {
        console.error('Failed to save onboarding:', err);
        return { 
          success: false, 
          error: 'Network error. Please check your connection and try again.' 
        };
      }
    }
    
    // No token - shouldn't happen but handle gracefully
    return { 
      success: false, 
      error: 'Session expired. Please sign in again.' 
    };
  };

  const handleActivate = () => {
    setHasActivated(true);
    localStorage.setItem('parallel_activated', 'true');
    setCurrentView('payment-confirmation');
  };

  const handleMatchInteraction = (matchId: string) => {
    if (!hasActivated) {
      setCurrentView('pricing');
    } else {
      setSelectedMatchId(matchId);
      setCurrentView('profile');
    }
  };

  const handleMatchAction = async (matchUserId: string) => {
    const likedUserId = matchUserId;

    setAcceptedMatchIds(prev => {
      const updated = [...prev, likedUserId];
      localStorage.setItem('parallel_accepted_matches', JSON.stringify(updated));
      return updated;
    });

    const match = matches.find(m => m.user.id === likedUserId);
    const token = localStorage.getItem('parallel_access_token');

    let isMutual = false;
    if (token) {
      try {
        const response = await fetch(`${EDGE_FUNCTION_URL}/matches/action`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ matchUserId: likedUserId, action: 'like' })
        });
        if (response.ok) {
          const data = await response.json();
          isMutual = data.isMutual === true;
        }
        await fetchMatches(token);
      } catch (err) {
        console.error('Failed to save match action:', err);
      }
    }

    if (isMutual && match) {
      setSelectedMatchId(likedUserId);
      setCurrentView('messaging');
      setInboxMessages(prev => {
        const existing = prev.find(m => m.matchId === likedUserId);
        if (existing) return prev.map(m => m.matchId === likedUserId ? { ...m, mutualMatch: true } : m);
        return [{
          matchId: likedUserId,
          matchName: match.user.name,
          matchPhoto: match.user.photoUrl,
          lastMessage: 'You matched! Say hello 👋',
          timestamp: new Date().toISOString(),
          unread: true,
          compatibilityScore: match.compatibilityScore,
          mutualMatch: true
        }, ...prev];
      });
    }
  };

  const handlePassAction = (matchUserId: string) => {
    setPassSheet({ matchId: matchUserId });
  };

  const handlePassFeedbackSubmit = async (passReasons: string[], wouldAdjust: string[]) => {
    const matchId = passSheet?.matchId;
    setPassSheet(null);
    if (!matchId) return;
    setDeclinedMatchIds(prev => {
      const updated = [...prev, matchId];
      localStorage.setItem('parallel_declined_matches', JSON.stringify(updated));
      return updated;
    });
    if (currentView === 'profile') setCurrentView('matches');
    const token = localStorage.getItem('parallel_access_token');
    if (!token) return;
    fetch(`${EDGE_FUNCTION_URL}/matches/action`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ matchUserId: matchId, action: 'pass' }),
    }).catch(err => console.error('Pass API failed:', err));
    if (passReasons.length > 0 || wouldAdjust.length > 0) {
      fetch(`${EDGE_FUNCTION_URL}/feedback/structured`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          matchedUserId: matchId,
          feedbackType: 'pass_reason',
          passReasons,
          wouldAdjust,
        }),
      }).catch(err => console.error('Feedback API failed:', err));
    }
  };

  const handlePassFeedbackClose = () => {
    setPassSheet(null);
  };

  const handleRetakeQuestionnaire = () => setCurrentView('questionnaire');
  const handleViewQuestionnaire = () => setCurrentView('questionnaire');
  const handleCloseQuestionnaire = () => setCurrentView('matches');

  const handleUpdateAnswer = (questionId: string, answer: any) => {
    const updatedAnswers = { ...userAnswers, [questionId]: answer };
    setUserAnswers(updatedAnswers);
    saveAnswersToSupabase(updatedAnswers);
  };

  const handleConfirmMet = async (matchId: string) => {
    const token = localStorage.getItem('parallel_access_token');
    if (token) {
      try {
        const res = await fetch(`${EDGE_FUNCTION_URL}/feedback/confirm-met`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ matchUserId: matchId })
        });
        const data = await res.json();
        setMetConfirmations(prev => ({ ...prev, [matchId]: { confirmed: true, bothConfirmed: data.bothConfirmed || false } }));
        if (data.bothConfirmed) {
          toast.success('You both confirmed! Leave a date review.');
        } else {
          toast.success("We've recorded that you met. We'll notify you when they confirm too.");
        }
      } catch (err) { console.error('Failed to confirm met:', err); }
    }
  };

  const handleOpenDateReview = (matchId: string) => {
    const match = matches.find(m => m.user.id === matchId);
    if (match) setDateReviewScreen({ isOpen: true, matchId, matchName: match.user.name });
  };

  const handleSubmitDateReview = async (review: any) => {
    if (!dateReviewScreen) return;
    const token = localStorage.getItem('parallel_access_token');
    if (token) {
      try {
        await fetch(`${EDGE_FUNCTION_URL}/feedback/tier2`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ matchUserId: dateReviewScreen.matchId, ...review })
        });
        if (review.isSafetyIssue) {
          await fetch(`${EDGE_FUNCTION_URL}/safety/report`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify({ reportedUserId: dateReviewScreen.matchId, reason: 'safety_issue_from_date_review', details: review.couldImprove || '' })
          });
        }
      } catch (err) { console.error('Failed to save date review:', err); }
    }
    setDateReviewScreen(null);
    if (review.isSafetyIssue) {
      toast.success('Thank you for reporting. Our safety team has been notified.');
    } else {
      toast.success('Your preferences have been updated to improve future matches.');
    }
  };

  const handleLogOut = async () => {
    if (answerSaveTimer.current) clearTimeout(answerSaveTimer.current);
    await supabase.auth.signOut();
    localStorage.clear();
    setCurrentView('signin');
    setHasActivated(false);
    setHasCompletedOnboarding(false);
    setUserAnswers({});
    setUserProfile({ photos: [], bio: '', career: '', education: '', instagram: '', pronouns: '' });
    setInboxMessages([]);
    setAcceptedMatchIds([]);
    setDeclinedMatchIds([]);
    setMutualMatchIds([]);
    setMatches([]);
    setSelectedMatchId(null);
    setUserName('');
    setAccessToken(null);
    setUserId(null);
  };

  const handleAppFeedbackSubmit = async (feedbackType: string, rating: number | null, message: string) => {
    const token = localStorage.getItem('parallel_access_token');
    if (token && message.trim()) {
      try {
        await fetch(`${EDGE_FUNCTION_URL}/app-feedback`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ feedbackType, rating, message })
        });
        toast.success('Thank you for your feedback!', { duration: 3000 });
      } catch (err) {
        console.error('Failed to save app feedback:', err);
        toast.success('Thank you for your feedback!', { duration: 3000 });
      }
    }
    setAppFeedbackSheet(false);
  };

  const handleNPSSubmit = async (score: number, reason: string) => {
    const token = localStorage.getItem('parallel_access_token');
    if (token) {
      try {
        await fetch(`${EDGE_FUNCTION_URL}/nps`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ score, reason })
        });
      } catch (err) {
        console.error('Failed to save NPS:', err);
      }
    }
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${now.getMonth() + 1}`;
    localStorage.setItem('parallel_nps_last_shown', monthYear);
    setNpsSheet(false);
    toast.success('Thank you for your feedback!', { duration: 3000 });
  };

  // ── Loading screen ────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <ParallelIcon size={32} className="text-black" />
          </div>
          <p className="font-semibold text-black">Parallel</p>
        </div>
      </div>
    );
  }

  if (isSuspended) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: "-apple-system, 'Helvetica Neue', sans-serif" }}>
        <div style={{ maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1a1a18', marginBottom: 12, letterSpacing: '-0.02em' }}>
            Account suspended
          </h1>
          <p style={{ fontSize: 14, color: '#6b6b67', lineHeight: 1.6, marginBottom: 24 }}>
            {suspensionMessage || 'Your account has been temporarily suspended for review. If you believe this is a mistake, please contact us at legal@getparallel.vip.'}
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              localStorage.clear();
              setIsSuspended(false);
              setCurrentView('signin');
            }}
            style={{ background: '#1a1a18', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────

  const isFullscreenView = [
    'onboarding', 'signin', 'account-creation', 'phone-verification',
    'payment-confirmation', 'reset-password'
  ].includes(currentView);

  // Hard gate — email not confirmed
  if (accessToken && !emailConfirmed && !['signin', 'account-creation', 'reset-password', 'phone-verification', 'onboarding'].includes(currentView)) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-8">
          <p className="text-4xl mb-6">✉️</p>
          <h1 className="text-2xl font-semibold mb-3">Check your email</h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">
            We sent a confirmation link to your email. Click it to activate your account and see your matches.
          </p>
        </div>
        <button
          onClick={async () => {
            const token = localStorage.getItem('parallel_access_token');
            if (!token) return;
            const res = await fetch(`${EDGE_FUNCTION_URL}/auth/resend-verification`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
            });
            const data = await res.json();
            if (data.alreadyVerified) {
              setEmailConfirmed(true);
            } else {
              alert('Verification email resent — check your inbox.');
            }
          }}
          className="text-sm text-gray-400 underline"
        >
          Resend verification email
        </button>
        <button
          onClick={() => {
            localStorage.removeItem('parallel_access_token');
            localStorage.removeItem('parallel_refresh_token');
            setCurrentView('signin');
            setEmailConfirmed(true);
          }}
          className="mt-4 text-sm text-gray-300"
        >
          Sign in with a different account
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Header — hidden on fullscreen views */}
      {!isFullscreenView && (
        <Header
          onNavigate={(view) => setCurrentView(view)}
          currentView={currentView}
          isSignedIn={true}
          unreadMessageCount={inboxMessages.filter(m => m.unread).length}
          showInbox={hasCompletedOnboarding}
        />
      )}

      {/* Main content wrapper with top padding to prevent header overlap */}
      <div className={!isFullscreenView ? 'pt-16' : ''}>
        {/* ── Reset Password ── */}
        {currentView === 'reset-password' && (
          <ResetPasswordPage
            onComplete={() => {
              setCurrentView('signin');
              toast.success('Password updated! Please sign in with your new password.', { duration: 4000 });
            }}
          />
        )}

        {/* ── Sign In ── */}
        {currentView === 'signin' && (
          <SignInPage
            onSignIn={async (token, uid) => {
              setAccessToken(token);
              setUserId(uid);
              localStorage.setItem('parallel_access_token', token);
              localStorage.setItem('parallel_user_id', uid);
              restoreLocalState();
              const userData = await fetchUserData(token);
              if (!userData) {
                await supabase.auth.signOut();
                localStorage.removeItem('parallel_access_token');
                localStorage.removeItem('parallel_user_id');
                localStorage.removeItem('parallel_onboarding_complete');
                setCurrentView('signin');
                return;
              }
              const onboardingComplete = !!userData.has_completed_onboarding;
              if (onboardingComplete) {
                await fetchMatches(token);
                setCurrentView('matches');
              } else {
                setCurrentView('onboarding');
              }
            }}
            onCreateAccount={() => setCurrentView('account-creation')}
            onShowExplainer={() => setCurrentView('account-creation')}
            onNavigate={(v) => setCurrentView(v as any)}
          />
        )}

        {/* ── Account Creation ── */}
        {currentView === 'account-creation' && (
          <AccountCreationPage
            onComplete={async (userData) => {
              if (userData.accessToken && userData.userId) {
                setAccessToken(userData.accessToken);
                setUserId(userData.userId);
                localStorage.setItem('parallel_access_token', userData.accessToken);
                localStorage.setItem('parallel_user_id', userData.userId);
                if (userData.dateOfBirth) {
                  setUserDateOfBirth(userData.dateOfBirth);
                }
                if (userData.name) {
                  setUserName(userData.name);
                }
                if (userData.emailConfirmed === false) {
                  setEmailConfirmed(false);
                }
              } else {
                setCurrentView('signin');
                return;
              }
              localStorage.removeItem('parallel_questionnaire_progress');
              // Route through phone verification if phone was provided
              if (userData.phone) {
                setPhoneToVerify(userData.phone);
                setCurrentView('phone-verification');
              } else {
                setCurrentView('onboarding');
              }
            }}
            onBack={() => setCurrentView('signin')}
            onNavigate={(v) => setCurrentView(v as any)}
          />
        )}

        {/* ── Phone Verification ── */}
        {currentView === 'phone-verification' && (
          <PhoneVerificationPage
            phone={phoneToVerify}
            accessToken={accessToken || ''}
            onVerified={() => setCurrentView('onboarding')}
            onSkip={() => setCurrentView('onboarding')}
          />
        )}

        {/* ── Onboarding ── */}
        {currentView === 'onboarding' && (
          <OnboardingFlow
            onComplete={handleOnboardingComplete}
            onNavigate={(view) => setCurrentView(view)}
            showInbox={false}
            userDateOfBirth={userDateOfBirth}
            userName={userName}
          />
        )}

        {/* ── Payment screens ── */}
        {currentView === 'pricing' && (
          <PricingPage
            onBack={() => setCurrentView('matches')}
            onCheckout={handleActivate}
            onSkip={() => setCurrentView('matches')}
            userEmail={localStorage.getItem('parallel_user_email') || ''}
            onNavigate={(view) => setCurrentView(view as any)}
          />
        )}
        {currentView === 'payment-confirmation' && (
          <PaymentConfirmation
            onContinue={() => setCurrentView('matches')}
            onVerify={() => setCurrentView('verification')}
          />
        )}

        {/* ── Matches ── */}
        {currentView === 'matches' && (
          <MatchesView
            matches={matches.filter(m => !acceptedMatchIds.includes(m.user.id) && !declinedMatchIds.includes(m.user.id))}
            onRetakeQuestionnaire={handleRetakeQuestionnaire}
            onViewQuestionnaire={handleViewQuestionnaire}
            onMatchInteraction={handleMatchInteraction}
            hasActivated={hasActivated}
            onActivate={() => setHasActivated(true)}
            onNavigateToPayment={() => setCurrentView('pricing')}
            onNavigateToInvite={() => setCurrentView('invite-friends')}
            userAnswers={userAnswers}
            hasReceivedMatches={acceptedMatchIds.length > 0 || declinedMatchIds.length > 0}
            isVerified={hasVerified}
            onVerify={() => setCurrentView('pricing')}
            onPass={handlePassAction}
            onLike={handleMatchAction}
            likedMatchIds={new Set(acceptedMatchIds)}
            emailConfirmationRequired={emailConfirmationRequired}
          />
        )}

        {/* ── Questionnaire ── */}
        {currentView === 'questionnaire' && (
          <QuestionnaireListView
            answers={userAnswers}
            onUpdateAnswer={handleUpdateAnswer}
            onClose={handleCloseQuestionnaire}
          />
        )}

        {/* ── Account ── */}
        {currentView === 'account' && (
          <AccountPage
            onNavigate={(view) => setCurrentView(view)}
            onLogOut={handleLogOut}
            hasActivated={hasActivated}
            userName={userName}
            hasVerified={hasVerified}
            userAnswers={userAnswers}
            totalQuestions={totalQuestions}
          />
        )}

        {/* ── Edit Profile ── */}
        {currentView === 'my-profile' && (
          <ProfileEditor
            isOnboarding={false}
            onComplete={async (data) => {
              setUserProfile(data);
              localStorage.setItem('parallel_user_profile', JSON.stringify(data));
              // Save bio/career/education/instagram/pronouns to DB
              // (photos are already saved to DB individually on upload)
              const token = localStorage.getItem('parallel_access_token');
              if (token) {
                try {
                  await fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
                    method: 'PUT',
                    headers: getHeaders(token),
                    body: JSON.stringify({
                      bio: data.bio,
                      career: data.career,
                      education: data.education,
                      instagram: data.instagram,
                      pronouns: data.pronouns || '',
                    }),
                  });
                } catch (err) {
                  console.error('Failed to save profile:', err);
                }
              }
              toast.success('Profile saved successfully! ✓', { duration: 3000 });
              setCurrentView('account');
            }}
            onBack={() => setCurrentView('account')}
            initialPhotos={userProfile.photos}
            initialBio={userProfile.bio}
            initialCareer={userProfile.career}
            initialEducation={userProfile.education}
            initialInstagram={userProfile.instagram}
            initialPronouns={userProfile.pronouns}
          />
        )}

        {/* ── Preview Profile ── */}
        {currentView === 'preview-profile' && (() => {
          const displayName = userName || '';
          const userAge = userDateOfBirth
            ? Math.floor((Date.now() - new Date(userDateOfBirth).getTime()) / 31557600000)
            : undefined;

          return (
            <div className="min-h-screen bg-white overflow-y-auto">
              <div className="max-w-[390px] mx-auto bg-white">
                {/* Header — matches ProfileEditor preview style */}
                <div className="sticky top-0 bg-white z-10 border-b border-gray-100 flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => setCurrentView('account')}
                    className="flex items-center gap-1 text-sm font-medium hover:text-gray-600"
                  >
                    <ChevronLeft size={18} /> Back to account
                  </button>
                  <span className="text-sm font-medium text-gray-500">Preview</span>
                  <div className="w-28" />
                </div>

                {/* Main photo */}
                {userProfile.photos[0] ? (
                  <div className="relative aspect-[3/4] bg-gray-100">
                    <img src={userProfile.photos[0]} alt="Main" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
                      <h2 className="text-white text-2xl font-semibold">
                        {displayName}{userAge ? `, ${userAge}` : ''}
                      </h2>
                      {userProfile.career && <p className="text-white/80 text-sm mt-1">{userProfile.career}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-2">
                        <ChevronLeft size={24} className="text-gray-400 rotate-180" />
                      </div>
                      <p className="text-sm">No photos yet</p>
                      <p className="text-xs mt-1">Add photos in Edit Profile</p>
                    </div>
                  </div>
                )}

                {/* Profile details */}
                <div className="px-6 py-6 space-y-4">
                  <div className="space-y-3">
                    {userProfile.career && (
                      <div className="flex items-center gap-3 text-gray-700">
                        <span className="text-gray-400">💼</span>
                        <span>{userProfile.career}</span>
                      </div>
                    )}
                    {userProfile.education && (
                      <div className="flex items-center gap-3 text-gray-700">
                        <span className="text-gray-400">🎓</span>
                        <span>{userProfile.education}</span>
                      </div>
                    )}
                    {hasVerified && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <span>✓</span>
                        <span className="text-sm font-medium">Identity Verified</span>
                      </div>
                    )}
                  </div>

                  {userProfile.bio && (
                    <div className="pt-2">
                      <h3 className="text-sm font-medium text-gray-500 mb-2">About Me</h3>
                      <p className="text-gray-800 leading-relaxed">{userProfile.bio}</p>
                    </div>
                  )}

                  {userProfile.photos.length > 1 && (
                    <div className="pt-2">
                      <h3 className="text-sm font-medium text-gray-500 mb-3">More Photos</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {userProfile.photos.slice(1).map((photo, i) => (
                          <div key={i} className="aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100">
                            <img src={photo} alt={`Photo ${i + 2}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 text-center pt-4">
                    This is how your profile appears to matches
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Account sub-pages ── */}
        {currentView === 'payment-details' && (
          <PaymentDetailsView onBack={() => setCurrentView('account')} hasActivated={hasActivated} onGoToPayment={() => setCurrentView('pricing')} />
        )}
        {currentView === 'privacy-safety' && (
          <PrivacySafetyView onBack={() => setCurrentView('account')} />
        )}
        {currentView === 'notifications' && (
          <NotificationsView userId={userId ?? ''} onBack={() => setCurrentView('account')} />
        )}
        {currentView === 'pause-profile' && (
          <PauseProfileView onBack={() => setCurrentView('account')} hasActivated={hasActivated} />
        )}
        {currentView === 'help-support' && (
          <HelpSupportView onBack={() => setCurrentView('account')} onNavigate={(view) => setCurrentView(view)} />
        )}
        {currentView === 'terms-service' && (
          <TermsServiceView onBack={() => setCurrentView('account')} />
        )}
        {currentView === 'privacy-policy' && (
          <PrivacyPolicyView onBack={() => setCurrentView('account')} />
        )}
        {currentView === 'community-guidelines' && (
          <CommunityGuidelinesView onBack={() => setCurrentView('account')} />
        )}
        {currentView === 'refund-policy' && (
          <RefundPolicyView onBack={() => setCurrentView('account')} />
        )}
        {currentView === 'consumer-health-data-policy' && (
          <ConsumerHealthDataPolicyView onBack={() => setCurrentView('account')} />
        )}
        {currentView === 'delete-account' && (
          <DeleteAccountView
            onBack={() => setCurrentView('account')}
            onDeleteComplete={() => {
              setCurrentView('signin');
              setHasActivated(false);
              setHasCompletedOnboarding(false);
              setUserAnswers({});
              setUserProfile({ photos: [], bio: '', career: '', education: '', instagram: '', pronouns: '' });
              setAcceptedMatchIds([]);
              setDeclinedMatchIds([]);
              setMutualMatchIds([]);
              setMatches([]);
              setInboxMessages([]);
              setSelectedMatchId(null);
              setUserName('');
              setAccessToken(null);
              setUserId(null);
            }}
          />
        )}

        {/* ── Match Profile View ── */}
        {currentView === 'profile' && selectedMatchId && (() => {
          const selectedMatch = matches.find(m => m.user.id === selectedMatchId);
          if (!selectedMatch) return null;
          return (
            <MatchProfileView
              match={selectedMatch}
              onBack={() => setCurrentView('matches')}
              onOpenChat={(matchId) => { setSelectedMatchId(matchId); setCurrentView('messaging'); }}
              onMatch={handleMatchAction}
              onPass={handlePassAction}
              accessToken={accessToken}
              isLiked={acceptedMatchIds.includes(selectedMatchId)}
              passFeedbackOpen={!!passSheet}
            />
          );
        })()}

        {/* ── Messaging ── */}
        {currentView === 'messaging' && selectedMatchId && (
          <MessagingView
            matchId={selectedMatchId}
            matchName={matches.find(m => m.user.id === selectedMatchId)?.user.name || ''}
            matchPhoto={matches.find(m => m.user.id === selectedMatchId)?.user.photoUrl || ''}
            compatibilityScore={matches.find(m => m.user.id === selectedMatchId)?.compatibilityScore || 85}
            mutualMatch={mutualMatchIds.includes(selectedMatchId)}
            onBack={() => setCurrentView('inbox')}
            onConfirmMet={handleConfirmMet}
            hasConfirmedMet={metConfirmations[selectedMatchId]?.confirmed || false}
            bothConfirmedMet={metConfirmations[selectedMatchId]?.bothConfirmed || false}
            onOpenDateReview={handleOpenDateReview}
          />
        )}

        {/* ── Inbox ── */}
        {currentView === 'inbox' && (
          <InboxView
            messages={inboxMessages}
            onOpenChat={(matchId) => {
              setSelectedMatchId(matchId);
              setInboxMessages(prev => prev.map(msg => msg.matchId === matchId ? { ...msg, unread: false } : msg));
              setCurrentView('messaging');
            }}
            onViewProfile={(matchId) => {
              setSelectedMatchId(matchId);
              setCurrentView('profile');
            }}
            hasActivated={hasActivated}
            onNavigateToPayment={() => setCurrentView('pricing')}
          />
        )}

        {/* ── Verification ── */}
        {currentView === 'verification' && userId && (
          <VerificationView
            userId={userId}
            onBack={() => setCurrentView('account')}
            onVerified={() => {
              setHasVerified(true);
              setCurrentView('matches');
              toast.success('Identity verified! Your blue checkmark is now live ✓', { duration: 4000 });
            }}
            isAlreadyVerified={hasVerified}
          />
        )}

        {/* ── Invite friends ── */}
        {currentView === 'invite-friends' && (
          <InviteView onBack={() => setCurrentView('account')} />
        )}
      </div>

      {/* ── Bottom nav — hidden on fullscreen views ── */}
      {!isFullscreenView && (
        <BottomNav
          onNavigate={(view) => setCurrentView(view)}
          currentView={currentView}
          unreadMessageCount={inboxMessages.filter(m => m.unread).length}
        />
      )}

      {/* ── App footer — legal/policy/account views only ── */}
      {/* Shown on all public entry points (via SignInPage + AccountCreationPage props)  */}
      {/* and on account/policy views where users are reading legal documents.           */}
      {/* NOT shown on matches, messaging, questionnaire, or other core app views.      */}
      {/* Required: WA MHMDA Consumer Health Data Policy must be linked from app entry  */}
      {/* points and accessible from within the app.                                    */}
      {[
        'privacy-policy', 'consumer-health-data-policy', 'terms-service',
        'refund-policy', 'community-guidelines', 'help-support', 'privacy-safety',
        'payment-details', 'notifications', 'pause-profile', 'delete-account',
        'verification',
      ].includes(currentView) && (
        <AppFooter onNavigate={(v) => setCurrentView(v as any)} />
      )}

      {/* ── Bottom sheets & overlays ── */}
      {dateReviewScreen && (
        <DateReviewScreen
          isOpen={dateReviewScreen.isOpen}
          onClose={() => setDateReviewScreen(null)}
          matchName={dateReviewScreen.matchName}
          matchId={dateReviewScreen.matchId}
          onSubmit={handleSubmitDateReview}
        />
      )}
      {passSheet && (
        <PassFeedbackBottomSheet
          isOpen={true}
          onClose={handlePassFeedbackClose}
          onSubmit={handlePassFeedbackSubmit}
          onNavigateToQuestionnaire={() => {
            setPassSheet(null);
            setCurrentView('questionnaire');
          }}
        />
      )}
      {appFeedbackSheet && (
        <AppFeedbackBottomSheet
          isOpen={appFeedbackSheet}
          onClose={() => setAppFeedbackSheet(false)}
          onSubmit={handleAppFeedbackSubmit}
        />
      )}
      {npsSheet && (
        <NPSBottomSheet
          isOpen={npsSheet}
          onClose={() => setNpsSheet(false)}
          onSubmit={handleNPSSubmit}
        />
      )}
    </>
  );
}

function AppWithErrorBoundary() {
  return (
    <>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster position="top-center" richColors />
    </>
  );
}

export default AppWithErrorBoundary;