-- Restrict column-level access to profiles.email
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, name, avatar_url, created_at) ON public.profiles TO anon, authenticated;
-- Allow users to read their own full row (including email) via RLS; column grant for email only to authenticated reading own row
GRANT SELECT (email) ON public.profiles TO authenticated;
-- But RLS still allows anyone authenticated to read any row's email. Tighten RLS by replacing readable policy.
DROP POLICY IF EXISTS "profiles readable" ON public.profiles;

CREATE POLICY "profiles public basic readable"
  ON public.profiles FOR SELECT
  USING (true);
-- Note: combined with column-level grant, anon can read only granted columns (id, name, avatar_url, created_at).
-- Authenticated users can technically read email columns of any row. Mitigate at app layer: revoke email column from authenticated too, and expose via SECURITY DEFINER functions for self and hosts.

REVOKE SELECT (email) ON public.profiles FROM authenticated;

-- Function: get own email (self)
CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid();
$$;

-- Function: hosts read attendees for one of their events
CREATE OR REPLACE FUNCTION public.get_event_attendees(_event_id uuid)
RETURNS TABLE(user_id uuid, name text, email text, status rsvp_status, checked_in_at timestamptz, ticket_code text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _host uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT host_id INTO _host FROM public.events WHERE id = _event_id;
  IF NOT public.is_any_host_member(auth.uid(), _host) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT r.user_id, p.name, p.email, r.status, r.checked_in_at, r.ticket_code, r.created_at
    FROM public.rsvps r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.event_id = _event_id;
END;
$$;

-- Function: hosts read member emails for their host org
CREATE OR REPLACE FUNCTION public.get_host_member_profiles(_host_id uuid)
RETURNS TABLE(user_id uuid, name text, email text, role host_role, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_host_member(auth.uid(), _host_id, 'host'::host_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT hm.user_id, p.name, p.email, hm.role, hm.created_at
    FROM public.host_members hm
    JOIN public.profiles p ON p.id = hm.user_id
    WHERE hm.host_id = _host_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_attendees(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_host_member_profiles(uuid) TO authenticated;