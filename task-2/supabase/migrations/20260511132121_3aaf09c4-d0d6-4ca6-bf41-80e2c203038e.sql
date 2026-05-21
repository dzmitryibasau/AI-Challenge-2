-- 1) hosts.contact_email: hide from anon
REVOKE SELECT (contact_email) ON public.hosts FROM anon;
GRANT SELECT (contact_email) ON public.hosts TO authenticated;

-- 2) member_invites: lock down SELECT, expose lookup-by-token via RPC
DROP POLICY IF EXISTS "invites select by token (open)" ON public.member_invites;
CREATE POLICY "invites select by host" ON public.member_invites
  FOR SELECT USING (public.is_host_member(auth.uid(), host_id, 'host'::host_role));

CREATE OR REPLACE FUNCTION public.lookup_invite(_token text)
RETURNS TABLE(id uuid, host_id uuid, role host_role, host_name text, host_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT mi.id, mi.host_id, mi.role, h.name, h.slug
  FROM public.member_invites mi
  JOIN public.hosts h ON h.id = mi.host_id
  WHERE mi.token = _token
  LIMIT 1;
$$;

-- 3) host_members insert policy — prevent self-promotion abuse
DROP POLICY IF EXISTS "host_members insert self as host on create" ON public.host_members;
CREATE POLICY "host_members insert by host or owner-bootstrap" ON public.host_members
  FOR INSERT WITH CHECK (
    public.is_host_member(auth.uid(), host_id, 'host'::host_role)
    OR (
      user_id = auth.uid()
      AND role = 'host'::host_role
      AND EXISTS (
        SELECT 1 FROM public.hosts h
        WHERE h.id = host_id
          AND h.owner_id = auth.uid()
          AND NOT EXISTS (SELECT 1 FROM public.host_members m WHERE m.host_id = h.id)
      )
    )
  );

-- 4) Storage: ownership-checked INSERT/UPDATE; remove broad public SELECT (public buckets still serve URLs)
DROP POLICY IF EXISTS "Storage authed upload host-logos" ON storage.objects;
DROP POLICY IF EXISTS "Storage authed update host-logos" ON storage.objects;
DROP POLICY IF EXISTS "Storage authed upload event-covers" ON storage.objects;
DROP POLICY IF EXISTS "Storage authed update event-covers" ON storage.objects;
DROP POLICY IF EXISTS "Storage authed upload gallery" ON storage.objects;
DROP POLICY IF EXISTS "Storage authed update gallery" ON storage.objects;
DROP POLICY IF EXISTS "Storage public read host-logos" ON storage.objects;
DROP POLICY IF EXISTS "Storage public read event-covers" ON storage.objects;
DROP POLICY IF EXISTS "Storage public read gallery" ON storage.objects;

-- host-logos: user can manage files under their own user-id folder
CREATE POLICY "host-logos insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'host-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "host-logos update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'host-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "host-logos delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'host-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- event-covers: host members of host_id (first folder) can upload/update/delete
CREATE POLICY "event-covers insert by host" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-covers'
    AND public.is_host_member(auth.uid(), ((storage.foldername(name))[1])::uuid, 'host'::host_role)
  );
CREATE POLICY "event-covers update by host" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-covers'
    AND public.is_host_member(auth.uid(), ((storage.foldername(name))[1])::uuid, 'host'::host_role)
  );
CREATE POLICY "event-covers delete by host" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-covers'
    AND public.is_host_member(auth.uid(), ((storage.foldername(name))[1])::uuid, 'host'::host_role)
  );

-- gallery: path is {event_id}/{user_id}/{filename}; uploader manages own files; host members can manage all in their event
CREATE POLICY "gallery insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gallery'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
CREATE POLICY "gallery update by uploader or host" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'gallery'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR public.is_any_host_member(auth.uid(), public.host_of_event(((storage.foldername(name))[1])::uuid))
    )
  );
CREATE POLICY "gallery delete by uploader or host" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'gallery'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR public.is_any_host_member(auth.uid(), public.host_of_event(((storage.foldername(name))[1])::uuid))
    )
  );

-- 5) SECURITY DEFINER functions: revoke from public/anon; grant authenticated where intended
REVOKE EXECUTE ON FUNCTION public.is_host_member(uuid, uuid, host_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_any_host_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.host_of_event(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.accept_invite(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.rsvp_to_event(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_rsvp(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_in_ticket(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.undo_check_in(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_email() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_event_attendees(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_host_member_profiles(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.lookup_invite(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_ticket_code() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rsvp_to_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_rsvp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_check_in(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_invite(text) TO authenticated;

-- 6) generate_ticket_code: set immutable search_path
CREATE OR REPLACE FUNCTION public.generate_ticket_code()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $function$
declare
  code text;
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
  attempt int := 0;
begin
  loop
    code := 'EVT-';
    for i in 1..4 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    code := code || '-';
    for i in 1..4 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rsvps where ticket_code = code);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate unique ticket code';
    end if;
  end loop;
  return code;
end;
$function$;