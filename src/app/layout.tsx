import type { Metadata } from 'next';
import { AnalyticsConsent } from '@/components/analytics-consent';
import '../styles/tokens.css';
import '../styles/app.css';
import '../styles/refinements.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://www.devils-advocate.app'),
  title: { default: 'Devils Advocate — Business Validation & Philosophical Reflection', template: '%s | Devils Advocate' },
  description: 'Challenge a business idea or think through a personal decision. Explore assumptions, reviewed sources, counterarguments and a practical next step.',
  openGraph: { type: 'website', siteName: 'Devils Advocate', locale: 'en_IN', title: 'Devils Advocate', description: 'Better questions for business ideas and personal decisions.' },
  twitter: { card: 'summary_large_image' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}<AnalyticsConsent projectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID}/></body></html>;
}
