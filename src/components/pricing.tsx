import Link from 'next/link';
import { LocalPrice } from './local-price';
import { Icon } from './app';

export function Pricing({ paid }: { paid: boolean }) {
  return <section className="landing-section" id="pricing" aria-labelledby="pricing-title">
    <p className="eyebrow blue-text">ONE PLAN. BOTH PERSPECTIVES.</p>
    <h2 id="pricing-title">Invest in a clearer next step.</h2>
    <p className="section-description">Both perspectives, one monthly plan.</p>
    <div className="pricing-grid">
      <article className="panel pricing-plan">
        <span className="pill">Devils Advocate membership</span>
        <h3><span className="plan-price">₹200</span><span className="muted"> / month</span></h3>
        <p>Charged once every month. Cancel anytime.</p><LocalPrice/>
        <ul className="plan-benefits">
          <li><Icon name="check"/>Business validation and philosophical reflection</li>
          <li><Icon name="check"/>Sourced loopholes, with their limits</li>
          <li><Icon name="check"/>Saved conversations and assessments</li>
        </ul>
        <Link className="button primary full-width" href="/billing">Subscribe for ₹200/month<Icon name="arrow"/></Link>
                {!paid && <p className="notice">Subscriptions open soon; your free access continues until then, and no real payment is collected.</p>}
        {paid && <p className="fine">New accounts get 24 hours free, no card needed.</p>}
      </article>
      <div className="pricing-answers">
        <h3>Know exactly what you’re choosing.</h3>
        <details open><summary>What will I pay?</summary><p>The base subscription is ₹200 INR per month. Dodo shows the final payable total, including any applicable taxes, before you confirm payment. There are no introductory discounts or yearly charges.</p></details>
        <details><summary>Can I pay from another country?</summary><p>Where supported, Dodo converts the INR price into a supported checkout currency. Review the currency, converted amount and available recurring payment methods before paying. Your bank may apply its own conversion fees.</p></details>
        <details><summary>How do renewal and cancellation work?</summary><p>You authorize recurring monthly payments at checkout. Cancel renewal from Billing before the next payment date to stop future subscription charges. Verified paid access continues through the paid period.</p></details>
        <details><summary>Can I manage my payments later?</summary><p>Open Billing to check payment status, manage your subscription and open Dodo’s customer portal for available invoice and payment-method controls.</p></details>
        <p className="fine">Fair-use limits apply. A tool for reflection, not professional advice.</p>
      </div>
    </div>
  </section>;
}
