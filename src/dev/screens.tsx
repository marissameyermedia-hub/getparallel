// Screen registry for the DevGallery. Each entry returns a fully-rendered
// component with mock props so it can be previewed in isolation via
// `?dev=1&d=<id>` (or just `?d=<id>`).
import type { ReactNode } from "react";
import { AccountCreationPage } from "../components/AccountCreationPage";
import { AccountPage } from "../components/AccountPage";
import { AppFeedbackBottomSheet } from "../components/AppFeedbackBottomSheet";
import { AppFooter } from "../components/AppFooter";
import { AppHeader } from "../components/AppHeader";
import { BackButton } from "../components/BackButton";
import { BottomNav } from "../components/BottomNav";
import { DateReviewScreen } from "../components/DateReviewScreen";
import { Header } from "../components/Header";
import { InboxView } from "../components/InboxView";
import { InstallPromptBanner } from "../components/InstallPromptBanner";
import { InviteView } from "../components/InviteView";
import { LoadingDots } from "../components/LoadingDots";
import { LocationPicker } from "../components/LocationPicker";
import { MatchCard } from "../components/MatchCard";
import { MatchProfileView } from "../components/MatchProfileView";
import { MatchWeightsScreen } from "../components/MatchWeightsScreen";
import { MatchesView } from "../components/MatchesView";
import { MessagingView } from "../components/MessagingView";
import { NPSBottomSheet } from "../components/NPSBottomSheet";
import { OnboardingFlow } from "../components/OnboardingFlow";
import { PageLoader } from "../components/PageLoader";
import { ParallelIcon } from "../components/ParallelIcon";
import { PassFeedbackBottomSheet } from "../components/PassFeedbackBottomSheet";
import { PhoneVerificationPage } from "../components/PhoneVerificationPage";
import { ProfileEditor } from "../components/ProfileEditor";
import { QuestionnaireListView } from "../components/QuestionnaireListView";
import { ResetPasswordPage } from "../components/ResetPasswordPage";
import { SignInPage } from "../components/SignInPage";
import { SimpleHeader } from "../components/SimpleHeader";
import { SwipeableMatchView } from "../components/SwipeableMatchView";
import { VerificationView } from "../components/VerificationView";
import { PaymentConfirmation } from "../components/payment/PaymentConfirmation";
import { PricingPage } from "../components/payment/PricingPage";
import { CommunityGuidelinesView } from "../components/account/CommunityGuidelinesView";
import { ConsumerHealthDataPolicyView } from "../components/account/ConsumerHealthDataPolicyView";
import { DeleteAccountView } from "../components/account/DeleteAccountView";
import { HelpSupportView } from "../components/account/HelpSupportView";
import { NotificationsView } from "../components/account/NotificationsView";
import { PauseProfileView } from "../components/account/PauseProfileView";
import { PaymentDetailsView } from "../components/account/PaymentDetailsView";
import { PrivacyPolicyView } from "../components/account/PrivacyPolicyView";
import { PrivacySafetyView } from "../components/account/PrivacySafetyView";
import { RefundPolicyView } from "../components/account/RefundPolicyView";
import { TermsServiceView } from "../components/account/TermsServiceView";
import { MOCK_INBOX, MOCK_MATCH, MOCK_MATCHES, MOCK_PROFILE } from "./mockData";

const noop = () => {};
const noopAsync = async () => ({ success: true });

export interface ScreenEntry {
  id: string;
  label: string;
  group: string;
  render: () => ReactNode;
}

