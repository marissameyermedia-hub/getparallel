import { ChevronLeft, MessageCircle } from 'lucide-react';
import { ParallelIcon } from './ParallelIcon';

interface SimpleHeaderProps {
  onNavigate?: (view: 'matches' | 'pricing' | 'questionnaire' | 'account' | 'attachment-quiz' | 'signin' | 'profile' | 'my-profile' | 'inbox' | 'resources') => void;
  onBack?: () => void;
  showBackButton?: boolean;
  showMenu?: boolean;
  isSignedIn?: boolean;
  title?: string;
  unreadMessageCount?: number;
  showInbox?: boolean;
}

export function SimpleHeader({ 
  onNavigate, 
  onBack, 
  showBackButton = false, 
  showMenu = true,
  isSignedIn = true,
  title,
  unreadMessageCount = 0,
  showInbox = false
}: SimpleHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 z-50 flex-shrink-0">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Left side - Back button or Logo */}
        {showBackButton && onBack ? (
          <button
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={() => onNavigate?.('matches')}
            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
          >
            <ParallelIcon size={24} className="text-black" />
            <span className="font-semibold">Parallel</span>
          </button>
        )}

        {/* Center - Optional Title */}
        {title && (
          <span className="absolute left-1/2 transform -translate-x-1/2 font-semibold">
            {title}
          </span>
        )}

        {/* Right side - Inbox Icon */}
        {showMenu && onNavigate && showInbox && (
          <button
            onClick={() => onNavigate('inbox')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors relative"
            aria-label="Inbox"
          >
            <MessageCircle size={24} />
            {/* Notification Badge */}
            {unreadMessageCount && unreadMessageCount > 0 && (
              <div className="absolute -top-1 -right-1 min-w-[20px] h-[20px] bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-[11px] font-bold px-1">
                  {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                </span>
              </div>
            )}
          </button>
        )}
        
        {/* Empty space to balance the header when no inbox */}
        {(!showMenu || !onNavigate || !showInbox) && <div className="w-10"></div>}
      </div>
    </header>
  );
}