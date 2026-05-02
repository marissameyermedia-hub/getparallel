import { useState } from 'react';
import { Eye, EyeOff, ChevronLeft, Mail, Phone, ArrowRight, CheckCircle, Circle } from 'lucide-react';
import { EDGE_FUNCTION_URL, AUTH_FUNCTION_URL } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { AppFooter } from './AppFooter';

const TOS_VERSION = '2026-04-16';
const PRIVACY_VERSION = '2026-04-09';
// NOTE: SMS consent is captured on PhoneVerificationPage, not here. This keeps
// account creation friction low and matches Telnyx's requirement that SMS
// opt-in be separate/optional/unchecked.

interface AccountCreationPageProps {
  onComplete: (userData: {
    name: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    accessToken: string;
    userId: string;
    emailConfirmed?: boolean;
  }) => void;
  onBack: () => void;
  onNavigate?: (view: string) => void;
  // Captured from ?ref=CODE upstream. When present, we surface a small
  // green "you were referred" banner above the form to build trust at the
  // exact moment the user is deciding whether to hand over their info.
  referralCode?: string | null;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

interface PasswordRule {
  label: string;
  met: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', met: (pw) => pw.length >= 8 },
  { label: 'At least one number', met: (pw) => /\d/.test(pw) },
];

function formatDobDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDobToIso(display: string): string | null {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const month = parseInt(mm);
  const day = parseInt(dd);
  const year = parseInt(yyyy);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;
  return `${yyyy}-${mm}-${dd}`;
}

// ToS/Privacy acceptance — written to the `agreements` table via the standalone log-agreement function.
async function logToSAgreement(accessToken: string): Promise<void> {
  const supabaseUrl = `https://${projectId}.supabase.co`;
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/log-agreement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': publicAnonKey,
      },
      body: JSON.stringify({
        tos_version: TOS_VERSION,
        privacy_version: PRIVACY_VERSION,
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      console.error('logToSAgreement failed:', err);
    }
  } catch (err) {
    console.error('logToSAgreement network error:', err);
  }
}