export const SCREENS: ScreenEntry[] = [
  // ── Auth ────────────────────────────────────────────────
  {
    id: "signin",
    label: "Sign In",
    group: "Auth",
    render: () => (
      <SignInPage
        onSignIn={noop}
        onCreateAccount={noop}
        onShowExplainer={noop}
        onNavigate={noop}
      />
    ),
  },
  {
    id: "account-creation",
    label: "Account Creation",
    group: "Auth",
    render: () => (
      <AccountCreationPage onComplete={noop} onBack={noop} onNavigate={noop} />
    ),
  },
  {
    id: "phone-verification",
    label: "Phone Verification",
    group: "Auth",
    render: () => (
      <PhoneVerificationPage
        accessToken="dev-token"
        phone=""
        onVerified={noop}
        onSkip={noop}
        onBack={noop}
      />
    ),
  },
  {
    id: "reset-password",
    label: "Reset Password",
    group: "Auth",
    render: () => <ResetPasswordPage onComplete={noop} />,
  },

  // ── Onboarding ──────────────────────────────────────────
  {
    id: "onboarding",
    label: "Onboarding Flow",
    group: "Onboarding",
    render: () => (
      <OnboardingFlow
        onComplete={noopAsync}
        onNavigate={noop}
        showInbox={false}
        userDateOfBirth="1995-04-12"
        userName="Riley"
      />
    ),
  },
  {
    id: "profile-editor",
    label: "Profile Editor",
    group: "Onboarding",
    render: () => (
      <ProfileEditor
        isOnboarding
        onComplete={noop}
        onBack={noop}
        initialName={MOCK_PROFILE.name}
        initialBio={MOCK_PROFILE.bio}
      />
    ),
  },
  {
    id: "match-weights",
    label: "Match Weights",
    group: "Onboarding",
    render: () => <MatchWeightsScreen onComplete={noop} onBack={noop} isOnboarding />,
  },

  // ── Matches ────────────────────────────────────────────
  {
    id: "matches",
    label: "Matches Feed",
    group: "Matches",
    render: () => (
      <MatchesView
        matches={MOCK_MATCHES}
        onRetakeQuestionnaire={noop}
        hasActivated
        hasReceivedMatches
        isVerified
      />
    ),
  },
  {
    id: "match-card",
    label: "Match Card",
    group: "Matches",
    render: () => (
      <div className="max-w-md mx-auto p-4">
        <MatchCard
          match={MOCK_MATCH}
          hasActivated
          onPass={noop}
          onLike={noop}
          onViewProfile={noop}
        />
      </div>
    ),
  },
  {
    id: "swipeable",
    label: "Swipeable Stack",
    group: "Matches",
    render: () => (
      <SwipeableMatchView
        matches={MOCK_MATCHES}
        hasActivated
        isVerified
        onPass={noop}
        onLike={noop}
        onViewProfile={noop}
      />
    ),
  },
  {
    id: "match-profile",
    label: "Match Profile",
    group: "Matches",
    render: () => (
      <MatchProfileView
        match={MOCK_MATCH}
        onBack={noop}
        onOpenChat={noop}
        onMatch={noop}
        onPass={noop}
      />
    ),
  },

  // ── Inbox & Messaging ──────────────────────────────────
  {
    id: "inbox",
    label: "Inbox",
    group: "Messaging",
    render: () => (
      <InboxView
        messages={MOCK_INBOX}
        onOpenChat={noop}
        onViewProfile={noop}
        hasActivated
      />
    ),
  },
  {
    id: "messaging",
    label: "Conversation",
    group: "Messaging",
    render: () => (
      <MessagingView
        matchName="Sara"
        matchPhoto={MOCK_MATCH.user.photoUrl}
        matchId="match-1"
        onBack={noop}
        compatibilityScore={87}
        mutualMatch
        sharedHobbies={["Hiking", "Cooking"]}
      />
    ),
  },

  // ── Account ────────────────────────────────────────────
  {
    id: "account",
    label: "Account",
    group: "Account",
    render: () => (
      <AccountPage
        onLogOut={noop}
        hasActivated
        userName={MOCK_PROFILE.name}
        hasVerified
        userAnswers={MOCK_PROFILE.answers}
        totalQuestions={55}
      />
    ),
  },
  {
    id: "questionnaire",
    label: "Questionnaire List",
    group: "Account",
    render: () => (
      <QuestionnaireListView
        answers={MOCK_PROFILE.answers}
        onUpdateAnswer={noop}
        onClose={noop}
      />
    ),
  },
  { id: "notifications", label: "Notifications", group: "Account", render: () => <NotificationsView userId="dev-user" onBack={noop as any} /> },
  { id: "payment-details", label: "Payment Details", group: "Account", render: () => <PaymentDetailsView onBack={noop as any} /> },
  { id: "privacy-safety", label: "Privacy & Safety", group: "Account", render: () => <PrivacySafetyView onBack={noop as any} /> },
  { id: "pause-profile", label: "Pause Profile", group: "Account", render: () => <PauseProfileView onBack={noop as any} /> },
  { id: "help-support", label: "Help & Support", group: "Account", render: () => <HelpSupportView onBack={noop as any} /> },
  { id: "delete-account", label: "Delete Account", group: "Account", render: () => <DeleteAccountView onBack={noop as any} onDeleteComplete={noop as any} /> },
  { id: "terms", label: "Terms of Service", group: "Account", render: () => <TermsServiceView onBack={noop as any} /> },
  { id: "privacy-policy", label: "Privacy Policy", group: "Account", render: () => <PrivacyPolicyView onBack={noop as any} /> },
  { id: "refund-policy", label: "Refund Policy", group: "Account", render: () => <RefundPolicyView onBack={noop as any} /> },
  { id: "community-guidelines", label: "Community Guidelines", group: "Account", render: () => <CommunityGuidelinesView onBack={noop as any} /> },
  { id: "health-data", label: "Consumer Health Data", group: "Account", render: () => <ConsumerHealthDataPolicyView onBack={noop as any} /> },

  // ── Payment ────────────────────────────────────────────
  { id: "pricing", label: "Pricing", group: "Payment", render: () => <PricingPage onBack={noop as any} onCheckout={noop as any} onSkip={noop as any} /> },
  { id: "payment-confirm", label: "Payment Confirmation", group: "Payment", render: () => <PaymentConfirmation onContinue={noop as any} /> },

  // ── Misc ───────────────────────────────────────────────
  { id: "verification", label: "ID Verification", group: "Misc", render: () => <VerificationView userId="dev-user" onBack={noop} onVerified={noop} /> },
  { id: "invite", label: "Invite Friends", group: "Misc", render: () => <InviteView onBack={noop} /> },
  { id: "date-review", label: "Date Review", group: "Misc", render: () => <DateReviewScreen isOpen onClose={noop} matchName="Sara" matchId="match-1" onSubmit={noop} /> },
  { id: "pass-feedback", label: "Pass Feedback Sheet", group: "Misc", render: () => <PassFeedbackBottomSheet isOpen onClose={noop} onSubmit={noop} onNavigateToQuestionnaire={noop} /> },
  { id: "app-feedback", label: "App Feedback Sheet", group: "Misc", render: () => <AppFeedbackBottomSheet isOpen onClose={noop} onSubmit={noop} /> },
  { id: "nps", label: "NPS Sheet", group: "Misc", render: () => <NPSBottomSheet isOpen onClose={noop} onSubmit={noop} /> },
  { id: "location-picker", label: "Location Picker", group: "Misc", render: () => (
    <div className="max-w-md mx-auto p-6"><LocationPicker value={null as any} onChange={noop} /></div>
  )},
  { id: "install-banner", label: "Install Prompt Banner", group: "Misc", render: () => <InstallPromptBanner hasCompletedOnboarding /> },

  // ── Primitives ────────────────────────────────────────
  { id: "header", label: "Header", group: "Primitives", render: () => <Header onNavigate={noop} currentView="matches" isSignedIn unreadMessageCount={2} showInbox /> },
  { id: "simple-header", label: "Simple Header", group: "Primitives", render: () => <SimpleHeader onNavigate={noop} title="Settings" showBackButton onBack={noop} /> },
  { id: "app-header", label: "App Header", group: "Primitives", render: () => <AppHeader onNavigate={noop} /> },
  { id: "app-footer", label: "App Footer", group: "Primitives", render: () => <AppFooter onNavigate={noop} /> },
  { id: "bottom-nav", label: "Bottom Nav", group: "Primitives", render: () => <BottomNav onNavigate={noop} currentView="matches" unreadMessageCount={3} /> },
  { id: "back-button", label: "Back Button", group: "Primitives", render: () => <div className="p-6"><BackButton onClick={noop} /></div> },
  { id: "parallel-icon", label: "Parallel Icon", group: "Primitives", render: () => <div className="p-6 flex gap-4 items-center"><ParallelIcon size={24} /><ParallelIcon size={48} /><ParallelIcon size={96} /></div> },
  { id: "loading-dots", label: "Loading Dots", group: "Primitives", render: () => <div className="p-12 flex justify-center"><LoadingDots /></div> },
  { id: "page-loader", label: "Page Loader", group: "Primitives", render: () => <PageLoader message="Loading your matches…" /> },
];

export const SCREEN_GROUPS = Array.from(new Set(SCREENS.map((s) => s.group)));

export function findScreen(id: string | null): ScreenEntry | undefined {
  if (!id) return undefined;
  return SCREENS.find((s) => s.id === id);
}
