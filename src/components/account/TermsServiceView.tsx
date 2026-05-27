import { FileText, ChevronLeft } from 'lucide-react';

interface TermsServiceViewProps {
  onBack: () => void;
}

export function TermsServiceView({ onBack }: TermsServiceViewProps) {
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
          <FileText className="w-8 h-8" />
          <h1>Terms of Service</h1>
        </div>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-8">Last updated: May 26, 2026</p>

          <div className="space-y-6 text-gray-700 leading-relaxed">

            <section>
              <h2 className="mb-3 font-semibold">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Parallel ("the Service," "we," "us," or "our"), you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy. If you do not agree to these Terms, do not use the Service. These Terms constitute a binding legal agreement between you and PARALLEL VIP LLC, a Washington limited liability company.
              </p>
              <p className="mt-3">
                If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">2. Eligibility</h2>
              <p>You must meet all of the following requirements to use Parallel:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>You are at least 18 years of age</li>
                <li>You are not prohibited from using the Service under applicable federal, state, or local law</li>
                <li>You have not been convicted of a felony, a sex crime, or any crime involving violence or physical harm to another person</li>
                <li>You are not required to register as a sex offender with any government authority in any jurisdiction</li>
                <li>You are not a competitor of Parallel and are not accessing the Service for competitive intelligence or benchmarking purposes</li>
                <li>You are not accessing the Service on behalf of a third party without their explicit authorization</li>
              </ul>
              <p className="mt-3">
                By using the Service, you represent and warrant that you meet all of the above requirements and that your representations are truthful, accurate, and complete.
              </p>
              <p className="mt-3">
                <strong>Minors.</strong> The Service is intended exclusively for users 18 years of age and older. We do not knowingly collect personal information from anyone under 18. If we become aware that a user is under 18, we will immediately terminate their account and delete their associated data. If you believe a minor is using the Service, please report it immediately to legal@getparallel.vip. This Service is not directed to children as defined under the Children's Online Privacy Protection Act (COPPA), and we do not knowingly collect personal information from children under 13.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">3. Account Registration</h2>
              <p>
                You must provide accurate, current, and complete information when creating your account and are responsible for keeping that information updated. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. You may not share your account with any other person or create multiple accounts. We reserve the right to suspend or terminate any account that contains inaccurate, misleading, or fraudulent information.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">4. Identity Verification</h2>
              <p>
                Parallel uses a third-party identity verification service (currently Persona Technologies, Inc.) to verify user identities. Verification is optional but verified users receive a visible checkmark on their profile.
              </p>
              <p className="mt-3">
                <strong>Important limitations of verification.</strong> A verified badge confirms only that a user's government-issued ID matched their selfie at the time of verification. It does not constitute a background check, a guarantee of the user's good character, a representation that the user's stated information is accurate, or any assurance of safety. Parallel does not currently conduct criminal background checks on users.
              </p>
              <p className="mt-3">
                By completing verification, you consent to the collection and processing of your government-issued ID and biometric data by our verification partner, subject to their privacy policy and our Consumer Health Data Privacy Policy. Verified status may be revoked if we detect fraudulent activity.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">5. Compatibility Matching and Non-Discrimination</h2>
              <p>
                <strong>How matching works.</strong> Parallel's matching algorithm uses questionnaire responses to calculate compatibility scores. Users voluntarily disclose information including relationship goals, values, lifestyle preferences, religious beliefs, political views, and other personal characteristics. This information is used solely to assess stated preference alignment between users — not to exclude any user from access to the platform, and not to make value judgments about any group or individual.
              </p>
              <p className="mt-3">
                <strong>Non-discrimination in access.</strong> Parallel does not discriminate against users in the provision of access to the Service on the basis of race, color, national origin, religion, sex, sexual orientation, gender identity or expression, disability, age, marital status, military or veteran status, or any other characteristic protected by applicable federal, state, or local law, including Washington's Law Against Discrimination (RCW 49.60), the California Unruh Civil Rights Act, and equivalent statutes.
              </p>
              <p className="mt-3">
                <strong>Compatibility scores.</strong> Compatibility scores are statistical estimates based solely on self-reported questionnaire data. They are not endorsements, value judgments, or representations about any user's worth, character, or suitability as a partner. We make no guarantee that any match will be suitable, safe, or accurate.
              </p>
              <p className="mt-3">
                <strong>User preferences.</strong> Users may express personal preferences in their questionnaire responses. Parallel presents compatible profiles based on those stated preferences. Parallel is not responsible for the preferences users choose to express and does not endorse or validate any particular preference.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">6. Prohibited Conduct</h2>
              <p>You agree not to use the Service to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Post inaccurate, false, or misleading information on your profile</li>
                <li>Impersonate any person or use photos that are not of you</li>
                <li>Harass, abuse, stalk, threaten, intimidate, or demean any user</li>
                <li>Refuse to interact with, harass, or demean any user on the basis of race, color, national origin, religion, sex, sexual orientation, gender identity, disability, or any other protected characteristic</li>
                <li>Solicit money, financial information, gifts, or other items of value from other users</li>
                <li>Advertise, promote, or solicit any commercial services, products, or third-party platforms</li>
                <li>Send unsolicited bulk messages, spam, or repetitive communications</li>
                <li>Attempt to access other users' accounts, personal data, or private communications</li>
                <li>Engage in any form of romantic fraud, catfishing, or misrepresentation of identity</li>
                <li>Use the Service for any illegal purpose or in violation of any applicable law or regulation</li>
                <li>Upload, transmit, or distribute malware, viruses, or malicious code</li>
                <li>Scrape, crawl, or extract data from the Service by automated means</li>
                <li>Defame, libel, or make false statements about any user or third party</li>
                <li>Use the Service to arrange commercial sexual services or engage in human trafficking of any kind</li>
                <li>Facilitate or encourage any of the above conduct by others</li>
              </ul>
              <p className="mt-3">
                Violation of these rules may result in immediate account termination without refund and, where appropriate, referral to law enforcement.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">7. Content and Intellectual Property</h2>
              <p>
                <strong>Your content.</strong> You retain ownership of content you post on Parallel, including photos and written content. By posting content, you grant Parallel a worldwide, non-exclusive, royalty-free, sublicensable license to use, store, copy, display, and distribute your content solely for the purpose of operating, improving, and promoting the Service. You represent that you own or have all rights necessary to grant this license, and that your content does not infringe any third party's intellectual property, privacy, or other rights.
              </p>
              <p className="mt-3">
                <strong>Restrictions on use of your content.</strong> We do not sell your photos, questionnaire responses, or personal data to third parties. We do not use your profile photos or questionnaire responses to train third-party artificial intelligence models. We may use aggregated, de-identified data to improve Parallel's matching algorithm.
              </p>
              <p className="mt-3">
                <strong>Parallel's intellectual property.</strong> The Service, including its design, features, algorithm, and content created by Parallel, is owned by PARALLEL VIP LLC and protected by copyright, trademark, and other applicable law. You may not copy, modify, distribute, or create derivative works from any part of the Service without our express written permission.
              </p>
              <p className="mt-3">
                <strong>Content removal.</strong> We may remove any content that violates these Terms or that we determine in our sole discretion is harmful, offensive, illegal, or otherwise inappropriate, without notice or liability.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">8. Subscription and Billing</h2>
              <p>
                Parallel offers annual paid membership plans. By subscribing, you authorize us to charge your payment method on a recurring basis at the then-current rate for your selected plan. Prices are displayed at checkout and may change with 30 days' notice to active subscribers.
              </p>
              <p className="mt-3 font-medium">
                AUTO-RENEWAL DISCLOSURE (ROSCA): YOUR SUBSCRIPTION WILL AUTOMATICALLY RENEW AT THE END OF EACH BILLING PERIOD AT THE THEN-CURRENT RATE UNLESS YOU CANCEL BEFORE THE RENEWAL DATE. For annual subscriptions, we will send you a renewal reminder no fewer than 7 days before your renewal date. We retain a timestamped record of your subscription consent, including the date, plan selected, and price agreed to.
              </p>
              <p className="mt-3">
                <strong>Cancellation:</strong> You may cancel your subscription at any time through Account Settings → Cancel Subscription. Cancellation takes effect at the end of your current billing period. You retain access to paid features until that date.
              </p>
              <p className="mt-3">
                <strong>Pause:</strong> You may pause your subscription at any time through Account Settings. Pausing hides your profile and suspends billing. Your questionnaire data and existing matches are preserved. When you resume, a new billing cycle starts at the current rate.
              </p>
              <p className="mt-3">
                <strong>Refunds:</strong> All subscription fees are non-refundable except where required by applicable law. We do not provide partial refunds for unused portions of a billing period. See our Refund Policy for details.
              </p>
              <p className="mt-3">
                <strong>Payment processing:</strong> All payments are processed by our third-party payment processor. Your payment information is stored and processed by the payment processor and is not retained on Parallel's servers. We are not responsible for errors or failures caused by your payment provider.
              </p>
              <p className="mt-3">
                <strong>Chargebacks:</strong> Initiating an unjustified chargeback or payment dispute may result in immediate account suspension.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">9. Safety</h2>
              <p>
                Parallel is committed to your safety but cannot guarantee that all users will behave appropriately, honestly, or safely. <strong>YOU ASSUME ALL RISK</strong> associated with interactions with other users of the Service, whether online or in person. Parallel is not responsible for the conduct, statements, or actions of any user before, during, or after any in-person meeting arranged through the Service.
              </p>
              <p className="mt-3">
                <strong>No background checks.</strong> Parallel does not conduct criminal background checks on users. Identity verification confirms only that a user's ID matched their selfie — it is not a safety guarantee. You are solely responsible for conducting your own due diligence before meeting any user in person.
              </p>
              <p className="mt-3">
                <strong>Financial risk.</strong> Parallel is not responsible for any financial loss, including loss resulting from romantic fraud or deception by other users. Never send money, financial information, gift cards, or other items of value to someone you have not met in person and verified independently.
              </p>
              <p className="mt-3">
                <strong>Safety recommendations.</strong> We strongly encourage you to: (a) meet new matches in public places for initial meetings; (b) inform a trusted friend or family member of your plans; (c) control your own transportation; (d) conduct a video call before meeting in person; (e) trust your instincts and leave any situation that feels unsafe.
              </p>
              <p className="mt-3">
                <strong>Reporting.</strong> Please use our in-app reporting and blocking tools to report any suspicious, threatening, or abusive behavior. Reports are reviewed by our Trust &amp; Safety team.
              </p>
              <p className="mt-3">
                <strong>Release.</strong> To the fullest extent permitted by applicable law, you release PARALLEL VIP LLC and its officers, members, employees, and agents from any and all claims, demands, damages, or losses arising from your interactions with other users, including any physical harm, emotional distress, financial loss, or property damage.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">10. Termination</h2>
              <p>
                We may suspend or terminate your account at any time, for any reason or no reason, including violation of these Terms, without notice or liability to you. Upon termination, your right to use the Service ceases immediately and we may delete your account data in accordance with our Privacy Policy.
              </p>
              <p className="mt-3">
                You may delete your account at any time through Account Settings → Delete Account. Deleting your account does not entitle you to a refund of any prepaid fees.
              </p>
              <p className="mt-3">
                Sections 7, 9, 12, 13, 14, 15, and 16 survive termination of your account or these Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">11. Disclaimers</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
              </p>
              <p className="mt-3">
                WE DO NOT WARRANT THAT: (a) THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE; (b) ANY DEFECTS WILL BE CORRECTED; (c) THE SERVICE IS FREE OF VIRUSES OR HARMFUL COMPONENTS; (d) THE RESULTS OF USING THE SERVICE WILL MEET YOUR EXPECTATIONS.
              </p>
              <p className="mt-3">
                WE MAKE NO REPRESENTATIONS THAT ANY MATCH IS SUITABLE, COMPATIBLE, SAFE, OR ACCURATE. COMPATIBILITY SCORES ARE STATISTICAL ESTIMATES BASED ON SELF-REPORTED QUESTIONNAIRE DATA AND DO NOT CONSTITUTE PROFESSIONAL ADVICE OF ANY KIND. WE ARE NOT RESPONSIBLE FOR THE ACCURACY, HONESTY, OR COMPLETENESS OF ANY USER'S PROFILE OR SELF-REPRESENTATION. WE ARE NOT RESPONSIBLE FOR ANY HARM — PHYSICAL, EMOTIONAL, FINANCIAL, OR OTHERWISE — RESULTING FROM YOUR INTERACTIONS WITH OTHER USERS.
              </p>
              <p className="mt-3">
                SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES. IN SUCH JURISDICTIONS, THE ABOVE EXCLUSIONS APPLY TO THE MAXIMUM EXTENT PERMITTED BY LAW.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">12. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, PARALLEL VIP LLC AND ITS OFFICERS, MEMBERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, GOODWILL, RELATIONSHIPS, OR PERSONAL INJURY, ARISING FROM OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE, REGARDLESS OF THE THEORY OF LIABILITY AND EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
              <p className="mt-3">
                OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY AND ALL CLAIMS ARISING FROM THESE TERMS OR YOUR USE OF THE SERVICE SHALL NOT EXCEED THE GREATER OF: (a) THE TOTAL AMOUNT YOU PAID TO US IN THE 12 MONTHS IMMEDIATELY PRECEDING THE CLAIM, OR (b) ONE HUNDRED U.S. DOLLARS ($100).
              </p>
              <p className="mt-3">
                THE LIMITATIONS IN THIS SECTION APPLY TO THE MAXIMUM EXTENT PERMITTED BY LAW. SOME JURISDICTIONS DO NOT ALLOW LIMITATION OF LIABILITY FOR PERSONAL INJURY OR CERTAIN CATEGORIES OF DAMAGES; IN SUCH JURISDICTIONS OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">13. Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless PARALLEL VIP LLC and its officers, members, employees, contractors, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any third party's rights, including privacy, intellectual property, or personal rights; (d) any content you post or transmit through the Service; or (e) your interaction with any other user, online or in person.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">14. Dispute Resolution and Arbitration</h2>
              <p>
                <strong>Informal Resolution First.</strong> Before filing any claim or arbitration demand, you agree to contact us at legal@getparallel.vip and attempt in good faith to resolve the dispute informally for at least 30 days. Many concerns can be resolved quickly this way.
              </p>
              <p className="mt-3">
                <strong>Binding Individual Arbitration.</strong> If informal resolution fails, any dispute, claim, or controversy arising out of or relating to these Terms or the Service — including questions about the validity, enforceability, or scope of this arbitration agreement — shall be resolved exclusively by binding individual arbitration administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules (available at adr.org), except as stated below.
              </p>
              <p className="mt-3">
                <strong>Seat and Format.</strong> Arbitration shall be seated in King County, Washington. Either party may elect to conduct the arbitration virtually.
              </p>
              <p className="mt-3">
                <strong>Arbitration Fees.</strong> For claims under $10,000, Parallel will pay all AAA filing and administrative fees. For claims over $10,000, fee allocation follows the Consumer Arbitration Rules. Each party bears their own attorneys' fees unless the arbitrator determines a claim was frivolous, in which case the arbitrator may award fees to the prevailing party.
              </p>
              <p className="mt-3">
                <strong>Small Claims Exception.</strong> Either party may bring an individual claim in small claims court in King County, Washington, or in the small claims court where you reside, if the claim qualifies under that court's jurisdictional limits, without first engaging in informal dispute resolution.
              </p>
              <p className="mt-3">
                <strong>CLASS ACTION WAIVER.</strong> TO THE MAXIMUM EXTENT PERMITTED BY LAW, YOU WAIVE ANY RIGHT TO BRING OR PARTICIPATE IN A CLASS ACTION, CLASS-WIDE ARBITRATION, PRIVATE ATTORNEY GENERAL ACTION, OR ANY OTHER REPRESENTATIVE PROCEEDING. ALL CLAIMS MUST BE BROUGHT SOLELY IN AN INDIVIDUAL CAPACITY. This waiver is a material term of these Terms; if it is found unenforceable, the entire arbitration agreement shall be void.
              </p>
              <p className="mt-3">
                <strong>Injunctive Relief.</strong> Notwithstanding the above, either party may seek emergency injunctive or other equitable relief in a court of competent jurisdiction to prevent irreparable harm pending arbitration.
              </p>
              <p className="mt-3">
                <strong>Opt-Out Right.</strong> You may opt out of this arbitration agreement by sending an email to legal@getparallel.vip with the subject line "Arbitration Opt-Out" within 30 days of first accepting these Terms. Opting out does not affect any other provision of these Terms.
              </p>
              <p className="mt-3">
                <strong>Survival.</strong> This arbitration agreement survives termination of your account and these Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">15. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the State of Washington, without regard to its conflict of law principles. Subject to the arbitration agreement above, you consent to the exclusive jurisdiction of the state and federal courts located in King County, Washington for any disputes not subject to arbitration.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">16. Washington State and Federal Compliance</h2>
              <p>
                <strong>Washington Law Against Discrimination (RCW 49.60).</strong> Parallel operates in compliance with Washington's Law Against Discrimination. We do not engage in discriminatory practices in the provision of access to or services within the Service.
              </p>
              <p className="mt-3">
                <strong>Washington My Health MY Data Act (MHMDA).</strong> We collect consumer health data — including information that may indicate mental or behavioral health, sexual orientation, and relationship patterns — as part of our compatibility questionnaire. This data is governed by our Consumer Health Data Privacy Policy. You have the right to confirm what health data we collect, access it, delete it, and withdraw consent for its processing at any time.
              </p>
              <p className="mt-3">
                <strong>Washington Consumer Protection Act (RCW 19.86).</strong> Our business practices are designed to comply with the Washington Consumer Protection Act. If you believe we have engaged in unfair or deceptive acts or practices, you may contact us or file a complaint with the Washington State Attorney General's Office.
              </p>
              <p className="mt-3">
                <strong>COPPA.</strong> We do not knowingly collect personal information from children under 13. See Section 2 for our full minor exclusion policy.
              </p>
              <p className="mt-3">
                <strong>ROSCA.</strong> Our auto-renewal practices comply with the Restore Online Shoppers' Confidence Act. See Section 8 for full disclosure.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">17. Accessibility</h2>
              <p>
                Parallel is committed to making the Service accessible to users with disabilities. We are working to conform to the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA as an ongoing effort.
              </p>
              <p className="mt-3">
                <strong>Accessibility contact.</strong> If you experience difficulty accessing any part of the Service due to a disability, or if you need content in an alternative format, please contact us at legal@getparallel.vip with the subject line "Accessibility Request." We will make reasonable efforts to accommodate your needs and respond within 5 business days.
              </p>
              <p className="mt-3">
                <strong>Good-faith commitment.</strong> We conduct periodic accessibility audits and work to remediate identified barriers. Our goal is that no user is excluded from the Service due to a disability.
              </p>
              <p className="mt-3">
                <strong>Limitation.</strong> While we make every reasonable effort to ensure accessibility, we cannot guarantee that the Service is fully accessible in all respects or on all devices and assistive technologies at all times. We will work to address reported barriers promptly.
              </p>
              <p className="mt-3">
                <strong>Third-party content.</strong> Some functionality is provided by third parties (such as payment processors or identity verification providers) whose accessibility standards we do not control. We encourage users who experience accessibility issues with third-party components to contact us so we can work with those providers.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">18. Additional Disclaimers</h2>
              <p>
                <strong>No professional advice.</strong> Nothing in the Service constitutes relationship counseling, psychological advice, medical advice, or professional advice of any kind. Compatibility scores and match suggestions are algorithmic outputs, not professional recommendations.
              </p>
              <p className="mt-3">
                <strong>No guarantee of results.</strong> Parallel does not guarantee that you will meet a romantic partner, form a relationship, or have any particular experience through the Service. Individual results vary.
              </p>
              <p className="mt-3">
                <strong>Third-party links.</strong> The Service may contain links to third-party websites or services. We are not responsible for the content, privacy practices, or conduct of any third-party site.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">19. Changes to Terms</h2>
              <p>
                We may update these Terms at any time. We will notify you of material changes via email to your registered address and via in-app notice at least 14 days before the updated Terms take effect. Your continued use of the Service after the effective date constitutes your acceptance of the updated Terms. If you do not agree to the updated Terms, you must stop using the Service and may delete your account.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">20. Miscellaneous</h2>
              <p>
                <strong>Entire agreement.</strong> These Terms, together with our Privacy Policy, Consumer Health Data Privacy Policy, Community Guidelines, and Refund Policy, constitute the entire agreement between you and Parallel regarding the Service.
              </p>
              <p className="mt-3">
                <strong>Severability.</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect. The unenforceable provision will be modified to the minimum extent necessary to make it enforceable.
              </p>
              <p className="mt-3">
                <strong>Waiver.</strong> Our failure to enforce any right or provision of these Terms shall not constitute a waiver of that right or provision.
              </p>
              <p className="mt-3">
                <strong>Assignment.</strong> You may not assign your rights under these Terms without our written consent. We may assign our rights without restriction, including in connection with a merger, acquisition, or sale of assets.
              </p>
              <p className="mt-3">
                <strong>Force Majeure.</strong> We are not liable for any failure or delay in performance resulting from causes beyond our reasonable control, including acts of God, natural disasters, pandemics, government actions, or internet service disruptions.
              </p>
              <p className="mt-3">
                <strong>No Third-Party Beneficiaries.</strong> These Terms do not create any third-party beneficiary rights.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">21. Contact</h2>
              <p>
                Questions about these Terms? Contact us at{' '}
                <a href="mailto:legal@getparallel.vip" className="underline">legal@getparallel.vip</a>.
              </p>
              <p className="mt-3">
                Accessibility concerns: <a href="mailto:legal@getparallel.vip" className="underline">legal@getparallel.vip</a> (subject: "Accessibility Request")
              </p>
              <p className="mt-3">
                PARALLEL VIP LLC<br />
                522 W Riverside Ave, Ste N<br />
                Spokane, WA 99201
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
