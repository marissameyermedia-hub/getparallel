import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-parallel-cream flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 mx-auto flex items-center justify-center mb-4">
              <span className="text-4xl">⚠️</span>
            </div>
            <h1 className="mb-2">Something went wrong</h1>
            <p className="text-gray-600 leading-relaxed mb-6">
              An unexpected error occurred. Restarting the app usually fixes it — your progress is saved.
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Still stuck? Email us at{' '}
              <a href="mailto:support@getparallel.vip" className="underline underline-offset-2 hover:text-parallel-void transition-colors">
                support@getparallel.vip
              </a>
            </p>
            <button
              onClick={() => {
                // Clear only auth keys — preserve questionnaire progress and match state
                try {
                  ['parallel_access_token', 'parallel_user_id', 'parallel_user_email'].forEach(k => localStorage.removeItem(k));
                } catch { /* ignore */ }
                window.location.href = '/';
              }}
              className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-semibold"
            >
              Restart app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
