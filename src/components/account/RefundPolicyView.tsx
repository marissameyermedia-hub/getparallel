import { DollarSign, ChevronLeft } from 'lucide-react';

interface RefundPolicyViewProps {
  onBack: () => void;
}

export function RefundPolicyView({ onBack }: RefundPolicyViewProps) {
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
          <DollarSign className="w-8 h-8" />
          <h1>Refund Policy</h1>
        </div>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-8">Last updated: May 26, 2026</p>

          <div className="space-y-6 text-gray-700 leading-relaxed">
            <section>
              <p className="mb-4">
                At Parallel, we strive to provide a valuable service. This Refund Policy explains our approach to refunds for subscription purchases.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">General Policy</h2>
              <p className="mb-3">
                All subscription purchases on Parallel are <strong>non-refundable</strong>. When you purchase a subscription, you are granted immediate access to premium features, and we cannot reverse this access retroactively.
              </p>
              <p>
                By purchasing a subscription, you acknowledge and agree that you will not be entitled to a refund under any circumstances.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Subscription Types</h2>
              <p className="mb-3">Parallel offers the following subscription option:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Annual Subscription:</strong> $79.00/year, billed annually</li>
              </ul>
              <p className="mt-3">
                All subscriptions automatically renew at the end of each billing period unless canceled before the renewal date.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Cancellation</h2>
              <p className="mb-3">
                You may cancel your subscription at any time through your Account Settings. Cancellation will:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Prevent future charges</li>
                <li>Allow you to continue using premium features until the end of your current billing period</li>
                <li>Not trigger any refund for the current billing period</li>
              </ul>
              <p className="mt-3">
                Once your subscription expires after cancellation, you will lose access to premium features and revert to a free account.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Exceptional Circumstances</h2>
              <p className="mb-3">
                While our general policy is that all sales are final, we may consider refund requests in the following exceptional circumstances:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Technical Error:</strong> If you were charged incorrectly due to a system error</li>
                <li><strong>Duplicate Charges:</strong> If you were accidentally charged multiple times for the same subscription</li>
                <li><strong>Unauthorized Transaction:</strong> If your payment method was used without your authorization</li>
              </ul>
              <p className="mt-3">
                Refund requests for exceptional circumstances must be submitted within 48 hours of the charge via email to support@getparallel.vip. Include:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Your account email address</li>
                <li>Transaction date and amount</li>
                <li>Detailed explanation of the exceptional circumstance</li>
                <li>Any relevant screenshots or documentation</li>
              </ul>
              <p className="mt-3">
                We will review your request and respond within 5-7 business days. Our decision on whether to grant a refund is final and at our sole discretion.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">What is NOT Eligible for Refund</h2>
              <p className="mb-3">The following situations are not eligible for refunds:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Change of mind after purchasing a subscription</li>
                <li>Not finding suitable matches</li>
                <li>Dissatisfaction with match quality or quantity</li>
                <li>Not using the service during your subscription period</li>
                <li>Being banned or suspended for violating our Terms of Service or Community Guidelines</li>
                <li>Technical issues with your device or internet connection</li>
                <li>Forgetting to cancel before renewal</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Free Trial</h2>
              <p>
                Parallel does not currently offer a free trial period. We encourage you to carefully review the features included in our premium subscription before purchasing.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Promotional Offers</h2>
              <p>
                Special promotional pricing or discounts are only valid for the initial subscription period. Upon renewal, you will be charged the regular subscription rate unless otherwise stated in the promotional offer terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Payment Processing</h2>
              <p className="mb-3">
                All payments are processed securely through PayPal. If you have questions about a charge or believe there is an error:
              </p>
              <ol className="list-decimal pl-6 space-y-2">
                <li>Check your subscription details in Account Settings → Payment Details, or in your PayPal account at paypal.com</li>
                <li>Review the charge details in your email receipt</li>
                <li>Contact us at support@getparallel.vip with specific questions</li>
              </ol>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Chargebacks</h2>
              <p className="mb-3">
                If you file a chargeback or payment dispute with your bank or credit card company:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Your account will be immediately suspended</li>
                <li>You will lose access to all premium features</li>
                <li>Your account may be permanently banned</li>
              </ul>
              <p className="mt-3">
                We strongly encourage you to contact us directly at support@getparallel.vip before initiating a chargeback so we can address your concerns.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Changes to This Policy</h2>
              <p>
                We reserve the right to modify this Refund Policy at any time. Changes will be posted on this page with an updated "Last updated" date. Your continued use of Parallel after any changes constitutes acceptance of the new policy.
              </p>
            </section>

            <section>
              <h2 className="mb-3 font-semibold">Contact Us</h2>
              <p className="mb-3">
                If you have questions about this Refund Policy or wish to request a refund for exceptional circumstances, please contact us at:
              </p>
              <p>
                Email: <a href="mailto:support@getparallel.vip" className="text-parallel-void underline">support@getparallel.vip</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}