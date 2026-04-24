import { LoadingDots } from './LoadingDots';

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message }: PageLoaderProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <LoadingDots />
      {message && (
        <p className="text-sm text-gray-400 font-medium">{message}</p>
      )}
    </div>
  );
}
