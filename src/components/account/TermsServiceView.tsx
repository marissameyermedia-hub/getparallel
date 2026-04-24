import { FileText, ChevronLeft } from 'lucide-react';

interface TermsServiceViewProps {
  onBack: () => void;
}

export function TermsServiceView({ onBack }: TermsServiceViewProps) {
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
          <FileText className="w-8 h-8" />
          <h1>Terms of Service</h1>
        </div>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-8">Last updated: April 17, 2026</p>

          <div className="space-y-6 text-gray-700 leading-relaxed">

            <section>
              <h2 className="mb-3 font-semibold">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Parallel ("the Service," "we," "us," or "our"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, do not use the Service. These Terms constitute a binding legal agreement between you and Parallel.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">2. Eligibility</h2>
              <p>You must meet all of the following requirements to use Parallel:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>You are at least 18 years of age</li>
                <li>You are not prohibited from using the Service under applicable law</li>
                <li>You have not been convicted of a felony, a sex crime, or any crime involving violence</li>
                <li>You are not required to register as a sex offender with any government authority</li>
                <li>You are not a competitor of Parallel and are not accessing the Service for competitive purposes</li>
              </ul>
              <p className="mt-3">
                By using the Service, you represent and warrant that you meet all of the above requirements.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">3. Account Registration</h2>
              <p>
                You must provide accurate, current, and complete information when creating your account and keep it updated. You are responsible for maintaining the confidentiality of your login credentials. You may not share your account with anyone or create multiple accounts. We reserve the right to suspend or terminate accounts with inaccurate or misleading information.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">4. Identity Verification</h2>
              <p>
                Parallel uses a third-party identity verification service (Persona) to verify user identities. Verification is optional but verified users receive a visible checkmark on their profile. By completing verification, you consent to the collection and processing of your government-issued ID and biometric data by our verification partner, subject to their privacy policy. Verified status may be revoked if we detect fraudulent activity.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">5. Prohibited Conduct</h2>
              <p>You agree not to use the Service to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Post inaccurate, false, or misleading information on your profile</li>
                <li>Impersonate any person or use photos that are not of you</li>
                <li>Harass, abuse, stalk, threaten, or intimidate any user</li>
                <li>Solicit money or financial information from other users</li>
                <li>Advertise, promote, or solicit any commercial services</li>
                <li>Engage in any form of discriminatory behavior based on race, ethnicity, religion, gender, sexual orientation, disability, or national origin</li>
                <li>Send unsolicited bulk messages or spam</li>
                <li>Attempt to access other users' accounts or personal data</li>
                <li>Use the Service for any illegal purpose</li>
                <li>Upload malware, viruses, or malicious code</li>
                <li>Scrape, crawl, or extract data from the Service by automated means</li>
              </ul>
              <p className="mt-3">
                Violation of these rules may result in immediate account termination and, where appropriate, referral to law enforcement.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">6. Content and License</h2>
              <p>
                You retain ownership of content you post on Parallel, including photos and written content. By posting content, you grant Parallel a worldwide, non-exclusive, royalty-free, sublicensable license to use, store, copy, display, and distribute your content solely for the purpose of operating and improving the Service. You represent that you have all rights necessary to grant this license.
              </p>
              <p className="mt-3">
                We may remove any content that violates these Terms or that we determine is harmful, offensive, or inappropriate, without notice.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">7. Subscription and Billing</h2>
              <p>
                Parallel offers paid membership plans billed monthly or annually. By subscribing, you authorize us to charge your payment method on a recurring basis at the then-current rate for your selected plan. Prices are displayed at checkout and may change with 30 days' notice.
              </p>
              <p className="mt-3">
                <strong>Cancellation:</strong> You may cancel your subscription at any time through Account Settings. Cancellation takes effect at the end of your current billing period. You will retain access to paid features until that date.
              </p>
              <p className="mt-3">
                <strong>Pause:</strong> You may pause your subscription at any time through Account Settings. Pausing hides your profile and suspends billing immediately. Your questionnaire data and existing matches are preserved. When you resume, a new billing cycle starts at the current rate.
              </p>
              <p className="mt-3">
                <strong>Refunds:</strong> All subscription fees are non-refundable except where required by applicable law. We do not provide partial refunds for unused portions of a billing period.
              </p>
              <p className="mt-3">
                All payments are processed by our payment processor. Your payment information is stored and processed by our payment processor and is not retained on Parallel's servers.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">8. Safety</h2>
              <p>
                Parallel is committed to your safety but cannot guarantee that all users will behave appropriately. You are solely responsible for your interactions with other users, both online and offline. We strongly recommend meeting new people in public places, telling a friend where you are going, and trusting your instincts. Please use our in-app reporting tools to report any suspicious or harmful behavior.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">9. Termination</h2>
              <p>
                We may suspend or terminate your account at any time for any reason, including violation of these Terms, without notice or liability. You may delete your account at any time through Account Settings. Upon termination, your right to use the Service ceases immediately. Sections 6, 10, 11, 12, and 13 survive termination.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">10. Disclaimers</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES. WE MAKE NO GUARANTEES REGARDING THE ACCURACY OF COMPATIBILITY SCORES OR MATCHING OUTCOMES.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">11. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, PARALLEL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE. OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR YOUR USE OF THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">12. Dispute Resolution and Arbitration</h2>
              <p>
                Any dispute arising out of or relating to these Terms or the Service shall be resolved by binding arbitration under the rules of the American Arbitration Association, rather than in court. The arbitration shall be conducted in King County, Washington. You waive any right to a jury trial or to participate in a class action lawsuit. You may opt out of this arbitration agreement by emailing legal@getparallel.vip within 30 days of first accepting these Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">13. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the State of Washington, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">14. Changes to Terms</h2>
              <p>
                We may update these Terms at any time. Material changes will be communicated via email or in-app notice at least 14 days before taking effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">15. Contact</h2>
              <p>
                Questions about these Terms? Contact us at legal@getparallel.vip.
              </p>
              <p className="mt-3">
                <strong>DMCA Designated Agent:</strong> To submit a copyright infringement notice under the Digital Millennium Copyright Act, contact our designated agent: Marissa Meyer, legal@getparallel.vip, 522 W Riverside Ave Ste N, Spokane WA 99201. Registration Number: DMCA-1071612.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}