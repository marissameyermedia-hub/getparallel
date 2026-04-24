import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { parallelQuestionnaire, Question } from '../data/parallelQuestionnaire_updated';
import { QuestionScreen } from './onboarding/QuestionScreen';
import { EDGE_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

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

  const handleSaveAndExit = () => {
    if (editingQuestion && editingAnswer !== undefined) {
      onUpdateAnswer(editingQuestion.id, editingAnswer);
      const updatedAnswers = { ...answers, [editingQuestion.id]: editingAnswer };

      // Direct backend write — bypasses the 1500ms debounce so the answer
      // is guaranteed to reach Supabase before returning to list view.
      const token = localStorage.getItem('parallel_access_token');
      if (token) {
        fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
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
        const token = localStorage.getItem('parallel_access_token');
        if (token) {
          const toLetter = (qId: string): 'A'|'B'|'C'|'D' => {
            const q = parallelQuestionnaire.flatMap(s => s.questions).find(q => q.id === qId);
            const ans = updatedAnswers[qId];
            const val = ans && typeof ans === 'object' && 'value' in ans ? ans.value : ans;
            const idx = q?.options?.indexOf(val) ?? -1;
            return (['A','B','C','D'][idx] || 'A') as 'A'|'B'|'C'|'D';
          };
          fetch(`${EDGE_FUNCTION_URL}/attachment/score`, {
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

  const handleContinueToNext = () => {
    if (editingQuestion && editingAnswer !== undefined) {
      onUpdateAnswer(editingQuestion.id, editingAnswer);
      const updatedAnswers = { ...answers, [editingQuestion.id]: editingAnswer };

      // Direct backend write — same as onBack. Bypasses the 1500ms debounce so
      // the answer is guaranteed to reach Supabase before the screen changes.
      const token = localStorage.getItem('parallel_access_token');
      if (token) {
        fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
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
          fetch(`${EDGE_FUNCTION_URL}/attachment/score`, {
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

  if (editingQuestion) {
    return (
      <div className="bg-white overflow-hidden" style={{ height: '100dvh' }}>
        <QuestionScreen
          question={{ ...editingQuestion, noAutoAdvance: true } as any}
          answer={editingAnswer}
          onAnswer={(ans) => {
            setEditingAnswer(ans);
            // Update parent state immediately on every answer change so the
            // debounce timer in saveAnswersToSupabase always has the latest value.
            onUpdateAnswer(editingQuestion.id, ans);
          }}
          onBack={() => {
            // Fire a direct backend write on Back, bypassing the 1500ms debounce.
            // Without this, tapping Back within 1500ms of answering cancels the
            // pending debounce timer and the answer is silently lost.
            if (editingAnswer !== undefined && editingAnswer !== null) {
              const token = localStorage.getItem('parallel_access_token');
              if (token) {
                const updatedAnswers = { ...answers, [editingQuestion.id]: editingAnswer };
                fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
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
          }}
          onContinue={handleContinueToNext}
          canGoBack={true}
          chapterTitle={`EDITING: ${editingQuestion.id}`}
          onSave={handleSaveAndExit}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 bg-white border-b border-gray-100 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-600 hover:text-black transition-colors p-2 -ml-2">
            <ChevronLeft size={18} />
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
            <div className="h-full bg-black rounded-full transition-all" style={{ width: `${completionPct}%` }} />
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
                    <div key={section.id} className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                        className="w-full px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${sectionComplete ? 'bg-black' : 'bg-gray-200'}`}>
                          {sectionComplete
                            ? <Check size={12} className="text-white" />
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
                                <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${answered ? 'bg-black' : 'bg-gray-300'}`} />
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
                            className="w-full px-4 py-3 text-center text-xs text-black font-medium hover:bg-gray-50 transition-colors border-t border-gray-100"
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