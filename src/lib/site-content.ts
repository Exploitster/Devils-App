export const siteOrigin = 'https://www.devils-advocate.app';
export interface ContentSection { title: string; paragraphs: string[]; }
export interface PublicPage {
  slug: string; title: string; heading: string; description: string; intro: string;
  sections: ContentSection[]; related: string[];
  questions?: { question: string; answer: string }[];
}
const section = (title: string, ...paragraphs: string[]): ContentSection => ({ title, paragraphs });
export const publicPages: PublicPage[] = [
  {
    slug: 'about', title: 'About Devils Advocate', heading: 'A little distance. A clearer decision.',
    description: 'Learn what Devils Advocate does, who it helps and why your decisions remain yours.',
    intro: 'Devils Advocate helps you examine an idea before committing to it, or understand the tradeoffs in a personal choice.',
    sections: [
      section('Two perspectives, one purpose', 'Business validation explores customers, demand, pricing, costs and the assumptions behind an idea. Philosophical reflection explores values, obligations and uncertainty in personal decisions. Choose the perspective that fits your situation; both are designed to help you think, rather than choose for you.'),
      section('A conversation with something to keep', 'Describe your situation in your own words. The app can ask up to three clarifying questions, identify what is strong in your position, and offer relevant counterpoints. You can correct the context or push back. Save a hand-back card with open questions and a practical next step, then revisit your conversation later.'),
      section('An evolving product', 'This is an MVP. Its evidence collection is deliberately reviewed but currently small, and AI responses can be incomplete or wrong. The product is text-only and does not replace professional advice. Inspect sources, notice where evidence is missing, and verify important facts independently before acting.'),
    ], related: ['features', 'how-it-works', 'sources'],
  },
  {
    slug: 'features', title: 'Features for clearer thinking', heading: 'From an opening thought to a practical next step.',
    description: 'Explore business validation, philosophical reflection, saved conversations, source details and exportable hand-back cards.',
    intro: 'One workspace for challenging assumptions, considering another perspective and keeping what you learn.',
    sections: [
      section('Focused conversations', 'Choose business or philosophy, then start with an idea, work proposal, life decision or belief. Clarifying questions help establish what you mean before exploring the other side. You can skip a question, change your position or challenge a response without pretending uncertainty has disappeared.'),
      section('Sources with context', 'When relevant reviewed material is available, inspect source details alongside a counterpoint. Exact quotations and paraphrases are distinguished. Source context and limitations matter: a company shutdown does not prove your idea will fail, and a philosophical argument does not decide how you should live.'),
      section('History and hand-back cards', 'Your signed-in conversations are saved to your account. Reopen them from History, search for earlier thoughts, and create updated decision cards as the conversation evolves. Cards collect your position, strengths, counterpoints, open questions and next step. Copy a card or download it as Markdown; deletion controls are available in the app.'),
    ], related: ['business-validation', 'philosophical-reflection', 'pricing'],
  },
  {
    slug: 'business-validation', title: 'Business idea validation with AI', heading: 'Challenge the idea before you commit.',
    description: 'Pressure-test a startup idea or work proposal with questions about customers, pricing, evidence and practical experiments.',
    intro: 'For founders, students and working professionals who want to understand what needs testing before investing more time or money.',
    sections: [
      section('Start with the actual business', 'Describe the customer, the problem, who pays and what people use today. Include any interviews, observed behavior or revenue you already have. Separate those observations from assumptions about demand. A precise starting point helps the conversation address your plan rather than a generic version of your industry.'),
      section('Examine risks without a verdict', 'Explore costs, willingness to pay, distribution, delivery constraints and reasons the idea could work. Comparisons use reviewed evidence where relevant; coverage is limited. A failed startup is not a prediction, and an unrelated software business should not be treated as proof about a local food-delivery idea.'),
      section('Leave with an experiment', 'Use a hand-back card to identify a reversible next step: for example, interview a defined customer group, test a price with consent, or run a small delivery pilot. Decide what observation would strengthen or weaken the idea before running the experiment. The app supports reasoning; it does not certify market demand or guarantee success.'),
    ], related: ['how-it-works', 'sources', 'pricing'],
  },
  {
    slug: 'philosophical-reflection', title: 'Philosophical reflection for personal decisions', heading: 'Understand what matters in your choice.',
    description: 'Explore life decisions, values and beliefs through philosophical perspectives, honest tradeoffs and practical next steps.',
    intro: 'Make room for the values, obligations and uncertainty behind a choice you are trying to make.',
    sections: [
      section('Bring the tension, not a perfect question', 'Explain the options you see, what matters to you and who else might be affected. A career change, an obligation to family or a belief you have never examined can all be starting points. You can keep identifying details general and share only what you are comfortable sending to an AI service.'),
      section('Use philosophy as a perspective', 'Relevant reviewed passages may offer a way to examine autonomy, responsibility, consequences or revising a belief. These are interpretations with context and limits, not instructions from a philosopher about your particular life. Inspect the work and passage behind a source, and distinguish a paraphrase from an exact quotation.'),
      section('Keep ownership of the outcome', 'The conversation can clarify strengths, tradeoffs and unanswered questions, then suggest an optional small step. It does not diagnose you, provide therapy or make your decision. For urgent or serious health, legal or financial concerns, seek qualified help. Your hand-back card is a record of reflection, not a professional assessment.'),
    ], related: ['how-it-works', 'sources', 'security'],
  },
  {
    slug: 'how-it-works', title: 'How Devils Advocate works', heading: 'A conversation that hands the decision back.',
    description: 'Learn the steps: choose a perspective, clarify your situation, examine both sides, push back and save a decision card.',
    intro: 'Start wherever you are. You do not need a business plan or a perfectly formed question.',
    sections: [
      section('Choose and describe', 'Try the scripted sample on the homepage without an account. For your own conversation, sign in with Google or create an email-and-password account. Choose business validation or philosophical reflection, then describe the situation, any evidence you already have and the decision you want to examine.'),
      section('Clarify and challenge', 'The app can ask up to three clarifying questions before examining your position. You can skip unknowns. Look at what holds up, consider counterpoints, inspect any relevant sources and correct misunderstandings. Pushback is welcome, but source coverage and service limits mean fresh evidence is not guaranteed every round.'),
      section('Save and return', 'Create a hand-back card when you want to collect the useful parts of the conversation. It records your position, strengths, counterpoints, open questions and a next step. Copy or download it as Markdown. Your history lets you resume a saved conversation and create another card as your reasoning changes.'),
    ], related: ['features', 'help', 'faq'],
  },
  {
    slug: 'pricing', title: 'Pricing — ₹2,000 monthly membership', heading: 'One monthly plan. Both perspectives.',
    description: 'Devils Advocate membership costs ₹2,000 INR per month with supported international currency conversion. Review renewals and access details.',
    intro: 'Business validation and philosophical reflection are included together. No yearly plan or introductory discount.',
    sections: [
      section('What the membership costs', 'The base price is ₹2,000 INR charged once every month. Applicable taxes and the final payable amount appear at Dodo checkout before you confirm. Supported countries may see a converted local-currency total. Website currency estimates are indicative; the checkout quote and any bank conversion fees can differ.'),
      section('What is included', 'The plan covers both conversation perspectives, available reviewed sources, saved history, hand-back cards and Markdown exports. Usage is subject to fair-use safeguards, context limits, operating budgets and provider availability. We do not promise unlimited generations, complete industry coverage or error-free AI responses.'),
      section('Access and renewal', 'Live subscriptions remain closed while payment verification is being completed; current free access continues. When paid access is enabled, new verified accounts receive a 24-hour cardless trial that ends without an automatic charge. Choosing a paid subscription authorizes monthly renewals until canceled. Cancel renewal from Billing before the next payment date.'),
    ], related: ['subscription-and-cancellation', 'refunds', 'faq'],
  },
  {
    slug: 'faq', title: 'Frequently asked questions', heading: 'The details before you get started.',
    description: 'Answers about Devils Advocate accounts, sources, AI limits, pricing, privacy, conversations and subscription management.',
    intro: 'Clear answers about what the product offers and where its limits are.',
    sections: [
      section('What you can bring', 'Use business validation for a startup idea, pricing decision or work proposal. Use philosophical reflection for a personal choice, values conflict or belief. You do not need a perfect prompt: describe the situation, include what you know and mark what is uncertain. The text-only app can ask clarifying questions before offering another perspective.'),
      section('What you should verify', 'AI can misunderstand context or return an unhelpful interpretation. Sources are checked against a reviewed collection, but that does not make every application of a source correct. Read the source details, challenge assumptions and independently verify important claims before making a decision. The app cannot guarantee a business or personal outcome.'),
      section('Where to manage your account', 'Use History to find saved conversations, the conversation page to delete a session, and Account for profile and deletion controls. Billing holds subscription status and payment-management actions when available. Google sign-in and email/password accounts are supported. Never include passwords, card numbers or identity documents in a conversation.'),
    ], related: ['help', 'pricing', 'security'],
    questions: [
      { question: 'Does Devils Advocate disagree with everything?', answer: 'No. It starts with what is strong in your position, then explores relevant counterpoints. You can correct the context or push back, and the decision remains yours.' },
      { question: 'How much does it cost?', answer: 'The planned membership is ₹2,000 INR per month before applicable taxes shown at checkout. There is no yearly plan. Live subscriptions are currently closed while verification is completed.' },
      { question: 'Can I try it without a payment card?', answer: 'Current access remains free while subscriptions are disabled. When paid access opens, new verified accounts receive a 24-hour cardless trial that ends without an automatic charge.' },
      { question: 'Are sources available for every topic?', answer: 'No. The reviewed source collection is currently small. The app should explain coverage limits rather than invent a source or treat an unrelated example as evidence.' },
      { question: 'Is this professional advice?', answer: 'No. It is a tool for reflection, not medical, legal, financial or mental health advice. Consult qualified support for decisions that require it.' },
      { question: 'Can I export or delete my conversations?', answer: 'You can download saved hand-back cards as Markdown, delete individual conversations and use Account to request account deletion. Operational and billing records may have separate retention requirements described in the Privacy notice.' },
    ],
  },
  {
    slug: 'help', title: 'Help and getting started', heading: 'Find your way through the app.',
    description: 'Get help with signing in, starting a conversation, inspecting sources, saving cards and resolving common errors.',
    intro: 'A practical guide to the controls you will use most often.',
    sections: [
      section('Sign in and start', 'Use Google or your email and password. If you forget your password, use the reset link on the sign-in screen and follow the email in the same browser where possible. After signing in, choose a perspective and start a conversation. The homepage sample is a scripted demonstration; your own account conversation is a separate experience.'),
      section('Use the conversation controls', 'Write your situation, then send it. If the app asks a question you cannot answer, use the skip control. Choose correction when your earlier position needs changing, or pushback when you want to challenge a response. Inspect source details when they appear. Create a hand-back card to collect the discussion and download it as Markdown.'),
      section('When something fails', 'If sending fails, keep your unsent text and read the error before retrying. A stale-conversation notice means another change occurred; refresh the saved conversation first. A limit or provider error can prevent a new response without removing history. Returning from payment checkout does not prove payment; use Billing to refresh verified status.'),
    ], related: ['faq', 'contact', 'subscription-and-cancellation'],
  },
  {
    slug: 'contact', title: 'Contact and support options', heading: 'Get help with the right context.',
    description: 'Find account help, payment-support routes and a way to report technical issues without exposing private information.',
    intro: 'Start with the help guide, then use the route that matches your issue.',
    sections: [
      section('Account and product questions', 'The Help and FAQ pages explain sign-in, conversation controls and common errors. You can manage your profile and request deletion through Account after signing in. A dedicated monitored support inbox is not currently published here. Do not send private conversation content to a public issue tracker or include login credentials in a support request.'),
      section('Payment questions', 'If you have completed a purchase, use the support details on your Dodo receipt or the customer portal available through Billing. Include the transaction reference and a concise description of the problem through that private support route. Do not share a full card number, security code, bank login or API key. A failed checkout may have no completed payment.'),
      section('Report a technical issue', 'The project repository offers a public issue tracker for reproducible technical problems. Describe the page, device, approximate time and steps that produced the issue. Remove personal data, tokens, email addresses and screenshots containing private conversations. Public reports are visible to other people; no response-time guarantee is offered.'),
    ], related: ['help', 'faq', 'refunds'],
  },
  {
    slug: 'security', title: 'Security and privacy controls', heading: 'Understand how your information is handled.',
    description: 'Learn about sign-in, account access, AI-provider sharing, payment handling and deletion controls in Devils Advocate.',
    intro: 'Use the product with a clear understanding of the data involved and the controls available to you.',
    sections: [
      section('Accounts and saved conversations', 'Hosted authentication is handled by Supabase, with Google sign-in or email and password. Account access controls separate saved user data. This service does not provide end-to-end encryption. Operators and infrastructure providers may have technical access needed to operate and secure it. Protect your credentials and use an email account you control.'),
      section('AI and payment boundaries', 'Relevant conversation text and reviewed source excerpts are sent to the configured AI service. AI Gateway may route requests to approved model providers; this app cannot guarantee every provider retention policy. Dodo hosts payment checkout when enabled. The app stores billing references and status, and does not collect card numbers in the conversation interface.'),
      section('Practical safeguards and choices', 'Avoid submitting passwords, identity documents, payment details or private information about other people. Use general descriptions where possible. Inspect sources before relying on a claim, download useful cards and delete sessions you no longer need. Account deletion can be retried if a required service fails; backups and necessary operational records may follow separate retention schedules.'),
    ], related: ['sources', 'help', 'contact'],
  },
  {
    slug: 'sources', title: 'Sources, citations and evidence limits', heading: 'Inspect the reasoning behind a counterpoint.',
    description: 'Understand reviewed evidence, exact quotations, paraphrases, source limitations and the current coverage of Devils Advocate.',
    intro: 'A source is a starting point for scrutiny. Its relevance to your situation still needs examination.',
    sections: [
      section('What reviewed evidence means', 'The current collection contains nine reviewed records and twelve stored excerpts. Records include source location, author or publisher, work, edition or pinned version, supported claims and limitations. Business coverage is concentrated in software and AI-evaluation material; it does not cover every industry, country or customer segment.'),
      section('How citations are checked', 'A generated citation must refer to reviewed material retrieved for that response. Exact quotes must match permitted stored excerpts, and sourced counterpoint text must match a supported curated claim. Paraphrases are labeled separately. These mechanical checks reduce fabricated references; they do not certify every interpretation or guarantee that a comparison fits your circumstances.'),
      section('When the collection has a gap', 'The app should explain when relevant reviewed evidence is missing rather than invent a failed company, quotation or historical fact. Homepage sample debates are scripted illustrations and are not additional reviewed evidence. Inspect the visible source context and limitations in a real conversation, then verify consequential factual claims independently.'),
    ], related: ['business-validation', 'philosophical-reflection', 'faq'],
  },
  {
    slug: 'subscription-and-cancellation', title: 'Subscriptions, renewals and cancellation', heading: 'Know how monthly access works.',
    description: 'Understand monthly renewal, the cardless trial, payment verification, cancellation and account deletion.',
    intro: 'The base plan is ₹2,000 INR per month, with no annual plan or long-term purchase commitment.',
    sections: [
      section('Trial and payment', 'Live subscriptions remain closed while verification is completed. When paid access opens, new verified accounts receive a 24-hour trial without a payment card. It ends without automatically charging you. You can choose to subscribe before or after the trial ends. Dodo shows the payable amount, supported payment methods and any applicable taxes before confirmation.'),
      section('Monthly renewals', 'Confirming a subscription authorizes recurring monthly payments until canceled. Provider configuration may permit ongoing renewal for up to a twenty-year subscription lifetime; that is not an annual charge or a commitment to pay for twenty years. International conversion and supported recurring payment methods depend on the country, currency and provider.'),
      section('Cancel from Billing', 'Open Billing and use Cancel renewal before the next payment date to stop future subscription charges. Verified paid access continues through its paid period. Payment failures, refunds or disputes can affect access. Account deletion is a separate process, and may remain pending while an unresolved checkout or billing operation is reconciled. Check the displayed status rather than assuming a redirect confirms cancellation.'),
    ], related: ['pricing', 'refunds', 'help'],
  },
  {
    slug: 'refunds', title: 'Refunds and payment problems', heading: 'Understand the next step for a payment issue.',
    description: 'Learn where to check payment status, request help with a charge and review the purchase terms governing refunds.',
    intro: 'Refund eligibility depends on the terms disclosed for the purchase and applicable law.',
    sections: [
      section('Check whether a payment completed', 'A return from checkout is not confirmation of payment. Open Billing and refresh the verified payment status. Dodo receipts and transaction references help identify a completed purchase. If checkout failed or is still pending, avoid repeatedly starting new payments while the existing attempt is unresolved.'),
      section('Request a review through your purchase', 'For a completed charge, use the support route on the Dodo receipt or customer portal and provide the transaction reference, date, amount and reason for your request. Use a private support channel and redact sensitive details. Do not share card security codes, bank passwords or full payment-card numbers.'),
      section('Review the purchase terms', 'No automatic refund guarantee, fixed refund window or processing deadline is promised on this page. The purchase terms disclosed at checkout and applicable law govern eligibility. Canceling renewal stops future subscription charges and does not itself refund an earlier payment. Verified refunds and disputes may change access; follow the confirmed billing status and provider correspondence.'),
    ], related: ['subscription-and-cancellation', 'pricing', 'contact'],
  },
  {
    slug: 'accessibility', title: 'Accessibility and using the interface', heading: 'A clearer interface for more people.',
    description: 'Learn about keyboard controls, readable content, mobile layouts and available alternatives in Devils Advocate.',
    intro: 'The interface is designed to remain usable with a keyboard, on smaller screens and with reduced motion preferences.',
    sections: [
      section('Navigate at your own pace', 'Use the skip link to reach the main content and keyboard focus indicators to follow interactive controls. Buttons, form labels and expandable sections should describe their purpose. The public sample is scripted and can be restarted. You can read product information without completing a sign-up flow or purchasing a subscription.'),
      section('Read and keep information', 'The app uses responsive layouts and supports the existing light and dark themes. Reduced-motion preferences limit decorative animation. Saved cards can be downloaded as Markdown for reading in another compatible application. The product is currently text-only; voice input and audio responses are not offered as built-in features.'),
      section('Tell us about a barrier', 'Automated checks and browser testing help find problems but cannot establish that every assistive technology and device combination works perfectly. If a control, layout or error message blocks you, report the page, device or assistive technology and steps through the Contact options. Include enough detail to reproduce the problem while removing private account or conversation information.'),
    ], related: ['help', 'contact', 'features'],
  },
];
export const publicSlugs = publicPages.map(page => page.slug);
export function pageJsonLd(page: PublicPage): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [{
    '@context': 'https://schema.org', '@type': 'WebPage', name: page.title,
    description: page.description, url: `${siteOrigin}/${page.slug}`,
    isPartOf: { '@type': 'WebSite', name: 'Devils Advocate', url: siteOrigin },
  }];
  if (page.questions) nodes.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.questions.map(({ question, answer }) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) });
  return nodes;
}
