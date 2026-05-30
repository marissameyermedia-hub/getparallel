import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { parallelQuestionnaire, ONBOARDING_INTRO, Question } from '../data/parallelQuestionnaire_updated';
import { ProgressBar } from './onboarding/ProgressBar';
import { ChapterTitle } from './onboarding/ChapterTitle';
import { QuestionScreen } from './onboarding/QuestionScreen';
import { ProfileEditor } from './ProfileEditor';
import { WelcomeScreen } from './onboarding/WelcomeScreen';
import { SimpleHeader } from './SimpleHeader';
import { MatchWeightsScreen } from './MatchWeightsScreen';
import { EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';

interface OnboardingFlowProps {
  onComplete: (answers: Record<string, any>) => Promise<{ success: boolean; error?: string; locationRequired?: boolean }>;
  onNavigate?: (view: 'matches' | 'pricing' | 'questionnaire' | 'account' | 'attachment-quiz' | 'signin' | 'profile' | 'my-profile' | 'inbox') => void;
  showInbox?: boolean;
  userDateOfBirth?: string;
  userName?: string;
}

// Index of the last Part 1 section in the parallelQuestionnaire array.
// Array order: [0]=id1 BasicIdentity, [1]=id3 Lifestyle, [2]=id4 CareerFinances,
// [3]=id5 FamilySocialLife, [4]=id6 ValuesBeliefs, [5]=id7 RelationshipPsychology,
// [6]=id8 RelationshipGoals  <-- Part 1 ends here
// [7]=id9 AttractionPreferences, [8]=id11 LifestyleCompatibility, [9]=id12 PartnerValues
const PART1_LAST_CHAPTER_INDEX = 6;

const STORAGE_KEY = 'parallel_questionnaire_progress';

export function OnboardingFlow({ onComplete, onNavigate, showInbox, userDateOfBirth, userName = '' }: OnboardingFlowProps) {
  const lockedAge = (() => {
    if (!userDateOfBirth) return null;
    const today = new Date();
    const birth = new Date(userDateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age > 0 ? age : null;
  })();

  const [showWelcome, setShowWelcome] = useState(false);
  const showTimeEstimate = false; // removed — info now lives in WelcomeScreen (May 2026)
  const [showPart2Transition, setShowPart2Transition] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [showCreateProfileTitle, setShowCreateProfileTitle] = useState(false);
  const [showMatchWeights, setShowMatchWeights] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [bio, setBio] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [career, setCareer] = useState<string>('');
  const [education, setEducation] = useState<string>('');
  const [instagram, setInstagram] = useState<string>('');
  const [pronouns, setPronouns] = useState<string>('');
  const [onboardingLocation, setOnboardingLocation] = useState<{
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
    locationDisplay: string;
  } | undefined>(undefined);
  const [showResumeMessage, setShowResumeMessage] = useState(false);
  // Ref to track the most recent answers synchronously — used by saveStep when called
  // immediately after handleAnswer, before React's async state commit resolves.
  const latestAnswersRef = useRef<Record<string, any>>({});
  // Gate — render nothing until fetchProgress has completed so there's no flash
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);
  const [hasSavedOnce, setHasSavedOnce] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [saveErrorLocationRequired, setSaveErrorLocationRequired] = useState(false);

  const currentChapter = parallelQuestionnaire[currentChapterIndex];

  // Pre-populate education from questionnaire answers
  useEffect(() => {
    if (answers['4.5'] && !education) {
      const val = answers['4.5'];
      const extracted = typeof val === 'string' ? val : (val?.value && typeof val.value === 'string' ? val.value : null);
      if (extracted) setEducation(extracted);
    }
  }, [answers]);

  // ── showIf visibility helper ─────────────────────────────────
  // IMPORTANT: reads from latestAnswersRef.current, NOT from the `answers` state.
  //
  // Why: QuestionScreen auto-advances 180ms after the user taps an option.
  // That 180ms fires handleContinue → getNextQuestionIndex → isQuestionVisible.
  // React's setAnswers is async — the `answers` closure value is the *pre-tap*
  // state at that point, so any conditional child whose showIf depends on the
  // just-answered question would appear invisible and get skipped.
  //
  // latestAnswersRef.current is updated synchronously inside the setAnswers
  // callback (before React commits), so it always reflects the newest answer.
  // We fall back to `answers` only for progress-bar rendering where we need
  // a stable React-controlled value.
  const isQuestionVisible = (question: Question, answersOverride?: Record<string, any>): boolean => {
    if (!question.showIf) return true;
    const { questionId, notValues, hasValue } = question.showIf;
    // Use the override (for rendering) or the ref (for navigation)
    const source = answersOverride ?? latestAnswersRef.current;
    const refAnswer = source[questionId];
    const refValue = refAnswer && typeof refAnswer === 'object' && 'value' in refAnswer
      ? refAnswer.value
      : refAnswer;
    if (hasValue) {
      return refValue != null && refValue !== '';
    }
    if (notValues) {
      if (refValue == null || refValue === '') return false;
      return !notValues.includes(String(refValue));
    }
    return true;
  };

  // ── Total question count ──────────────────────────────────────
  const totalQuestions = parallelQuestionnaire.reduce((total, section) => {
    return total + section.questions.filter(q => isQuestionVisible(q, answers)).length;
  }, 0);

  const getCurrentQuestionNumber = () => {
    let questionNumber = 0;
    for (let i = 0; i < currentChapterIndex; i++) {
      questionNumber += parallelQuestionnaire[i].questions.filter(q => isQuestionVisible(q, answers)).length;
    }
    if (currentQuestionIndex >= 0) {
      const questionsUpToHere = currentChapter.questions
        .slice(0, currentQuestionIndex + 1)
        .filter(q => isQuestionVisible(q, answers));
      questionNumber += questionsUpToHere.length;
    }
    return questionNumber;
  };


  // ── Save a non-question step (location, chapter intros, transitions) ──────
  // Called whenever the user lands on a screen that isn't a question answer.
  // This ensures resume works even if they exit on these screens.
  //
  // IMPORTANT: Pass `latestAnswers` when calling from handleContinue after an answer
  // was just set. React's setAnswers is async — the closure `answers` value may be
  // stale at call time, which would overwrite the just-saved answer in user_answers.
  const saveStep = useCallback(async (step: string, latestAnswers?: Record<string, any>) => {
    const token = await getAccessToken();
    if (!token) return;
    fetch(`${ONBOARDING_FUNCTION_URL}/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': publicAnonKey,
      },
      body: JSON.stringify({
        current_step: step,
        partial_answers: latestAnswers ?? answers,
        partial_photos: photos,
      }),
    }).catch(err => console.error('Failed to save step:', err));
  }, [answers, photos]);

  // ── Fetch saved progress on mount ────────────────────────────
  useEffect(() => {
    const fetchProgress = async () => {
      const token = await getAccessToken();
      if (!token) {
        setHasLoadedProgress(true);
        return;
      }
      try {
        const res = await fetch(`${ONBOARDING_FUNCTION_URL}/progress`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey,
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.progress && data.progress.current_step) {
            const progress = data.progress;
            const step = progress.current_step as string;

            // Restore answers and photos first, regardless of step
            if (progress.partial_answers && Object.keys(progress.partial_answers).length > 0) {
              setAnswers(progress.partial_answers);
              // Keep ref in sync — navigation uses ref directly (not state)
              latestAnswersRef.current = progress.partial_answers;
              // Re-derive onboardingLocation from the saved answer for question 1.0.
              // Without this, ProfileEditor receives initialLocation=undefined on
              // resume even though the user already set their location, and the
              // LocationPicker shows empty instead of pre-filled.
              const savedLoc = progress.partial_answers['1.0'];
              if (savedLoc?.latitude) {
                setOnboardingLocation(savedLoc);
              }
            }
            if (progress.partial_photos && progress.partial_photos.length > 0) {
              setPhotos(progress.partial_photos);
            }

            // Restore the correct screen
            if (step === 'profile' || step === 'photo_upload') {
              // photo_upload is written by ProfileEditor during photo uploads —
              // both map to the Create Profile screen
              setShowCreateProfileTitle(true);
            } else if (step === 'location') {
              // location step is now question 1.0 inside the questionnaire
              setShowResumeMessage(true);
              setTimeout(() => setShowResumeMessage(false), 3000);
            } else if (step === 'part2_transition') {
              setShowPart2Transition(true);
              setShowResumeMessage(true);
              setTimeout(() => setShowResumeMessage(false), 3000);
            } else if (step.startsWith('chapter_')) {
              const parts = step.split('_');
              const chapterIdx = parseInt(parts[1]);
              if (parts[2] === 'intro') {
                setCurrentChapterIndex(chapterIdx);
                setCurrentQuestionIndex(-1);
              } else if (parts[2] === 'question') {
                const questionIdx = parseInt(parts[3]);
                setCurrentChapterIndex(chapterIdx);
                setCurrentQuestionIndex(questionIdx);
              }
              setShowResumeMessage(true);
              setTimeout(() => setShowResumeMessage(false), 3000);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch progress:', err);
      } finally {
        setHasLoadedProgress(true);
      }
    };
    fetchProgress();
  }, []);

  // ── Saving spinner ───────────────────────────────────────────
  // DO NOT REMOVE — blocks the UI during the final profile-save network call.
  // Without this the user can tap buttons on a stale screen while the save is
  // in flight, causing duplicate submissions or a broken onboarding state.
  // This block has been stripped by automated edits before — keep it.
  if (isSaving) {
    return (
      <div className="fixed inset-0 bg-parallel-cream z-50 flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
        <div className="w-8 h-8 border-2 border-parallel-void border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <p className="text-sm text-gray-500">Saving your profile…</p>
      </div>
    );
  }


  // ── Loading gate — render nothing until progress fetch resolves ──────────
  // Prevents the intro screen flashing before the user is dropped at their
  // saved question. Shows for ~200-500ms on a normal connection.
  if (!hasLoadedProgress) {
    return (
      <div className="fixed inset-0 bg-parallel-cream flex items-center justify-center" role="status" aria-live="polite">
        <p className="text-sm text-gray-500">Loading your progress…</p>
      </div>
    );
  }

  // ── Profile completion handler ────────────────────────────────
  const handleProfileCompletionComplete = async (data: {
    photos: string[];
    bio: string;
    career: string;
    education: string;
    instagram: string;
    pronouns: string;
    location?: { latitude: number; longitude: number; city: string; state: string; country: string; locationDisplay: string };
  }) => {
    setIsSaving(true);
    setSaveError('');
    setSaveErrorLocationRequired(false);
    setPhotos(data.photos);
    setBio(data.bio);
    setCareer(data.career);
    setEducation(data.education);
    setInstagram(data.instagram);
    setPronouns(data.pronouns || '');

    try {
      // Three-tier location fallback so it can never be dropped at submit:
      // 1. data.location  — set in ProfileEditor (most recently edited value)
      // 2. onboardingLocation — set when question 1.0 was answered this session
      // 3. answers['1.0'] — last resort from saved questionnaire answers
      const resolvedLocation =
        data.location ||
        onboardingLocation ||
        (answers['1.0']?.latitude ? answers['1.0'] : undefined);

      const result = await onComplete({
        ...answers,
        photos: data.photos,
        bio: data.bio,
        career: data.career,
        education: data.education,
        instagram: data.instagram,
        pronouns: data.pronouns || '',
        location: resolvedLocation,
      });

      if (!result.success) {
        setIsSaving(false);
        setSaveError(result.error || 'An error occurred while saving your profile.');
        if (result.locationRequired) {
          setSaveErrorLocationRequired(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        setIsSaving(false);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      setIsSaving(false);
      setSaveError('Network error. Please check your connection and try again.');
      console.error('Profile save error:', err);
    }
  };

  // ── Profile completion screen ────────────────────────────────
  if (showProfileCompletion) {
    return (
      <div className="flex flex-col min-h-screen bg-parallel-cream">
        {saveError && (
          <div className="bg-red-50 border-b-2 border-red-200 px-6 py-3 flex-shrink-0 flex items-start gap-3">
            <span className="text-red-500 text-lg flex-shrink-0">⚠</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Couldn't save your profile</p>
              <p className="text-sm text-red-700 mt-0.5">{saveError}</p>
              {saveErrorLocationRequired && (
                <p className="text-xs text-red-600 mt-1">Scroll down to add your location before finishing.</p>
              )}
            </div>
            <button onClick={() => setSaveError('')} className="text-red-400 hover:text-red-600 text-lg flex-shrink-0">×</button>
          </div>
        )}
        <ProfileEditor
          isOnboarding={true}
          initialName={userName}
          onComplete={handleProfileCompletionComplete}
          onBack={() => {
            setShowProfileCompletion(false);
            setShowCreateProfileTitle(true);
          }}
          initialPhotos={photos}
          initialBio={bio}
          initialCareer={career}
          initialEducation={education}
          initialInstagram={instagram}
          initialPronouns={pronouns}
          initialLocation={onboardingLocation}
        />
      </div>
    );
  }

  // ── Match Weights screen ─────────────────────────────────────
  if (showMatchWeights) {
    return (
      <MatchWeightsScreen
        isOnboarding={true}
        onComplete={() => {
          setShowMatchWeights(false);
          setShowCreateProfileTitle(true);
        }}
        onBack={() => setShowMatchWeights(false)}
      />
    );
  }

  // ── "Create Profile" chapter title screen ────────────────────
  if (showCreateProfileTitle) {
    return (
      <div className="flex flex-col bg-parallel-cream" style={{ height: '100dvh', overflow: 'hidden' }}>
        {onNavigate && (
          <SimpleHeader
            onNavigate={onNavigate}
            showBackButton={false}
            showMenu={true}
            isSignedIn={true}
            showInbox={showInbox}
          />
        )}
        <div
          className="flex-1 min-h-0 flex flex-col max-w-[390px] mx-auto w-full bg-parallel-cream"
        >
          <ChapterTitle
            title="Create Profile"
            subtitle="Add your photos and a few details so your matches can get to know the real you."
            chapterNumber={parallelQuestionnaire.length + 1}
            totalChapters={parallelQuestionnaire.length + 1}
            onContinue={() => {
              setShowCreateProfileTitle(false);
              setShowProfileCompletion(true);
            }}
            onBack={() => {
              setShowCreateProfileTitle(false);
              const lastChapterIndex = parallelQuestionnaire.length - 1;
              setCurrentChapterIndex(lastChapterIndex);
              const lastChapter = parallelQuestionnaire[lastChapterIndex];
              setCurrentQuestionIndex(lastChapter.questions.length - 1);
            }}
            canGoBack={true}
          />
        </div>
      </div>
    );
  }

  if (!currentChapter) return null;

  // ── Navigation helpers ────────────────────────────────────────
  const getNextQuestionIndex = (fromIndex: number): number | null => {
    for (let i = fromIndex; i < currentChapter.questions.length; i++) {
      const q = currentChapter.questions[i];
      if (isQuestionVisible(q)) return i;
    }
    return null;
  };

  const getPrevQuestionIndex = (fromIndex: number): number | null => {
    for (let i = fromIndex; i >= 0; i--) {
      const q = currentChapter.questions[i];
      if (isQuestionVisible(q)) return i;
    }
    return null;
  };

  const getCompletedQuestions = () => {
    let completed = 0;
    for (let i = 0; i < currentChapterIndex; i++) {
      completed += parallelQuestionnaire[i].questions.filter(q => isQuestionVisible(q, answers)).length;
    }
    if (currentQuestionIndex >= 0) {
      completed += currentChapter.questions
        .slice(0, currentQuestionIndex + 1)
        .filter(q => isQuestionVisible(q, answers)).length;
    }
    return completed;
  };

  const handleAnswer = (questionId: string, answer: any) => {
    let updated: Record<string, any> | null = null;
    setAnswers((prev) => {
      const next: Record<string, any> = { ...prev, [questionId]: answer };

      // ── Stale-conditional cleanup ────────────────────────────────
      // If this question is the parent of any conditional (`showIf`) child,
      // and the new answer hides that child, wipe the child's previous answer.
      // Without this, a user who answered 3.2 ("when you drink…") and then
      // changes 3.1 to "Never drink" would have a stranded 3.2 answer they
      // can't see or edit, and that answer would still be sent to the matching
      // algorithm. We only check direct children of `questionId`; transitive
      // chains (e.g. 6.2 → 6.2b → 12.3) are handled because re-checking on
      // every parent change cascades naturally as users move through the flow.
      for (const section of parallelQuestionnaire) {
        for (const child of section.questions) {
          if (!child.showIf || child.showIf.questionId !== questionId) continue;
          const childAnswer = next[child.id];
          if (childAnswer === undefined || childAnswer === null) continue;
          // Re-evaluate visibility against the *new* parent answer.
          const refValue = answer && typeof answer === 'object' && 'value' in answer
            ? (answer as any).value
            : answer;
          let stillVisible = true;
          if (child.showIf.hasValue) {
            stillVisible = refValue != null && refValue !== '';
          } else if (child.showIf.notValues) {
            stillVisible = refValue != null && refValue !== '' &&
              !child.showIf.notValues.includes(String(refValue));
          }
          if (!stillVisible) {
            delete next[child.id];
            // Also wipe transitive children (e.g. 12.3 depends on 6.2b which
            // depends on 6.2). If 6.2 → atheist hides 6.2b, and 12.3 depended
            // on 6.2b having any value, 12.3 should also clear.
            for (const grandSection of parallelQuestionnaire) {
              for (const grand of grandSection.questions) {
                if (!grand.showIf || grand.showIf.questionId !== child.id) continue;
                if (next[grand.id] !== undefined) delete next[grand.id];
              }
            }
          }
        }
      }
      // ── End cleanup ──────────────────────────────────────────────

      updated = next;
      // Store latest answers in ref so handleContinue's saveStep call
      // gets the fresh value even though React state hasn't committed yet.
      latestAnswersRef.current = updated;
      return updated;
    });

    // Persist progress to backend (async, fire-and-forget).
    // Pulled out of the setState callback so we can await getAccessToken().
    (async () => {
      const token = await getAccessToken();
      if (!token || !updated) return;
      fetch(`${ONBOARDING_FUNCTION_URL}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          current_step: `chapter_${currentChapterIndex}_question_${currentQuestionIndex}`,
          completed_steps: [],
          partial_answers: updated,
          partial_photos: photos,
        }),
      }).catch(err => console.error('Failed to save answer:', err));

      // LOCATION questions also persist to /user/location so the
      // matching algorithm can read lat/lng directly from the profile.
      const allQuestions = parallelQuestionnaire.flatMap(s => s.questions);
      const answeredQuestion = allQuestions.find(q => q.id === questionId);
      if (answeredQuestion?.type === 'LOCATION' && answer?.latitude) {
        setOnboardingLocation(answer);
        fetch(`${ONBOARDING_FUNCTION_URL}/user/location`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify(answer),
        }).catch(err => console.error('Failed to save location:', err));
      }
    })();
  };

  const getTotalDealbreakers = () => {
    let count = 0;
    Object.values(answers).forEach((answer) => {
      if (answer && typeof answer === 'object' && answer.isDealbreaker === true) count++;
    });
    return count;
  };

  const handleContinue = () => {
    const nextInChapter = getNextQuestionIndex(currentQuestionIndex + 1);
    if (nextInChapter !== null) {
      setCurrentQuestionIndex(nextInChapter);
      window.scrollTo(0, 0);
    } else {
      // End of current chapter — pass latestAnswersRef.current so saveStep doesn't
      // use the stale closure value and accidentally overwrite the last answer.
      const fresh = latestAnswersRef.current && Object.keys(latestAnswersRef.current).length > 0
        ? latestAnswersRef.current
        : undefined;
      if (currentChapterIndex === PART1_LAST_CHAPTER_INDEX) {
        // Skip the Part 1 complete interstitial — go straight to Part 2
        const nextIdx = PART1_LAST_CHAPTER_INDEX + 1;
        setCurrentChapterIndex(nextIdx);
        setCurrentQuestionIndex(-1);
        saveStep(`chapter_${nextIdx}_intro`, fresh);
        window.scrollTo(0, 0);
      } else if (currentChapterIndex < parallelQuestionnaire.length - 1) {
        const nextIdx = currentChapterIndex + 1;
        setCurrentChapterIndex(nextIdx);
        setCurrentQuestionIndex(-1);
        saveStep(`chapter_${nextIdx}_intro`, fresh);
        window.scrollTo(0, 0);
      } else {
        setShowMatchWeights(true);
        window.scrollTo(0, 0);
      }
    }
  };

  const handleBack = () => {
    if (showPart2Transition) {
      // Back from Part 2 transition — return to last question of Part 1
      setShowPart2Transition(false);
      setCurrentChapterIndex(PART1_LAST_CHAPTER_INDEX);
      const lastPart1Chapter = parallelQuestionnaire[PART1_LAST_CHAPTER_INDEX];
      let lastQ = lastPart1Chapter.questions.length - 1;
      while (lastQ >= 0 && !isQuestionVisible(lastPart1Chapter.questions[lastQ])) lastQ--;
      setCurrentQuestionIndex(lastQ >= 0 ? lastQ : lastPart1Chapter.questions.length - 1);
      window.scrollTo(0, 0);
      return;
    }
    if (currentQuestionIndex > 0) {
      const prev = getPrevQuestionIndex(currentQuestionIndex - 1);
      if (prev !== null) {
        setCurrentQuestionIndex(prev);
      } else {
        setCurrentQuestionIndex(-1);
      }
      window.scrollTo(0, 0);
    } else if (currentQuestionIndex === 0) {
      setCurrentQuestionIndex(-1);
      window.scrollTo(0, 0);
    } else if (currentQuestionIndex === -1) {
      // On a chapter intro screen
      if (currentChapterIndex === PART1_LAST_CHAPTER_INDEX + 1) {
        // First Part 2 chapter intro — back goes to Part 2 transition
        setShowPart2Transition(true);
        window.scrollTo(0, 0);
      } else if (currentChapterIndex > 0) {
        const prevChapter = parallelQuestionnaire[currentChapterIndex - 1];
        setCurrentChapterIndex(currentChapterIndex - 1);
        let lastQ = prevChapter.questions.length - 1;
        while (lastQ >= 0 && !isQuestionVisible(prevChapter.questions[lastQ])) lastQ--;
        setCurrentQuestionIndex(lastQ >= 0 ? lastQ : prevChapter.questions.length - 1);
        window.scrollTo(0, 0);
      } else {
        window.scrollTo(0, 0);
      }
    }
  };

  const handleStartChapter = () => {
    const firstQ = getNextQuestionIndex(0);
    if (firstQ !== null) {
      setCurrentQuestionIndex(firstQ);
      saveStep(`chapter_${currentChapterIndex}_question_${firstQ}`);
      window.scrollTo(0, 0);
    } else {
      handleSkipChapter();
    }
  };

  const handleSkipChapter = () => {
    if (currentChapterIndex < parallelQuestionnaire.length - 1) {
      const nextIdx = currentChapterIndex + 1;
      setCurrentChapterIndex(nextIdx);
      setCurrentQuestionIndex(-1);
      saveStep(`chapter_${nextIdx}_intro`);
      window.scrollTo(0, 0);
    } else {
      setShowCreateProfileTitle(true);
      saveStep('profile');
      window.scrollTo(0, 0);
    }
  };

  // ── TIME ESTIMATE SCREEN ─────────────────────────────────────
  if (showTimeEstimate && !showWelcome) {
    return (
      <div className="flex flex-col bg-parallel-cream" style={{ height: '100dvh', overflow: 'hidden' }}>
        {onNavigate && (
          <SimpleHeader
            onNavigate={onNavigate}
            showBackButton={false}
            showMenu={true}
            isSignedIn={true}
            showInbox={showInbox}
          />
        )}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-6 pb-4"
          style={{
            paddingTop: '40px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="max-w-md w-full mx-auto">
            <h1 className="text-3xl font-medium mb-4 leading-tight">
              Here's how Parallel works
            </h1>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Answer honestly — there are no right answers, just yours. Your responses are private and only used for matching.
            </p>
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-parallel-purple text-parallel-cream flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="font-medium text-gray-900">Answer 68 questions about yourself</p>
                  <p className="text-sm text-gray-500 mt-0.5">Takes about 15 minutes. Saves automatically as you go — you can close and come back anytime.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-parallel-purple text-parallel-cream flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="font-medium text-gray-900">We run our compatibility algorithm</p>
                  <p className="text-sm text-gray-500 mt-0.5">Your answers are matched against others across 8 compatibility categories — no random swiping.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-parallel-purple text-parallel-cream flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">3</div>
                <div>
                  <p className="font-medium text-gray-900">Meet people who actually match</p>
                  <p className="text-sm text-gray-500 mt-0.5">See exactly why you matched — and what might be different. Then decide if you want to connect.</p>
                </div>
              </div>
            </div>

            {/* Photo heads-up — set expectation now so users don't bail mid-flow
                hunting for photos. Surfaces the requirement before they invest
                15+ minutes in the questionnaire. */}
            <div className="mt-6 rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-sm text-gray-700 leading-relaxed">
                <span className="font-medium">Heads up:</span> you'll want 2–3 photos of yourself ready when you build your profile.
              </p>
            </div>
          </div>
        </div>
        <div
          className="flex-shrink-0 bg-parallel-cream border-t border-gray-100 px-6 pt-3"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-md mx-auto">
            <button
              onClick={() => {
                saveStep('chapter_0_question_0');
              }}
              className="w-full py-4 px-6 rounded-full bg-parallel-purple text-parallel-cream text-lg font-medium transition-all hover:bg-parallel-purple/90"
            >
              Let's go →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Part 2 transition screen ─────────────────────────────────
  if (showPart2Transition) {
    return (
      <div className="flex flex-col bg-parallel-cream" style={{ height: '100dvh', overflow: 'hidden' }}>
        {onNavigate && (
          <SimpleHeader
            onNavigate={onNavigate}
            showBackButton={false}
            showMenu={true}
            isSignedIn={true}
            showInbox={showInbox}
          />
        )}
        {showResumeMessage && (
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200 px-6 py-3 flex-shrink-0">
            <p className="text-center text-blue-900 font-medium text-sm">
              Welcome back — pick up where you left off ✓
            </p>
          </div>
        )}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 flex flex-col items-center justify-center"
          style={{
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="max-w-md w-full mx-auto text-center">
            <div className="text-6xl mb-6" role="img" aria-label="celebration">🎉</div>
            <h1 className="text-3xl font-medium mb-4 leading-tight">
              Part 1 complete!
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed">
              Now let's talk about what you're looking for in a match.
            </p>
          </div>
        </div>
        <div
          className="flex-shrink-0 bg-parallel-cream border-t border-gray-100 px-4 pt-3"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-md mx-auto flex items-center gap-3">
            <button
              onClick={() => handleBack()}
              aria-label="Go back"
              className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full border-2 border-gray-200 hover:border-parallel-void transition-colors bg-parallel-cream"
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button
              onClick={() => {
                setShowPart2Transition(false);
                const nextIdx = PART1_LAST_CHAPTER_INDEX + 1;
                setCurrentChapterIndex(nextIdx);
                setCurrentQuestionIndex(-1);
                saveStep(`chapter_${nextIdx}_intro`);
                window.scrollTo(0, 0);
              }}
              className="flex-1 py-4 px-6 rounded-full bg-parallel-purple text-parallel-cream text-lg font-medium transition-all hover:bg-parallel-purple/90"
            >
              Let's go →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = currentChapter.questions[currentQuestionIndex];

  return (
    <div className="flex flex-col bg-parallel-cream" style={{ height: '100dvh', overflow: 'hidden' }}>
      {onNavigate && (
        <SimpleHeader
          onNavigate={onNavigate}
          showBackButton={false}
          showMenu={true}
          isSignedIn={true}
          showInbox={showInbox}
        />
      )}

      <div
        className="max-w-[390px] mx-auto w-full bg-parallel-cream flex flex-col flex-1 min-h-0"
      >
        {showResumeMessage && (
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-200 px-6 py-3 flex-shrink-0">
            <p className="text-center text-blue-900 font-medium text-sm">
              Welcome back — pick up where you left off ✓
            </p>
          </div>
        )}

        {/* Progress bar — only shown during questions */}
        {currentQuestionIndex >= 0 && (
          <div className="flex-shrink-0">
            <ProgressBar
              currentChapter={currentChapterIndex + 1}
              totalChapters={parallelQuestionnaire.length}
            />
          </div>
        )}

        {currentQuestionIndex === -1 ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <ChapterTitle
              title={currentChapter.title}
              subtitle={currentChapter.subtitle}
              chapterNumber={currentChapter.id}
              totalChapters={parallelQuestionnaire.length}
              onContinue={handleStartChapter}
              onBack={handleBack}
              canGoBack={true}
            />
          </div>
        ) : currentQuestion ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Section title replaces "Section X of Y" — more meaningful to users */}
            <div className="px-6 pt-2 pb-0 flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                {currentChapter.title}
              </span>
              <span className="text-xs text-green-500 font-medium flex items-center gap-1">
                <span>✓</span>
                <span>Saving automatically</span>
              </span>
            </div>
            <QuestionScreen
              key={currentQuestion.id}
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              answers={answers}
              onAnswer={((qId) => (answer: any) => handleAnswer(qId, answer))(currentQuestion.id)}
              onBack={handleBack}
              onContinue={handleContinue}
              canGoBack={true}
              chapterTitle={`QUESTION ${getCurrentQuestionNumber()} OF 68`}
              lockedAge={lockedAge}
              totalDealbreakers={getTotalDealbreakers()}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}