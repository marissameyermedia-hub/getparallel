import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { WAITLIST_FUNCTION_URL } from '../utils/supabase/client';

interface WaitlistPageProps {
  onNavigate: (view: string) => void;
}

const CITIES = [
  'Seattle, WA',
  'Portland, OR',
  'San Francisco, CA',
  'Los Angeles, CA',
  'New York, NY',
  'Chicago, IL',
  'Austin, TX',
  'Denver, CO',
  'Boston, MA',
  'Other city',
];

interface SuccessData {
  already_on_list: boolean;
  position_in_city: number;
  total_in_city: number;
  message: string;
}

export function WaitlistPage({ onNavigate }: WaitlistPageProps) {
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [otherCity, setOtherCity] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const effectiveCity = city === 'Other city' ? otherCity.trim() : city;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !effectiveCity) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const params = new URLSearchParams(window.location.search);
      const utmSource = params.get('utm_source') ?? undefined;
      const utmMedium = params.get('utm_medium') ?? undefined;
      const utmCampaign = params.get('utm_campaign') ?? undefined;

      const res = await fetch(WAITLIST_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          city: effectiveCity,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }

      setSuccessData(data);
      setStatus('success');
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  const cityShortName = effectiveCity.split(',')[0];

  if (status === 'success' && successData) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#7B5EA7]/10 mb-6">
              <Check className="text-[#7B5EA7]" size={28} strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold text-[#0D0D0F] tracking-tight mb-4">
              {successData.already_on_list ? "You're already on the list." : "You're on the list."}
            </h1>
            {successData.position_in_city > 0 && (
              <p className="text-lg text-gray-600 mb-3">
                You're{' '}
                <span className="font-semibold text-[#0D0D0F]">
                  #{successData.position_in_city} in {cityShortName}
                </span>
                {successData.total_in_city > 1 && (
                  <> out of {successData.total_in_city} people waiting.</>
                )}
                {successData.total_in_city <= 1 && '.'}
              </p>
            )}
            <p className="text-gray-500 max-w-sm mx-auto">
              We'll reach out when there are enough people near you for matching to actually work.
            </p>
          </div>

          <div className="w-full max-w-sm bg-[#F5F2EE] rounded-2xl p-6 text-left mb-8">
            <p className="text-xs tracking-[0.15em] uppercase text-[#7B5EA7] font-semibold mb-2">
              Founders Club
            </p>
            <p className="text-[#0D0D0F] font-medium mb-1">Lock in $79/year for life.</p>
            <p className="text-sm text-gray-600 mb-4">
              Take the questionnaire now — your profile waits with you, and founding members keep their rate forever.
            </p>
            <button
              onClick={() => onNavigate('account-creation')}
              className="w-full bg-[#7B5EA7] text-white px-5 py-3 rounded-full text-sm font-medium hover:bg-[#7B5EA7]/90 transition-colors flex items-center justify-center gap-2"
            >
              Take the questionnaire
              <ArrowRight size={16} />
            </button>
          </div>

          <button
            onClick={() => onNavigate('signin')}
            className="text-sm text-gray-500 hover:text-[#0D0D0F] transition-colors"
          >
            Already a member? Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          {/* Wordmark */}
          <div className="mb-10 text-center">
            <span className="text-2xl font-semibold tracking-tight text-[#0D0D0F]">
              PARA<span className="text-[#7B5EA7]">//</span>EL
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-semibold text-[#0D0D0F] tracking-tight leading-[1.1] mb-4">
            Parallel is opening<br />city by city.
          </h1>
          <p className="text-gray-600 leading-relaxed mb-10">
            Tell us where you are. We'll let you know when there are enough people near you for matching to actually work.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="wl-email" className="block text-sm font-medium text-[#0D0D0F] mb-1.5">
                Email
              </label>
              <input
                id="wl-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[#0D0D0F] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#7B5EA7]/30 focus:border-[#7B5EA7] transition-colors"
              />
            </div>

            <div>
              <label htmlFor="wl-city" className="block text-sm font-medium text-[#0D0D0F] mb-1.5">
                City
              </label>
              <select
                id="wl-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[#0D0D0F] focus:outline-none focus:ring-2 focus:ring-[#7B5EA7]/30 focus:border-[#7B5EA7] transition-colors appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238A8690' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}
              >
                <option value="">Select your city…</option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {city === 'Other city' && (
              <div>
                <label htmlFor="wl-other-city" className="block text-sm font-medium text-[#0D0D0F] mb-1.5">
                  Your city
                </label>
                <input
                  id="wl-other-city"
                  type="text"
                  value={otherCity}
                  onChange={(e) => setOtherCity(e.target.value)}
                  placeholder="e.g. Nashville, TN"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[#0D0D0F] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#7B5EA7]/30 focus:border-[#7B5EA7] transition-colors"
                />
              </div>
            )}

            {status === 'error' && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading' || !email || !effectiveCity}
              className="w-full bg-[#0D0D0F] text-white px-6 py-3.5 rounded-full font-medium hover:bg-[#0D0D0F]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {status === 'loading' ? 'Joining…' : (
                <>
                  Join the waitlist
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-gray-100 text-center space-y-3">
            <p className="text-sm text-gray-500">Ready to take the questionnaire now?</p>
            <button
              onClick={() => onNavigate('account-creation')}
              className="text-sm font-medium text-[#7B5EA7] hover:text-[#7B5EA7]/80 transition-colors"
            >
              Create your profile →
            </button>
            <div>
              <button
                onClick={() => onNavigate('signin')}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Already a member? Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
