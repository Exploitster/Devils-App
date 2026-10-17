import type { Metadata } from 'next';
import '../styles/tokens.css';
import '../styles/app.css';
export const metadata: Metadata = { title: 'Devils Advocate', description: 'A calm space to challenge an idea, explore a decision, and find your next step. Your call. Always.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
