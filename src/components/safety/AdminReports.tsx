import { useCallback, useEffect, useState } from 'react';
import {
  FileText, RefreshCw, AlertCircle, Heart,
  ChevronDown, ChevronUp, CheckCircle, Clock,
  Lightbulb, MessageSquare, Layers,
} from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyReport {
  id: string;
  report_text: string;
  summary_json: Record<string, any>;
  feedback_count: number;
  new_feedback_count: number;
  story_count: number;
  new_story_count: number;
  generated_at: string;
}

interface SuccessStory {
  id: string;
  story_text: string;
  how_long_together: string | null;
  approved: boolean;
  show_on_landing: boolean;
  marketing_quote: string | null;
  marketing_instagram: string | null;
  marketing_tweet: string | null;
  created_at: string;
  name: string | null;
  city: string | null;
}

interface FeedbackItem {
  id: string;
  feedback_type: string;
  rating: number | null;
  message: string;
  tags: string[] | null;
  status: string;
  ai_theme: string | null;
  ai_sentiment: string | null;
  created_at: string;
  name: string | null;
  city: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function groupByTheme(items: FeedbackItem[]): Record<string, FeedbackItem[]> {
  const groups: Record<string, FeedbackItem[]> = {};
  for (const item of items) {
    const key = item.ai_theme ?? deriveTheme(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function deriveTheme(item: FeedbackItem): string {
  const msg = item.message.toLowerCase();
  if (item.feedback_type === 'feature_request') {
    if (msg.includes('match') || msg.includes('algorithm')) return 'Matching';
    if (msg.includes('photo') || msg.includes('profile')) return 'Profiles';
    if (msg.includes('message') || msg.includes('chat')) return 'Messaging';
    if (msg.includes('notif')) return 'Notifications';
    return 'General Request';
  }
  if (item.feedback_type === 'bug_report') return 'Bug Report';
  if (item.rating && item.rating >= 4) return 'Positive';
  return 'General';
}

function sentimentColor(sentiment: string | null, rating: number | null): string {
  if (sentiment === 'positive' || (rating && rating >= 4)) return 'text-[#7B5EA7]';
  if (sentiment === 'negative' || (rating && rating <= 2)) return 'text-gray-400';
  return 'text-gray-400';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ThemeGroup({ theme, items }: { theme: string; items: FeedbackItem[] }) {
  const [open, setOpen] = useState(false);
  const positiveCount = items.filter(i =>
    i.ai_sentiment === 'positive' || (i.rating && i.rating >= 4)
  ).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Layers size={13} className="text-[#7B5EA7] flex-shrink-0" />
          <span className="text-sm font-medium text-gray-900">{theme}</span>
          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 tabular-nums">
            {items.length}
          </span>
          {positiveCount > 0 && (
            <span className="text-[10px] text-[#7B5EA7]/80">{positiveCount} positive</span>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {items.map(item => (
            <div key={item.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-gray-700 leading-relaxed flex-1">{item.message}</p>
                <div className="flex-shrink-0 text-right">
                  {item.rating && (
                    <p className={`text-xs font-semibold tabular-nums ${sentimentColor(item.ai_sentiment, item.rating)}`}>
                      {item.rating}/5
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400">{timeAgo(item.created_at)}</p>
                </div>
              </div>
              {(item.name || item.city) && (
                <p className="text-[10px] text-gray-400 mt-1">
                  {[item.name, item.city].filter(Boolean).join(' · ')}
                </p>
              )}
              {item.tags && item.tags.length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {item.tags.map(t => (
                    <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackDigest({ items, emptyLabel }: { items: FeedbackItem[]; emptyLabel: string }) {
  const groups = groupByTheme(items);
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  const total = items.length;
  const newCount = items.filter(i => i.status === 'new').length;

  if (items.length === 0) {
    return (
      <div className="border border-gray-200 rounded-xl p-10 text-center">
        <MessageSquare size={24} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 px-1">
        <p className="text-xs text-gray-500">
          <span className="text-gray-900 font-semibold">{total}</span> total
        </p>
        {newCount > 0 && (
          <p className="text-xs text-[#7B5EA7]">
            <span className="font-semibold">{newCount}</span> new
          </p>
        )}
        <p className="text-xs text-gray-400">
          {sorted.length} theme{sorted.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="space-y-2">
        {sorted.map(([theme, groupItems]) => (
          <ThemeGroup key={theme} theme={theme} items={groupItems} />
        ))}
      </div>
    </div>
  );
}

function StoryCard({ story }: { story: SuccessStory }) {
  const [expanded, setExpanded] = useState(false);
  const hasMarketing = story.marketing_quote || story.marketing_instagram || story.marketing_tweet;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Heart size={14} className="text-[#A98FD0] flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-900 truncate block">
              {story.name ?? 'Anonymous'}{story.city ? ` · ${story.city}` : ''}
            </span>
            <span className="text-[11px] text-gray-400">
              {timeAgo(story.created_at)}
              {story.how_long_together ? ` · together ${story.how_long_together}` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {story.approved
            ? <span className="flex items-center gap-1 text-[10px] text-[#7B5EA7] font-medium"><CheckCircle size={11} /> Approved</span>
            : <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium"><Clock size={11} /> Pending</span>
          }
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed">{story.story_text}</p>
          {hasMarketing ? (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Marketing copy</p>
              {story.marketing_quote && (
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">Quote</p>
                  <p className="text-xs text-gray-900 italic">"{story.marketing_quote}"</p>
                </div>
              )}
              {story.marketing_instagram && (
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">Instagram</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{story.marketing_instagram}</p>
                </div>
              )}
              {story.marketing_tweet && (
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">Tweet</p>
                  <p className="text-xs text-gray-700">{story.marketing_tweet}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic">Marketing copy not yet generated.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: DailyReport }) {
  const [expanded, setExpanded] = useState(false);
  const s = report.summary_json ?? {};
  const pulse = s.pulse ?? null;
  const aiUnavailable = s.aiUnavailable === true;

  const statPills = [
    { label: 'Feedback', value: report.feedback_count },
    { label: 'New (24h)', value: report.new_feedback_count },
    { label: 'Stories', value: report.new_story_count },
    s.npsScore != null ? { label: 'NPS', value: s.npsScore } : null,
  ].filter(Boolean) as { label: string; value: number }[];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <FileText size={14} className="text-[#7B5EA7] flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-gray-900 block">
              Daily Report{aiUnavailable ? <span className="ml-2 text-[10px] text-yellow-600 font-normal">[AI unavailable]</span> : ''}
            </span>
            <span className="text-[11px] text-gray-400">
              {formatDate(report.generated_at)} · {timeAgo(report.generated_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            {statPills.map(p => (
              <span key={p.label} className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 tabular-nums">
                {p.value} {p.label}
              </span>
            ))}
          </div>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {pulse && (
            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">System Health</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                {[
                  { label: 'Signups (24h)',         value: pulse.signups_24h },
                  { label: 'Active subscriptions',  value: pulse.active_subscriptions },
                  { label: 'Matches (24h)',          value: pulse.matches_24h },
                  { label: 'OTP failures',          value: pulse.otp_failures_24h,      warn: pulse.otp_failures_24h > 0 },
                  { label: 'PhotoDNA flags (7d)',    value: pulse.photodna_flags_7d,     warn: pulse.photodna_flags_7d > 0 },
                  { label: 'Underage reports (7d)', value: pulse.underage_reports_7d,   warn: pulse.underage_reports_7d > 0 },
                  { label: 'Persona failures (7d)', value: pulse.persona_failures_7d,   warn: pulse.persona_failures_7d > 0 },
                  { label: 'User reports (7d)',      value: pulse.user_reports_7d,       warn: pulse.user_reports_7d > 0 },
                  { label: 'Auto-suspends (7d)',     value: pulse.auto_suspends_7d,      warn: pulse.auto_suspends_7d > 0 },
                ].map(m => (
                  <div key={m.label} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-500">{m.label}</span>
                    <span className={`text-[11px] font-semibold tabular-nums ${m.warn ? 'text-red-500' : 'text-gray-900'}`}>
                      {m.value ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="px-5 pt-4 pb-5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">Product Analysis</p>
            {aiUnavailable ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                <p className="text-xs text-yellow-700">{report.report_text}</p>
              </div>
            ) : report.report_text ? (
              <div className="space-y-1">
                {report.report_text.split('\n').map((line, i) => {
                  if (/^#{1,2}\s/.test(line))
                    return <p key={i} className="text-xs font-semibold text-gray-900 mt-3 mb-1">{line.replace(/^#+\s*/, '')}</p>;
                  if (line.trim() === '') return <div key={i} className="h-1" />;
                  return <p key={i} className="text-xs text-gray-600 leading-relaxed">{line}</p>;
                })}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic">No report text available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = 'stories' | 'features' | 'feedback' | 'reports';

export function AdminReports() {
  const [reports, setReports]       = useState<DailyReport[]>([]);
  const [stories, setStories]       = useState<SuccessStory[]>([]);
  const [features, setFeatures]     = useState<FeedbackItem[]>([]);
  const [appFeedback, setAppFeedback] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<Tab>('reports');

  const fetchData = useCallback(async () => {
    const [
      { data: reportData,   error: reportErr },
      { data: storyData,    error: storyErr },
      { data: feedbackData, error: feedbackErr },
    ] = await Promise.all([
      supabase
        .from('feedback_reports')
        .select('id, report_text, summary_json, feedback_count, new_feedback_count, story_count, new_story_count, generated_at')
        .order('generated_at', { ascending: false })
        .limit(50),
      supabase
        .from('success_stories')
        .select('id, story_text, how_long_together, approved, show_on_landing, marketing_quote, marketing_instagram, marketing_tweet, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('app_feedback')
        .select('id, feedback_type, rating, message, tags, status, ai_theme, ai_sentiment, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (reportErr) setError(reportErr.message);
    else setReports((reportData as DailyReport[]) ?? []);

    if (!storyErr && storyData && storyData.length > 0) {
      const userIds = [...new Set(storyData.map((s: any) => s.user_id).filter(Boolean))];
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, city_normalized')
        .in('id', userIds);
      const profileMap = Object.fromEntries((profileData ?? []).map((p: any) => [p.id, p]));
      setStories(storyData.map((s: any) => ({
        ...s,
        name: profileMap[s.user_id]?.name ?? null,
        city: profileMap[s.user_id]?.city_normalized ?? null,
      })));
    } else {
      setStories([]);
    }

    if (!feedbackErr && feedbackData && feedbackData.length > 0) {
      const userIds = [...new Set(feedbackData.map((f: any) => f.user_id).filter(Boolean))];
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, city_normalized')
        .in('id', userIds);
      const profileMap = Object.fromEntries((profileData ?? []).map((p: any) => [p.id, p]));
      const enriched: FeedbackItem[] = feedbackData.map((f: any) => ({
        ...f,
        name: profileMap[f.user_id]?.name ?? null,
        city: profileMap[f.user_id]?.city_normalized ?? null,
      }));
      setFeatures(enriched.filter(f => f.feedback_type === 'feature_request'));
      setAppFeedback(enriched.filter(f => f.feedback_type !== 'feature_request'));
    } else {
      setFeatures([]);
      setAppFeedback([]);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const TABS: { id: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'reports',  label: 'Daily Reports',    icon: FileText,      count: reports.length },
    { id: 'features', label: 'Feature Requests', icon: Lightbulb,     count: features.length },
    { id: 'feedback', label: 'App Feedback',     icon: MessageSquare, count: appFeedback.length },
    { id: 'stories',  label: 'Success Stories',  icon: Heart,         count: stories.length },
  ];

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-[#7B5EA7]" />
          <h2 className="text-base font-semibold text-gray-900">Reports</h2>
        </div>
        <button
          onClick={() => { setIsRefreshing(true); fetchData(); }}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === t.id
                ? 'border-[#7B5EA7] text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <t.icon size={13} />
            {t.label}
            {t.count > 0 && (
              <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 tabular-nums">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'reports' && (
        reports.length === 0 ? (
          <div className="border border-gray-200 rounded-xl p-10 text-center">
            <FileText size={24} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No daily reports yet.</p>
            <p className="text-gray-400 text-xs mt-1">Reports are generated automatically each day at 9am.</p>
          </div>
        ) : (
          <div className="space-y-2">{reports.map(r => <ReportCard key={r.id} report={r} />)}</div>
        )
      )}

      {activeTab === 'features' && (
        <FeedbackDigest items={features} emptyLabel="No feature requests yet." />
      )}

      {activeTab === 'feedback' && (
        <FeedbackDigest items={appFeedback} emptyLabel="No app feedback yet." />
      )}

      {activeTab === 'stories' && (
        stories.length === 0 ? (
          <div className="border border-gray-200 rounded-xl p-10 text-center">
            <Heart size={24} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No success stories yet.</p>
          </div>
        ) : (
          <div className="space-y-2">{stories.map(s => <StoryCard key={s.id} story={s} />)}</div>
        )
      )}
    </div>
  );
}
