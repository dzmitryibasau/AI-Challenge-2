import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DemoUser = { email: string; password: string; name: string };

const DEMO_USERS: DemoUser[] = [
  { email: "demo-host@openseat.test", password: "demo1234", name: "Demo Host" },
  { email: "demo-attendee@openseat.test", password: "demo1234", name: "Demo Attendee" },
  { email: "demo-checker@openseat.test", password: "demo1234", name: "Demo Checker" },
];

async function ensureUser(u: DemoUser): Promise<string> {
  // Try create; if exists, look up via listUsers paging
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { name: u.name },
  });
  if (!error && created.user) return created.user.id;
  // Find existing
  let page = 1;
  while (page < 10) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
    if (found) return found.id;
    if (!data?.users.length) break;
    page++;
  }
  throw new Error(`Could not create or find user ${u.email}`);
}

function ticketCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const r = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `EVT-${r(4)}-${r(4)}`;
}

export const seedDemoData = createServerFn({ method: "POST" })
  .inputValidator((input: { token?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const expected = process.env.SETUP_DEMO_TOKEN;
    if (!expected) {
      throw new Error(
        "Demo seeding is disabled. An administrator must set the SETUP_DEMO_TOKEN secret to enable it."
      );
    }
    if (!data?.token || data.token !== expected) {
      throw new Error("Invalid or missing setup token.");
    }
  const [hostId, attendeeId, checkerId] = await Promise.all(DEMO_USERS.map(ensureUser));

  // Ensure profiles
  await supabaseAdmin.from("profiles").upsert(
    [
      { id: hostId, name: "Demo Host", email: DEMO_USERS[0].email },
      { id: attendeeId, name: "Demo Attendee", email: DEMO_USERS[1].email },
      { id: checkerId, name: "Demo Checker", email: DEMO_USERS[2].email },
    ],
    { onConflict: "id" }
  );

  // Host
  const hostSlug = "openseat-demo";
  const { data: existingHost } = await supabaseAdmin
    .from("hosts")
    .select("*")
    .eq("slug", hostSlug)
    .maybeSingle();

  let host = existingHost;
  if (!host) {
    const { data: created, error: hostErr } = await supabaseAdmin
      .from("hosts")
      .insert({
        slug: hostSlug,
        name: "OpenSeat Demo Collective",
        owner_id: hostId,
        bio: "A demo community host running free workshops, meetups, and gatherings to showcase OpenSeat.",
        contact_email: "demo-host@openseat.test",
        logo_url: null,
      })
      .select()
      .single();
    if (hostErr) throw new Error(hostErr.message);
    host = created;
  }

  // Memberships
  await supabaseAdmin.from("host_members").upsert(
    [
      { host_id: host!.id, user_id: hostId, role: "host" as const },
      { host_id: host!.id, user_id: checkerId, role: "checker" as const },
    ],
    { onConflict: "host_id,user_id,role" } as never
  );

  // Events
  const now = Date.now();
  const upcomingStart = new Date(now + 7 * 86400000).toISOString();
  const upcomingEnd = new Date(now + 7 * 86400000 + 2 * 3600000).toISOString();
  const pastStart = new Date(now - 10 * 86400000).toISOString();
  const pastEnd = new Date(now - 10 * 86400000 + 2 * 3600000).toISOString();

  async function upsertEvent(
    slug: string,
    fields: {
      title: string;
      description: string;
      starts_at: string;
      ends_at: string;
      capacity: number;
      venue_type: "in_person" | "online";
      venue_address?: string;
      online_link?: string;
      status: "published" | "draft";
      visibility: "public" | "unlisted";
      price_type: "free" | "paid";
      timezone: string;
    }
  ) {
    const { data: ex } = await supabaseAdmin.from("events").select("*").eq("slug", slug).maybeSingle();
    if (ex) return ex;
    const { data, error } = await supabaseAdmin
      .from("events")
      .insert({ slug, host_id: host!.id, ...fields })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const upcoming = await upsertEvent("demo-community-meetup", {
    title: "Demo Community Meetup",
    description:
      "Join the OpenSeat demo community for a friendly evening meetup. We'll share project updates, do lightning talks, and hang out. Free for everyone.",
    starts_at: upcomingStart,
    ends_at: upcomingEnd,
    capacity: 5,
    venue_type: "in_person" as const,
    venue_address: "Community Hall, 123 Demo Street",
    status: "published" as const,
    visibility: "public" as const,
    price_type: "free" as const,
    timezone: "UTC",
  });

  const past = await upsertEvent("demo-past-workshop", {
    title: "Demo Past Workshop: Intro to OpenSeat",
    description:
      "A past hands-on workshop introducing OpenSeat features. Thanks to everyone who joined!",
    starts_at: pastStart,
    ends_at: pastEnd,
    capacity: 20,
    venue_type: "online" as const,
    online_link: "https://meet.example.com/demo",
    status: "published" as const,
    visibility: "public" as const,
    price_type: "free" as const,
    timezone: "UTC",
  });

  // RSVPs on upcoming: attendee=going checked-in, checker=going, plus 5 fillers + waitlist
  async function ensureRsvp(
    eventId: string,
    userId: string,
    status: "going" | "waitlist",
    checked = false
  ) {
    const { data: ex } = await supabaseAdmin
      .from("rsvps")
      .select("*")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle();
    if (ex) return ex;
    const { data, error } = await supabaseAdmin
      .from("rsvps")
      .insert({
        event_id: eventId,
        user_id: userId,
        status,
        ticket_code: ticketCode(),
        checked_in_at: checked ? new Date().toISOString() : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  await ensureRsvp(upcoming.id, attendeeId, "going", true);
  await ensureRsvp(upcoming.id, checkerId, "going", false);
  await ensureRsvp(upcoming.id, hostId, "waitlist", false);

  // Past event: attendee went and checked in
  await ensureRsvp(past.id, attendeeId, "going", true);
  await ensureRsvp(past.id, checkerId, "going", true);

  // Gallery pending photo on past event
  const { data: existingPhoto } = await supabaseAdmin
    .from("gallery_photos")
    .select("id")
    .eq("event_id", past.id)
    .eq("user_id", attendeeId)
    .maybeSingle();
  if (!existingPhoto) {
    await supabaseAdmin.from("gallery_photos").insert({
      event_id: past.id,
      user_id: attendeeId,
      status: "pending" as const,
      image_url:
        "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&q=80",
    });
  }

  // Open report on upcoming event
  const { data: existingReport } = await supabaseAdmin
    .from("reports")
    .select("id")
    .eq("target_id", upcoming.id)
    .eq("reporter_id", attendeeId)
    .maybeSingle();
  if (!existingReport) {
    await supabaseAdmin.from("reports").insert({
      target_type: "event" as const,
      target_id: upcoming.id,
      reporter_id: attendeeId,
      reason: "Demo report: please review this event listing.",
      status: "open" as const,
    });
  }

  return {
    ok: true,
    credentials: DEMO_USERS.map((u) => ({ email: u.email, password: u.password })),
    hostSlug,
    upcomingSlug: upcoming.slug,
    pastSlug: past.slug,
  };
});
