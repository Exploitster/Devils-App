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
RESET ROLE;
ROLLBACK;