export function AccountCreationPage({ onComplete, onBack, onNavigate, referralCode }: AccountCreationPageProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const [dobDisplay, setDobDisplay] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    setFormData(prev => ({ ...prev, phone: raw }));
  };

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    setDobDisplay(formatDobDisplay(digits));
  };

  const handleEmailBlur = () => {
    if (!formData.email) return;
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
    setEmailError(valid ? '' : 'Please enter a valid email address');
  };

  const handlePhoneBlur = () => {
    if (!formData.phone) return;
    const digits = formData.phone.replace(/\D/g, '');
    setPhoneError(digits.length >= 10 ? '' : 'Please enter a valid 10-digit phone number');
  };

  const allPasswordRulesMet = PASSWORD_RULES.every(r => r.met(formData.password));

  const calculateAge = (isoDate: string): number => {
    const today = new Date();
    const birth = new Date(isoDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const dobIso = parseDobToIso(dobDisplay);

    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (!dobIso) {
      setError('Please enter a valid date of birth in MM/DD/YYYY format');
      return;
    }
    const age = calculateAge(dobIso);
    if (age < 18) {
      setError('You must be at least 18 years old to use Parallel');
      return;
    }
    if (formData.phone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }
    if (!allPasswordRulesMet) {
      setError('Please make sure your password meets all requirements');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue');
      return;
    }
    // NOTE: SMS consent is intentionally NOT required. 10DLC compliance requires it to be optional.

    setIsLoading(true);

    try {
      const normalizedPhone = normalizePhone(formData.phone);

      const response = await fetch(`${AUTH_FUNCTION_URL}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          phone: normalizedPhone,
          dateOfBirth: dobIso,
        }),
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        setError('Server error — please try again.');
        setIsLoading(false);
        return;
      }

      if (!response.ok || data.error) {
        let errorMsg = data.error || `Server error (${response.status}). Please try again.`;
        if (errorMsg.includes('profiles_phone_key') || (errorMsg.includes('duplicate') && errorMsg.includes('phone'))) {
          errorMsg = 'That phone number is already linked to an account. Try signing in instead.';
        } else if (errorMsg.includes('already been registered') || errorMsg.includes('email_exists')) {
          errorMsg = 'An account with that email already exists. Try signing in instead.';
        } else if (errorMsg.includes('duplicate key') || errorMsg.includes('unique constraint')) {
          errorMsg = 'An account with that information already exists. Try signing in instead.';
        }
        setError(errorMsg);
        setIsLoading(false);
        return;
      }

      if (!data.accessToken || !data.userId) {
        setError('Account created but sign-in failed. Please sign in manually.');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('parallel_access_token', data.accessToken);
      localStorage.setItem('parallel_user_id', data.userId);
      localStorage.setItem('parallel_user_email', formData.email);

      // Log ToS + Privacy acceptance — legal record for clickwrap.
      // SMS consent is logged later on PhoneVerificationPage when the user
      // explicitly opts in at the moment they provide their phone number.
      logToSAgreement(data.accessToken).catch(() => {});

      onComplete({
        name: formData.name,
        email: formData.email,
        phone: normalizedPhone,
        dateOfBirth: dobIso,
        accessToken: data.accessToken,
        userId: data.userId,
        emailConfirmed: data.emailConfirmed ?? true,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-parallel-cream flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <button
          onClick={onBack}
          className="mb-8 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Create Account</h1>
          <p className="text-gray-600">You deserve to have everything you want. Tell us what it is.</p>
        </div>

        {/* Referral acknowledgement — only shown when ?ref=CODE was captured.
            Builds trust at the exact moment the user is handing over PII.
            We don't show the inviter's name yet (no backend lookup endpoint);
            once /referral/by-code lands, swap "A friend" for the actual name. */}
        {referralCode && (
          <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-2">
            <CheckCircle size={18} className="text-green-600 flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-green-800">
              <span className="font-medium">A friend referred you to Parallel.</span>{' '}
              <span className="text-green-700">Welcome.</span>
            </p>
          </div>
        )}

        {error && (
          <div id="account-creation-error" role="alert" className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">

          <div>
            <label htmlFor="name" className="block text-sm mb-2 text-gray-700">Full Name</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Your full name"
              className="w-full px-4 py-3 rounded-full border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
              disabled={isLoading}
              style={{ fontSize: '16px' }}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm mb-2 text-gray-700">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setEmailError(''); }}
                onBlur={handleEmailBlur}
                placeholder="you@example.com"
                className="w-full pl-12 pr-4 py-3 rounded-full border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                disabled={isLoading}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'email-error' : undefined}
                style={{ fontSize: '16px' }}
              />
            </div>
            {emailError && <p id="email-error" role="alert" className="mt-1 text-xs text-red-600 ml-1">{emailError}</p>}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm mb-2 text-gray-700">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
              <input
                id="phone"
                type="tel"
                value={formatPhoneDisplay(formData.phone)}
                onChange={handlePhoneChange}
                onBlur={handlePhoneBlur}
                placeholder="(555) 000-0000"
                className="w-full pl-12 pr-4 py-3 rounded-full border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                disabled={isLoading}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? 'phone-error' : 'phone-hint'}
                style={{ fontSize: '16px' }}
              />
            </div>
            {phoneError && <p id="phone-error" role="alert" className="mt-1 text-xs text-red-600 ml-1">{phoneError}</p>}
            <p id="phone-hint" className="mt-1.5 text-xs text-gray-500 ml-1">
              We'll send a 6-digit code to this number to verify it's you.
            </p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm mb-2 text-gray-700">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onFocus={() => setPasswordFocused(true)}
                placeholder="Create a password"
                className="w-full px-4 pr-12 py-3 rounded-full border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                disabled={isLoading}
                aria-describedby={formData.password.length > 0 ? 'password-rules' : undefined}
                style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>
            {formData.password.length > 0 && (
              <div id="password-rules" className="mt-2 space-y-1 px-1">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.met(formData.password);
                  return (
                    <div key={rule.label} className="flex items-center gap-2">
                      {met
                        ? <CheckCircle size={13} className="text-green-500 flex-shrink-0" aria-hidden="true" />
                        : <Circle size={13} className="text-gray-300 flex-shrink-0" aria-hidden="true" />
                      }
                      <span className={`text-xs ${met ? 'text-green-700' : 'text-gray-600'}`}>
                        {rule.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm mb-2 text-gray-700">Confirm Password</label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Confirm your password"
                className={`w-full px-4 pr-12 py-3 rounded-full border-2 focus:outline-none transition-colors ${
                  formData.confirmPassword && formData.password !== formData.confirmPassword
                    ? 'border-red-300 focus:border-red-400'
                    : formData.confirmPassword && formData.password === formData.confirmPassword
                    ? 'border-green-300 focus:border-green-400'
                    : 'border-gray-200 focus:border-parallel-purple'
                }`}
                disabled={isLoading}
                aria-invalid={formData.confirmPassword && formData.password !== formData.confirmPassword ? true : undefined}
                aria-describedby={formData.confirmPassword && formData.password !== formData.confirmPassword ? 'confirm-password-error' : undefined}
                style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showConfirmPassword}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p id="confirm-password-error" role="alert" className="mt-1 text-xs text-red-600 ml-1">Passwords don't match</p>
            )}
          </div>

          <div>
            <label htmlFor="dateOfBirth" className="block text-sm mb-2 text-gray-700">Date of Birth</label>
            <input
              id="dateOfBirth"
              type="text"
              inputMode="numeric"
              value={dobDisplay}
              onChange={handleDobChange}
              placeholder="MM/DD/YYYY"
              maxLength={10}
              className="w-full px-4 py-3 rounded-full border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
              disabled={isLoading}
              aria-invalid={
                (dobDisplay.replace(/\D/g, '').length === 8 && !parseDobToIso(dobDisplay)) ||
                (dobDisplay.replace(/\D/g, '').length === 8 && parseDobToIso(dobDisplay) && calculateAge(parseDobToIso(dobDisplay)!) < 18)
                  ? true : undefined
              }
              aria-describedby="dob-hint dob-error"
              style={{ fontSize: '16px' }}
            />
            {dobDisplay.replace(/\D/g, '').length === 8 && !parseDobToIso(dobDisplay) && (
              <p id="dob-error" role="alert" className="mt-1 text-xs text-red-600 ml-1">Please check your date of birth</p>
            )}
            {dobDisplay.replace(/\D/g, '').length === 8 && parseDobToIso(dobDisplay) && calculateAge(parseDobToIso(dobDisplay)!) < 18 && (
              <p id="dob-error" role="alert" className="mt-1 text-xs text-red-600 ml-1">You must be at least 18 to use Parallel</p>
            )}
            <p id="dob-hint" className="mt-1.5 text-xs text-gray-500 ml-1">
              🔒 Used to verify you're 18+ and auto-fill your age in the questionnaire. Never shown publicly.
            </p>
          </div>

          {/* REQUIRED: Terms of Service + Privacy Policy clickwrap — legal record of consent.
              SMS consent is collected separately on PhoneVerificationPage. */}
          <div
            className={`flex items-start gap-3 p-4 rounded-2xl border-2 transition-colors cursor-pointer ${
              agreedToTerms ? 'border-parallel-void bg-gray-50' : 'border-gray-200'
            }`}
            onClick={() => setAgreedToTerms(!agreedToTerms)}
          >
            <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
              agreedToTerms ? 'bg-parallel-void border-parallel-void' : 'border-gray-300'
            }`}>
              {agreedToTerms && (
                <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                  <path d="M1 4L4.5 7.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed select-none">
              I have read and agree to Parallel's{' '}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onNavigate?.('terms-service'); }}
                className="underline text-parallel-void font-medium"
              >
                Terms of Service
              </button>
              {' '}and{' '}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onNavigate?.('privacy-policy'); }}
                className="underline text-parallel-void font-medium"
              >
                Privacy Policy
              </button>
              , including the collection and processing of my personal information for compatibility matching.
            </p>
          </div>

          {/* SMS consent is captured on PhoneVerificationPage, not here —
              keeps account creation friction low and presents the SMS opt-in
              at the moment the user actually provides their phone number. */}

          <button
            type="submit"
            disabled={isLoading || !agreedToTerms}
            className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full hover:bg-parallel-purple/90 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <button onClick={onBack} className="text-gray-600 hover:text-parallel-void transition-colors">
            ← Back to Sign In
          </button>
        </div>
      </div>

      {onNavigate && <AppFooter onNavigate={onNavigate} />}
    </div>
  );
}