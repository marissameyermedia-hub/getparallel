import { FileText, ChevronLeft } from 'lucide-react';

interface ConsumerHealthDataPolicyViewProps {
  onBack: () => void;
}

export function ConsumerHealthDataPolicyView({ onBack }: ConsumerHealthDataPolicyViewProps) {
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
          <h1>Consumer Health Data Privacy Policy</h1>
        </div>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-2"><strong>Effective date: April 17, 2026</strong></p>
          <p className="text-sm text-gray-600 mb-8 leading-relaxed">
            This is a standalone privacy policy required under the Washington My Health MY Data Act (Chapter 19.373 RCW). It covers only consumer health data collected by Parallel. For all other privacy practices, see our Privacy Policy.
          </p>

          <div className="space-y-6 text-gray-700 leading-relaxed">

            <section>
              <h2 className="mb-3 font-semibold">1. Who we are</h2>
              <p className="mb-3">
                Parallel is operated by <strong>PARALLEL VIP LLC</strong>, a Washington limited liability company ("Parallel," "we," "us," or "our"). We operate the Parallel dating and matchmaking service at getparallel.vip.
              </p>
              <p>
                For questions about this policy, contact us at <a href="mailto:privacy@getparallel.vip" className="underline">privacy@getparallel.vip</a>.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">2. What this policy covers</h2>
              <p className="mb-3">
                This policy explains how we collect, use, share, and protect <strong>consumer health data</strong> ("CHD") as defined under the Washington My Health MY Data Act. CHD includes personal information that is linked or reasonably linkable to a consumer and that identifies the consumer's past, present, or future physical or mental health status.
              </p>
              <p>
                This policy applies to Washington State residents. Residents of other jurisdictions may have similar rights under their own state laws — see our general Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">3. Categories of consumer health data we collect</h2>
              <p className="mb-3">
                In the course of operating a compatibility-focused dating service, we collect the following categories of CHD:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Biometric data</strong> — facial geometry captured during optional identity verification, processed by our verification partner (Persona Technologies, Inc.)</li>
                <li><strong>Data that may reveal mental or behavioral health status</strong> — responses to questionnaire items that touch on attachment styles, relationship patterns, and emotional wellbeing</li>
                <li><strong>Data that may reveal sexual orientation or reproductive health</strong> — responses indicating gender identity, who you are seeking, and relationship preferences</li>
                <li><strong>Data that could be used to infer health conditions</strong> — lifestyle questionnaire responses relating to diet, exercise, substance use, and sleep</li>
              </ul>
              <p className="mt-3">
                We do not collect: genetic data, precise geolocation data used to identify healthcare facility visits, or data about healthcare services sought or received.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">4. Sources of consumer health data</h2>
              <p className="mb-3">
                We collect CHD only from you directly. Specifically:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Questionnaire responses you provide during onboarding and at any time you edit your answers</li>
                <li>Biometric data provided during optional identity verification (only if you choose to verify)</li>
                <li>Profile information you choose to share</li>
              </ul>
              <p className="mt-3">
                We do not purchase consumer health data from any third party. We do not collect consumer health data from public sources or data brokers.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">5. How we use consumer health data</h2>
              <p className="mb-3">We use CHD strictly for the following specified purposes:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>To generate compatibility scores and match you with other users</li>
                <li>To allow you to filter and express preferences for your matches</li>
                <li>To verify your identity (biometric data only, and only if you choose to verify)</li>
                <li>To improve matching quality based on aggregated, de-identified patterns</li>
              </ul>
              <p className="mt-3 mb-3">We do not use CHD for:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Targeted advertising</li>
                <li>Training third-party machine learning models</li>
                <li>Sale to any third party</li>
                <li>Any purpose we have not disclosed in this policy</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">6. Categories of third parties we share consumer health data with</h2>
              <p className="mb-3">
                We share CHD only with the following categories of service providers, and only as necessary for the specific purposes listed:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Cloud infrastructure provider (Supabase Inc.)</strong> — stores encrypted questionnaire responses so we can generate matches</li>
                <li><strong>Identity verification partner (Persona Technologies, Inc.)</strong> — processes biometric data only if you choose to verify. Persona retains biometric data per its own retention schedule; Parallel receives only a verification pass/fail signal, not the biometric data itself.</li>
              </ul>
              <p className="mt-3 mb-3">We do not share CHD with:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Advertisers, ad networks, or data brokers</li>
                <li>Other users (your questionnaire answers, attachment style results, and verification documents are never shown to your matches)</li>
                <li>Government entities, except when legally compelled by valid subpoena or court order</li>
              </ul>
              <p className="mt-3 font-medium">
                We do not sell consumer health data. We have not sold CHD in the past and have no plans to do so.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">7. Your rights under the Washington My Health MY Data Act</h2>
              <p className="mb-3">If you are a Washington State resident, you have the following rights:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Right to access</strong> — confirm whether we are collecting, sharing, or selling your CHD, and receive a copy of your CHD</li>
                <li><strong>Right to a list of third parties</strong> — receive a list of all third parties and affiliates with whom we have shared your CHD, along with their contact information</li>
                <li><strong>Right to withdraw consent</strong> — withdraw your consent to our collection and sharing of your CHD at any time</li>
                <li><strong>Right to deletion</strong> — request that we delete your CHD. We will pass the deletion request through to any third parties with which we have shared your data.</li>
              </ul>

              <h3 className="mt-4 mb-2 text-base font-semibold">How to exercise your rights</h3>
              <p className="mb-3">
                To exercise any of these rights, email us at <a href="mailto:privacy@getparallel.vip" className="underline">privacy@getparallel.vip</a> with your request.
              </p>
              <p className="mb-3">
                We will respond within <strong>45 days</strong> of receiving your request. If your request is complex, we may take an additional 45 days to respond (90 days total), and we will notify you of the extension within the initial 45-day window.
              </p>
              <p className="mb-3">You may also exercise most of these rights directly within the app:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Access</strong> — download a copy of your data via Account → Privacy &amp; Safety → Download Your Data</li>
                <li><strong>Deletion</strong> — delete your account via Account → Delete Account. Deletion removes all CHD within 30 days and triggers passthrough deletion to our service providers.</li>
                <li><strong>Withdraw consent</strong> — deleting your account also withdraws your consent for all CHD collection and sharing.</li>
              </ul>
              <p className="mt-3">
                You may appeal any denial of your request by emailing <a href="mailto:legal@getparallel.vip" className="underline">legal@getparallel.vip</a> within 30 days of the denial. If your appeal is denied, you may contact the Washington State Attorney General at <a href="https://www.atg.wa.gov" target="_blank" rel="noopener noreferrer" className="underline">atg.wa.gov</a>.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">8. Retention and destruction</h2>
              <p className="mb-3">We retain CHD only as long as necessary to provide the service:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Questionnaire responses:</strong> retained while your account is active. Deleted within 30 days of account deletion.</li>
                <li><strong>Biometric data:</strong> we do not store biometric data directly. Persona (our verification partner) retains biometric data per its own retention schedule. We retain only the verification status (pass/fail) for as long as your account is active.</li>
                <li><strong>Aggregated, de-identified analytics:</strong> retained indefinitely. Cannot be re-associated with any individual.</li>
              </ul>
              <p className="mt-3">
                Upon receiving a valid deletion request, we will destroy the relevant CHD within 30 days and notify all service providers that have received your CHD to do the same.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">9. Security</h2>
              <p className="mb-3">We protect CHD using:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Encrypted data transmission (TLS 1.3 or higher)</li>
                <li>Row-level security on our database (each user's data is accessible only to that user)</li>
                <li>Access controls limiting internal access to data</li>
                <li>Physical security at our cloud infrastructure provider (Supabase / AWS)</li>
              </ul>
              <p className="mt-3">
                If a data breach affects your CHD, we will notify you as required by Washington law and no later than 72 hours after discovery where required by applicable law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">10. Geofencing</h2>
              <p>
                We do not use geofencing technology around healthcare facilities, as prohibited by RCW 19.373.100.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">11. Consent</h2>
              <p className="mb-3">
                Before we collect CHD for any specified purpose, we will obtain your clear and affirmative opt-in consent. Consent for each purpose is collected separately. You may withdraw consent at any time by emailing <a href="mailto:privacy@getparallel.vip" className="underline">privacy@getparallel.vip</a> or by deleting your account.
              </p>
              <p>
                We do not condition the provision of our service on your consent to uses of CHD beyond what is strictly necessary to provide the service.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">12. Changes to this policy</h2>
              <p>
                We may update this policy from time to time. Material changes will be communicated via email or in-app notice at least 14 days before taking effect. The effective date at the top of this page reflects the most recent revision.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">13. Contact</h2>
              <p className="mb-3">For questions about this Consumer Health Data Privacy Policy:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Email: <a href="mailto:privacy@getparallel.vip" className="underline">privacy@getparallel.vip</a></li>
                <li>Mail: PARALLEL VIP LLC, 522 W Riverside Ave, Ste N, Spokane WA 99201</li>
              </ul>
              <p className="mt-3">
                For legal matters: <a href="mailto:legal@getparallel.vip" className="underline">legal@getparallel.vip</a>
              </p>
              <p className="mt-3">
                To file a complaint with the Washington State Attorney General, visit <a href="https://www.atg.wa.gov" target="_blank" rel="noopener noreferrer" className="underline">atg.wa.gov</a>.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}