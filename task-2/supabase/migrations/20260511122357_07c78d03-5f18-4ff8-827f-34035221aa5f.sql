
-- =========================================================
-- OpenSeat: schema, enums, functions, RLS, storage
-- =========================================================

-- Enums
create type public.host_role as enum ('host', 'checker');
create type public.rsvp_status as enum ('going', 'waitlist', 'cancelled');
create type public.event_visibility as enum ('public', 'unlisted');
create type public.event_status as enum ('draft', 'published');
create type public.price_type as enum ('free', 'paid');
create type public.photo_status as enum ('pending', 'approved', 'hidden');
create type public.report_status as enum ('open', 'resolved');
create type public.report_target as enum ('event', 'photo');
create type public.venue_kind as enum ('in_person', 'online');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- hosts
create table public.hosts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  logo_url text,
  bio text,
  contact_email text,
  created_at timestamptz not null default now()
);
create index hosts_owner_idx on public.hosts(owner_id);

-- host_members
create table public.host_members (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role host_role not null,
  created_at timestamptz not null default now(),
  unique (host_id, user_id, role)
);
create index host_members_user_idx on public.host_members(user_id);
create index host_members_host_idx on public.host_members(host_id);

-- member_invites
create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  role host_role not null,
  token text not null unique,
  created_at timestamptz not null default now()
);

-- events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  title text not null,
  slug text not null unique,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC',
  venue_type venue_kind not null default 'in_person',
  venue_address text,
  online_link text,
  capacity int not null default 100 check (capacity >= 0),
  cover_image_url text,
  visibility event_visibility not null default 'public',
  status event_status not null default 'draft',
  price_type price_type not null default 'free',
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index events_host_idx on public.events(host_id);
create index events_status_idx on public.events(status, hidden, visibility);
create index events_starts_idx on public.events(starts_at);

-- rsvps
create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status rsvp_status not null,
  ticket_code text not null unique,
  checked_in_at timestamptz,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index rsvps_event_idx on public.rsvps(event_id);
create index rsvps_user_idx on public.rsvps(user_id);

-- feedback
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index feedback_event_idx on public.feedback(event_id);

-- gallery_photos
create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  status photo_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index gallery_event_idx on public.gallery_photos(event_id);

-- reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type report_target not null,
  target_id uuid not null,
  reason text not null,
  status report_status not null default 'open',
  created_at timestamptz not null default now()
);
create index reports_target_idx on public.reports(target_type, target_id);

-- =========================================================
-- Helper functions (SECURITY DEFINER, set search_path = public)
-- =========================================================

-- Auto-create profile on new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Role check helper to avoid recursive RLS
create or replace function public.is_host_member(_user_id uuid, _host_id uuid, _role host_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.host_members
    where user_id = _user_id and host_id = _host_id and role = _role
  );
$$;

create or replace function public.is_any_host_member(_user_id uuid, _host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.host_members
    where user_id = _user_id and host_id = _host_id
  );
$$;

