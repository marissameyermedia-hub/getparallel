import { MessageCircle } from 'lucide-react';
import { ParallelIcon } from './ParallelIcon';

interface HeaderProps {
  onNavigate: (view: 'matches' | 'pricing' | 'questionnaire' | 'account' | 'signin' | 'inbox' | 'my-profile') => void;
  currentView?: string;
  isSignedIn?: boolean;
  unreadMessageCount?: number;
  showInbox?: boolean;
}

export function Header({ onNavigate, currentView, isSignedIn = true, unreadMessageCount = 0, showInbox = false }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo - clickable to navigate to matches */}
        <button
          onClick={() => onNavigate('matches')}
          className="flex items-center gap-2 hover:opacity-70 transition-opacity"
        >
          <ParallelIcon size="md" tone="foreground" label="Parallel" />
          <span className="font-semibold">Parallel</span>
        </button>
      </div>
    </header>
  );
}