import { AuthScreen } from '@/components/auth-screen';
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <AuthScreen subscriptionIntent={next === '/billing'}/>;
}
