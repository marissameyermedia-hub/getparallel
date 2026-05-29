import { Users, ChevronLeft } from 'lucide-react';

interface CommunityGuidelinesViewProps {
  onBack: () => void;
}

export function CommunityGuidelinesView({ onBack }: CommunityGuidelinesViewProps) {
  return (
    <div className="min-h-screen bg-parallel-cream pt-6 pb-36 px-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={28} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <Users className="w-8 h-8" />
          <h1>Community Guidelines</h1>
        </div>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-8">Last updated: May 26, 2026</p>

          <div className="space-y-6 text-gray-700 leading-relaxed">
            <section>
              <p className="mb-4">
                Parallel is a community built on respect, honesty, and meaningful connections. These guidelines help ensure everyone has a positive and safe experience.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Be Respectful</h2>
              <p className="mb-3">Treat others with kindness and respect, even if you're not interested in connecting.</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Communicate clearly and considerately</li>
                <li>Accept rejection gracefully</li>
                <li>Respect boundaries and personal space</li>
                <li>Use inclusive and appropriate language</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Be Honest</h2>
              <p className="mb-3">Authenticity is the foundation of meaningful connections.</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use recent, accurate photos of yourself only</li>
                <li>Provide truthful information in your profile and questionnaire</li>
                <li>Don't impersonate others or create fake accounts</li>
                <li>Be upfront about your intentions and relationship goals</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Be Safe</h2>
              <p className="mb-3">Protect yourself and others by following these safety practices:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Don't share financial information or send money</li>
                <li>Keep conversations on the platform until you're comfortable</li>
                <li>Meet in public places for first dates</li>
                <li>Tell a friend where you're going and when you'll be back</li>
                <li>Trust your instincts and report concerning behavior</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Prohibited Content & Behavior</h2>
              <p className="mb-3">The following are strictly prohibited and will result in account suspension or termination:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Harassment or bullying:</strong> Including unwanted sexual advances, threats, or stalking</li>
                <li><strong>Hate speech:</strong> Content that attacks people based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics</li>
                <li><strong>Violence or illegal activity:</strong> Promoting, glorifying, or engaging in violence or illegal activities</li>
                <li><strong>Sexual content:</strong> Nudity, pornography, or sexually explicit content</li>
                <li><strong>Spam or scams:</strong> Fraudulent schemes, pyramid schemes, or commercial solicitation</li>
                <li><strong>Minors:</strong> Anyone under 18 years old</li>
                <li><strong>False information:</strong> Catfishing, fake profiles, or intentionally misleading others</li>
                <li><strong>Account manipulation:</strong> Creating multiple accounts, buying/selling accounts, or manipulating the matching algorithm</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Photo Guidelines</h2>
              <p className="mb-3">Your photos should:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Clearly show your face (at least in your main photo)</li>
                <li>Be recent (taken within the last year)</li>
                <li>Be of you only (no group photos as main photo)</li>
                <li>Be appropriate for all audiences</li>
              </ul>
              <p className="mt-3 mb-3">Your photos should not contain:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Nudity or sexually suggestive content</li>
                <li>Violence, weapons, or illegal substances</li>
                <li>Minors (children under 18)</li>
                <li>Copyrighted images you don't own</li>
                <li>Excessive filters that dramatically alter your appearance</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Reporting Violations</h2>
              <p className="mb-3">
                If you encounter content or behavior that violates these guidelines, please report it immediately. We review all reports promptly and take appropriate action.
              </p>
              <p className="mb-3">To report a user:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Tap the three dots on their profile</li>
                <li>Select "Report"</li>
                <li>Choose the reason and provide details</li>
                <li>Our safety team will investigate as quickly as possible</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Consequences</h2>
              <p className="mb-3">Violations of these guidelines may result in:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Warning:</strong> For minor or first-time violations</li>
                <li><strong>Temporary suspension:</strong> Account access restricted for a period of time</li>
                <li><strong>Permanent ban:</strong> Account terminated for serious or repeated violations</li>
                <li><strong>Legal action:</strong> In cases involving illegal activity or threats to safety</li>
              </ul>
              <p className="mt-3">
                We reserve the right to suspend or terminate accounts at our discretion for any behavior we deem harmful to the community.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Age Requirement</h2>
              <p>
                You must be at least 18 years old to use Parallel. We verify age through date of birth during signup and reserve the right to request additional verification if needed.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Questions?</h2>
              <p>
                If you have questions about these Community Guidelines, please contact us at support@getparallel.vip.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}