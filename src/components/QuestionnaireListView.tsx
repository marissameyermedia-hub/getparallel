import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Check, AlertCircle } from "lucide-react";
import { parallelQuestionnaire, Question } from "../data/parallelQuestionnaire_updated";
import { QuestionScreen } from "./onboarding/QuestionScreen";
import { EDGE_FUNCTION_URL } from "../utils/supabase/client";
import { publicAnonKey } from "../utils/supabase/info";

interface QuestionnaireListViewProps {
  answers: Record<string, any>;
  onUpdateAnswer: (questionId: string, answer: any) => void;
  onClose: () => void;
}

function getAnswerSummary(question: Question, answer: any): string {
  if (answer === null || answer === undefined) return "Not answered";
  const val = typeof answer === "object" && "value" in answer ? answer.value : answer;
  if (val === null || val === undefined) return "Not answered";
  switch (question.type) {
    case "MC":
    case "DROPDOWN":
      return typeof val === "string" ? val : "Not answered";
    case "MS":
    case "MS_MAX":
      if (Array.isArray(val)) {
        if (val.length === 0) return "Not answered";
        if (val.length <= 3) return val.join(", ");
        return `${val.slice(0, 2).join(", ")} +${val.length - 2} more`;
      }
      return "Not answered";
    case "HEIGHT":
      if (val?.feet !== undefined) {
        if (val.unit === "cm" && val.cm) return `${val.cm} cm (${val.feet}'${val.inches || 0}")`;
        return `${val.feet}'${val.inches || 0}"`;
      }
      return "Not answered";
    case "AGE_RANGE":
      if (val?.min !== undefined && val?.max !== undefined) return `${val.min}–${val.max} years`;
      return "Not answered";
    case "HEIGHT_RANGE":
      if (val?.minFeet !== undefined) {
        return `${val.minFeet}'${val.minInches || 0}" – ${val.maxFeet || 7}'${val.maxInches || 0}"`;
      }
      return "Not answered";
    case "TXT":
    case "DATE":
      if (Array.isArray(val)) return val.filter(Boolean).join(", ") || "Not answered";
      return String(val) || "Not answered";
    case "PARA":
    case "LT":
      const text = Array.isArray(val) ? val[0] : val;
      if (!text) return "Not answered";
      return text.length > 60 ? text.slice(0, 60) + "…" : text;
    case "LOCATION":
      return val?.locationDisplay || val?.city || "Location set";
    default:
      return "Answered";
  }
}

function isQuestionVisible(question: Question, answers: Record<string, any>): boolean {
  if (!question.showIf) return true;
  const { questionId, notValues, hasValue } = question.showIf as any;
  const refAnswer = answers[questionId];
  const refValue = refAnswer && typeof refAnswer === "object" && "value" in refAnswer ? refAnswer.value : refAnswer;
  if (hasValue) return refValue != null && refValue !== "";
  if (notValues) {
    if (refValue == null || refValue === "") return false;
    return !notValues.includes(String(refValue));
  }
  return true;
}

function isAnswered(question: Question, answer: any): boolean {
  if (answer === null || answer === undefined) return false;
  const val = typeof answer === "object" && "value" in answer ? answer.value : answer;
  if (val === null || val === undefined) return false;
  if (typeof val === "string" && val.trim() === "") return false;
  if (Array.isArray(val) && val.length === 0) return false;
  return true;
}

