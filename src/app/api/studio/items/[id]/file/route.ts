import { authResponse, getKnowledgeStore, getRuntimeConfig } from '@/lib/auth/service';
import { notFound } from '@/lib/errors';
import { json } from '@/lib/http';
import { FILE_LIMIT_BYTES, LocalFileStore, fileTooLarge, localFileDirectory } from '@/lib/knowledge/files';
import { studioService } from '@/lib/knowledge/service';
import { invalidStatus } from '@/lib/knowledge/store';
export const runtime = 'nodejs';
/** Local mode only: the upload target that stands in for a signed storage URL. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return authResponse(request, async () => {
    await studioService(request, { write: true });
    const config = getRuntimeConfig(request); if (config.mode !== 'local') throw notFound();
    const { id } = await context.params; const item = await getKnowledgeStore(config).getItem(id);
    if (!item) throw notFound();
    if (item.kind === 'text' || item.status !== 'uploading') throw invalidStatus();
    if (Number(request.headers.get('content-length') ?? '0') > FILE_LIMIT_BYTES) throw fileTooLarge(item.kind);
    await new LocalFileStore(localFileDirectory(config)).write(id, request.body, item.kind);
    return json({ uploaded: true });
  });
}
