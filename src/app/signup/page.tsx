import { AuthScreen } from '@/components/auth-screen';
export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <AuthScreen view="signup" subscriptionIntent={next === '/billing'}/>;
}
