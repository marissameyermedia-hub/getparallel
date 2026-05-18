import { useState } from 'react';
import { AlertTriangle, Trash2, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, MISC_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { EDGE_FUNCTION_URL } from '../../utils/supabase/client';
import { getAccessToken } from '../../utils/auth';

interface DeleteAccountViewProps {
  onBack: () => void;
  onDeleteComplete: () => void;
}

export function DeleteAccountView({ onBack, onDeleteComplete }: DeleteAccountViewProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async () => {
    if (confirmText.toLowerCase() !== 'delete') return;

    setIsDeleting(true);
    setDeleteError('');

    const token = await getAccessToken();

    if (!token) {
      setDeleteError('Session expired. Please sign in again and retry.');
      setIsDeleting(false);
      return;
    }

    try {
      const response = await fetch(`${MISC_FUNCTION_URL}/user/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Delete account error:', data);
        setDeleteError(data.error || 'Something went wrong. Please contact support at legal@getparallel.vip');
        setIsDeleting(false);
        return;
      }

      await supabase.auth.signOut();
      localStorage.clear();

      toast.success(
        "Your account has been permanently deleted. A confirmation has been sent to your email."
      );
      onDeleteComplete();

    } catch (err: any) {
      console.error('Failed to delete account:', err);
      setDeleteError('Network error. Please try again or contact legal@getparallel.vip');
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-parallel-cream pt-6 pb-24 px-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={28} aria-hidden="true" />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="mb-2">Delete Account</h1>
          <p className="text-gray-600">This action is permanent and cannot be undone</p>
        </div>

        {!showConfirmation ? (
          <>
            <div className="bg-gray-50 rounded-2xl p-6 mb-6">
              <h3 className="mb-4">What happens when you delete your account:</h3>
              <ul className="space-y-3 text-gray-700">
                {[
                  'Your profile will be permanently removed',
                  'All your matches and conversations will be deleted',
                  'Your questionnaire responses will be removed',
                  "You won't be visible to any current or future matches",
                  'Your subscription will be cancelled immediately',
                  'Any remaining plan time will be forfeited and cannot be refunded',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="text-red-600 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6 mb-6 border-2 border-gray-200">
              <h3 className="mb-2">Not sure? Try these instead:</h3>
              <p className="text-gray-700 mb-4">
                If you need a break, you can pause your profile instead. This will hide you from
                matches while keeping your account and data safe.
              </p>
              <button onClick={onBack} className="text-parallel-void hover:text-gray-700 font-medium">
                Go to Pause Profile →
              </button>
            </div>

            <button
              onClick={() => setShowConfirmation(true)}
              className="w-full py-4 px-6 bg-red-600 text-parallel-cream rounded-full hover:bg-red-700 transition-colors font-medium"
            >
              Continue to Delete Account
            </button>
            <button
              onClick={onBack}
              className="w-full py-4 px-6 mt-3 border-2 border-gray-200 rounded-full hover:border-gray-400 transition-colors font-medium"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="bg-red-50 rounded-2xl p-6 mb-6 border-2 border-red-200">
              <h3 className="mb-4 text-red-900">Final Confirmation</h3>
              <p className="text-gray-700 mb-4">
                To confirm deletion, please type <strong>"delete"</strong> below:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type here..."
                className="w-full px-4 py-3 rounded-full border-2 border-gray-300 focus:border-red-500 focus:outline-none"
                style={{ fontSize: '16px' }}
              />
            </div>

            {deleteError && (
              <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
                <p className="text-sm text-red-600">{deleteError}</p>
              </div>
            )}

            <button
              onClick={handleDelete}
              disabled={confirmText.toLowerCase() !== 'delete' || isDeleting}
              className={`w-full py-4 px-6 rounded-full font-medium transition-colors mb-3 flex items-center justify-center gap-2 ${
                confirmText.toLowerCase() === 'delete' && !isDeleting
                  ? 'bg-red-600 text-parallel-cream hover:bg-red-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Trash2 className="w-5 h-5" />
              {isDeleting ? 'Deleting your account...' : 'Permanently Delete My Account'}
            </button>

            <button
              onClick={() => { setShowConfirmation(false); setDeleteError(''); }}
              className="w-full py-4 px-6 border-2 border-gray-200 rounded-full hover:border-gray-400 transition-colors font-medium"
            >
              Go Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}