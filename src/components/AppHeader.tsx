import { ParallelIcon } from './ParallelIcon';

interface AppHeaderProps {
  onNavigate?: () => void;
}

export function AppHeader({ onNavigate }: AppHeaderProps) {
  return (
    <div className="w-full bg-white border-b border-gray-200 py-4 px-6">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <button
          onClick={onNavigate}
          className="flex items-center gap-3 hover:opacity-70 transition-opacity"
          disabled={!onNavigate}
        >
          <ParallelIcon size="md" tone="foreground" label="Parallel" />
          <span className="font-semibold text-lg">Parallel</span>
        </button>
      </div>
    </div>
  );
}
