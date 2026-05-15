import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Check, GripVertical, Upload, Search } from 'lucide-react';
import { Question } from '../../data/parallelQuestionnaire_updated';
import { Slider } from '../ui/slider';
import { LocationPicker } from '../LocationPicker';

interface QuestionScreenProps {
  question: Question;
  answer: any;
  onAnswer: (answer: any) => void;
  onBack: () => void;
  onContinue: () => void;
  canGoBack: boolean;
  chapterTitle?: string;
  onSave?: () => void;
  lockedAge?: number | null;
  totalDealbreakers?: number;
  userGender?: string | null;
  answers?: Record<string, any>;
}

const HOBBY_CATEGORIES: { label: string; emoji: string; hobbies: string[] }[] = [
  {
    label: 'Sports & Entertainment', emoji: '🏟️',
    hobbies: ['Watching sports','Going to live sporting events','Football Sundays','March Madness & brackets','Fantasy football & fantasy leagues','Combat sports (UFC, boxing)','Golf watching','NASCAR & motorsports watching'],
  },
  {
    label: 'Active & Outdoors', emoji: '🏃',
    hobbies: ['Hiking & backpacking','Running & jogging','Walking & nature walks','Cycling','Swimming','Scuba diving & snorkeling','Rock climbing','Skiing & snowboarding','Surfing','Kayaking & paddleboarding','Camping','Yoga','Pilates','Going to the gym','Weightlifting','CrossFit','Martial arts','Golf','Tennis','Pickleball','Basketball','Soccer','Volleyball','Softball & baseball','Boating & sailing','Jet skiing','Fishing','Hunting','Skateboarding','Archery','Disc golf','Horseback riding','Birdwatching'],
  },
  {
    label: 'Social & Lifestyle', emoji: '🌍',
    hobbies: ['Traveling & exploring new places','Spending time with friends','Going out to bars & nightlife','Volunteering & community service','Spirituality & mindfulness','Meditation & breathwork','Self-care & wellness routines','Spa days & massages','Fashion & style','Shopping','Home improvement & DIY','Gardening & plants','Cars & motorsports','Motorcycle riding','Off-roading & overlanding','Thrifting & antiquing','Theme parks & experiences','Van life & road trips','Wine & whiskey collecting','Festival going','Political activism & advocacy','Napping & rest','Watching TV & movies'],
  },
  {
    label: 'Food & Drink', emoji: '🍳',
    hobbies: ['Cooking & grilling','Baking','Trying new restaurants','Wine tasting','Craft beer & home brewing','Cocktail making','Coffee culture','Farmers markets & local food','Meal prepping & nutrition'],
  },
  {
    label: 'Mind & Learning', emoji: '📚',
    hobbies: ['Reading','Podcasts','Philosophy & big ideas','History','Learning languages','Chess & strategy games','Puzzles & brain games','Investing & personal finance','Entrepreneurship & startups','True crime','Astronomy & stargazing','Psychology & self-development','Science & technology','Documentaries','Political science & current events'],
  },
  {
    label: 'Music & Performance', emoji: '🎵',
    hobbies: ['Playing an instrument','Singing & choir','DJing & music production','Going to concerts & live music','Dancing','Theater & improv','Karaoke','Attending musicals & opera'],
  },
  {
    label: 'Creative & Arts', emoji: '🎨',
    hobbies: ['Photography','Videography & filmmaking','Painting & drawing','Pottery & ceramics','Woodworking','Sewing & fashion design','Jewelry making','Graphic design','Writing & journaling','Knitting & crocheting','Sculpting','Interior design & decorating','Tattooing & body art','Comic book & illustration','Candle & soap making','Scrapbooking & memory keeping'],
  },
  {
    label: 'Digital & Gaming', emoji: '🎮',
    hobbies: ['Video gaming','Board games & tabletop RPGs','Trivia & game nights','Anime & manga','Dungeons & Dragons','Collecting (cards, figures, memorabilia)','Streaming & content creation','Fantasy sports','Sports betting & gambling','Casino nights & poker'],
  },
  {
    label: 'Animals & Nature', emoji: '🐾',
    hobbies: ['Dog ownership & training','Cat person','Wildlife & nature conservation','Beekeeping','Aquariums & fishkeeping','Fostering & animal rescue','Farm life & homesteading'],
  },
];

