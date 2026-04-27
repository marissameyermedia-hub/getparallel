import { HelpCircle, Mail, FileText, ChevronLeft } from 'lucide-react';

interface HelpSupportViewProps {
  onBack: () => void;
  onNavigate?: (view: string) => void;
}

export function HelpSupportView({ onBack, onNavigate }: HelpSupportViewProps) {
  return (
    <div className="min-h-screen bg-white pt-6 pb-36 px-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={28} aria-hidden="true" />
        </button>

        <h1 className="mb-3">Help & Support</h1>
        <p className="text-gray-600 mb-8">We're here to help</p>

        {/* Contact Options */}
        <div className="mb-8">
          <h3 className="mb-4">Get Help</h3>
          <div className="space-y-3">
            <a
              href="mailto:support@getparallel.vip"
              className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"
            >
              <Mail className="w-5 h-5 text-gray-600" />
              <div className="flex-1">
                <div className="font-medium">Email Support</div>
                <div className="text-sm text-gray-600">support@getparallel.vip</div>
              </div>
            </a>
          </div>
        </div>

        {/* Safe Dating Tips */}
        <div className="mb-8">
          <h3 className="mb-2">Safe Dating Tips</h3>
          <p className="text-sm text-gray-600 mb-5">
            Meeting someone new is exciting. A few good habits make it a lot safer.
          </p>

          {/* Section 1: Before you meet */}
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Before you meet
            </h4>
            <div className="space-y-3">
              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Never send money or share financial info</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  Don't send money, gift cards, or cryptocurrency to a match — no matter what the reason is. Don't share bank details, investment accounts, or anything that could be used to access your money. Be cautious of anyone who quickly professes strong feelings, has a vague reason they can't meet in person, or has an emergency that only money can solve. These are classic romance scam signals. If a match asks you for money, report it.
                </p>
              </details>

              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Protect your personal information</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  Don't share your home address, exact workplace, or details about your daily routine (like "I'm at the same gym every Tuesday at 7"). If you have kids, avoid sharing their names, photos, schools, or ages with someone you haven't met. Take your time building trust before giving out any of this.
                </p>
              </details>

              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Keep conversations in Parallel at first</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  Stay in Parallel's messaging while you're getting to know someone. People with bad intentions often try to move the conversation to text, WhatsApp, Telegram, or email right away because those channels aren't monitored for safety. If someone is pushing hard to move off-platform before you've even video chatted, that's a red flag.
                </p>
              </details>

              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Video chat before meeting in person</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  A quick video call before a first date helps confirm the person matches their profile and gives you a real sense of who they are. If someone consistently refuses to video chat or has excuses for why they can't, take it seriously.
                </p>
              </details>
            </div>
          </div>

          {/* Section 2: On your date */}
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              On your date
            </h4>
            <div className="space-y-3">
              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Meet in public and stay in public</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  Meet in a populated public place — a coffee shop, restaurant, or busy park. Not at your home, their home, or anywhere private. If your date pressures you to go somewhere private, trust that instinct and end the date.
                </p>
              </details>

              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Tell a friend the plan</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  Tell someone you trust where you're going, who you're meeting, and when you expect to be back. Consider sharing your phone's live location with them for the duration of the date. Keep your phone charged and with you the whole time.
                </p>
              </details>

              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Control your own transportation</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  Get yourself to and from the date so you can leave whenever you want. Don't let your date pick you up from home or drop you off there on a first meeting. If you're driving, have a backup plan — a ride-share app, or a friend on standby.
                </p>
              </details>

              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Know your limits with alcohol and drugs</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  Alcohol and drugs affect judgment and alertness. If your date pressures you to drink more than you're comfortable with, hold your ground or end the date. Keep an eye on your drink at all times — only accept drinks poured or handed to you directly by the bartender or server. Don't leave your phone, purse, or wallet unattended.
                </p>
              </details>
            </div>
          </div>

          {/* Section 3: Trust your instincts */}
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Trust your instincts
            </h4>
            <div className="space-y-3">
              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">If you feel uncomfortable, leave</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  You don't owe anyone an explanation or a full evening. If something feels off — in messages or in person — it's okay to leave. If you're at a bar or restaurant and feel unsafe, ask the bartender or server for help. Many venues train their staff to respond to signals from patrons who don't feel safe.
                </p>
              </details>

              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Use Block and Report anytime</summary>
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                  You can block or report any match directly from their profile or your message thread with them. Blocking is immediate — they're removed from your matches and can't contact you again. Reporting sends the case to our safety team for review. Report anything that crosses a line: harassment, threats, requests for money, fake profiles, anything you feel is wrong.
                </p>
              </details>
            </div>
          </div>

          {/* Section 4: In an emergency */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              In an emergency
            </h4>
            <div className="space-y-3">
              <details className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                <summary className="font-medium cursor-pointer text-red-900">If you're in immediate danger, call 911</summary>
                <p className="mt-3 text-sm text-red-900/80 leading-relaxed">
                  Parallel does not replace emergency services. If you're in danger right now, call 911. If you can't speak, in many areas you can text 911 — check your local emergency services for availability.
                </p>
              </details>

              <details className="p-4 bg-gray-50 rounded-2xl">
                <summary className="font-medium cursor-pointer">Confidential crisis support — 24/7</summary>
                <div className="mt-3 text-sm text-gray-700 leading-relaxed space-y-2">
                  <p>
                    <strong>RAINN (sexual assault):</strong> Call <a href="tel:18006564673" className="underline">800-656-HOPE (4673)</a>, text HOPE to 64673, or chat at <a href="https://rainn.org/hotline" target="_blank" rel="noopener noreferrer" className="underline">rainn.org/hotline</a>. Free, confidential, 24/7.
                  </p>
                  <p>
                    <strong>National Domestic Violence Hotline:</strong> Call <a href="tel:18007997233" className="underline">1-800-799-7233</a> or text "START" to 88788. Free, confidential, 24/7.
                  </p>
                  <p>
                    <strong>988 Suicide &amp; Crisis Lifeline:</strong> Call or text <a href="tel:988" className="underline">988</a>. Free, confidential, 24/7.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-8">
          <h3 className="mb-4">Frequently Asked Questions</h3>
          <div className="space-y-3">
            <details className="p-4 bg-gray-50 rounded-2xl">
              <summary className="font-medium cursor-pointer">How does the matching algorithm work?</summary>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                Our algorithm analyzes your questionnaire responses across 8 categories: Attachment & Emotional Health, Communication & Conflict, Life Goals, Values & Beliefs, Lifestyle Behaviors, Relationship Psychology, Attraction & Preferences, and Life Logistics. We prioritize compatibility in the areas that matter most for long-term relationship success, including communication styles, life goals, and core values.
              </p>
            </details>

            <details className="p-4 bg-gray-50 rounded-2xl">
              <summary className="font-medium cursor-pointer">Can I update my questionnaire answers?</summary>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                Yes — you can edit your responses anytime from My Matching Questionnaire in your account. Your matches will be updated to reflect your new answers.
              </p>
            </details>

            <details className="p-4 bg-gray-50 rounded-2xl">
              <summary className="font-medium cursor-pointer">How do I report inappropriate behavior?</summary>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                You can report any user directly from their profile or message thread. We take all reports seriously and our safety team reviews them as quickly as possible. You can also block users at any time from Privacy & Safety settings.
              </p>
            </details>

            <details className="p-4 bg-gray-50 rounded-2xl">
              <summary className="font-medium cursor-pointer">What if I want to delete my account?</summary>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                You can delete your account from Account Actions in your account settings. This action is permanent and cannot be undone. All your data, matches, and messages will be permanently deleted.
              </p>
            </details>
          </div>
        </div>

        {/* Additional Resources */}
        <div className="bg-gray-50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-6 h-6 text-gray-600" />
            <h3>More Resources</h3>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => onNavigate?.('community-guidelines')}
              className="block text-sm text-gray-700 hover:text-black text-left"
            >
              Community Guidelines
            </button>
            <button
              onClick={() => onNavigate?.('privacy-policy')}
              className="block text-sm text-gray-700 hover:text-black text-left"
            >
              Privacy Policy
            </button>
            <button
              onClick={() => onNavigate?.('terms-service')}
              className="block text-sm text-gray-700 hover:text-black text-left"
            >
              Terms of Service
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}