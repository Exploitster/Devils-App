BEGIN;
SET ROLE service_role;
SELECT public.app_store('putProfile', '{"profile":{"id":"00000000-0000-4000-8000-000000000001","email":"alex@example.test","disabled":false,"deletionState":"none","createdAt":"2026-10-14T09:00:00Z"}}');
SELECT public.app_store('putProfile', '{"profile":{"id":"00000000-0000-4000-8000-000000000002","email":"sam@example.test","disabled":false,"deletionState":"none","createdAt":"2026-10-14T09:00:00Z"}}');
SELECT public.app_store('createSession', '{"userId":"00000000-0000-4000-8000-000000000001","input":{"mode":"business","topic":"startup"},"now":"2026-10-14T09:00:00Z"}', '00000000-0000-4000-8000-000000000001');
SELECT public.app_store('createSession', '{"userId":"00000000-0000-4000-8000-000000000002","input":{"mode":"philosophy","topic":"life"},"now":"2026-10-14T09:00:00Z"}', '00000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.sessions) <> 1 THEN RAISE EXCEPTION 'Owner RLS failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.sessions WHERE user_id='00000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Foreign rows exposed'; END IF;
  BEGIN
    UPDATE public.sessions SET data=data || '{"revision":999}'::jsonb;
    RAISE EXCEPTION 'Public generated-state mutation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.app_store('getProfile','{"userId":"00000000-0000-4000-8000-000000000002"}');
    RAISE EXCEPTION 'Privileged RPC exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.sessions) <> 1 THEN RAISE EXCEPTION 'Second owner RLS failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.sessions WHERE user_id='00000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'First user rows exposed'; END IF;
END $$;
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM count(*) FROM public.sessions;
    RAISE EXCEPTION 'Anonymous private access allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET ROLE service_role;
DO $$ DECLARE sid text; args jsonb; result jsonb; BEGIN
  SELECT id INTO sid FROM public.sessions WHERE user_id='00000000-0000-4000-8000-000000000002';
  BEGIN
    PERFORM public.app_store('getSession',jsonb_build_object('userId','00000000-0000-4000-8000-000000000001','sessionId',sid),'00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Server owner predicate failed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'NOT_FOUND' THEN RAISE; END IF; END;
  SELECT id INTO sid FROM public.sessions WHERE user_id='00000000-0000-4000-8000-000000000001';
  args:=jsonb_build_object('userId','00000000-0000-4000-8000-000000000001','sessionId',sid,'operationId','sql-turn-one','expectedRevision',0,'fingerprint','same-input','leaseExpiresAt','2026-10-14T09:01:00Z','now','2026-10-14T09:00:00Z');
  result:=public.app_store('reserveTurn',args,'00000000-0000-4000-8000-000000000001');
  IF result->>'kind' <> 'reserved' THEN RAISE EXCEPTION 'Atomic reservation failed'; END IF;
  BEGIN
    PERFORM public.app_store('reserveTurn',args || '{"fingerprint":"changed-input"}','00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Changed duplicate accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
  PERFORM public.app_store('cancelTurn',jsonb_build_object('userId','00000000-0000-4000-8000-000000000001','sessionId',sid,'operationId','sql-turn-one'),'00000000-0000-4000-8000-000000000001');
  IF NOT EXISTS(SELECT 1 FROM public.turn_operations WHERE id='sql-turn-one' AND data->>'status'='cancelled') THEN RAISE EXCEPTION 'Cancellation not durable'; END IF;
  PERFORM public.app_store('deleteSession',jsonb_build_object('userId','00000000-0000-4000-8000-000000000001','sessionId',sid),'00000000-0000-4000-8000-000000000001');
  IF EXISTS(SELECT 1 FROM public.turn_operations WHERE id='sql-turn-one') THEN RAISE EXCEPTION 'Private operation did not cascade'; END IF;
END $$;
SET ROLE service_role;
SELECT public.app_store('beginAccountDeletion', '{"userId":"00000000-0000-4000-8000-000000000002"}', '00000000-0000-4000-8000-000000000002');
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.sessions) <> 0 THEN RAISE EXCEPTION 'Disabled account can still read private sessions'; END IF;
 IF (SELECT count(*) FROM public.profiles) <> 1 THEN RAISE EXCEPTION 'Closure retry profile is unavailable'; END IF;
END $$;
SET ROLE service_role;
DO $$ DECLARE uid text := '00000000-0000-4000-8000-000000000001'; ctx jsonb; BEGIN
 ctx:=jsonb_build_object('userId',uid,'token','attempt','plan','monthly','expiresAt',0,'provider','dodo','environment','test_mode');
 PERFORM public.billing_sync_operation('acquire',jsonb_build_object('customerId','dodo-test-fence','token','owner','expiresAt',(extract(epoch from clock_timestamp())*1000)::bigint+60000));
 PERFORM public.billing_context_save_guarded(ctx,'{"key":"dodo-test-fence","token":"owner"}');
 BEGIN
  PERFORM public.billing_context_save_guarded(ctx||'{"customerId":"wrong"}','{"key":"dodo-test-fence","token":"stale"}');
  RAISE EXCEPTION 'Stale billing save accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Billing lease expired' THEN RAISE; END IF; END;
 IF (public.billing_context_operation('get',jsonb_build_object('userId',uid))->>'customerId') IS NOT NULL THEN RAISE EXCEPTION 'Stale save changed billing authority'; END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.billing_context_save_guarded('{}','{}');RAISE EXCEPTION 'Client can change billing authority';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='owner-knowledge' AND NOT public AND file_size_limit=52428800) THEN RAISE EXCEPTION 'Private knowledge bucket missing'; END IF;
END $$;
SET ROLE service_role;
DO $$ DECLARE live jsonb; item jsonb; found jsonb; BEGIN
 PERFORM public.knowledge_operation('createItem','{"id":"sql-approved","kind":"text","status":"review","title":"Pricing notes","text":"Monthly subscription pricing works.","mimeType":"text/plain","sizeBytes":35,"createdAt":"2026-11-09T10:00:00Z","updatedAt":"2026-11-09T10:00:00Z"}');
 PERFORM public.knowledge_operation('createItem','{"id":"sql-pending","kind":"text","status":"review","title":"Draft","text":"Pending subscription pricing.","mimeType":"text/plain","sizeBytes":29,"createdAt":"2026-11-09T10:00:00Z","updatedAt":"2026-11-09T10:00:00Z"}');
 item:=public.knowledge_operation('approveItem','{"id":"sql-approved","passages":["Monthly subscription pricing works."],"now":"2026-11-09T10:01:00Z"}');
 IF item->>'status' <> 'approved' THEN RAISE EXCEPTION 'Approval did not change status'; END IF;
 -- Answer words are ORed: one shared word is enough, and a pending item never matches.
 found:=public.knowledge_operation('search','{"match":"charge ten dollars month subscription","rank":"money","limit":3}');
 IF found <> '[{"text":"Monthly subscription pricing works."}]'::jsonb THEN RAISE EXCEPTION 'OR search returned %', found; END IF;
 IF public.knowledge_operation('search','{"match":"nothing relevant","rank":"pricing","limit":3}') <> '[]'::jsonb THEN RAISE EXCEPTION 'Ranking words alone matched'; END IF;
 BEGIN
  PERFORM public.knowledge_operation('updateItem','{"id":"sql-approved","patch":{"text":"Changed"},"now":"2026-11-09T10:02:00Z"}');
  RAISE EXCEPTION 'Approved item changed in place';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'INVALID_STATUS' THEN RAISE; END IF; END;
 PERFORM public.knowledge_operation('withdrawItem','{"id":"sql-approved","now":"2026-11-09T10:03:00Z"}');
 IF public.knowledge_operation('search','{"match":"subscription","limit":3}') <> '[]'::jsonb THEN RAISE EXCEPTION 'Withdrawn passage still searchable'; END IF;
 PERFORM public.knowledge_operation('deleteItem','{"id":"sql-approved"}');
 IF public.knowledge_operation('getItem','{"id":"sql-approved"}') IS NOT NULL OR EXISTS(SELECT 1 FROM public.knowledge_passages WHERE item_id='sql-approved') THEN RAISE EXCEPTION 'Deleted item remains'; END IF;
 PERFORM public.knowledge_operation('publishVersion','{"mode":"business","areas":[{"id":"a"}],"note":"First","now":"2026-11-09T10:00:00Z"}');
 PERFORM public.knowledge_operation('publishVersion','{"mode":"business","areas":[{"id":"b"}],"now":"2026-11-09T11:00:00Z"}');
 live:=public.knowledge_operation('getVersion','{"mode":"business"}');
 IF (live->>'version')::int <> 2 OR live->'areas' <> '[{"id":"b"}]'::jsonb OR live ? 'note' THEN RAISE EXCEPTION 'Live version is %', live; END IF;
 IF public.knowledge_operation('getVersion','{"mode":"business","version":1}') <> '{"mode":"business","version":1,"areas":[{"id":"a"}],"note":"First","createdAt":"2026-11-09T10:00:00.000Z"}'::jsonb THEN RAISE EXCEPTION 'Earlier version changed'; END IF;
 IF public.knowledge_operation('getVersion','{"mode":"philosophy"}') IS NOT NULL THEN RAISE EXCEPTION 'Unpublished mode has a live version'; END IF;
 IF (SELECT count(*) FROM public.knowledge_items) <> 1 OR (SELECT count(*) FROM public.framework_versions) <> 2 THEN RAISE EXCEPTION 'Service role cannot read knowledge tables'; END IF;
END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['public.knowledge_items','public.knowledge_passages','public.framework_versions'] LOOP
  BEGIN
   EXECUTE 'SELECT count(*) FROM ' || target;
   RAISE EXCEPTION 'Signed-in users can read %', target;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN
  PERFORM public.knowledge_operation('listItems','{}');
  RAISE EXCEPTION 'Signed-in users can run the knowledge function';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM count(*) FROM public.knowledge_passages;
  RAISE EXCEPTION 'Anonymous knowledge access allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.knowledge_operation('search','{"match":"pricing","limit":3}');
  RAISE EXCEPTION 'Anonymous knowledge search allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
