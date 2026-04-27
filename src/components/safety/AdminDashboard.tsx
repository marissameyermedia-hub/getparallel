import { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search,
  Filter,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import { AdminCaseDetail } from './AdminCaseDetail';

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

const MOCK_CASES: SafetyCase[] = [
  {
    id: '1',
    caseNumber: 'TS-2026-0247',
    status: 'open',
    priority: 'critical',
    reporterId: 'reporter-1',
    reporterName: 'Emma Rodriguez',
    accusedId: 'accused-1',
    accusedName: 'Michael Stevens',
    accusedPhoto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300',
    category: 'Felt physically unsafe',
    description: 'During our date, he became aggressive when I said I wanted to leave early. He blocked the exit and raised his voice. I felt threatened.',
    context: 'post-date',
    feelsUnsafe: true,
    screenshots: [],
    suggestedTier: 3,
    trustScore: 42,
    priorReports: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '2',
    caseNumber: 'TS-2026-0246',
    status: 'under-review',
    priority: 'high',
    reporterId: 'reporter-2',
    reporterName: 'Sarah Johnson',
    accusedId: 'accused-2',
    accusedName: 'David Martinez',
    accusedPhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300',
    category: 'Sexual or inappropriate messages',
    description: 'After matching, he immediately sent explicit messages despite me asking him to stop. He continued for several days.',
    context: 'chat',
    feelsUnsafe: false,
    screenshots: ['screenshot-1.png', 'screenshot-2.png'],
    suggestedTier: 2,
    trustScore: 68,
    priorReports: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    assignedTo: 'Jessica Chen',
  },
  {
    id: '3',
    caseNumber: 'TS-2026-0245',
    status: 'open',
    priority: 'medium',
    reporterId: 'reporter-3',
    reporterName: 'Lisa Thompson',
    accusedId: 'accused-3',
    accusedName: 'James Wilson',
    accusedPhoto: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300',
    category: 'Misleading profile information',
    description: 'His profile photos were at least 10 years old and 50+ pounds lighter. He was also married, which he never mentioned.',
    context: 'post-date',
    feelsUnsafe: false,
    screenshots: [],
    suggestedTier: 1,
    trustScore: 55,
    priorReports: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: '4',
    caseNumber: 'TS-2026-0244',
    status: 'resolved',
    priority: 'low',
    reporterId: 'reporter-4',
    reporterName: 'Rachel Green',
    accusedId: 'accused-4',
    accusedName: 'Tom Anderson',
    accusedPhoto: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300',
    category: 'Harassment or bullying',
    description: 'He was rude when I said I wasn\'t interested in a second date. Called me names via text.',
    context: 'chat',
    feelsUnsafe: false,
    screenshots: ['screenshot-3.png'],
    suggestedTier: 1,
    trustScore: 78,
    priorReports: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    assignedTo: 'Marcus Lee',
  },
];

export function AdminDashboard({ onBack, accessToken }: AdminDashboardProps) {
  const [cases, setCases] = useState<SafetyCase[]>(MOCK_CASES);
  const [selectedCase, setSelectedCase] = useState<SafetyCase | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCases = cases.filter(c => {
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || c.priority === filterPriority;
    const matchesSearch = !searchQuery || 
      c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.accusedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.reporterName.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const statusCounts = {
    all: cases.length,
    open: cases.filter(c => c.status === 'open').length,
    'under-review': cases.filter(c => c.status === 'under-review').length,
    escalated: cases.filter(c => c.status === 'escalated').length,
    resolved: cases.filter(c => c.status === 'resolved').length,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'under-review': return 'bg-purple-100 text-purple-800';
      case 'escalated': return 'bg-red-100 text-red-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const minutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                aria-label="Go back"
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              </button>
              <div>
                <h1 className="text-2xl font-bold">Trust & Safety Dashboard</h1>
                <p className="text-sm text-gray-600">Internal moderation system</p>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by case number, user name..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black text-sm"
              />
            </div>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black text-sm"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Status Tabs */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            {(['all', 'open', 'under-review', 'escalated', 'resolved'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filterStatus === status
                    ? 'bg-black text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                <span className="ml-2 text-xs opacity-75">
                  ({statusCounts[status]})
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cases List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {filteredCases.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-600">No cases match your filters</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCases.map((case_) => (
              <button
                key={case_.id}
                onClick={() => setSelectedCase(case_)}
                className="w-full bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-all text-left"
              >
                <div className="flex items-start gap-4">
                  {/* Priority Indicator */}
                  <div className={`w-1 h-full rounded-full ${
                    case_.priority === 'critical' ? 'bg-red-600' :
                    case_.priority === 'high' ? 'bg-orange-500' :
                    case_.priority === 'medium' ? 'bg-yellow-500' :
                    'bg-gray-400'
                  }`} />

                  <div className="flex-1 min-w-0">
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">
                          {case_.caseNumber}
                        </span>
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
                      <span className="text-xs text-gray-500">
                        {getTimeAgo(case_.createdAt)}
                      </span>
                    </div>

                    {/* Case Info */}
                    <div className="flex items-center gap-2 mb-2">
                      <img
                        src={case_.accusedPhoto}
                        alt={case_.accusedName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {case_.accusedName}
                        </p>
                        <p className="text-xs text-gray-600">
                          Reported by {case_.reporterName}
                        </p>
                      </div>
                    </div>

                    {/* Category and Description */}
                    <div className="mb-3">
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        {case_.category}
                      </p>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {case_.description}
                      </p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-4 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4 text-xs text-gray-600">
                        <span>Trust Score: {case_.trustScore}/100</span>
                        <span>Prior Reports: {case_.priorReports}</span>
                        <span>Suggested: Tier {case_.suggestedTier}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
