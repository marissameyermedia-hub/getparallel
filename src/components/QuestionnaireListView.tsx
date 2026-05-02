import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { parallelQuestionnaire, Question } from '../data/parallelQuestionnaire_updated';
import { QuestionScreen } from './onboarding/QuestionScreen';
import { EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';
import { useModalA11y } from '../utils/useModalA11y';

interface QuestionnaireListViewProps {
  answers: Record<string, any>;
  onUpdateAnswer: (questionId: string, answer: any) => void;
  onClose: () => void;
}

function getAnswerSummary(question: Question, answer: any): string {
  if (answer === null || answer === undefined) return 'Not answered';
  const val = typeof answer === 'object' && 'value' in answer ? answer.value : answer;
  if (val === null || val === undefined) return 'Not answered';
  switch (question.type) {
    case 'MC':
    case 'DROPDOWN':
      return typeof val === 'string' ? val : 'Not answered';
    case 'MS':
    case 'MS_MAX':
      if (Array.isArray(val)) {
        if (val.length === 0) return 'Not answered';
        if (val.length <= 3) return val.join(', ');
        return `${val.slice(0, 2).join(', ')} +${val.length - 2} more`;
      }
      return 'Not answered';
    case 'HEIGHT':
      if (val?.feet !== undefined) {
        if (val.unit === 'cm' && val.cm) return `${val.cm} cm (${val.feet}'${val.inches || 0}")`;
        return `${val.feet}'${val.inches || 0}"`;
      }
      return 'Not answered';
    case 'AGE_RANGE':
      if (val?.min !== undefined && val?.max !== undefined) return `${val.min}–${val.max} years`;
      return 'Not answered';
    case 'HEIGHT_RANGE':
      if (val?.minFeet !== undefined) {
        return `${val.minFeet}'${val.minInches || 0}" – ${val.maxFeet || 7}'${val.maxInches || 0}"`;
      }
      return 'Not answered';
    case 'TXT':
    case 'DATE':
      if (Array.isArray(val)) return val.filter(Boolean).join(', ') || 'Not answered';
      return String(val) || 'Not answered';
    case 'PARA':
    case 'LT':
      const text = Array.isArray(val) ? val[0] : val;
      if (!text) return 'Not answered';
      return text.length > 60 ? text.slice(0, 60) + '…' : text;
    case 'LOCATION':
      return val?.locationDisplay || val?.city || 'Location set';
    default:
      return 'Answered';
  }
}

function isQuestionVisible(question: Question, answers: Record<string, any>): boolean {
  if (!question.showIf) return true;
  const { questionId, notValues, hasValue } = question.showIf as any;
  const refAnswer = answers[questionId];
  const refValue = refAnswer && typeof refAnswer === 'object' && 'value' in refAnswer
    ? refAnswer.value
    : refAnswer;
  if (hasValue) return refValue != null && refValue !== '';
  if (notValues) {
    if (refValue == null || refValue === '') return false;
    return !notValues.includes(String(refValue));
  }
  return true;
}

function isAnswered(question: Question, answer: any): boolean {
  if (answer === null || answer === undefined) return false;
  const val = typeof answer === 'object' && 'value' in answer ? answer.value : answer;
  if (val === null || val === undefined) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  if (Array.isArray(val) && val.length === 0) return false;
  return true;
}

// When the user edits a parent question (e.g. 3.1, 6.2, 8.2, 3.10), any
// previously-answered child question with a `showIf` rule that no longer
// matches the new parent value must be wiped. Otherwise the child answer
// becomes a stranded ghost — invisible to the user (filtered out by
// isQuestionVisible), but still sent to the matching algorithm.
//
// Returns a new answers object with stale conditional children removed.
// Handles transitive chains too (e.g. 6.2 → 6.2b → 12.3).
function stripStaleConditionalAnswers(answers: Record<string, any>): Record<string, any> {
  let next = { ...answers };
  // Iterate until stable — clearing one child may invalidate its grandchild.
  let changed = true;
  let safety = 0;
  while (changed && safety++ < 5) {
    changed = false;
    for (const section of parallelQuestionnaire) {
      for (const q of section.questions) {
        if (!q.showIf) continue;
        if (next[q.id] === undefined) continue;
        const refAnswer = next[q.showIf.questionId];
        const refValue = refAnswer && typeof refAnswer === 'object' && 'value' in refAnswer
          ? refAnswer.value
          : refAnswer;
        let visible = true;
        if ((q.showIf as any).hasValue) {
          visible = refValue != null && refValue !== '';
        } else if ((q.showIf as any).notValues) {
          visible = refValue != null && refValue !== '' &&
            !(q.showIf as any).notValues.includes(String(refValue));
        }
        if (!visible) {
          delete next[q.id];
          changed = true;
        }
      }
    }
  }
  return next;
}

export function QuestionnaireListView({
  answers,
  onUpdateAnswer,
  onClose,
}: QuestionnaireListViewProps) {
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingAnswer, setEditingAnswer] = useState<any>(null);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [editingQuestion]);

  const totalQuestions = parallelQuestionnaire.reduce(
    (acc, s) => acc + s.questions.filter(q => q.type !== 'LOCATION' && isQuestionVisible(q, answers)).length, 0
  );
  const answeredCount = parallelQuestionnaire.reduce((acc, s) => {
    return acc + s.questions.filter(q => q.type !== 'LOCATION' && isQuestionVisible(q, answers) && isAnswered(q, answers[q.id])).length;
  }, 0);
  const completionPct = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setEditingAnswer(answers[question.id]);
  };

  const handleSaveAndExit = async () => {
    if (editingQuestion && editingAnswer !== undefined) {
      onUpdateAnswer(editingQuestion.id, editingAnswer);
      // Apply the new answer, then strip any conditional children that the
      // change made invisible. Both the local copy we send to the backend
      // AND the parent state need to be cleaned, so we propagate deletions
      // back through onUpdateAnswer for any child IDs that were wiped.
      const before = { ...answers, [editingQuestion.id]: editingAnswer };
      const updatedAnswers = stripStaleConditionalAnswers(before);
      for (const key of Object.keys(before)) {
        if (!(key in updatedAnswers)) {
          // Tell parent state to drop this stale child
          onUpdateAnswer(key, null);
        }
      }

      // Direct backend write — bypasses the 1500ms debounce so the answer
      // is guaranteed to reach Supabase before returning to list view.
      const token = await getAccessToken();
      if (token) {
        fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({ answers: updatedAnswers }),
        }).catch(() => {});
      }

      const attachmentIds = ['7.1a', '7.1b', '7.1c'];
      const allThreeAnswered = attachmentIds.every(id => updatedAnswers[id]);
      if (attachmentIds.includes(editingQuestion.id) && allThreeAnswered) {
        const token = await getAccessToken();
        if (token) {
          const toLetter = (qId: string): 'A'|'B'|'C'|'D' => {
            const q = parallelQuestionnaire.flatMap(s => s.questions).find(q => q.id === qId);
            const ans = updatedAnswers[qId];
            const val = ans && typeof ans === 'object' && 'value' in ans ? ans.value : ans;
            const idx = q?.options?.indexOf(val) ?? -1;
            return (['A','B','C','D'][idx] || 'A') as 'A'|'B'|'C'|'D';
          };
          fetch(`${ONBOARDING_FUNCTION_URL}/attachment/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
            body: JSON.stringify({ answerA: toLetter('7.1a'), answerB: toLetter('7.1b'), answerC: toLetter('7.1c') }),
          }).catch(err => console.error('Failed to score attachment:', err));
        }
      }
    }
    setEditingQuestion(null);
    setEditingAnswer(null);
  };

  const handleContinueToNext = async () => {
    if (editingQuestion && editingAnswer !== undefined) {
      onUpdateAnswer(editingQuestion.id, editingAnswer);
      const before = { ...answers, [editingQuestion.id]: editingAnswer };
      const updatedAnswers = stripStaleConditionalAnswers(before);
      for (const key of Object.keys(before)) {
        if (!(key in updatedAnswers)) onUpdateAnswer(key, null);
      }

      // Direct backend write — same as onBack. Bypasses the 1500ms debounce so
      // the answer is guaranteed to reach Supabase before the screen changes.
      const token = await getAccessToken();
      if (token) {
        fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({ answers: updatedAnswers }),
        }).catch(() => {});
      }

      const attachmentIds = ['7.1a', '7.1b', '7.1c'];
      const allThreeAnswered = attachmentIds.every(id => updatedAnswers[id]);
      if (attachmentIds.includes(editingQuestion.id) && allThreeAnswered) {
        if (token) {
          const toLetter = (qId: string): 'A'|'B'|'C'|'D' => {
            const q = parallelQuestionnaire.flatMap(s => s.questions).find(q => q.id === qId);
            const ans = updatedAnswers[qId];
            const val = ans && typeof ans === 'object' && 'value' in ans ? ans.value : ans;
            const idx = q?.options?.indexOf(val) ?? -1;
            return (['A','B','C','D'][idx] || 'A') as 'A'|'B'|'C'|'D';
          };
          fetch(`${ONBOARDING_FUNCTION_URL}/attachment/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
            body: JSON.stringify({ answerA: toLetter('7.1a'), answerB: toLetter('7.1b'), answerC: toLetter('7.1c') }),
          }).catch(err => console.error('Failed to score attachment:', err));
        }
      }
    }
    const allQuestions = parallelQuestionnaire.flatMap(s => s.questions).filter(q => q.type !== 'LOCATION');
    const idx = allQuestions.findIndex(q => q.id === editingQuestion?.id);
    if (idx !== -1 && idx < allQuestions.length - 1) {
      const next = allQuestions[idx + 1];
      setEditingQuestion(next);
      setEditingAnswer(answers[next.id]);
    } else {
      setEditingQuestion(null);
      setEditingAnswer(null);
    }
  };

  // Save the current answer (bypassing the 1500ms debounce) and exit the
  // editor. Used both by the Back button in QuestionScreen and by the
  // Escape-key handler in useModalA11y so both paths share identical save
  // logic. Without this extraction, Escape would skip the save and tapping
  // Back within 1500ms of answering would cancel the pending debounce timer
  // and silently drop the answer.
  const closeEditor = useCallback(async () => {
    if (editingQuestion && editingAnswer !== undefined && editingAnswer !== null) {
      const token = await getAccessToken();
      if (token) {
        const before = { ...answers, [editingQuestion.id]: editingAnswer };
        const updatedAnswers = stripStaleConditionalAnswers(before);
        for (const key of Object.keys(before)) {
          if (!(key in updatedAnswers)) onUpdateAnswer(key, null);
        }
        fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({ answers: updatedAnswers }),
        }).catch(() => {});
        onUpdateAnswer(editingQuestion.id, editingAnswer);
      }
    }
    setEditingQuestion(null);
    setEditingAnswer(null);
  }, [answers, editingAnswer, editingQuestion, onUpdateAnswer]);

  // Locks body scroll, listens for Escape to close, and restores focus to
  // the question row that opened the editor.
  useModalA11y(editingQuestion !== null, closeEditor);

  if (editingQuestion) {
    // Fixed-position fullscreen overlay so the editor isn't sandwiched
    // between the App Header (top) and the BottomNav (bottom). Without this,
    // the wrapper inherited only viewport - 64px - 70px of available height
    // while still being styled as 100dvh, which pushed Save & Exit / Save &
    // Continue below the visible area on long questions (hobby grid, MS_MAX
    // questions with many options, paragraph inputs, etc). flex flex-col is
    // critical: QuestionScreen relies on `flex-1 min-h-0 overflow-y-auto` on
    // its scroll area, which only works inside a flex parent with a fixed
    // height. z-[60] keeps it above the InAppNotificationBanner.
    return (
      <div
        className="fixed inset-0 z-[60] bg-parallel-cream flex flex-col"
        style={{ height: '100dvh', overflow: 'hidden' }}
      >
        <QuestionScreen
          question={{ ...editingQuestion, noAutoAdvance: true } as any}
          answer={editingAnswer}
          onAnswer={(ans) => {
            setEditingAnswer(ans);
            // Update parent state immediately on every answer change so the
            // debounce timer in saveAnswersToSupabase always has the latest value.
            onUpdateAnswer(editingQuestion.id, ans);
          }}
          onBack={closeEditor}
          onContinue={handleContinueToNext}
          canGoBack={true}
          chapterTitle={`EDITING: ${editingQuestion.id}`}
          onSave={handleSaveAndExit}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parallel-cream">
      <div className="sticky top-0 bg-parallel-cream border-b border-gray-100 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-600 hover:text-parallel-void transition-colors p-2 -ml-2">
            <ChevronLeft size={18} aria-hidden="true" />
            Back
          </button>
          <h1 className="text-base font-semibold">My Questionnaire</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{answeredCount} of {totalQuestions} questions answered</p>
            <span className="text-sm font-semibold">{completionPct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-parallel-void rounded-full transition-all" style={{ width: `${completionPct}%` }} />
          </div>
          {completionPct < 100 && (
            <p className="text-xs text-gray-400 mt-2">More complete answers = better matches. Tap any section to edit.</p>
          )}
        </div>

        {[1, 2].map(part => {
          const partSections = parallelQuestionnaire.filter(s => s.part === part);
          return (
            <div key={part} className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 px-1">
                {part === 1 ? 'Part 1 — About You' : 'Part 2 — Your Preferences'}
              </p>
              <div className="space-y-2">
                {partSections.map(section => {
                  const sectionQuestions = section.questions.filter(q => q.type !== 'LOCATION' && isQuestionVisible(q, answers));
                  const requiredQuestions = sectionQuestions.filter(q => !(q as any).optional);
                  const sectionAnswered = sectionQuestions.filter(q => isAnswered(q, answers[q.id])).length;
                  const requiredAnswered = requiredQuestions.filter(q => isAnswered(q, answers[q.id])).length;
                  const sectionComplete = requiredAnswered === requiredQuestions.length && requiredQuestions.length > 0;
                  const isExpanded = expandedSection === section.id;

                  return (
                    <div key={section.id} className="bg-parallel-cream border-2 border-gray-200 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                        className="w-full px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${sectionComplete ? 'bg-parallel-void' : 'bg-gray-200'}`}>
                          {sectionComplete
                            ? <Check size={12} className="text-parallel-cream" />
                            : <span className="text-xs text-gray-500">{sectionAnswered}</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{section.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {sectionComplete ? 'All answered' : `${sectionAnswered} of ${requiredQuestions.length} answered`}
                          </p>
                        </div>
                        <ChevronRight size={16} className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          {sectionQuestions.map((question, idx) => {
                            const answered = isAnswered(question, answers[question.id]);
                            const summary = getAnswerSummary(question, answers[question.id]);
                            const isLast = idx === sectionQuestions.length - 1;
                            return (
                              <button
                                key={question.id}
                                onClick={() => handleEditQuestion(question)}
                                className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left ${!isLast ? 'border-b border-gray-100' : ''}`}
                              >
                                <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${answered ? 'bg-parallel-void' : 'bg-gray-300'}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 leading-snug">{question.text}</p>
                                  <p className={`text-xs mt-0.5 truncate ${answered ? 'text-gray-500' : 'text-gray-300 italic'}`}>{summary}</p>
                                </div>
                                <ChevronRight size={14} className="text-gray-300 mt-1 flex-shrink-0" />
                              </button>
                            );
                          })}
                          <button
                            onClick={() => {
                              const firstUnanswered = sectionQuestions.find(q => !isAnswered(q, answers[q.id]));
                              const toEdit = firstUnanswered || sectionQuestions[0];
                              handleEditQuestion(toEdit);
                            }}
                            className="w-full px-4 py-3 text-center text-xs text-parallel-void font-medium hover:bg-gray-50 transition-colors border-t border-gray-100"
                          >
                            {sectionComplete ? 'Edit this section →' : 'Continue this section →'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