export function QuestionnaireListView({ answers, onUpdateAnswer, onClose }: QuestionnaireListViewProps) {
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingAnswer, setEditingAnswer] = useState<any>(null);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  // Build flat list of REQUIRED unanswered questions (non-optional, visible, not answered).
  // This drives the "X required questions left" banner and section-auto-expansion.
  const requiredUnanswered = parallelQuestionnaire.flatMap((s) =>
    s.questions
      .filter(
        (q) =>
          q.type !== "LOCATION" &&
          !(q as any).optional &&
          isQuestionVisible(q, answers) &&
          !isAnswered(q, answers[q.id]),
      )
      .map((q) => ({ question: q, sectionId: s.id })),
  );

  // Sections that have any unanswered REQUIRED question — these auto-expand on first render
  const sectionsWithRequiredUnanswered = new Set(requiredUnanswered.map((r) => r.sectionId));

  // Auto-expand the first section with required unanswered questions on mount
  useEffect(() => {
    if (expandedSection === null && requiredUnanswered.length > 0) {
      setExpandedSection(requiredUnanswered[0].sectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [editingQuestion]);

  // Total / answered counts now ONLY consider required, visible questions.
  // This matches the matches-unlock gate and means optional skipped Q's don't block 100%.
  const totalQuestions = parallelQuestionnaire.reduce(
    (acc, s) =>
      acc +
      s.questions.filter((q) => q.type !== "LOCATION" && !(q as any).optional && isQuestionVisible(q, answers)).length,
    0,
  );
  const answeredCount = parallelQuestionnaire.reduce((acc, s) => {
    return (
      acc +
      s.questions.filter(
        (q) =>
          q.type !== "LOCATION" &&
          !(q as any).optional &&
          isQuestionVisible(q, answers) &&
          isAnswered(q, answers[q.id]),
      ).length
    );
  }, 0);
  const completionPct = totalQuestions === 0 ? 100 : Math.min(100, Math.round((answeredCount / totalQuestions) * 100));

  // Jump straight to the first required-unanswered question
  const jumpToFirstUnanswered = () => {
    if (requiredUnanswered.length === 0) return;
    const first = requiredUnanswered[0];
    setExpandedSection(first.sectionId);
    setEditingQuestion(first.question);
    setEditingAnswer(answers[first.question.id]);
  };

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
      const token = localStorage.getItem("parallel_access_token");
      if (token) {
        fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: publicAnonKey,
          },
          body: JSON.stringify({ answers: updatedAnswers }),
        }).catch(() => {});
      }

      const attachmentIds = ["7.1a", "7.1b", "7.1c"];
      const allThreeAnswered = attachmentIds.every((id) => updatedAnswers[id]);
      if (attachmentIds.includes(editingQuestion.id) && allThreeAnswered) {
        const token = localStorage.getItem("parallel_access_token");
        if (token) {
          const toLetter = (qId: string): "A" | "B" | "C" | "D" => {
            const q = parallelQuestionnaire.flatMap((s) => s.questions).find((q) => q.id === qId);
            const ans = updatedAnswers[qId];
            const val = ans && typeof ans === "object" && "value" in ans ? ans.value : ans;
            const idx = q?.options?.indexOf(val) ?? -1;
            return (["A", "B", "C", "D"][idx] || "A") as "A" | "B" | "C" | "D";
          };
          fetch(`${EDGE_FUNCTION_URL}/attachment/score`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: publicAnonKey },
            body: JSON.stringify({ answerA: toLetter("7.1a"), answerB: toLetter("7.1b"), answerC: toLetter("7.1c") }),
          }).catch((err) => console.error("Failed to score attachment:", err));
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
      const token = localStorage.getItem("parallel_access_token");
      if (token) {
        fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: publicAnonKey,
          },
          body: JSON.stringify({ answers: updatedAnswers }),
        }).catch(() => {});
      }

      const attachmentIds = ["7.1a", "7.1b", "7.1c"];
      const allThreeAnswered = attachmentIds.every((id) => updatedAnswers[id]);
      if (attachmentIds.includes(editingQuestion.id) && allThreeAnswered) {
        const token = localStorage.getItem("parallel_access_token");
        if (token) {
          const toLetter = (qId: string): "A" | "B" | "C" | "D" => {
            const q = parallelQuestionnaire.flatMap((s) => s.questions).find((q) => q.id === qId);
            const ans = updatedAnswers[qId];
            const val = ans && typeof ans === "object" && "value" in ans ? ans.value : ans;
            const idx = q?.options?.indexOf(val) ?? -1;
            return (["A", "B", "C", "D"][idx] || "A") as "A" | "B" | "C" | "D";
          };
          fetch(`${EDGE_FUNCTION_URL}/attachment/score`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: publicAnonKey },
            body: JSON.stringify({ answerA: toLetter("7.1a"), answerB: toLetter("7.1b"), answerC: toLetter("7.1c") }),
          }).catch((err) => console.error("Failed to score attachment:", err));
        }
      }
    }
    const allQuestions = parallelQuestionnaire.flatMap((s) => s.questions).filter((q) => q.type !== "LOCATION");
    const idx = allQuestions.findIndex((q) => q.id === editingQuestion?.id);
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
      <div className="bg-white overflow-hidden" style={{ height: "100dvh" }}>
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
              const token = localStorage.getItem("parallel_access_token");
              if (token) {
                const updatedAnswers = { ...answers, [editingQuestion.id]: editingAnswer };
                fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    apikey: publicAnonKey,
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
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-black transition-colors p-2 -ml-2"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <h1 className="text-base font-semibold">My Questionnaire</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* Top banner: required unanswered count — only shows when there are required Qs left */}
        {requiredUnanswered.length > 0 && (
          <button
            onClick={jumpToFirstUnanswered}
            className="w-full mb-4 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl flex items-center gap-3 hover:bg-amber-100 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                You have {requiredUnanswered.length} unanswered question{requiredUnanswered.length === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Tap to jump to the next one. Matches unlock when all required questions are done.
              </p>
            </div>
            <ChevronRight size={18} className="text-amber-600 flex-shrink-0" />
          </button>
        )}

        <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              {answeredCount} of {totalQuestions} required questions answered
            </p>
            <span className="text-sm font-semibold">{completionPct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-black rounded-full transition-all" style={{ width: `${completionPct}%` }} />
          </div>
          {completionPct < 100 && (
            <p className="text-xs text-gray-400 mt-2">Optional questions help refine matches but aren't required.</p>
          )}
        </div>

        {[1, 2].map((part) => {
          const partSections = parallelQuestionnaire.filter((s) => s.part === part);
          return (
            <div key={part} className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 px-1">
                {part === 1 ? "Part 1 — About You" : "Part 2 — Your Preferences"}
              </p>
              <div className="space-y-2">
                {partSections.map((section) => {
                  const sectionQuestions = section.questions.filter(
                    (q) => q.type !== "LOCATION" && isQuestionVisible(q, answers),
                  );
                  const requiredQuestions = sectionQuestions.filter((q) => !(q as any).optional);
                  const requiredAnswered = requiredQuestions.filter((q) => isAnswered(q, answers[q.id])).length;
                  const requiredUnansweredInSection = requiredQuestions.length - requiredAnswered;
                  const sectionComplete = requiredAnswered === requiredQuestions.length && requiredQuestions.length > 0;
                  const isExpanded = expandedSection === section.id;
                  const hasRequiredUnanswered = sectionsWithRequiredUnanswered.has(section.id);

                  return (
                    <div
                      key={section.id}
                      className={`bg-white border-2 rounded-2xl overflow-hidden ${
                        hasRequiredUnanswered ? "border-amber-300" : "border-gray-200"
                      }`}
                    >
                      <button
                        onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                        className="w-full px-4 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                            sectionComplete ? "bg-black" : hasRequiredUnanswered ? "bg-amber-500" : "bg-gray-200"
                          }`}
                        >
                          {sectionComplete ? (
                            <Check size={12} className="text-white" />
                          ) : hasRequiredUnanswered ? (
                            <span className="text-xs font-semibold text-white">{requiredUnansweredInSection}</span>
                          ) : (
                            <span className="text-xs text-gray-500">{requiredAnswered}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{section.title}</p>
                          <p
                            className={`text-xs mt-0.5 ${
                              hasRequiredUnanswered ? "text-amber-700 font-medium" : "text-gray-400"
                            }`}
                          >
                            {sectionComplete
                              ? "All answered"
                              : hasRequiredUnanswered
                                ? `${requiredUnansweredInSection} unanswered`
                                : `${requiredAnswered} of ${requiredQuestions.length} answered`}
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                        />
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          {sectionQuestions.map((question, idx) => {
                            const answered = isAnswered(question, answers[question.id]);
                            const summary = getAnswerSummary(question, answers[question.id]);
                            const isLast = idx === sectionQuestions.length - 1;
                            const isOptional = !!(question as any).optional;
                            const isUnansweredRequired = !answered && !isOptional;
                            const isUnansweredOptional = !answered && isOptional;

                            return (
                              <button
                                key={question.id}
                                onClick={() => handleEditQuestion(question)}
                                className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors text-left ${!isLast ? "border-b border-gray-100" : ""} ${isUnansweredRequired ? "bg-amber-50/40" : ""}`}
                              >
                                <div
                                  className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                                    answered ? "bg-black" : isUnansweredRequired ? "bg-amber-500" : "bg-gray-300"
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start gap-2">
                                    <p className="text-sm text-gray-800 leading-snug flex-1">{question.text}</p>
                                    {isOptional && !answered && (
                                      <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium px-1.5 py-0.5 bg-gray-100 rounded flex-shrink-0">
                                        Optional
                                      </span>
                                    )}
                                  </div>
                                  <p
                                    className={`text-xs mt-0.5 truncate ${
                                      answered
                                        ? "text-gray-500"
                                        : isUnansweredRequired
                                          ? "text-amber-700 font-medium"
                                          : "text-gray-400 italic"
                                    }`}
                                  >
                                    {answered
                                      ? summary
                                      : isUnansweredOptional
                                        ? "Skipped — tap to answer"
                                        : "Not answered — tap to answer"}
                                  </p>
                                </div>
                                <ChevronRight size={14} className="text-gray-300 mt-1 flex-shrink-0" />
                              </button>
                            );
                          })}
                          <button
                            onClick={() => {
                              const firstUnanswered =
                                sectionQuestions.find((q) => !(q as any).optional && !isAnswered(q, answers[q.id])) ||
                                sectionQuestions.find((q) => !isAnswered(q, answers[q.id])) ||
                                sectionQuestions[0];
                              handleEditQuestion(firstUnanswered);
                            }}
                            className="w-full px-4 py-3 text-center text-xs text-black font-medium hover:bg-gray-50 transition-colors border-t border-gray-100"
                          >
                            {sectionComplete ? "Edit this section →" : "Continue this section →"}
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
