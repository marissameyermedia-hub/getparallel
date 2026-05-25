import { useState, useEffect, useRef, useCallback } from 'react';

// Guard so the email-confirmed welcome endpoint fires at most once per page load
// even if both the pre-session and in-session code paths both trigger.
let emailConfirmedNotified = false;
import { supabase, EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL, MATCHES_FUNCTION_URL, MESSAGES_FUNCTION_URL, MISC_FUNCTION_URL, EMAIL_FUNCTION_URL, FEEDBACK_PROCESSOR_URL } from './utils/supabase/client';
import { WaitlistPage } from './components/WaitlistPage';
import { publicAnonKey } from './utils/supabase/info';
import { getAccessToken } from './utils/auth';
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
import { BottomNav } from './components/BottomNav';
import { ProfileEditor } from './components/ProfileEditor';
import { PaymentDetailsView } from './components/account/PaymentDetailsView';
import { PrivacySafetyView } from './components/account/PrivacySafetyView';
import { NotificationsView } from './components/account/NotificationsView';
import { PauseProfileView } from './components/account/PauseProfileView';
import { CancelSubscriptionView } from './components/account/CancelSubscriptionView';
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
import { GoAgainPrompt } from './components/GoAgainPrompt';
import { AppFeedbackBottomSheet } from './components/AppFeedbackBottomSheet';
import { NPSBottomSheet } from './components/NPSBottomSheet';
import { VerificationView } from './components/VerificationView';
import { InviteView } from './components/InviteView';
import { AdminDashboard } from './components/safety/AdminDashboard';
import { InAppNotificationBanner } from './components/InAppNotificationBanner';
import { PushSubscriptionSync } from './components/PushSubscriptionSync';
import { EnablePushBanner } from './components/EnablePushBanner';
import { AddToHomeScreenBanner } from './components/AddToHomeScreenBanner';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppFooter } from './components/AppFooter';
import { NavigationProgress } from './components/NavigationProgress';
import { ChevronLeft } from 'lucide-react';
import { PageLoader } from './components/PageLoader';
import { loadFlags, FeatureFlags } from './hooks/useFeatureFlags';
import { ADMIN_FUNCTION_URL } from './utils/supabase/client';
import { PASS_REASON_CATEGORY_MAP } from './data/passFeedbackReasons';
import { TosGateModal } from './components/TosGateModal';
import { CURRENT_TOS_VERSION } from './utils/constants';

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
  const [currentView, setCurrentView] = useState<
    | 'signin' | 'account-creation' | 'phone-verification' | 'onboarding'
    | 'pricing' | 'payment-confirmation'
    | 'matches' | 'questionnaire' | 'account' | 'profile' | 'my-profile'
    | 'payment-details' | 'privacy-safety' | 'notifications' | 'pause-profile' | 'cancel-subscription'
    | 'help-support' | 'terms-service' | 'privacy-policy' | 'community-guidelines' | 'refund-policy'
    | 'consumer-health-data-policy' | 'delete-account' | 'messaging' | 'inbox'
    | 'verification' | 'invite-friends' | 'reset-password'
    | 'preview-profile' | 'waitlist' | 'admin'
  >(() => window.location.pathname === '/waitlist' ? 'waitlist' : 'signin');
  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  // Tracks how the user arrived at the profile view. Determines whether the
  // bottom action bar shows Like/Pass (browsing from home) or Message (came
  // from a chat they've already matched with).
  const [profileSource, setProfileSource] = useState<'home' | 'chat'>('home');
  const [phoneToVerify, setPhoneToVerify] = useState<string>('');
  const [userProfile, setUserProfile] = useState<{
    photos: string[];
    bio: string;
    career: string;
    education: string;
    instagram: string;
    pronouns: string;
    fieldVisibility: Record<string, boolean>;
    location?: { latitude: number; longitude: number; city: string; state: string; country: string; locationDisplay: string; };
  }>({ photos: [], bio: '', career: '', education: '', instagram: '', pronouns: '', fieldVisibility: {} });

  const [acceptedMatchIds, setAcceptedMatchIds] = useState<string[]>([]);
  const [declinedMatchIds, setDeclinedMatchIds] = useState<string[]>([]);
  const [mutualMatchIds, setMutualMatchIds] = useState<string[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [profileFetching, setProfileFetching] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [hasActivated, setHasActivated] = useState(false);
  const [hasVerified, setHasVerified] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [tosGateRequired, setTosGateRequired] = useState(false);
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
  const [passSheet, setPassSheet] = useState<{
    matchId: string;
    snapshot: {
      compatibility_score: number;
      matched_age: number | null;
      distance_miles: number | null;
      dimension_scores: Record<string, number> | null;
      why_you_matched: string[] | null;
      shared_hobbies: string[] | null;
    } | null;
  } | null>(null);
  const [goAgainPrompt, setGoAgainPrompt] = useState<{ matchId: string; matchName: string } | null>(null);
  const [appFeedbackSheet, setAppFeedbackSheet] = useState(false);
  const [npsSheet, setNpsSheet] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({});
  const [feedbackInsights, setFeedbackInsights] = useState<Array<{ type: string; message: string }>>([]);
  const [dismissedInsight, setDismissedInsight] = useState<string>(() => {
    try { return localStorage.getItem('parallel_dismissed_insight') ?? ''; } catch { return ''; }
  });

  // Captured from ?ref=CODE on first load. Persists in localStorage so it
  // survives the trip through SignIn → AccountCreation. Cleared after the
  // user finishes account creation (the backend ties it to the user there).
  const [referralCode, setReferralCode] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('ref');
      if (fromUrl) {
        localStorage.setItem('parallel_referral_code', fromUrl);
        // Strip ?ref= from the URL so a refresh doesn't re-capture it.
        params.delete('ref');
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
        return fromUrl;
      }
      return localStorage.getItem('parallel_referral_code');
    } catch { return null; }
  });

  const answerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetchers ─────────────────────────────────────────────

  const fetchMutualMatches = async (token: string) => {
    try {
      const res = await fetch(`${MATCHES_FUNCTION_URL}/mutual`, { headers: getHeaders(token) });
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
      const res = await fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, { headers: getHeaders(token) });
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
          pronouns: data.pronouns || '',
          fieldVisibility: data.field_visibility || {},
          ...(data.latitude && data.longitude ? {
            location: {
              latitude: data.latitude,
              longitude: data.longitude,
              city: data.city || '',
              state: data.state || '',
              country: data.country || '',
              locationDisplay: data.location_display || '',
            }
          } : {}),
        });
        setHasCompletedOnboarding(!!data.has_completed_onboarding);
        setHasActivated(data.hasActivated || false);
        setHasVerified(data.is_verified || false);
        if (data.has_completed_onboarding && data.tos_version_accepted !== CURRENT_TOS_VERSION) {
          setTosGateRequired(true);
        }
        // Persist email so AccountPage can display it even on PWA cold starts
        // where localStorage hasn't been written by the email-update flow yet.
        if (data.email) localStorage.setItem('parallel_user_email', data.email);
        // Sync email-verification state from the server. The profile row's
        // email_verified flag is the source of truth — this keeps the soft
        // banner accurate even for users who signed up before this flow
        // shipped or who refresh after verification on another device.
        if (typeof data.email_verified === 'boolean') {
          setEmailConfirmed(data.email_verified);
        }
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
        fetch(`${MATCHES_FUNCTION_URL}/list`, { headers: getHeaders(token) }),
        fetchMutualMatches(token)
      ]);
      if (matchesRes.ok) {
        const data = await matchesRes.json();
        if (Array.isArray(data.matches)) {
          setMatches(data.matches);
        }
      }
    } catch (err) {
      console.error('Failed to fetch matches:', err);
    }
  };

  const fetchFeedbackInsights = async (token: string, uid: string) => {
    try {
      const res = await fetch(`${FEEDBACK_PROCESSOR_URL}/get-insights?userId=${uid}`, {
        headers: getHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.insights) && data.insights.length > 0) {
          setFeedbackInsights(data.insights);
        }
      }
    } catch { /* non-critical, silently skip */ }
  };

  const saveAnswersToSupabase = useCallback((answers: Record<string, any>) => {
    if (answerSaveTimer.current) clearTimeout(answerSaveTimer.current);
    answerSaveTimer.current = setTimeout(async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        await fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, {
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

      // Capture push notification deep-link before any URL cleanup.
      // The messages edge function embeds ?notify=message&from=<senderId>
      // in the OneSignal notification URL so tapping it opens the right thread.
      const notifyType = params.get('notify');
      const notifyFrom = params.get('from');
      if (notifyFrom) {
        params.delete('notify');
        params.delete('from');
        const newSearch = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash);
      }
      
      try {
        // ── Handle email verification token ──
        const verifyToken = params.get('verify');
        if (verifyToken) {
          // Show loading screen while validating token
          setIsLoading(true);
          try {
            const response = await fetch(`${EMAIL_FUNCTION_URL}/verify-confirm`, {
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
              if (data.ok) {
                // Email confirmed successfully
                setEmailConfirmed(true);

                // v6 of the email function returns access/refresh tokens so we
                // can sign the user in directly even if their browser session
                // was cleared (e.g., they clicked the link on a different
                // device than they signed up on). If tokens are present,
                // install them in the Supabase client and use the access
                // token immediately. If not, fall back to whatever session
                // the browser already has.
                let storedToken: string | null = null;
                if (data.accessToken && data.refreshToken) {
                  try {
                    await supabase.auth.setSession({
                      access_token: data.accessToken,
                      refresh_token: data.refreshToken,
                    });
                    storedToken = data.accessToken;
                  } catch (sessErr) {
                    console.error('setSession from verify-confirm failed:', sessErr);
                  }
                }
                if (!storedToken) {
                  storedToken = await getAccessToken();
                }

                if (storedToken) {
                  await fetchUserData(storedToken);
                  await fetchMatches(storedToken);
                  setCurrentView('matches');
                  toast.success(`Email verified — welcome!`, { duration: 4000 });
                } else {
                  // Truly no way to sign them in. Fall through to signin
                  // with a friendly toast.
                  setCurrentView('signin');
                  toast.success('Email verified! Please sign in.', { duration: 4000 });
                }
                setIsLoading(false);
                return;
              }
            }

            // Token validation failed — surface server's error message
            let errMsg = 'This verification link has expired. Please request a new one.';
            try {
              const errData = await response.clone().json();
              if (errData?.error) errMsg = errData.error;
            } catch {
              /* fall through with default */
            }
            setIsLoading(false);
            setCurrentView('signin');
            toast.error(errMsg, { duration: 5000 });
            return;
          } catch (err) {
            console.error('Token validation error:', err);
            window.history.replaceState({}, '', '/');
            setIsLoading(false);
            setCurrentView('signin');
            toast.error('Could not verify your email. Please request a new link.', { duration: 5000 });
            return;
          }
        }

        // ── Handle legacy verified param ──
        if (params.get('verified') === 'true') {
          window.history.replaceState({}, '', '/');
          const storedToken = await getAccessToken();
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
          const storedToken = await getAccessToken();
          if (storedToken) {
            setEmailConfirmed(true);
            window.history.replaceState({}, '', window.location.pathname);
            if (!emailConfirmedNotified) {
              emailConfirmedNotified = true;
              fetch(`${MISC_FUNCTION_URL}/auth/email-confirmed`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${storedToken}`, 'apikey': publicAnonKey },
              }).catch(() => {});
            }
          }
        }

        // ── PWA install token exchange ────────────────────────────────────────
        // iOS 17+ completely isolates PWA standalone storage from Safari
        // (cookies, localStorage, everything). When a user adds the app to home
        // screen via our in-app banner, we embed a one-time token in the URL.
        // Here we exchange that token for a real Supabase session before calling
        // getSession(), so the normal session-found path handles everything.
        const pwaToken = params.get('pwa_token');
        if (pwaToken) {
          try {
            const pwaRes = await fetch(`${MISC_FUNCTION_URL}/auth/pwa-token/exchange`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: publicAnonKey },
              body: JSON.stringify({ token: pwaToken }),
            });
            if (pwaRes.ok) {
              const pwaData = await pwaRes.json();
              if (pwaData.access_token && pwaData.refresh_token) {
                await supabase.auth.setSession({
                  access_token: pwaData.access_token,
                  refresh_token: pwaData.refresh_token,
                });
              }
            }
          } catch (pwaErr) {
            console.warn('[pwa-install] token exchange failed:', pwaErr);
          }
          // Always clean the token from the URL regardless of outcome
          window.history.replaceState({}, '', window.location.pathname);
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
            window.history.replaceState({}, '', window.location.pathname);
            if (!emailConfirmedNotified) {
              emailConfirmedNotified = true;
              fetch(`${MISC_FUNCTION_URL}/auth/email-confirmed`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': publicAnonKey },
              }).catch(() => {});
            }
          }

          const onboardingComplete = !!userData?.has_completed_onboarding;
          // ── Phone verification gate ──
          // Telnyx 10DLC went live April 2026 — phone verification is now
          // required before onboarding. If the user has a phone set on their
          // profile but hasn't verified it, route them to PhoneVerificationPage
          // regardless of where they were trying to go. This blocks the
          // bypass where a user could hit browser back from the OTP page,
          // triggering session restore and landing them in OnboardingFlow.
          const needsPhoneVerification = !!userData?.phone && userData?.phone_verified === false;
          if (needsPhoneVerification) {
            setPhoneToVerify(userData.phone);
            setCurrentView('phone-verification');
          } else if (onboardingComplete) {
            await fetchMatches(session.access_token);
            fetchFeedbackInsights(session.access_token, session.user.id);
            if (notifyType === 'message' && notifyFrom) {
              // Notification deep-link: open directly to the conversation.
              setSelectedMatchId(notifyFrom);
              setCurrentView('messaging');
            } else {
              const lastView = localStorage.getItem('parallel_last_view') as any;
              const safeView = ['matches', 'inbox', 'account', 'questionnaire'].includes(lastView) ? lastView : 'matches';
              setCurrentView(safeView);
            }
            if (params.get('email_confirmed') === 'true' || isEmailConfirmationLink) {
              toast.success('Email confirmed! Welcome to Parallel 🎉', { duration: 4000 });
            }
          } else {
            setCurrentView('onboarding');
          }
        } else {
          const storedToken = await getAccessToken();
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
                fetch(`${MISC_FUNCTION_URL}/auth/email-confirmed`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${storedToken}`, 'apikey': publicAnonKey },
                }).catch(() => {});
              }

              const onboardingComplete = !!userData?.has_completed_onboarding;
              // Same phone verification gate as above — blocks the bypass
              // when session restore runs from a stored token (e.g., user
              // refreshed mid-flow on PhoneVerificationPage).
              const needsPhoneVerification = !!userData?.phone && userData?.phone_verified === false;
              if (needsPhoneVerification) {
                setPhoneToVerify(userData.phone);
                setCurrentView('phone-verification');
              } else if (onboardingComplete) {
                await fetchMatches(storedToken);
                fetchFeedbackInsights(storedToken, storedUserId);
                if (notifyType === 'message' && notifyFrom) {
                  setSelectedMatchId(notifyFrom);
                  setCurrentView('messaging');
                } else {
                  const lastView = localStorage.getItem('parallel_last_view') as any;
                  const safeView = ['matches', 'inbox', 'account', 'questionnaire'].includes(lastView) ? lastView : 'matches';
                  setCurrentView(safeView);
                }
              } else {
                setCurrentView('onboarding');
              }
            } catch (tokenErr) {
              toast('Your session expired — please sign back in.', { duration: 4000 });
              localStorage.clear();
              setCurrentView('signin');
            }
          } else {
            setCurrentView(window.location.pathname === '/waitlist' ? 'waitlist' : 'signin');
          }
        }
      } catch (e) {
        setCurrentView(window.location.pathname === '/waitlist' ? 'waitlist' : 'signin');
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

  // ── Keep cached access token fresh ────────────────────────────
  //
  // Supabase auto-refreshes access tokens every ~50 minutes. The refreshed
  // token only lives in the SDK's session storage by default — we have to
  // mirror it back to localStorage and to component state so any legacy
  // code reading `parallel_access_token` directly stays in sync.
  //
  // Also handles SIGNED_OUT (e.g. session expired beyond refresh window)
  // by clearing local state and dropping the user back to the sign-in page.

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session?.access_token) {
        setAccessToken(session.access_token);
        try {
          localStorage.setItem('parallel_access_token', session.access_token);
        } catch {
          /* localStorage may be disabled — ignore */
        }
      } else if (event === 'SIGNED_OUT') {
        resetAppState();
      } else if (event === 'SIGNED_IN' && session?.access_token) {
        // Belt-and-suspenders: ensure cached token is fresh on sign-in too
        try {
          localStorage.setItem('parallel_access_token', session.access_token);
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // ── Feature flags ────────────────────────────────────────────
  // Load once per session after the user authenticates. The loadFlags helper
  // deduplicates in-flight requests and caches the result at module level so
  // subsequent component mounts don't re-fetch.
  useEffect(() => {
    if (!accessToken) return;
    loadFlags().then(setFeatureFlags);
  }, [accessToken]);

  // ── Admin check ───────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) { setIsAdmin(false); return; }
    fetch(`${ADMIN_FUNCTION_URL}/check`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': publicAnonKey },
    })
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then(data => setIsAdmin(data.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, [accessToken]);

  // ── Re-validate session on app foreground ────────────────────
  // Supabase's autoRefreshToken timer is paused while the app is minimized
  // or the device is asleep. If the access token (1 hour TTL) expired during
  // that gap, the next API call would 401. Calling getSession() on visibility
  // change triggers a proactive refresh — the new token lands via the
  // TOKEN_REFRESHED handler above, so no extra state update is needed here.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ── Scroll to top on view change ─────────────────────────────

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentView]);

  // ── SetupChecklist deep-links ─────────────────────────────────
  // These events are dispatched by SetupChecklist rows when no explicit
  // prop handler is provided. Listening here keeps the checklist
  // self-contained (no need to thread props through MatchesView).

  useEffect(() => {
    const openNotifications = () => setCurrentView('notifications');
    const openVerification = () => setCurrentView('verification');
    window.addEventListener('parallel:open-notifications', openNotifications);
    window.addEventListener('parallel:open-verification', openVerification);
    return () => {
      window.removeEventListener('parallel:open-notifications', openNotifications);
      window.removeEventListener('parallel:open-verification', openVerification);
    };
  }, []);

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
    // Flush any pending questionnaire save when navigating away from the
    // questionnaire view so answers aren't lost mid-debounce.
    if (currentView !== 'questionnaire' && answerSaveTimer.current) {
      clearTimeout(answerSaveTimer.current);
      answerSaveTimer.current = null;
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

  // Navigate back if a profile opened from inbox isn't found after the fetch completes
  useEffect(() => {
    if (currentView === 'profile' && selectedMatchId && !profileFetching) {
      if (!matches.find(m => m.user.id === selectedMatchId)) {
        setCurrentView(profileSource === 'chat' ? 'inbox' : 'matches');
      }
    }
  }, [profileFetching, currentView, selectedMatchId, matches, profileSource]);

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
    const token = await getAccessToken();
    if (token) {
      try {
        const response = await fetch(`${ONBOARDING_FUNCTION_URL}/user/complete-onboarding`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ answers, ...profileData })
        });

        // Handle error responses
        if (!response.ok) {
          // Read body once as text so we can handle both JSON and non-JSON 500s
          const raw = await response.text().catch(() => '');
          let errorData: any = {};
          try { errorData = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON */ }

          // Check for location required error
          if (response.status === 400 && errorData.locationRequired === true) {
            return {
              success: false,
              error: 'Please set your location before finishing your profile.',
              locationRequired: true
            };
          }

          // Check for phone verification required (v6 backend gate). This is the
          // backstop for the frontend phone-verification gate — if a user finds
          // any way to reach OnboardingFlow without verifying their phone, the
          // backend will refuse and we route them back to PhoneVerificationPage.
          if (response.status === 403 && errorData.phoneVerificationRequired === true) {
            if (errorData.phone) setPhoneToVerify(errorData.phone);
            setCurrentView('phone-verification');
            toast('Please verify your phone number to continue.', { duration: 4000 });
            return {
              success: false,
              error: 'Please verify your phone number to continue.',
              phoneVerificationRequired: true,
            };
          }

          // Server-side 5xx — surface a friendly retry message instead of blanking
          if (response.status >= 500) {
            console.warn('complete-onboarding 5xx:', response.status, raw);
            toast.error("We couldn't save your answers. Please try again.");
            return {
              success: false,
              error: "We couldn't save your answers right now. Please try again in a moment."
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

        // Success - fetch matches and navigate. Email verification is now
        // soft-gated via the persistent banner, so we don't branch here.
        await fetchMatches(token);
        setHasCompletedOnboarding(true);
        setCurrentView('matches');
        toast.success('Profile saved! Welcome to Parallel 🎉', { duration: 4000 });
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
      setProfileSource('home');
      setCurrentView('profile');
    }
  };

  const handleMatchAction = async (matchUserId: string): Promise<{ isMutual: boolean }> => {
    const likedUserId = matchUserId;

    setAcceptedMatchIds(prev => {
      const updated = [...prev, likedUserId];
      localStorage.setItem('parallel_accepted_matches', JSON.stringify(updated));
      return updated;
    });

    // Stamp the first-like timestamp the very first time the user likes
    // somebody. This unlocks the PWA install prompt (which now waits for
    // first-like rather than auto-firing on onboarding completion) and
    // surfaces the "Add to home screen" row in the SetupChecklist card.
    try {
      if (!localStorage.getItem('parallel_first_like_at')) {
        localStorage.setItem('parallel_first_like_at', String(Date.now()));
        window.dispatchEvent(new CustomEvent('parallel:first-like'));
      }
    } catch { /* localStorage unavailable; harmless */ }

    const match = matches.find(m => m.user.id === likedUserId);
    const token = await getAccessToken();

    let isMutual = false;
    if (token) {
      try {
        const response = await fetch(`${MATCHES_FUNCTION_URL}/action`, {
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
      // Don't navigate away — user stays on match cards and works through their lineup.
      // Add to inbox state so badge updates and inbox is ready when they navigate.
      setInboxMessages(prev => {
        const existing = prev.find(m => m.matchId === likedUserId);
        if (existing) return prev.map(m => m.matchId === likedUserId ? { ...m, mutualMatch: true } : m);
        return [{
          matchId: likedUserId,
          matchName: match.user.name,
          matchPhoto: match.user.photoUrl,
          lastMessage: 'You matched! Say hello 👋',
          timestamp: new Date().toISOString(),
          unread: false,
          compatibilityScore: match.compatibilityScore,
          mutualMatch: true
        }, ...prev];
      });
      toast.success(`You matched with ${match.user.name.split(' ')[0]}! Check your inbox to say hi.`, { duration: 4000 });
    }
    return { isMutual };
  };

  const handlePassAction = (matchUserId: string) => {
    const match = matches.find(m => m.user.id === matchUserId);
    const snapshot = match ? {
      compatibility_score: match.compatibilityScore,
      matched_age: match.user.age ?? null,
      distance_miles: match.distanceMiles ?? null,
      dimension_scores: (match.matchDetails?.breakdown && Object.keys(match.matchDetails.breakdown).length > 0)
        ? (match.matchDetails.breakdown as Record<string, number>)
        : null,
      why_you_matched: (match.matchDetails?.whyYouMatched?.length ?? 0) > 0 ? match.matchDetails.whyYouMatched : null,
      shared_hobbies: (match.matchDetails?.sharedHobbies?.length ?? 0) > 0 ? match.matchDetails.sharedHobbies : null,
    } : null;
    setPassSheet({ matchId: matchUserId, snapshot });
  };

  const handlePassFeedbackSubmit = async (passReasons: string[], wouldAdjust: string[]) => {
    const matchId = passSheet?.matchId;
    const snapshot = passSheet?.snapshot ?? null;
    setPassSheet(null);
    if (!matchId) return;
    setDeclinedMatchIds(prev => {
      const updated = [...prev, matchId];
      localStorage.setItem('parallel_declined_matches', JSON.stringify(updated));
      return updated;
    });
    if (currentView === 'profile') setCurrentView('matches');
    const token = await getAccessToken();
    if (!token) return;
    fetch(`${MATCHES_FUNCTION_URL}/action`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ matchUserId: matchId, action: 'pass' }),
    }).catch(err => console.error('Pass API failed:', err));
    if (passReasons.length > 0) {
      const passReasonCategories = [...new Set(passReasons.map(id => PASS_REASON_CATEGORY_MAP[id]).filter(Boolean))];
      fetch(`${MATCHES_FUNCTION_URL}/feedback/structured`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          matchedUserId: matchId,
          feedbackType: 'pass_reason',
          passReasons,
          passReasonCategories,
          ...(snapshot ? { snapshot } : {}),
        }),
      }).catch(err => console.error('Feedback API failed:', err));
      // Recompute matching weights from accumulated feedback (fire-and-forget)
      if (userId) {
        fetch(`${FEEDBACK_PROCESSOR_URL}/process-user`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ userId }),
        }).catch(() => {});
        // Derive Haiku pattern insights from accumulated snapshots (fire-and-forget)
        fetch(`${FEEDBACK_PROCESSOR_URL}/analyze-user`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ userId }),
        }).then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data.insights) && data.insights.length > 0) {
              const newMsg = data.insights[0]?.message ?? '';
              const prevDismissed = localStorage.getItem('parallel_dismissed_insight') ?? '';
              if (newMsg !== prevDismissed) {
                setDismissedInsight('');
                try { localStorage.removeItem('parallel_dismissed_insight'); } catch {}
              }
              setFeedbackInsights(data.insights);
            }
          }
        }).catch(() => {});
      }
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

  const handleConfirmMet = async (matchId: string, source: 'banner' | 'kebab' = 'kebab') => {
    const token = await getAccessToken();
    if (token) {
      try {
        const res = await fetch(`${MESSAGES_FUNCTION_URL}/met-banner-action`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ matchId, action: 'confirmed', source }),
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
    const token = await getAccessToken();
    if (token) {
      try {
        await fetch(`${MATCHES_FUNCTION_URL}/feedback/tier2`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ matchUserId: dateReviewScreen.matchId, ...review })
        });
        if (review.isSafetyIssue) {
          await fetch(`${MISC_FUNCTION_URL}/safety/report`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify({ reportedUserId: dateReviewScreen.matchId, reason: 'safety_issue_from_date_review', details: review.couldImprove || '' })
          });
        }
        // Recompute matching weights from accumulated feedback (fire-and-forget)
        if (userId) {
          fetch(`${FEEDBACK_PROCESSOR_URL}/process-user`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify({ userId }),
          }).catch(() => {});
        }
      } catch (err) { console.error('Failed to save date review:', err); }
    }
    const reviewedMatchId = dateReviewScreen.matchId;
    const reviewedMatchName = dateReviewScreen.matchName;
    setDateReviewScreen(null);
    if (review.isSafetyIssue) {
      toast.success('Thank you for reporting. Our safety team has been notified.');
    } else {
      toast.success('Your preferences have been updated to improve future matches.');
      if (featureFlags['feature_feedback_loop_enabled'] === true) {
        setGoAgainPrompt({ matchId: reviewedMatchId, matchName: reviewedMatchName });
      }
    }
  };

  const handleGoAgainSubmit = async (outcome: 'yes' | 'maybe' | 'no') => {
    const prompt = goAgainPrompt;
    setGoAgainPrompt(null);
    const token = await getAccessToken();
    if (!token || !prompt) return;
    fetch(`${MATCHES_FUNCTION_URL}/date-outcome`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ matchedUserId: prompt.matchId, outcome }),
    }).catch(() => {});
  };

  const resetAppState = () => {
    try { localStorage.clear(); } catch { /* ignore */ }
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
    setEmailConfirmed(true);
    setHasVerified(false);
    setHasActivated(false);
  };

  const handleLogOut = async () => {
    if (answerSaveTimer.current) clearTimeout(answerSaveTimer.current);
    await supabase.auth.signOut();
    resetAppState();
  };

  const handleAppFeedbackSubmit = async (feedbackType: string, rating: number | null, message: string) => {
    const token = await getAccessToken();
    if (token && message.trim()) {
      try {
        await fetch(`${MISC_FUNCTION_URL}/app-feedback`, {
          method: 'POST',
          headers: getHeaders(token),
          body: JSON.stringify({ feedbackType, rating, message })
        });
        toast.success('Thank you for your feedback!', { duration: 3000 });
      } catch (err) {
        console.error('Failed to save app feedback:', err);
        toast.error('Couldn\'t save feedback — please try again.');
      }
    }
    setAppFeedbackSheet(false);
  };

  // ── In-app notification handler ───────────────────────────────
  // Called by InAppNotificationBanner whenever a new inbound message arrives.
  // Updates the inbox unread state so the badge count stays accurate even
  // when the user is on a non-inbox view.
  const handleNewIncomingMessage = useCallback((
    matchId: string,
    senderName: string,
    senderPhoto: string,
    text: string,
    compatibilityScore: number,
  ) => {
    setInboxMessages(prev => {
      const existing = prev.find(m => m.matchId === matchId);
      if (existing) {
        // Update last message + mark unread (user isn't in that chat right now)
        return prev.map(m =>
          m.matchId === matchId
            ? { ...m, lastMessage: text, timestamp: new Date().toISOString(), unread: true }
            : m
        );
      }
      // First message from this match — add to inbox
      return [{
        matchId,
        matchName: senderName,
        matchPhoto: senderPhoto,
        lastMessage: text,
        timestamp: new Date().toISOString(),
        unread: true,
        compatibilityScore,
        mutualMatch: true,
      }, ...prev];
    });
  }, []);

  const handleNPSSubmit = async (score: number, reason: string) => {
    const token = await getAccessToken();
    if (token) {
      try {
        await fetch(`${MISC_FUNCTION_URL}/nps`, {
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
    return <PageLoader />;
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

  // True once the backend has returned at least one match for this user
  // (current unreviewed matches OR any previously accepted/declined match).
  // Used to gate subscribe and identity-verify CTAs — no point showing them
  // before there's anything to unlock.
  const hasMatches = matches.length > 0 || acceptedMatchIds.length > 0 || declinedMatchIds.length > 0;

  const isFullscreenView = [
    'onboarding', 'signin', 'account-creation', 'phone-verification',
    'payment-confirmation', 'reset-password', 'messaging', 'waitlist',
    // my-profile: editor has its own sticky header + fixed save bar
    // preview-profile: full-screen photo carousel
    // profile: match profile view has its own fixed action bar (z-60);
    //   BottomNav (z-50) was competing with it at the bottom
    'my-profile', 'preview-profile', 'profile',
    // admin: has its own sticky header with back button
    'admin',
  ].includes(currentView);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {tosGateRequired && accessToken && (
        <TosGateModal
          accessToken={accessToken}
          onAccepted={() => setTosGateRequired(false)}
          onNavigateTerms={() => setCurrentView('terms-service')}
        />
      )}
      <NavigationProgress />

      {/* Skip-to-content link for keyboard users — visually hidden until focused */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      {/* Header — flex-shrink-0 top bar; no longer position:fixed */}
      {!isFullscreenView && (
        <Header
          onNavigate={(view) => setCurrentView(view)}
          currentView={currentView}
          isSignedIn={true}
          unreadMessageCount={inboxMessages.filter(m => m.unread).length}
          showInbox={hasCompletedOnboarding}
        />
      )}

      {/* The standalone yellow EmailVerificationBanner used to live here.
          It's been replaced by the unified SetupChecklist card rendered at
          the top of MatchesView (Home only). The MessagingView still gates
          outbound sends on emailVerified independently. */}

      {/* In-app notification banner — slides in below the header when a new
          message arrives while the user is on a different view. */}
      {userId && (
        <InAppNotificationBanner
          userId={userId}
          activeMatchId={currentView === 'messaging' ? selectedMatchId : null}
          currentView={currentView}
          matches={matches}
          onOpenChat={(matchId) => {
            setSelectedMatchId(matchId);
            setInboxMessages(prev =>
              prev.map(m => m.matchId === matchId ? { ...m, unread: false } : m)
            );
            setCurrentView('messaging');
          }}
          onNewMessage={handleNewIncomingMessage}
        />
      )}


      <PushSubscriptionSync accessToken={accessToken} />

      {hasCompletedOnboarding && currentView === 'matches' && (
        <EnablePushBanner accessToken={accessToken} />
      )}

      {accessToken && hasCompletedOnboarding && !isFullscreenView && (
        <AddToHomeScreenBanner accessToken={accessToken} />
      )}

      {/* Main content — scrolls within the flex column; header and nav are stationary */}
      <div id="main-content" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* ── Reset Password ── */}
        {currentView === 'reset-password' && (
          <ResetPasswordPage
            onComplete={() => {
              setCurrentView('signin');
              toast.success('Password updated! Please sign in with your new password.', { duration: 4000 });
            }}
          />
        )}

        {/* ── Waitlist ── */}
        {currentView === 'waitlist' && (
          <WaitlistPage onNavigate={(v) => setCurrentView(v as any)} />
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
            referralCode={referralCode}
            onComplete={async (userData) => {
              if (userData.accessToken && userData.userId) {
                setAccessToken(userData.accessToken);
                setUserId(userData.userId);
                localStorage.setItem('parallel_access_token', userData.accessToken);
                localStorage.setItem('parallel_user_id', userData.userId);
                // Referral has now been tied to the user account on signup.
                // Drop it from local state + storage so it isn't re-applied later.
                if (referralCode) {
                  try { localStorage.removeItem('parallel_referral_code'); } catch { /* noop */ }
                  setReferralCode(null);
                }
                if (userData.dateOfBirth) {
                  setUserDateOfBirth(userData.dateOfBirth);
                }
                if (userData.name) {
                  setUserName(userData.name);
                }
                if (userData.emailConfirmed === false) {
                  setEmailConfirmed(false);
                }

                // Fire-and-forget: send the initial verification email so the
                // user has it in their inbox by the time they finish onboarding.
                // No await — failure shouldn't block signup, and the banner
                // gives them a "Resend" path if Resend hiccups.
                fetch(`${EMAIL_FUNCTION_URL}/verify-send`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userData.accessToken}`,
                    'apikey': publicAnonKey,
                  },
                }).catch((err) => {
                  console.warn('[signup] auto-verify-send failed:', err);
                });
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
            onBack={async () => { await supabase.auth.signOut(); resetAppState(); }}
          />
        )}

        {/* ── Onboarding ── */}
        {currentView === 'onboarding' && (
          <OnboardingFlow
            onComplete={handleOnboardingComplete}
            onNavigate={(view) => setCurrentView(view as any)}
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
            accessToken={accessToken}
            emailVerified={emailConfirmed}
            onOpenNotifications={() => setCurrentView('notifications')}
            onOpenFeedback={() => setAppFeedbackSheet(true)}
            feedbackInsights={feedbackInsights.filter(i => i.message !== dismissedInsight)}
            onDismissInsight={() => {
              const msg = feedbackInsights[0]?.message ?? '';
              setDismissedInsight(msg);
              try { localStorage.setItem('parallel_dismissed_insight', msg); } catch {}
            }}
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
            onNavigate={(view) => setCurrentView(view as any)}
            onLogOut={handleLogOut}
            hasActivated={hasActivated}
            hasMatches={hasMatches}
            userName={userName}
            userEmail={localStorage.getItem('parallel_user_email') || ''}
            hasVerified={hasVerified}
            userAnswers={userAnswers}
            isAdmin={isAdmin}
          />
        )}

        {/* ── Admin Panel ── */}
        {currentView === 'admin' && (
          <AdminDashboard
            onBack={() => setCurrentView('account')}
            accessToken={accessToken}
          />
        )}

        {/* ── Edit Profile ── */}
        {currentView === 'my-profile' && (
          <ProfileEditor
            isOnboarding={false}
            onComplete={async (data) => {
              setUserProfile({ ...data, fieldVisibility: data.fieldVisibility });
              localStorage.setItem('parallel_user_profile', JSON.stringify(data));
              // Save bio/career/education/instagram/pronouns/field_visibility to DB
              // (photos are already saved to DB individually on upload)
              const token = await getAccessToken();
              if (token) {
                try {
                  await fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, {
                    method: 'PUT',
                    headers: getHeaders(token),
                    body: JSON.stringify({
                      bio: data.bio,
                      career: data.career,
                      education: data.education,
                      instagram: data.instagram,
                      pronouns: data.pronouns || '',
                      field_visibility: data.fieldVisibility,
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
            initialLocation={userProfile.location}
            initialFieldVisibility={userProfile.fieldVisibility}
            initialName={userName}
            userAnswers={userAnswers}
            userDateOfBirth={userDateOfBirth}
            isVerified={hasVerified}
          />
        )}

        {/* ── Preview Profile ── */}
        {/*
         * Renders the *actual* MatchProfileView component fed a synthetic
         * Match built from the signed-in user's own data. This way the
         * preview is literally the same UI another person sees when they
         * tap into Marissa's card on Home — no separate hand-rolled layout
         * to drift over time.
         *
         * Notes on the synthetic Match:
         *   - compatibilityScore is intentionally 100 (preview is "perfect
         *     match with yourself"). The breakdown shows 100% across all 8
         *     categories so the bars render fully filled.
         *   - Unwraps {value, isDealbreaker} answer wrappers to plain
         *     strings before passing to User fields, matching how the
         *     matches edge function flattens them server-side.
         *   - Action handlers are wired to no-ops (the preview is read-only
         *     — Pass / Like / Message / Block all do nothing). onBack
         *     returns to the Account page where the preview was launched.
         */}
        {currentView === 'preview-profile' && (() => {
          const userAge = userDateOfBirth
            ? Math.floor((Date.now() - new Date(userDateOfBirth).getTime()) / 31557600000)
            : 0;

          // Helper: unwrap {value, isDealbreaker} -> value, return string or undefined
          const unwrap = (raw: any): string | undefined => {
            if (raw == null) return undefined;
            const v = (typeof raw === 'object' && 'value' in raw) ? raw.value : raw;
            if (v == null || v === '') return undefined;
            return String(v);
          };
          const unwrapArray = (raw: any): string[] | undefined => {
            if (raw == null) return undefined;
            const v = (typeof raw === 'object' && 'value' in raw) ? raw.value : raw;
            if (!Array.isArray(v) || v.length === 0) return undefined;
            return v.map(String);
          };

          const previewMatch: Match = {
            user: {
              id: userId || 'preview',
              name: userName || 'You',
              age: userAge,
              bio: userProfile.bio || '',
              photoUrl: userProfile.photos[0] || '',
              photos: userProfile.photos,
              pronouns: userProfile.pronouns || undefined,
              education: userProfile.education || undefined,
              career: userProfile.career || undefined,
              instagram: userProfile.instagram || undefined,
              isVerified: hasVerified,
              fieldVisibility: userProfile.fieldVisibility,
              // Profile Basics fields — pulled from questionnaire answers,
              // matching what the matches edge function returns for other users
              drinking: unwrap(userAnswers['3.1']),
              smoking: unwrap(userAnswers['3.3']),
              pets: unwrap(userAnswers['3.8']),
              hobbies: unwrapArray(userAnswers['3.9']),
              politics: unwrap(userAnswers['6.1']),
              religion: unwrap(userAnswers['6.2']),
              answers: {} as any,
              preferences: {} as any,
            },
            compatibilityScore: 100,
            matchDetails: {
              // 100 across all 8 categories so the breakdown bars render
              // fully filled and the layout is identical to a real match.
              breakdown: {
                'Attachment & Emotional Health': 100,
                'Communication & Conflict': 100,
                'Life Goals': 100,
                'Values & Beliefs': 100,
                'Financial & Career': 100,
                'Connection Style': 100,
                'Lifestyle Behaviors': 100,
                'Social & Shared Life': 100,
              },
            },
          };

          const noop = () => {};

          return (
            <MatchProfileView
              match={previewMatch}
              onBack={() => setCurrentView('account')}
              onOpenChat={noop}
              onMatch={noop}
              onPass={noop}
              accessToken={accessToken}
              isLiked={false}
              alreadyMatched={false}
              isPreview={true}
              onEditProfile={() => setCurrentView('my-profile')}
            />
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
        {currentView === 'cancel-subscription' && (
          <CancelSubscriptionView
            onBack={() => setCurrentView('account')}
            onCancelSuccess={() => {
              setHasActivated(false);
              getAccessToken().then(token => { if (token) fetchUserData(token); }).catch(() => {});
            }}
          />
        )}
        {currentView === 'help-support' && (
          <HelpSupportView onBack={() => setCurrentView('account')} onNavigate={(view) => setCurrentView(view as any)} />
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
            onDeleteComplete={resetAppState}
          />
        )}

        {/* ── Match Profile View ── */}
        {currentView === 'profile' && selectedMatchId && (() => {
          const selectedMatch = matches.find(m => m.user.id === selectedMatchId);
          if (!selectedMatch) {
            return <PageLoader />;
          }
          return (
            <MatchProfileView
              match={selectedMatch}
              onBack={() => setCurrentView(profileSource === 'chat' ? 'inbox' : 'matches')}
              onOpenChat={(matchId) => { setSelectedMatchId(matchId); setCurrentView('messaging'); }}
              onMatch={handleMatchAction}
              onPass={handlePassAction}
              accessToken={accessToken}
              isLiked={acceptedMatchIds.includes(selectedMatchId)}
              passFeedbackOpen={!!passSheet}
              alreadyMatched={profileSource === 'chat'}
            />
          );
        })()}

        {/* ── Messaging ── */}
        {currentView === 'messaging' && selectedMatchId && (
          <MessagingView
            matchId={selectedMatchId}
            matchName={matches.find(m => m.user.id === selectedMatchId)?.user.name || inboxMessages.find(m => m.matchId === selectedMatchId)?.matchName || ''}
            matchPhoto={matches.find(m => m.user.id === selectedMatchId)?.user.photoUrl || inboxMessages.find(m => m.matchId === selectedMatchId)?.matchPhoto || ''}
            compatibilityScore={matches.find(m => m.user.id === selectedMatchId)?.compatibilityScore || 85}
            mutualMatch={!!(mutualMatchIds.includes(selectedMatchId) || inboxMessages.some(m => m.matchId === selectedMatchId) || matches.some(m => m.user.id === selectedMatchId))}
            onBack={() => setCurrentView('inbox')}
            onConfirmMet={handleConfirmMet}
            hasConfirmedMet={metConfirmations[selectedMatchId]?.confirmed || false}
            bothConfirmedMet={metConfirmations[selectedMatchId]?.bothConfirmed || false}
            onOpenDateReview={handleOpenDateReview}
            emailVerified={emailConfirmed}
            onViewProfile={(matchId) => { setSelectedMatchId(matchId); setProfileSource('chat'); setCurrentView('profile'); }}
            sharedHobbies={matches.find(m => m.user.id === selectedMatchId)?.matchDetails?.sharedHobbies}
            featureUnsticker={featureFlags['feature_unsticker_enabled'] === true}
            featureDateAgent={featureFlags['feature_date_agent_enabled'] === true}
            featureRecoverySignal={featureFlags['feature_recovery_signal_enabled'] === true}
            featureFeedbackLoop={featureFlags['feature_feedback_loop_enabled'] === true}
          />
        )}

        {/* ── Inbox ── */}
        {currentView === 'inbox' && (
          <InboxView
            messages={inboxMessages}
            onOpenChat={(matchId, matchName, matchPhoto) => {
              setSelectedMatchId(matchId);
              setInboxMessages(prev => {
                const exists = prev.find(m => m.matchId === matchId);
                if (exists) return prev.map(m => m.matchId === matchId ? { ...m, unread: false, matchName: matchName || m.matchName, matchPhoto: matchPhoto || m.matchPhoto } : m);
                return [{ matchId, matchName, matchPhoto, lastMessage: '', timestamp: new Date().toISOString(), unread: false, compatibilityScore: 0, mutualMatch: true }, ...prev];
              });
              setCurrentView('messaging');
            }}
            onViewProfile={(matchId) => {
              setSelectedMatchId(matchId);
              setProfileSource('chat');
              setCurrentView('profile');
              if (!matches.find(m => m.user.id === matchId)) {
                setProfileFetching(true);
                getAccessToken().then(token => {
                  if (token) fetchMatches(token).finally(() => setProfileFetching(false));
                });
              }
            }}
            hasActivated={hasActivated}
            hasMatches={hasMatches}
            onNavigateToPayment={() => setCurrentView('pricing')}
            accessToken={accessToken}
            emailVerified={emailConfirmed}
            isVerified={hasVerified}
            onOpenNotifications={() => setCurrentView('notifications')}
            onOpenSubscribe={() => setCurrentView('pricing')}
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

        {/* ── App footer — legal/policy/account views only — inside scroll area ── */}
        {[
          'account', 'privacy-policy', 'consumer-health-data-policy', 'terms-service',
          'refund-policy', 'community-guidelines', 'help-support', 'privacy-safety',
          'payment-details', 'notifications', 'pause-profile', 'delete-account',
          'verification',
        ].includes(currentView) && (
          <AppFooter onNavigate={(v) => setCurrentView(v as any)} />
        )}
      </div>

      {/* ── Bottom nav — flex-shrink-0 bottom bar; no longer position:fixed ── */}
      {!isFullscreenView && (
        <BottomNav
          onNavigate={(view) => {
            setCurrentView(view as any);
            if (view === 'account') {
              getAccessToken().then(token => { if (token) fetchUserData(token); }).catch(() => {});
            }
          }}
          currentView={currentView}
          unreadMessageCount={inboxMessages.filter(m => m.unread).length}
        />
      )}

      {/* ── Bottom sheets & overlays (position:fixed — unaffected by flex layout) ── */}
      {dateReviewScreen && (
        <DateReviewScreen
          isOpen={dateReviewScreen.isOpen}
          onClose={() => setDateReviewScreen(null)}
          matchName={dateReviewScreen.matchName}
          matchId={dateReviewScreen.matchId}
          onSubmit={handleSubmitDateReview}
        />
      )}
      {goAgainPrompt && featureFlags['feature_feedback_loop_enabled'] === true && (
        <GoAgainPrompt
          matchName={goAgainPrompt.matchName}
          onSubmit={handleGoAgainSubmit}
          onSkip={() => setGoAgainPrompt(null)}
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
    </div>
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
