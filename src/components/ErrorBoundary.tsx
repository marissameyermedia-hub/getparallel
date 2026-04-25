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
        <div className="min-h-screen bg-white flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 rounded-full bg-red-100 mx-auto flex items-center justify-center mb-4">
              <span className="text-4xl">⚠️</span>
            </div>
            <h1 className="mb-2">Something went wrong</h1>
            <div className="mt-4 p-4 bg-gray-100 rounded-xl text-left text-xs font-mono break-all mb-6">
              <p className="font-bold text-red-600 mb-1">Error:</p>
              <p className="text-gray-800 mb-3">{this.state.error?.message || 'Unknown'}</p>
              <p className="font-bold text-red-600 mb-1">Location:</p>
              <p className="text-gray-600 whitespace-pre-wrap">{this.state.error?.stack?.slice(0, 400)}</p>
            </div>
            <p className="text-xs text-gray-400 mb-6">Screenshot this and send to Marissa</p>
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/'; }}
              className="w-full bg-black text-white py-4 rounded-full font-semibold"
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
