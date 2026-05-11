import { Home, MessageSquare, User } from 'lucide-react';

interface BottomNavProps {
  onNavigate: (view: string) => void;
  currentView: string;
  unreadMessageCount?: number;
}

export function BottomNav({ onNavigate, currentView, unreadMessageCount = 0 }: BottomNavProps) {
  const isActive = (view: string) => {
    if (view === 'matches') return currentView === 'matches';
    if (view === 'inbox') return currentView === 'inbox' || currentView === 'messaging';
    if (view === 'account') return currentView === 'account' || currentView === 'my-profile' || currentView === 'profile' || currentView === 'questionnaire';
    return currentView === view;
  };

  // Hard-hide during messaging so the nav never covers the input bar.
  // App.tsx also conditionally renders this via isFullscreenView, but this
  // inline guard is a belt-and-suspenders defence against stale builds.
  if (currentView === 'messaging') return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-parallel-cream border-t-2 border-gray-200 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary"
    >
      <div className="max-w-lg mx-auto flex items-center justify-around px-[24px] py-[9px] mx-[0px] my-[1px]">

        {/* Home */}
        <button
          onClick={() => onNavigate('matches')}
          aria-label="Matches"
          aria-current={isActive('matches') ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
            isActive('matches') ? 'text-parallel-void' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Home size={24} strokeWidth={isActive('matches') ? 2.5 : 1.5} aria-hidden="true" />
          <span className="text-xs font-medium">Home</span>
        </button>

        {/* Inbox */}
        <button
          onClick={() => onNavigate('inbox')}
          aria-label={unreadMessageCount > 0 ? `Inbox, ${unreadMessageCount} unread` : 'Inbox'}
          aria-current={isActive('inbox') ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors relative ${
            isActive('inbox') ? 'text-parallel-void' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="relative">
            <MessageSquare size={24} strokeWidth={isActive('inbox') ? 2.5 : 1.5} aria-hidden="true" />
            {unreadMessageCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-parallel-void rounded-full flex items-center justify-center" aria-hidden="true">
                <span className="text-parallel-cream text-[10px] font-bold">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
              </div>
            )}
          </div>
          <span className="text-xs font-medium">Inbox</span>
        </button>

        {/* Account */}
        <button
          onClick={() => onNavigate('account')}
          aria-label="Account"
          aria-current={isActive('account') ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
            isActive('account') ? 'text-parallel-void' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <User size={24} strokeWidth={isActive('account') ? 2.5 : 1.5} aria-hidden="true" />
          <span className="text-xs font-medium">Account</span>
        </button>

      </div>
    </nav>
  );
}
