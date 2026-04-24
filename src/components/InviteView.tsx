import { useState, useEffect } from 'react';
import { ChevronLeft, Copy, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { EDGE_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

interface InviteViewProps {
  onBack: () => void;
}

function getHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': publicAnonKey
  };
}

export function InviteView({ onBack }: InviteViewProps) {
  const [referralCode, setReferralCode] = useState<string>('');
  const [friendsInvited, setFriendsInvited] = useState<number>(0);
  const [friendsSubscribed, setFriendsSubscribed] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReferralData = async () => {
      const token = localStorage.getItem('parallel_access_token');
      if (!token) return;

      try {
        const res = await fetch(`${EDGE_FUNCTION_URL}/referral/my-code`, {
          headers: getHeaders(token)
        });

        if (res.ok) {
          const data = await res.json();
          setReferralCode(data.code || '');
          setFriendsInvited(data.friendsInvited || 0);
          setFriendsSubscribed(data.friendsSubscribed || 0);
        }
      } catch (err) {
        console.error('Failed to fetch referral data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReferralData();
  }, []);

  const referralLink = `https://getparallel.vip?ref=${referralCode}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Link copied!', { duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Join me on Parallel',
      text: `I've been using Parallel — a new matchmaking app that actually matches you based on what matters most. I think you'd like it. ${referralLink}`,
      url: referralLink
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await handleCopyLink();
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-white z-10 border-b border-gray-200">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-gray-50 rounded-full transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="font-semibold absolute left-1/2 -translate-x-1/2">Invite Friends</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* Content */}
      <div className="pt-20 px-4 max-w-2xl mx-auto">

        {/* Logo */}
        <div className="flex justify-center mb-6 mt-6">
          <div className="flex gap-1">
            <div className="w-1.5 h-10 bg-black"></div>
            <div className="w-1.5 h-10 bg-black"></div>
          </div>
        </div>

        {/* Headline */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3 tracking-tight leading-tight">
            We're only as good<br />as our match pool.
          </h2>
          <p className="text-gray-600 text-base leading-relaxed max-w-md mx-auto">
            Know someone who belongs in it? Send them your link.
          </p>
        </div>

        {/* Referral Link Card */}
        {isLoading ? (
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 mb-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-10 bg-gray-200 rounded mb-4"></div>
            <div className="flex gap-3">
              <div className="h-12 bg-gray-200 rounded flex-1"></div>
              <div className="h-12 bg-gray-200 rounded flex-1"></div>
            </div>
          </div>
        ) : (
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 mb-6">
            <p className="text-sm text-gray-600 mb-2">Your referral link</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4 font-mono text-sm break-all">
              {referralLink}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCopyLink}
                className="flex-1 bg-white border-2 border-black text-black px-6 py-3 rounded-full hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check size={18} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={18} />
                    Copy link
                  </>
                )}
              </button>

              <button
                onClick={handleShare}
                className="flex-1 bg-black text-white px-6 py-3 rounded-full hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <Share2 size={18} />
                Share
              </button>
            </div>
          </div>
        )}

        {/* Your impact — the game element */}
        {!isLoading && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
              Your impact
            </p>
            <div className="flex items-baseline gap-6">
              <div>
                <p className="text-3xl font-bold tracking-tight">{friendsInvited}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {friendsInvited === 1 ? 'friend invited' : 'friends invited'}
                </p>
              </div>
              <div className="h-10 w-px bg-gray-200"></div>
              <div>
                <p className="text-3xl font-bold tracking-tight">{friendsSubscribed}</p>
                <p className="text-xs text-gray-500 mt-0.5">joined Parallel</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}