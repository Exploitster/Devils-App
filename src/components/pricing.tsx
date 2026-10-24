import Link from 'next/link';
import { Icon } from './app';

export function Pricing({ paid }: { paid: boolean }) {
  return <section className="landing-section" id="pricing" aria-labelledby="pricing-title">
    <p className="eyebrow blue-text">ONE PLAN. BOTH PERSPECTIVES.</p>
    <h2 id="pricing-title">Invest in a clearer next step.</h2>
    <p className="section-description">A space to challenge your business ideas and think through personal decisions, with everything in one monthly plan.</p>
    <div className="pricing-grid">
      <article className="panel pricing-plan">
        <span className="pill">Devils Advocate membership</span>
        <h3><span className="plan-price">₹2,000</span><span className="muted"> / month</span></h3>
        <p>Charged once every month. No annual plan or long-term commitment.</p>
        <ul className="plan-benefits">
          <li><Icon name="check"/>Business validation: question demand, pricing and the assumptions behind your idea.</li>
          <li><Icon name="check"/>Philosophical reflection: explore values, obligations and the tradeoffs in a personal choice.</li>
          <li><Icon name="check"/>Reviewed sources where relevant, with context and limitations.</li>
          <li><Icon name="check"/>Saved conversations, decision cards and Markdown exports.</li>
        </ul>
        <Link className="button primary full-width" href="/billing">Subscribe for ₹2,000/month<Icon name="arrow"/></Link>
        <p className="fine">Sign in with Google or email, review your plan, then choose whether to pay. You can subscribe directly from here; conversation onboarding can wait.</p>
        {!paid && <p className="notice">Live subscriptions are not open yet. Current free access continues. Authorized testers can use Dodo Test Mode; no real payment is collected.</p>}
        {paid && <p className="fine">Prefer to try it first? Your new account includes a 24-hour cardless trial. It ends without an automatic charge. You can subscribe before or after it ends.</p>}
      </article>
      <div className="pricing-answers">
        <h3>Know exactly what you’re choosing.</h3>
        <details open><summary>What will I pay?</summary><p>The base subscription is ₹2,000 INR per month. Dodo shows the final payable total, including any applicable taxes, before you confirm payment. There are no introductory discounts or yearly charges.</p></details>
        <details open><summary>Can I pay from another country?</summary><p>Where supported, Dodo converts the INR price into a supported checkout currency. Review the currency, converted amount and available recurring payment methods before paying. Your bank may apply its own conversion fees.</p></details>
        <details open><summary>How do renewal and cancellation work?</summary><p>You authorize recurring monthly payments at checkout. Cancel renewal from Billing before the next payment date to stop future subscription charges. Verified paid access continues through the paid period.</p></details>
        <details><summary>Can I manage my payments later?</summary><p>Open Billing to check payment status, manage your subscription and open Dodo’s customer portal for available invoice and payment-method controls.</p></details>
        <p className="fine">AI responses are subject to fair-use safeguards and provider availability. This is a tool for reflection, not professional advice or a guarantee of business success.</p>
      </div>
    </div>
  </section>;
}
