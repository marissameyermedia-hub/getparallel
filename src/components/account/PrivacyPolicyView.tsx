import { Shield, ChevronLeft } from 'lucide-react';

interface PrivacyPolicyViewProps {
  onBack: () => void;
}

export function PrivacyPolicyView({ onBack }: PrivacyPolicyViewProps) {
  return (
    <div className="min-h-screen bg-white pt-6 pb-36 px-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={28} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8" />
          <h1>Privacy Policy</h1>
        </div>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-8">Last updated: April 21, 2026</p>

          <div className="space-y-6 text-gray-700 leading-relaxed">
            <section>
              <h2 className="mb-3 font-semibold">1. Overview</h2>
              <p>
                Parallel ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, share, and protect your personal information when you use our dating and matchmaking service. By using Parallel, you agree to the practices described in this policy.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">2. Information We Collect</h2>
              <p className="mb-3"><strong>Information you provide directly:</strong></p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Account information: name, email address, phone number, date of birth</li>
                <li>Profile information: photos, bio, career, education, Instagram handle, pronouns</li>
                <li>Questionnaire responses: lifestyle, values, relationship preferences, dealbreakers</li>
                <li>Messages and communications with other users</li>
                <li>Feedback you submit about matches or dates</li>
                <li>Referral codes you share or use</li>
              </ul>
              <p className="mb-3"><strong>Identity verification data (if you choose to verify):</strong></p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Government-issued ID document images</li>
                <li>Facial biometric data processed by our verification partner, Persona Technologies, Inc.</li>
              </ul>
              <p className="mb-3"><strong>Information collected automatically:</strong></p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>Location data (city and approximate location for match distance calculations)</li>
                <li>Device information and browser type</li>
                <li>Usage data: features used, pages viewed, interactions with matches</li>
              </ul>
              <p className="mb-3"><strong>Payment information:</strong></p>
              <p>
                Payment details are collected and stored directly by our payment processor. We receive only a tokenized reference to your payment method and subscription status. We do not store your full credit card number.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">3. Sensitive Personal Information</h2>
              <p>
                As a dating app, we necessarily process certain sensitive categories of personal information, including information that may reveal your sexual orientation, relationship preferences, and religious or political beliefs (through questionnaire responses). We also process biometric data if you choose to verify your identity.
              </p>
              <p className="mt-3">
                We handle this sensitive information with heightened care. We do not sell sensitive personal information. We do not use it for targeted advertising. Attachment style results are stored privately and are never shown to your matches or used to restrict who you are shown.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">4. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>To create and manage your account</li>
                <li>To generate compatibility scores and match you with other users</li>
                <li>To refine your matches based on feedback you provide</li>
                <li>To verify your identity and display a verified badge on your profile</li>
                <li>To send you email and SMS notifications about matches, messages, and app updates</li>
                <li>To process your subscription payments</li>
                <li>To detect and prevent fraud, abuse, and safety violations</li>
                <li>To improve our matching algorithm and app features</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">5. Information Sharing</h2>
              <p className="mb-3">We share your information only in the following circumstances:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>With your matches:</strong> Your profile photos, bio, career, education, and compatibility information are visible to users you are matched with. Your phone number, email, and questionnaire answers are never shown to other users.</li>
                <li><strong>Service providers:</strong> We share data with trusted third-party vendors including Supabase (database and authentication), Resend (email), Persona (identity verification), and Telnyx (SMS). These providers are contractually bound to protect your data.</li>
                <li><strong>Legal compliance:</strong> We may disclose information when required by law, court order, or to protect the safety of our users or the public.</li>
                <li><strong>Business transfers:</strong> If Parallel is acquired or merges with another company, your information may be transferred as part of that transaction. We will notify you before your information is transferred.</li>
              </ul>
              <p className="mt-3 font-medium">We do not sell your personal information. We do not share your data with advertisers.</p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">6. Communications</h2>
              <p>
                By creating an account, you consent to receive transactional communications from us by email about your account, matches, and subscription. You can manage your notification preferences in Account Settings.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">6.1 SMS and Mobile Information</h2>
              <p className="mb-3">
                Parallel may send SMS (text messages) to verify your phone number and to notify you about account activity, including new matches and messages. <strong>SMS messaging is optional and requires your explicit, separate consent — it is never bundled with our Terms of Service.</strong> You can opt in during signup or later from your notification settings.
              </p>
              <p className="mb-2"><strong>What we send by SMS:</strong></p>
              <ul className="list-disc pl-5 mb-3 space-y-1">
                <li>One-time verification codes when you sign up or sign in</li>
                <li>Account notifications (such as new match and message alerts)</li>
                <li>Service updates that are essential to your use of Parallel</li>
              </ul>
              <p className="mb-2"><strong>What we will never do with your mobile information:</strong></p>
              <blockquote className="border-l-2 border-gray-300 pl-4 my-3 italic text-gray-700">
                No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Information sharing with subcontractors in support services, such as customer service, is permitted. All other use case categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.
              </blockquote>
              <p className="mb-2"><strong>How to opt out:</strong></p>
              <ul className="list-disc pl-5 mb-3 space-y-1">
                <li>Reply STOP to any text message from Parallel at any time</li>
                <li>Reply HELP for assistance</li>
                <li>Toggle SMS off in your account notification settings</li>
              </ul>
              <p>
                Message frequency varies based on your account activity and matches. Standard message and data rates from your mobile carrier may apply. Consent to receive SMS is not a condition of using Parallel — if you choose not to opt in, we will send your verification code by email instead, and you can opt in to SMS later at any time. For questions about how we handle your mobile information, contact <a href="mailto:privacy@getparallel.vip" className="underline">privacy@getparallel.vip</a>.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">7. Data Security</h2>
              <p>
                We implement industry-standard technical and organizational security measures including encrypted data transmission (TLS), row-level security on our database, and access controls limiting who can view your data. However, no method of transmission over the internet is completely secure. We encourage you to use a strong password and to contact us immediately if you suspect unauthorized access to your account.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">8. Data Retention</h2>
              <p>
                We retain your personal information for as long as your account is active. When you delete your account, we will delete your profile, photos, messages, and questionnaire data within 30 days. Some information may be retained longer where required by law or for legitimate safety purposes (such as records of reported users). Aggregated, anonymized analytics data that cannot identify you may be retained indefinitely.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">9. Your Privacy Rights</h2>
              <p className="mb-3">Depending on your location, you may have the following rights regarding your personal information:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                <li><strong>Correction:</strong> Update or correct inaccurate information through your profile and account settings</li>
                <li><strong>Deletion:</strong> Request deletion of your account and personal data via Account Settings or by emailing privacy@getparallel.vip</li>
                <li><strong>Portability:</strong> Request your data in a structured, machine-readable format</li>
                <li><strong>Objection:</strong> Object to certain uses of your data</li>
                <li><strong>Opt-out of sale:</strong> We do not sell personal information, but you may submit a formal opt-out request at any time</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, email us at privacy@getparallel.vip. We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">10. Washington State Privacy Rights</h2>
              <p>
                If you are a Washington State resident, you have additional rights under the Washington My Health MY Data Act with respect to sensitive health data, which may include data revealing your mental health, sexual orientation, and biometric information. To exercise these rights, contact us at privacy@getparallel.vip.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">11. California Privacy Rights (CCPA)</h2>
              <p>
                If you are a California resident, you have the right to know what personal information we collect and how it is used, to request deletion of your personal information, to opt out of the sale of personal information (we do not sell personal information), and to non-discrimination for exercising your privacy rights. To submit a CCPA request, email privacy@getparallel.vip.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">12. Data Breach Notification</h2>
              <p>
                In the event of a data breach that affects your personal information, we will notify you promptly upon discovery — and no later than 72 hours after becoming aware of the breach where required by applicable law. Our notification will describe what data was affected, what steps we have taken to address the incident, and what actions we recommend you take to protect yourself. We will also notify applicable regulatory authorities within the timeframes required by law. To report a suspected security issue, email us at legal@getparallel.vip.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">13. Children's Privacy</h2>
              <p>
                Parallel is not intended for anyone under the age of 18. We do not knowingly collect personal information from anyone under 18. If we become aware that we have collected personal data from a person under 18, we will delete that information promptly. If you believe a minor has created an account, please contact us at privacy@getparallel.vip.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">14. Cookies and Tracking</h2>
              <p>
                We use browser local storage and session data to maintain your login session and remember your preferences. We do not use third-party advertising cookies or tracking pixels. We may use anonymized analytics to understand how users interact with the app.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">15. Third-Party Services</h2>
              <p className="mb-2">Parallel integrates with the following third-party services, each governed by their own privacy policies:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Supabase — database, authentication, and storage</li>
                <li>Our payment processor — payment processing</li>
                <li>Resend — transactional email delivery</li>
                <li>Telnyx — SMS notifications</li>
                <li>Persona Technologies — identity verification</li>
                <li>Google Maps — location search and geocoding</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">16. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notice at least 14 days before they take effect. The "Last updated" date at the top of this page reflects the most recent revision.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">17. Contact Us</h2>
              <p>
                For privacy questions, requests, or concerns, contact us at privacy@getparallel.vip. For general legal matters, contact legal@getparallel.vip.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}