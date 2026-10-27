import { SessionView } from '@/components/session';
export default async function SessionPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const { id } = await params; return <SessionView id={id}/>; }
