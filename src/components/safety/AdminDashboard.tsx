import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  ChevronRight,
  ArrowLeft,
  MapPin,
  Activity,
  Clock,
  FileText,
  DollarSign,
} from 'lucide-react';
import { AdminCaseDetail } from './AdminCaseDetail';
import { AdminCitiesOverview } from './AdminCitiesOverview';
import { AdminCityDetail } from './AdminCityDetail';
import { AdminReports } from './AdminReports';
import { AdminMatchQuality } from './AdminMatchQuality';
import { AdminReleases } from './AdminReleases';
import { AdminRevenue } from './AdminRevenue';
import { AdminPulsePanel } from './AdminPulsePanel';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const ADMIN_API_URL = `https://${projectId}.supabase.co/functions/v1/admin-api`;

interface AdminDashboardProps {
  onBack: () => void;
  accessToken: string | null;
}

export interface SafetyCase {
  id: string;
  caseNumber: string;
  status: 'open' | 'under-review' | 'resolved' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
  reporterId: string;
  reporterName: string;
  accusedId: string;
  accusedName: string;
  accusedPhoto: string;
  category: string;
  description: string;
  context: 'profile' | 'chat' | 'post-date';
  feelsUnsafe: boolean;
  screenshots: string[];
  suggestedTier: 1 | 2 | 3;
  trustScore: number;
  priorReports: number;
  createdAt: string;
  assignedTo?: string;
}

function apiCaseToSafetyCase(c: any): SafetyCase {
  return {
    id:            c.id,
    caseNumber:    c.case_number,
    status:        c.status,
    priority:      c.priority,
    reporterId:    c.reporter_id,
    reporterName:  c.reporter_name,
    accusedId:     c.accused_id,
    accusedName:   c.accused_name,
    accusedPhoto:  '',
    category:      c.category,
    description:   c.description,
    context:       c.context,
    feelsUnsafe:   c.feels_unsafe,
    screenshots:   c.screenshots ?? [],
    suggestedTier: c.suggested_tier,
    trustScore:    c.trust_score,
    priorReports:  c.prior_reports,
    createdAt:     c.created_at,
    assignedTo:    c.assigned_to ?? undefined,
  };
}

type Tab = 'cities' | 'reports' | 'match-quality' | 'releases' | 'revenue' | 'trust-safety';