const NO_PREFERENCE_VALUES = new Set([
  'No preference','Open to all genders','Open to all backgrounds',
  'Open to all body types','Open to anywhere in the world',
  'I love pets — any pet is fine',
]);

// Questions that should never auto-advance regardless of type
const NO_AUTO_ADVANCE_IDS = new Set(['7.1']);

export function QuestionScreen({
  question,
  answer,
  onAnswer,
  onBack,
  onContinue,
  canGoBack,
  chapterTitle,
  onSave,
  lockedAge,
  totalDealbreakers = 0,
  userGender,
  answers,
}: QuestionScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inchesInputRef = useRef<HTMLInputElement>(null);

  const getDefaultHeight = () => {
    if (userGender === 'Woman' || userGender === 'Transgender woman') return { feet: 5, inches: 4, unit: 'imperial' as const };
    if (userGender === 'Man' || userGender === 'Transgender man') return { feet: 5, inches: 10, unit: 'imperial' as const };
    return { feet: 5, inches: 6, unit: 'imperial' as const };
  };

  const [localAnswer, setLocalAnswer] = useState<any>(() => {
    if (answer !== undefined && answer !== null) {
      if (typeof answer === 'object' && 'value' in answer) return answer.value;
      return answer;
    }
    return null;
  });

  const [isDealbreaker, setIsDealbreaker] = useState<boolean>(() => {
    if (answer && typeof answer === 'object' && 'isDealbreaker' in answer) return answer.isDealbreaker;
    return false;
  });

  const [heightUnit, setHeightUnit] = useState<'imperial' | 'cm'>('imperial');
  const [heightCmValue, setHeightCmValue] = useState<string>('');
  const [heightFtValue, setHeightFtValue] = useState<string>('');
  const [heightInValue, setHeightInValue] = useState<string>('');
  const [heightValid, setHeightValid] = useState<boolean>(false);

  const [textInputs, setTextInputs] = useState<string[]>(
    answer?.value || answer || Array(question.multipleFields || 1).fill('')
  );
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [showOrientationHelp, setShowOrientationHelp] = useState(false);
  const [hobbySearch, setHobbySearch] = useState('');
  // dealbreakerJustToggled still controls auto-advance suppression — visual banner removed
  const [dealbreakerJustToggled, setDealbreakerJustToggled] = useState(false);

  const noAutoAdvance = NO_AUTO_ADVANCE_IDS.has(question.id) || !!(question as any).noAutoAdvance;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [question.id]);

  useEffect(() => {
    if (answer !== undefined && answer !== null) {
      if (typeof answer === 'object' && 'value' in answer) {
        setLocalAnswer(answer.value);
        setIsDealbreaker(answer.isDealbreaker || false);
      } else {
        setLocalAnswer(answer);
        setIsDealbreaker(false);
      }
    } else {
      setLocalAnswer(null);
      setIsDealbreaker(false);
    }
    setHobbySearch('');
    setDealbreakerJustToggled(false);
  }, [question.id]);

  useEffect(() => {
    if (question.type === 'HEIGHT') {
      if (answer !== undefined && answer !== null) {
        const h = (typeof answer === 'object' && 'value' in answer) ? answer.value : answer;
        if (h?.feet !== undefined) {
          setHeightFtValue(String(h.feet));
          setHeightInValue(String(h.inches || 0));
          setHeightValid(h.feet >= 3 && h.feet <= 8);
        }
        if (h?.cm !== undefined) {
          setHeightCmValue(String(h.cm));
          setHeightUnit('cm');
          setHeightValid(h.cm >= 90 && h.cm <= 250);
        }
      } else {
        setHeightFtValue('');
        setHeightInValue('');
        setHeightCmValue('');
        setHeightValid(false);
      }
    }
  }, [question.id]);

  const saveAnswer = (value: any, dealbreaker: boolean) => {
    if (question.hasDealbreaker) {
      onAnswer({ value, isDealbreaker: dealbreaker });
    } else {
      onAnswer(value);
    }
  };

  const getHeightPreview = (): string | null => {
    if (question.type !== 'HEIGHT') return null;
    if (heightUnit === 'imperial') {
      const ft = parseInt(heightFtValue) || 0;
      const inch = parseInt(heightInValue) || 0;
      if (ft < 3 || ft > 8) return null;
      const totalIn = ft * 12 + inch;
      const cm = Math.round(totalIn * 2.54);
      return `That's ${ft}'${inch}" — ${cm} cm`;
    } else {
      const cm = parseInt(heightCmValue) || 0;
      if (cm < 90 || cm > 250) return null;
      const totalIn = Math.round(cm / 2.54);
      const ft = Math.floor(totalIn / 12);
      const inch = totalIn % 12;
      return `That's ${cm} cm — ${ft}'${inch}"`;
    }
  };

  const handleSelectOption = (option: string) => {
    if (question.type === 'MC') {
      setLocalAnswer(option);
      const isNoPreference = NO_PREFERENCE_VALUES.has(option);
      if (isDealbreaker && option !== localAnswer) {
        setIsDealbreaker(false);
        saveAnswer(option, false);
      } else {
        saveAnswer(option, isNoPreference ? false : isDealbreaker);
      }
      if (!dealbreakerJustToggled && !noAutoAdvance) {
        if (question.hasDealbreaker) {
          if (question.dealbreakerValues?.length && !question.dealbreakerValues.includes(option)) {
            setTimeout(() => { onContinue(); }, 180);
          }
        } else {
          setTimeout(() => { onContinue(); }, 180);
        }
      }
    } else if (question.type === 'MS' || question.type === 'MS_MAX') {
      const currentSelections = Array.isArray(localAnswer) ? localAnswer : [];
      let newSelections: string[];
      if (currentSelections.includes(option)) {
        newSelections = currentSelections.filter(item => item !== option);
      } else {
        if (question.maxSelections && currentSelections.length >= question.maxSelections) return;
        newSelections = [...currentSelections, option];
      }
      const hasNoPreference = newSelections.some(v => NO_PREFERENCE_VALUES.has(v));
      if (hasNoPreference) setIsDealbreaker(false);
      setLocalAnswer(newSelections);
      saveAnswer(newSelections, hasNoPreference ? false : isDealbreaker);
      // Auto-scroll footer into view when max selections reached
      if (question.maxSelections && newSelections.length >= question.maxSelections) {
        setTimeout(() => {
          document.querySelector('[data-continue-btn]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }
  };

  const handleHeightImperialChange = (ft: string, inch: string) => {
    setHeightFtValue(ft);
    setHeightInValue(inch);
    const parsedFt = parseInt(ft) || 0;
    const parsedIn = parseInt(inch) || 0;
    const valid = parsedFt >= 3 && parsedFt <= 8;
    setHeightValid(valid);
    if (valid) {
      const val = { feet: parsedFt, inches: parsedIn, unit: 'imperial' as const };
      setLocalAnswer(val);
      saveAnswer(val, isDealbreaker);
    }
  };

  const handleHeightCmChange = (cm: string) => {
    setHeightCmValue(cm);
    const parsedCm = parseInt(cm) || 0;
    const valid = parsedCm >= 90 && parsedCm <= 250;
    setHeightValid(valid);
    if (valid) {
      const totalInches = Math.round(parsedCm / 2.54);
      const feet = Math.floor(totalInches / 12);
      const inches = totalInches % 12;
      const val = { feet, inches, cm: parsedCm, unit: 'cm' as const };
      setLocalAnswer(val);
      saveAnswer(val, isDealbreaker);
    }
  };

  const switchHeightUnit = (unit: 'imperial' | 'cm') => {
    setHeightUnit(unit);
    if (unit === 'cm' && localAnswer?.feet) {
      const totalInches = (localAnswer.feet * 12) + (localAnswer.inches || 0);
      const cm = Math.round(totalInches * 2.54);
      setHeightCmValue(String(cm));
    } else if (unit === 'imperial' && localAnswer?.cm) {
      const totalInches = Math.round(localAnswer.cm / 2.54);
      const ft = Math.floor(totalInches / 12);
      const inch = totalInches % 12;
      setHeightFtValue(String(ft));
      setHeightInValue(String(inch));
    }
  };

  const handleTextChange = (index: number, value: string) => {
    const newInputs = [...textInputs];
    newInputs[index] = value;
    setTextInputs(newInputs);
    saveAnswer(newInputs, isDealbreaker);
  };

  const handleParaChange = (value: string) => {
    const trimmed = value.slice(0, question.maxCharacters || 1000);
    setTextInputs([trimmed]);
    saveAnswer([trimmed], isDealbreaker);
  };

  const handleDragStart = (item: string) => setDraggedItem(item);
  const handleDragEnd = () => setDraggedItem(null);
  const handleDragOver = (e: React.DragEvent, targetItem: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetItem) return;
    const currentOrder = Array.isArray(localAnswer) ? [...localAnswer] : [...(question.options || [])];
    const draggedIdx = currentOrder.indexOf(draggedItem);
    const targetIdx = currentOrder.indexOf(targetItem);
    if (draggedIdx !== -1 && targetIdx !== -1) {
      currentOrder.splice(draggedIdx, 1);
      currentOrder.splice(targetIdx, 0, draggedItem);
      setLocalAnswer(currentOrder);
      saveAnswer(currentOrder, isDealbreaker);
    }
  };

  const isAnswered = () => {
    if (question.type === 'MC') return localAnswer !== null && localAnswer !== '';
    if (question.type === 'MS' || question.type === 'MS_MAX') {
      const s = Array.isArray(localAnswer) ? localAnswer : [];
      return question.minSelections ? s.length >= question.minSelections : s.length > 0;
    }
    if (question.type === 'HEIGHT') return heightValid;
    if (question.type === 'AGE_RANGE' || question.type === 'HEIGHT_RANGE') return true;
    if (question.type === 'NUM') return localAnswer !== null && localAnswer !== undefined && localAnswer !== '';
    if (question.type === 'TXT' || question.type === 'DATE') return textInputs.some(i => i.trim() !== '');
    if (question.type === 'PARA' || question.type === 'LT') return (textInputs[0]?.trim() || '') !== '';
    if (question.type === 'RANK') return Array.isArray(localAnswer) && localAnswer.length > 0;
    if (question.type === 'LOCATION') return localAnswer && localAnswer.latitude != null;
    return false;
  };

  const hasAnswer = isAnswered();
  const heightPreview = getHeightPreview();

  const isOpenAnswer = (() => {
    if (!localAnswer) return false;
    if (typeof localAnswer === 'string') return NO_PREFERENCE_VALUES.has(localAnswer);
    if (Array.isArray(localAnswer)) return localAnswer.some(v => NO_PREFERENCE_VALUES.has(v));
    return false;
  })();

  const isDealbreakerEligibleAnswer = (() => {
    if (!hasAnswer || isOpenAnswer) return false;
    if (question.dealbreakerValues && question.dealbreakerValues.length > 0) {
      if (typeof localAnswer === 'string') return question.dealbreakerValues.includes(localAnswer);
      if (Array.isArray(localAnswer)) return localAnswer.some(v => question.dealbreakerValues!.includes(v));
      return false;
    }
    return true;
  })();

  const showDealbreakerToggle =
    question.hasDealbreaker &&
    question.type !== 'AGE_RANGE' &&
    question.type !== 'HEIGHT_RANGE' &&
    isDealbreakerEligibleAnswer;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-parallel-cream">

      {/* Question number row */}
      {chapterTitle && (
        <div className="px-6 pt-1 pb-0 flex-shrink-0">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{chapterTitle}</p>
        </div>
      )}

      {/* Scrollable content area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-6 pb-4"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <motion.div
          className="max-w-md mx-auto w-full"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Question title */}
          <div className="mb-5 pt-3">
            <h2 className="text-2xl font-medium leading-snug">{question.text}</h2>
            {question.subtitle && (
              <p className="text-base text-gray-600 mt-2">{question.subtitle}</p>
            )}
            {question.privacyNote && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-xs">🔒</span>
                <span className="text-xs text-gray-500">{question.privacyNote}</span>
              </div>
            )}
            {/* helperText shown only when it adds genuine context beyond privacyNote */}
            {question.helperText && (
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">{question.helperText}</p>
            )}
          </div>

          {/* Dealbreaker toggle */}
          {showDealbreakerToggle && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 mb-4"
            >
              <div className="flex-1 pr-3">
                <p className="text-sm font-semibold text-parallel-void">Make this a dealbreaker</p>
                <p className="text-xs text-gray-500 mt-0.5">We'll only match you with people whose answer aligns with yours</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newVal = !isDealbreaker;
                  setIsDealbreaker(newVal);
                  setDealbreakerJustToggled(newVal);
                  saveAnswer(localAnswer, newVal);
                }}
                className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${isDealbreaker ? 'bg-parallel-void' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-parallel-cream rounded-full shadow transition-transform ${isDealbreaker ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </motion.div>
          )}

          {/* Dealbreaker count warning */}
          {showDealbreakerToggle && isDealbreaker && totalDealbreakers >= 3 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-4 p-4 rounded-xl border-2 border-parallel-void bg-parallel-cream"
            >
              <p className="text-sm text-gray-700 leading-relaxed">
                You have <span className="font-semibold">{totalDealbreakers} dealbreakers</span> set. More dealbreakers means a smaller — but more aligned — match pool.
              </p>
            </motion.div>
          )}

          {/* Question content */}
          <div>

            {/* LOCATION */}
            {question.type === 'LOCATION' && (
              <LocationPicker
                value={localAnswer}
                onChange={(loc) => { setLocalAnswer(loc); saveAnswer(loc, isDealbreaker); }}
              />
            )}

            {/* MC */}
            {question.type === 'MC' && question.options && (() => {
              const visibleOptions = (() => {
                if (!question.filterOptionsIf || !answers) return question.options!;
                const { questionId, ifValues, hideOptions } = question.filterOptionsIf;
                const refAnswer = answers[questionId];
                const refValue = refAnswer && typeof refAnswer === 'object' && 'value' in refAnswer
                  ? refAnswer.value : refAnswer;
                if (ifValues.includes(String(refValue ?? ''))) {
                  return question.options!.filter(opt => !hideOptions.includes(opt));
                }
                return question.options!;
              })();
              return (
                <div className="space-y-2.5">
                  {visibleOptions.map((option) => (
                    <motion.button
                      key={option}
                      onClick={() => handleSelectOption(option)}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full rounded-xl border-2 text-left transition-all px-5 py-3 ${
                        localAnswer === option ? 'border-parallel-void bg-parallel-void/5' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base">{option}</span>
                        {localAnswer === option && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="w-6 h-6 rounded-full bg-parallel-void flex items-center justify-center flex-shrink-0"
                          >
                            <Check size={14} className="text-parallel-cream" />
                          </motion.div>
                        )}
                      </div>
                    </motion.button>
                  ))}
                  {question.id === '1.3' && (
                    <div className="mt-4">
                      <button type="button" onClick={() => setShowOrientationHelp(!showOrientationHelp)}
                        className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {showOrientationHelp ? '▼' : '▶'} What do these terms mean?
                      </button>
                      {showOrientationHelp && (
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                          Demisexual means attraction only after an emotional bond forms. Asexual means little or no sexual attraction. Pansexual means attraction regardless of gender.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* MS / MS_MAX */}
            {(question.type === 'MS' || question.type === 'MS_MAX') && (question.options || question.id === '3.9') && (() => {
              if (question.id === '3.9') {
                const selected = Array.isArray(localAnswer) ? localAnswer : [];
                const remaining = question.maxSelections ? question.maxSelections - selected.length : null;
                const searchLower = hobbySearch.toLowerCase().trim();
                const filteredCategories = searchLower
                  ? HOBBY_CATEGORIES.map(cat => ({ ...cat, hobbies: cat.hobbies.filter(h => h.toLowerCase().includes(searchLower)) })).filter(cat => cat.hobbies.length > 0)
                  : HOBBY_CATEGORIES;

                return (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">{selected.length === 0 ? 'None selected yet' : `${selected.length} selected`}</p>
                      {remaining !== null && selected.length > 0 && (
                        <p className="text-sm text-gray-500">{remaining > 0 ? `${remaining} more` : 'Maximum reached'}</p>
                      )}
                    </div>
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={hobbySearch}
                        onChange={e => setHobbySearch(e.target.value)}
                        placeholder="Search or browse by category ↓"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors text-sm"
                      />
                      {hobbySearch && (
                        <button onClick={() => setHobbySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600">×</button>
                      )}
                    </div>
                    {selected.length > 0 && !hobbySearch && (
                      <div className="flex flex-wrap gap-2 p-3 bg-parallel-void/5 rounded-2xl border border-parallel-void/10">
                        {selected.map(hobby => (
                          <button key={hobby}
                            onClick={() => { const n = selected.filter(h => h !== hobby); setLocalAnswer(n); saveAnswer(n, isDealbreaker); }}
                            className="flex items-center gap-1 bg-parallel-purple text-parallel-cream text-xs font-medium px-3 py-1.5 rounded-full"
                          >
                            {hobby}<span className="ml-1 opacity-60">×</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {filteredCategories.map(cat => (
                      <div key={cat.label}>
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">{cat.emoji} {cat.label}</p>
                        <div className="flex flex-wrap gap-2">
                          {cat.hobbies.map(hobby => {
                            const isSelected = selected.includes(hobby);
                            const isDisabled = !isSelected && remaining !== null && remaining <= 0;
                            return (
                              <button key={hobby}
                                onClick={() => {
                                  if (isDisabled) return;
                                  const n = isSelected ? selected.filter(h => h !== hobby) : [...selected, hobby];
                                  setLocalAnswer(n); saveAnswer(n, isDealbreaker);
                                }}
                                className={`text-sm px-3 py-2 rounded-full border-2 transition-all font-medium ${isSelected ? 'border-parallel-purple bg-parallel-purple text-parallel-cream' : isDisabled ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-gray-200 hover:border-gray-400 text-parallel-void'}`}
                              >
                                {hobby}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {filteredCategories.length === 0 && (
                      <p className="text-center text-gray-500 text-sm py-8">No hobbies match "{hobbySearch}"</p>
                    )}
                  </div>
                );
              }

              // Standard pill grid
              return (
                <div>
                  {question.type === 'MS_MAX' && question.maxSelections && !question.subtitle && (
                    <p className="text-sm text-gray-500 mb-4">
                      Select up to {question.maxSelections}
                    </p>
                  )}
                  {question.type === 'MS_MAX' && question.maxSelections && (() => {
                    const sel = Array.isArray(localAnswer) ? localAnswer : [];
                    const atMax = sel.length >= question.maxSelections;
                    if (sel.length === 0) return null;
                    return (
                      <div className="flex items-center justify-between mb-3 py-1">
                        <span className="text-sm text-gray-500">
                          {atMax ? 'Maximum selected — tap Continue below' : `${question.maxSelections - sel.length} more to go`}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-2.5" style={{ touchAction: 'pan-y' }}>
                    {question.options!.map(option => {
                      const isSelected = Array.isArray(localAnswer) && localAnswer.includes(option);
                      return (
                        <motion.button key={option}
                          onClick={() => handleSelectOption(option)}
                          whileTap={{ scale: 0.95 }}
                          className={`rounded-full border-2 transition-all font-medium text-sm px-4 py-2 ${isSelected ? 'border-parallel-purple bg-parallel-purple text-parallel-cream' : 'border-gray-200 hover:border-gray-300 text-parallel-void'}`}
                        >
                          {option}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* HEIGHT */}
            {question.type === 'HEIGHT' && (
              <div className="space-y-4">
                <div className="flex bg-gray-100 rounded-full p-1 w-fit">
                  <button
                    onClick={() => switchHeightUnit('imperial')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${heightUnit === 'imperial' ? 'bg-parallel-cream text-parallel-void shadow-sm' : 'text-gray-500'}`}
                  >
                    ft / in
                  </button>
                  <button
                    onClick={() => switchHeightUnit('cm')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${heightUnit === 'cm' ? 'bg-parallel-cream text-parallel-void shadow-sm' : 'text-gray-500'}`}
                  >
                    cm
                  </button>
                </div>
                {heightUnit === 'imperial' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Feet</label>
                      <input
                        type="number"
                        value={heightFtValue}
                        onChange={e => {
                          handleHeightImperialChange(e.target.value, heightInValue);
                          // Auto-focus inches after a single digit is typed
                          if (e.target.value.length === 1) {
                            inchesInputRef.current?.focus();
                          }
                        }}
                        placeholder="5"
                        min={3} max={8}
                        className={`w-full p-4 rounded-2xl border-2 focus:outline-none transition-colors text-lg font-medium ${
                          heightFtValue && heightValid ? 'border-green-400 focus:border-green-500' :
                          heightFtValue && !heightValid ? 'border-red-300 focus:border-red-400' :
                          'border-gray-200 focus:border-parallel-purple'
                        }`}
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Inches</label>
                      <input
                        ref={inchesInputRef}
                        type="number"
                        value={heightInValue}
                        onChange={e => handleHeightImperialChange(heightFtValue, e.target.value)}
                        placeholder="4"
                        min={0} max={11}
                        className={`w-full p-4 rounded-2xl border-2 focus:outline-none transition-colors text-lg font-medium ${
                          heightFtValue && heightValid ? 'border-green-400 focus:border-green-500' :
                          'border-gray-200 focus:border-parallel-purple'
                        }`}
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">Height in centimeters</label>
                    <input
                      type="number"
                      value={heightCmValue}
                      onChange={e => handleHeightCmChange(e.target.value)}
                      placeholder="165"
                      min={90} max={250}
                      className={`w-full p-4 rounded-2xl border-2 focus:outline-none transition-colors text-lg font-medium ${
                        heightCmValue && heightValid ? 'border-green-400 focus:border-green-500' :
                        heightCmValue && !heightValid ? 'border-red-300 focus:border-red-400' :
                        'border-gray-200 focus:border-parallel-purple'
                      }`}
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                )}
                {heightPreview && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-green-600 font-medium">
                    ✓ {heightPreview}
                  </motion.p>
                )}
                {!heightValid && (heightFtValue || heightCmValue) && (
                  <p className="text-sm text-red-500">Please enter a valid height</p>
                )}
              </div>
            )}

            {/* AGE RANGE */}
            {question.type === 'AGE_RANGE' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Minimum Age</label>
                  <select
                    value={localAnswer?.min || 18}
                    onChange={e => { const n = { ...localAnswer, min: parseInt(e.target.value) }; setLocalAnswer(n); saveAnswer(n, isDealbreaker); }}
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none bg-parallel-cream"
                  >
                    {Array.from({ length: 63 }, (_, i) => i + 18).map(age => (
                      <option key={age} value={age}>{age}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Maximum Age</label>
                  <select
                    value={localAnswer?.max || 80}
                    onChange={e => { const n = { ...localAnswer, max: parseInt(e.target.value) }; setLocalAnswer(n); saveAnswer(n, isDealbreaker); }}
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none bg-parallel-cream"
                  >
                    {Array.from({ length: 63 }, (_, i) => i + 18).map(age => (
                      <option key={age} value={age}>{age}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* HEIGHT RANGE */}
            {question.type === 'HEIGHT_RANGE' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Min — Feet</label>
                  <select value={localAnswer?.minFeet || 3}
                    onChange={e => { const n = { minFeet: parseInt(e.target.value), minInches: localAnswer?.minInches || 0, maxFeet: localAnswer?.maxFeet || 8, maxInches: localAnswer?.maxInches || 0 }; setLocalAnswer(n); saveAnswer(n, isDealbreaker); }}
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none bg-parallel-cream"
                  >
                    {Array.from({ length: 6 }, (_, i) => i + 3).map(ft => <option key={ft} value={ft}>{ft}'</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Min — Inches</label>
                  <select value={localAnswer?.minInches || 0}
                    onChange={e => { const n = { ...localAnswer, minInches: parseInt(e.target.value) }; setLocalAnswer(n); saveAnswer(n, isDealbreaker); }}
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none bg-parallel-cream"
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map(inch => <option key={inch} value={inch}>{inch}"</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Max — Feet</label>
                  <select value={localAnswer?.maxFeet || 8}
                    onChange={e => { const n = { ...localAnswer, maxFeet: parseInt(e.target.value) }; setLocalAnswer(n); saveAnswer(n, isDealbreaker); }}
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none bg-parallel-cream"
                  >
                    {Array.from({ length: 6 }, (_, i) => i + 3).map(ft => <option key={ft} value={ft}>{ft}'</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Max — Inches</label>
                  <select value={localAnswer?.maxInches || 0}
                    onChange={e => { const n = { ...localAnswer, maxInches: parseInt(e.target.value) }; setLocalAnswer(n); saveAnswer(n, isDealbreaker); }}
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none bg-parallel-cream"
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map(inch => <option key={inch} value={inch}>{inch}"</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* RANK */}
            {question.type === 'RANK' && question.options && (
              <div className="space-y-2">
                {(Array.isArray(localAnswer) ? localAnswer : question.options).map((option, index) => (
                  <motion.div key={option} draggable
                    onDragStart={() => handleDragStart(option)}
                    onDragOver={e => handleDragOver(e, option)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-move ${draggedItem === option ? 'border-parallel-void opacity-50' : 'border-gray-200'}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-parallel-purple text-parallel-cream text-sm flex items-center justify-center flex-shrink-0">{index + 1}</div>
                    <GripVertical className="w-4 h-4 text-gray-500" />
                    <span className="flex-1 text-sm">{option}</span>
                  </motion.div>
                ))}
              </div>
            )}

            {/* TXT */}
            {question.type === 'TXT' && (
              <div className="space-y-4">
                {Array.from({ length: question.multipleFields || 1 }).map((_, i) => (
                  <input key={i} type="text" value={textInputs[i] || ''}
                    onChange={e => handleTextChange(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && isAnswered()) { e.preventDefault(); onContinue(); } }}
                    placeholder="Type here..."
                    className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                    style={{ fontSize: '16px' }}
                  />
                ))}
              </div>
            )}

            {/* NUM */}
            {question.type === 'NUM' && (
              <input type="number" value={localAnswer || ''}
                onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null; setLocalAnswer(v); saveAnswer(v, isDealbreaker); }}
                onKeyDown={e => { if (e.key === 'Enter' && isAnswered()) { e.preventDefault(); onContinue(); } }}
                placeholder="Enter a number" min={18} max={100}
                className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                style={{ fontSize: '16px' }}
              />
            )}

            {/* DATE */}
            {question.type === 'DATE' && (
              <input type="date" value={textInputs[0] || ''}
                onChange={e => handleTextChange(0, e.target.value)}
                max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                style={{ fontSize: '16px' }}
              />
            )}

            {/* PARA / LT */}
            {(question.type === 'PARA' || question.type === 'LT') && (
              <div>
                <textarea value={textInputs[0] || ''}
                  onChange={e => handleParaChange(e.target.value)}
                  placeholder="Type your answer here..."
                  rows={5}
                  maxLength={question.maxCharacters || 300}
                  className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors resize-none"
                  style={{ fontSize: '16px' }}
                />
                {question.maxCharacters && (
                  <div className="text-right text-xs text-gray-500 mt-1">{textInputs[0]?.length || 0}/{question.maxCharacters}</div>
                )}
              </div>
            )}

            {/* UPLOAD */}
            {question.type === 'UPLOAD' && (
              <label className="w-full cursor-pointer">
                <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-parallel-void transition-colors">
                  <Upload size={32} className="mx-auto mb-3 text-gray-500" />
                  <p className="font-medium">{localAnswer ? 'File uploaded ✓' : 'Click to upload'}</p>
                </div>
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) { const fn = e.target.files[0].name; setLocalAnswer(fn); saveAnswer(fn, isDealbreaker); } }}
                />
              </label>
            )}

          </div>
        </motion.div>
      </div>

      {/* Bottom CTA — sticky footer, never fixed */}
      <div
        className="flex-shrink-0 bg-parallel-cream border-t border-gray-100 py-3 px-4"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            disabled={!canGoBack}
            aria-label="Previous question"
            className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full border-2 border-gray-200 hover:border-parallel-void transition-colors disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <div className="flex-1">
            {onSave ? (
              <div className="flex gap-2">
                <button onClick={onSave} disabled={!isAnswered()}
                  className="flex-1 py-2.5 px-3 rounded-full text-parallel-cream transition-all disabled:opacity-40 bg-parallel-void text-sm font-medium"
                >Save & Exit</button>
                <button onClick={onContinue}
                  className="flex-1 py-2.5 px-3 text-parallel-void border-2 border-parallel-void rounded-full text-sm font-medium hover:bg-gray-50"
                >Save & Continue</button>
              </div>
            ) : (
              (question.type !== 'MC' || dealbreakerJustToggled || noAutoAdvance || question.hasDealbreaker) && (
                <div className="space-y-2">
                  <motion.button
                    data-continue-btn
                    onClick={() => { setDealbreakerJustToggled(false); onContinue(); }}
                    disabled={!isAnswered()}
                    whileTap={isAnswered() ? { scale: 0.98 } : {}}
                    className="w-full py-4 px-6 rounded-full text-parallel-cream transition-all disabled:opacity-40 bg-parallel-void text-lg font-medium"
                  >
                    Continue
                  </motion.button>
                  {!question.hasDealbreaker && (
                    <button onClick={onContinue}
                      className="w-full py-3 px-6 text-gray-600 hover:text-parallel-void transition-colors text-sm font-medium border-2 border-gray-300 rounded-full hover:border-gray-400"
                    >
                      Skip for now
                    </button>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}