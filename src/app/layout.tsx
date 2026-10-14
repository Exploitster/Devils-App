import type { Metadata } from 'next';
import '../styles/tokens.css';
export const metadata: Metadata = { title: 'Devils Advocate', description: 'Challenge an idea or decision. Your call. Always.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
