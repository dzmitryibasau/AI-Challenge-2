-- Revoke broad SELECT on hosts from anon and authenticated; grant only safe columns
REVOKE SELECT ON public.hosts FROM anon, authenticated;
GRANT SELECT (id, name, slug, bio, logo_url, owner_id, created_at) ON public.hosts TO anon, authenticated;
GRANT SELECT (contact_email) ON public.hosts TO authenticated;

-- Re-assert profiles column grants (defensive)
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, name, avatar_url, created_at) ON public.profiles TO anon, authenticated;