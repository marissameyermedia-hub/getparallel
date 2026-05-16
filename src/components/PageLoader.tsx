import { ParallelWordmark } from './ParallelWordmark';
import { LoadingDots } from './LoadingDots';

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message }: PageLoaderProps) {
  return (
    <div className="min-h-screen bg-parallel-cream flex flex-col items-center justify-center gap-6">
      <ParallelWordmark sizeClassName="text-2xl" />
      <LoadingDots />
      {message && (
        <p className="text-sm text-gray-500 font-medium">{message}</p>
      )}
    </div>
  );
}
