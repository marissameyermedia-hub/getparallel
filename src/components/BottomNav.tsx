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

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 z-50">
      <div className="max-w-lg mx-auto flex items-center justify-around px-[24px] py-[9px] mx-[0px] my-[1px]">

        {/* Home */}
        <button
          onClick={() => onNavigate('matches')}
          className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
            isActive('matches') ? 'text-black' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Home size={24} strokeWidth={isActive('matches') ? 2.5 : 1.5} />
          <span className="text-xs font-medium">Home</span>
        </button>

        {/* Inbox */}
        <button
          onClick={() => onNavigate('inbox')}
          className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors relative ${
            isActive('inbox') ? 'text-black' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <div className="relative">
            <MessageSquare size={24} strokeWidth={isActive('inbox') ? 2.5 : 1.5} />
            {unreadMessageCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center">
                <span className="text-primary text-[10px] font-bold">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
              </div>
            )}
          </div>
          <span className="text-xs font-medium">Inbox</span>
        </button>

        {/* Account */}
        <button
          onClick={() => onNavigate('account')}
          className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
            isActive('account') ? 'text-black' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <User size={24} strokeWidth={isActive('account') ? 2.5 : 1.5} />
          <span className="text-xs font-medium">Account</span>
        </button>

      </div>
    </div>
  );
}