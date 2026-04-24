interface ProgressBarProps {
  currentChapter: number;
  totalChapters: number;
}

export function ProgressBar({ currentChapter, totalChapters }: ProgressBarProps) {
  const progress = (currentChapter / totalChapters) * 100;

  return (
    <div className="w-full">
      <div className="h-1 bg-gray-100">
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{
            width: `${progress}%`,
            backgroundColor: '#000000',
          }}
        />
      </div>
    </div>
  );
}