create or replace function public.host_of_event(_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select host_id from public.events where id = _event_id;
$$;

-- Generate unique ticket code EVT-XXXX-XXXX
create or replace function public.generate_ticket_code()
returns text
language plpgsql
as $$
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
$$;

-- RSVP RPC: atomic capacity check + waitlist
create or replace function public.rsvp_to_event(_event_id uuid)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _evt public.events;
  _existing public.rsvps;
  _going_count int;
  _new public.rsvps;
  _new_status rsvp_status;
begin
  if _user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into _evt from public.events where id = _event_id for update;
  if not found then
    raise exception 'Event not found';
  end if;
  if _evt.status <> 'published' or _evt.hidden then
    raise exception 'Event not available';
  end if;
  if _evt.ends_at < now() then
    raise exception 'Event has ended';
  end if;

  select * into _existing from public.rsvps
    where event_id = _event_id and user_id = _user_id;

  if found then
    if _existing.status in ('going','waitlist') then
      return _existing;
    end if;
    -- reactivate cancelled
    select count(*) into _going_count from public.rsvps
      where event_id = _event_id and status = 'going';
    if _going_count < _evt.capacity then
      _new_status := 'going';
    else
      _new_status := 'waitlist';
    end if;
    update public.rsvps
      set status = _new_status,
          created_at = now(),
          checked_in_at = null,
          promoted_at = null
      where id = _existing.id
      returning * into _new;
    return _new;
  end if;

  select count(*) into _going_count from public.rsvps
    where event_id = _event_id and status = 'going';
  if _going_count < _evt.capacity then
    _new_status := 'going';
  else
    _new_status := 'waitlist';
  end if;

  insert into public.rsvps (event_id, user_id, status, ticket_code)
  values (_event_id, _user_id, _new_status, public.generate_ticket_code())
  returning * into _new;

  return _new;
end;
$$;

-- Cancel RSVP + FIFO waitlist promotion
create or replace function public.cancel_rsvp(_rsvp_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _rsvp public.rsvps;
  _promote public.rsvps;
  _evt public.events;
begin
  if _user_id is null then
    raise exception 'Not authenticated';
  end if;
  select * into _rsvp from public.rsvps where id = _rsvp_id for update;
  if not found then raise exception 'RSVP not found'; end if;
  if _rsvp.user_id <> _user_id then raise exception 'Not your RSVP'; end if;

  select * into _evt from public.events where id = _rsvp.event_id for update;

  update public.rsvps set status = 'cancelled' where id = _rsvp.id;

  if _rsvp.status = 'going' and _evt.ends_at > now() then
    select * into _promote from public.rsvps
      where event_id = _rsvp.event_id and status = 'waitlist'
      order by created_at asc
      limit 1
      for update;
    if found then
      update public.rsvps
        set status = 'going', promoted_at = now()
        where id = _promote.id;
    end if;
  end if;
end;
$$;

-- Check-in
create or replace function public.check_in_ticket(_event_id uuid, _code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _is_member boolean;
  _rsvp public.rsvps;
begin
  if _user_id is null then
    raise exception 'Not authenticated';
  end if;
  select public.is_any_host_member(_user_id, (select host_id from public.events where id = _event_id))
    into _is_member;
  if not _is_member then
    raise exception 'Not authorized for this event';
  end if;

  select * into _rsvp from public.rsvps
    where event_id = _event_id and upper(ticket_code) = upper(_code)
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if _rsvp.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;
  if _rsvp.status = 'waitlist' then
    return jsonb_build_object('ok', false, 'reason', 'waitlist');
  end if;
  if _rsvp.checked_in_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'duplicate',
      'name', (select name from public.profiles where id = _rsvp.user_id),
      'checked_in_at', _rsvp.checked_in_at);
  end if;

  update public.rsvps set checked_in_at = now() where id = _rsvp.id
    returning * into _rsvp;
  return jsonb_build_object('ok', true,
    'rsvp_id', _rsvp.id,
    'name', (select name from public.profiles where id = _rsvp.user_id),
    'checked_in_at', _rsvp.checked_in_at);
end;
$$;

-- Undo last check-in (specific rsvp id)
create or replace function public.undo_check_in(_rsvp_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _evt_host uuid;
begin
  if _user_id is null then raise exception 'Not authenticated'; end if;
  select host_of_event(event_id) into _evt_host from public.rsvps where id = _rsvp_id;
  if not public.is_any_host_member(_user_id, _evt_host) then
    raise exception 'Not authorized';
  end if;
  update public.rsvps set checked_in_at = null where id = _rsvp_id;
end;
$$;

-- Accept invite
create or replace function public.accept_invite(_token text)
returns public.host_members
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _invite public.member_invites;
  _member public.host_members;
begin
  if _user_id is null then raise exception 'Not authenticated'; end if;
  select * into _invite from public.member_invites where token = _token;
  if not found then raise exception 'Invalid invite'; end if;

  insert into public.host_members (host_id, user_id, role)
  values (_invite.host_id, _user_id, _invite.role)
  on conflict (host_id, user_id, role) do nothing;

  select * into _member from public.host_members
    where host_id = _invite.host_id and user_id = _user_id and role = _invite.role;
  return _member;
end;
$$;

-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.hosts enable row level security;
alter table public.host_members enable row level security;
alter table public.member_invites enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.feedback enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.reports enable row level security;

-- profiles
create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles update own" on public.profiles for update using (id = auth.uid());
create policy "profiles insert own" on public.profiles for insert with check (id = auth.uid());

-- hosts
create policy "hosts readable" on public.hosts for select using (true);
create policy "hosts insert by owner" on public.hosts for insert
  with check (owner_id = auth.uid());
create policy "hosts update by host member" on public.hosts for update
  using (public.is_host_member(auth.uid(), id, 'host'::host_role) or owner_id = auth.uid());
create policy "hosts delete by owner" on public.hosts for delete using (owner_id = auth.uid());

-- host_members
create policy "host_members select by member or host" on public.host_members for select
  using (user_id = auth.uid() or public.is_host_member(auth.uid(), host_id, 'host'::host_role));
create policy "host_members insert self as host on create" on public.host_members for insert
  with check (
    user_id = auth.uid()
    or public.is_host_member(auth.uid(), host_id, 'host'::host_role)
  );
create policy "host_members delete by host" on public.host_members for delete
  using (public.is_host_member(auth.uid(), host_id, 'host'::host_role) or user_id = auth.uid());

-- member_invites
create policy "invites select by host" on public.member_invites for select
  using (public.is_host_member(auth.uid(), host_id, 'host'::host_role));
create policy "invites select by token (open)" on public.member_invites for select
  using (true);
create policy "invites insert by host" on public.member_invites for insert
  with check (public.is_host_member(auth.uid(), host_id, 'host'::host_role));
create policy "invites delete by host" on public.member_invites for delete
  using (public.is_host_member(auth.uid(), host_id, 'host'::host_role));

-- NOTE: two SELECT policies on invites are OR'd; we want anyone with the token URL to read it.
-- Drop the redundant first one to avoid surprises:
drop policy "invites select by host" on public.member_invites;

-- events
create policy "events public read" on public.events for select
  using (
    (status = 'published' and not hidden)
    or public.is_any_host_member(auth.uid(), host_id)
  );
create policy "events insert by host member" on public.events for insert
  with check (public.is_host_member(auth.uid(), host_id, 'host'::host_role));
create policy "events update by host member" on public.events for update
  using (public.is_host_member(auth.uid(), host_id, 'host'::host_role));
create policy "events delete by host member" on public.events for delete
  using (public.is_host_member(auth.uid(), host_id, 'host'::host_role));

-- rsvps
create policy "rsvps select own" on public.rsvps for select
  using (
    user_id = auth.uid()
    or public.is_any_host_member(auth.uid(), public.host_of_event(event_id))
  );
-- writes go through SECURITY DEFINER RPCs; no insert/update/delete policies for users

-- feedback
create policy "feedback readable" on public.feedback for select using (true);
create policy "feedback insert by attendee after end" on public.feedback for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rsvps r
        join public.events e on e.id = r.event_id
      where r.event_id = feedback.event_id
        and r.user_id = auth.uid()
        and r.status = 'going'
        and e.ends_at < now()
    )
  );
create policy "feedback update own" on public.feedback for update using (user_id = auth.uid());
create policy "feedback delete own" on public.feedback for delete using (user_id = auth.uid());

-- gallery_photos
create policy "gallery public approved" on public.gallery_photos for select
  using (
    status = 'approved'
    or user_id = auth.uid()
    or public.is_any_host_member(auth.uid(), public.host_of_event(event_id))
  );
create policy "gallery insert by signed-in" on public.gallery_photos for insert
  with check (user_id = auth.uid());
create policy "gallery update by host" on public.gallery_photos for update
  using (public.is_any_host_member(auth.uid(), public.host_of_event(event_id)));
create policy "gallery delete by uploader or host" on public.gallery_photos for delete
  using (
    user_id = auth.uid()
    or public.is_any_host_member(auth.uid(), public.host_of_event(event_id))
  );

-- reports
create policy "reports insert by authed" on public.reports for insert
  with check (reporter_id = auth.uid());
create policy "reports select by host of target" on public.reports for select
  using (
    reporter_id = auth.uid()
    or (
      target_type = 'event'
      and public.is_any_host_member(
        auth.uid(),
        (select host_id from public.events where id = reports.target_id)
      )
    )
    or (
      target_type = 'photo'
      and public.is_any_host_member(
        auth.uid(),
        (select host_id from public.events where id = (
          select event_id from public.gallery_photos where id = reports.target_id
        ))
      )
    )
  );
create policy "reports update by host of target" on public.reports for update
  using (
    (target_type = 'event'
      and public.is_any_host_member(
        auth.uid(),
        (select host_id from public.events where id = reports.target_id)
      )
    )
    or (target_type = 'photo'
      and public.is_any_host_member(
        auth.uid(),
        (select host_id from public.events where id = (
          select event_id from public.gallery_photos where id = reports.target_id
        ))
      )
    )
  );

-- =========================================================
-- Storage buckets
-- =========================================================
insert into storage.buckets (id, name, public) values
  ('host-logos','host-logos', true),
  ('event-covers','event-covers', true),
  ('gallery','gallery', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Storage public read host-logos" on storage.objects for select
  using (bucket_id = 'host-logos');
create policy "Storage authed upload host-logos" on storage.objects for insert
  with check (bucket_id = 'host-logos' and auth.uid() is not null);
create policy "Storage authed update host-logos" on storage.objects for update
  using (bucket_id = 'host-logos' and auth.uid() is not null);

create policy "Storage public read event-covers" on storage.objects for select
  using (bucket_id = 'event-covers');
create policy "Storage authed upload event-covers" on storage.objects for insert
  with check (bucket_id = 'event-covers' and auth.uid() is not null);
create policy "Storage authed update event-covers" on storage.objects for update
  using (bucket_id = 'event-covers' and auth.uid() is not null);

create policy "Storage public read gallery" on storage.objects for select
  using (bucket_id = 'gallery');
create policy "Storage authed upload gallery" on storage.objects for insert
  with check (bucket_id = 'gallery' and auth.uid() is not null);
create policy "Storage authed update gallery" on storage.objects for update
  using (bucket_id = 'gallery' and auth.uid() is not null);

-- =========================================================
-- Realtime publication for rsvps (for check-in counters)
-- =========================================================
alter publication supabase_realtime add table public.rsvps;