export function AdminDashboard({ onBack, accessToken }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('cities');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [cases, setCases] = useState<SafetyCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<SafetyCase | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    setIsLoading(true);
    fetch(`${ADMIN_API_URL}/safety/cases`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': publicAnonKey,
      },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: any[]) => {
        setCases(data.map(apiCaseToSafetyCase));
        setLoadError(null);
      })
      .catch(err => {
        console.error('[AdminDashboard] failed to load cases:', err);
        setLoadError('Failed to load cases. Please try again.');
      })
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  const filteredCases = cases.filter(c => {
    const matchesStatus   = filterStatus   === 'all' || c.status   === filterStatus;
    const matchesPriority = filterPriority === 'all' || c.priority === filterPriority;
    const matchesSearch   = !searchQuery ||
      c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.accusedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.reporterName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const statusCounts = {
    all:            cases.length,
    open:           cases.filter(c => c.status === 'open').length,
    'under-review': cases.filter(c => c.status === 'under-review').length,
    escalated:      cases.filter(c => c.status === 'escalated').length,
    resolved:       cases.filter(c => c.status === 'resolved').length,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high':     return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':   return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':      return 'bg-gray-100 text-gray-800 border-gray-200';
      default:         return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':         return 'bg-blue-100 text-blue-800';
      case 'under-review': return 'bg-purple-100 text-purple-800';
      case 'escalated':    return 'bg-red-100 text-red-800';
      case 'resolved':     return 'bg-green-100 text-green-800';
      default:             return 'bg-gray-100 text-gray-800';
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const minutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (selectedCase) {
    return (
      <AdminCaseDetail
        case={selectedCase}
        onBack={() => setSelectedCase(null)}
        onUpdateCase={(updatedCase) => {
          setCases(cases.map(c => c.id === updatedCase.id ? updatedCase : c));
          setSelectedCase(null);
        }}
        accessToken={accessToken}
      />
    );
  }

  if (selectedCity) {
    return (
      <AdminCityDetail
        cityNormalized={selectedCity}
        onBack={() => setSelectedCity(null)}
        accessToken={accessToken}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-parallel-cream border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={onBack}
              aria-label="Go back"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Admin Panel</h1>
              <p className="text-sm text-gray-500">Internal dashboard</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {([
              { id: 'cities',        label: 'Cities',        Icon: MapPin },
              { id: 'reports',       label: 'Reports',       Icon: FileText },
              { id: 'match-quality', label: 'Match Quality', Icon: Activity },
              { id: 'releases',      label: 'Releases',      Icon: Clock },
              { id: 'revenue',       label: 'Revenue',       Icon: DollarSign },
              { id: 'trust-safety',  label: 'Trust & Safety', Icon: AlertTriangle, badge: !isLoading && statusCounts.open + statusCounts['under-review'] > 0 ? statusCounts.open + statusCounts['under-review'] : 0 },
            ] as const).map(({ id, label, Icon, badge }) => (
              <button
                key={id}
                onClick={() => { setActiveTab(id as Tab); setSelectedCity(null); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === id
                    ? 'bg-parallel-purple text-parallel-cream'
                    : 'bg-parallel-cream text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon size={14} />
                {label}
                {badge != null && badge > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-1 font-semibold">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'trust-safety' && (
            <>
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by case number, user name..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-parallel-purple text-sm"
                  />
                </div>
                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-parallel-purple text-sm"
                >
                  <option value="all">All Priorities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                {(['all', 'open', 'under-review', 'escalated', 'resolved'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      filterStatus === status
                        ? 'bg-parallel-purple text-parallel-cream'
                        : 'bg-parallel-cream text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    <span className="ml-2 text-xs opacity-75">({statusCounts[status]})</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {activeTab === 'cities' && (
        <AdminCitiesOverview onSelectCity={(city) => setSelectedCity(city)} />
      )}

      {activeTab === 'reports' && <AdminReports />}

      {activeTab === 'match-quality' && <AdminMatchQuality accessToken={accessToken} />}

      {activeTab === 'releases' && <AdminReleases />}

      {activeTab === 'revenue' && <AdminRevenue accessToken={accessToken} />}

      {activeTab === 'trust-safety' && (
        <>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
            <AdminPulsePanel accessToken={accessToken} />
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-parallel-cream rounded-lg border border-gray-200 p-4 animate-pulse">
                    <div className="flex items-start gap-4">
                      <div className="w-1 h-20 bg-gray-200 rounded-full" />
                      <div className="flex-1 space-y-3">
                        <div className="flex gap-2">
                          <div className="h-4 w-24 bg-gray-200 rounded" />
                          <div className="h-4 w-16 bg-gray-200 rounded" />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-full" />
                          <div className="space-y-1 flex-1">
                            <div className="h-3 w-32 bg-gray-200 rounded" />
                            <div className="h-3 w-24 bg-gray-200 rounded" />
                          </div>
                        </div>
                        <div className="h-3 w-3/4 bg-gray-200 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                <p className="text-red-700 text-sm">{loadError}</p>
                <button onClick={() => window.location.reload()} className="mt-3 text-sm text-red-600 underline">
                  Retry
                </button>
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="bg-parallel-cream rounded-lg border border-gray-200 p-12 text-center">
                <p className="text-gray-600">
                  {cases.length === 0 ? 'No reports have been filed yet' : 'No cases match your filters'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCases.map((case_) => (
                  <button
                    key={case_.id}
                    onClick={() => setSelectedCase(case_)}
                    className="w-full bg-parallel-cream rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-all text-left"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-1 self-stretch rounded-full ${
                        case_.priority === 'critical' ? 'bg-red-600' :
                        case_.priority === 'high'     ? 'bg-orange-500' :
                        case_.priority === 'medium'   ? 'bg-yellow-500' :
                        'bg-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-medium">{case_.caseNumber}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(case_.priority)}`}>
                              {case_.priority.toUpperCase()}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(case_.status)}`}>
                              {case_.status.split('-').join(' ')}
                            </span>
                            {case_.feelsUnsafe && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Unsafe
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0">{getTimeAgo(case_.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-10 h-10 rounded-full bg-parallel-purple/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-parallel-purple font-semibold text-sm">
                              {case_.accusedName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{case_.accusedName}</p>
                            <p className="text-xs text-gray-600">Reported by {case_.reporterName}</p>
                          </div>
                        </div>
                        <div className="mb-3">
                          <p className="text-sm font-medium text-gray-900 mb-1">{case_.category}</p>
                          <p className="text-sm text-gray-600 line-clamp-2">{case_.description}</p>
                        </div>
                        <div className="flex items-center justify-between gap-4 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-4 text-xs text-gray-600">
                            <span>Trust Score: {case_.trustScore}/100</span>
                            <span>Prior Reports: {case_.priorReports}</span>
                            <span>Suggested: Tier {case_.suggestedTier}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
