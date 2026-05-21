import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Download, Edit, Copy, Eye, EyeOff, Users, ShieldAlert } from "lucide-react";
import { formatDateRange, isPast, buildCSV, downloadFile, slugify } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/host/$slug/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Host Dashboard — OpenSeat" }] }),
});

function Dashboard() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const [host, setHost] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, { going: number; waitlist: number; checked: number }>>({});
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: h } = await supabase.from("hosts").select("*").eq("slug", slug).maybeSingle();
    if (!h) { setLoading(false); return; }
    setHost(h);
    const { data: mem } = await supabase.from("host_members").select("role").eq("host_id", h.id).eq("user_id", user.id);
    setIsHost(!!mem?.some((m: any) => m.role === "host"));
    const { data: ev } = await supabase.from("events").select("*").eq("host_id", h.id).order("starts_at", { ascending: false });
    setEvents(ev ?? []);
    if (ev && ev.length > 0) {
      const { data: rs } = await supabase.from("rsvps").select("event_id,status,checked_in_at").in("event_id", ev.map(e => e.id));
      const s: typeof stats = {};
      ev.forEach(e => s[e.id] = { going: 0, waitlist: 0, checked: 0 });
      (rs ?? []).forEach((r: any) => {
        if (!s[r.event_id]) return;
        if (r.status === "going") s[r.event_id].going++;
        if (r.status === "waitlist") s[r.event_id].waitlist++;
        if (r.checked_in_at) s[r.event_id].checked++;
      });
      setStats(s);
    }
    setLoading(false);
  }, [slug, user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function togglePublish(e: any) {
    const next = e.status === "published" ? "draft" : "published";
    const { error } = await supabase.from("events").update({ status: next }).eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success(next === "published" ? "Published" : "Unpublished");
    load();
  }

  async function duplicate(e: any) {
    const newSlug = slugify(`${e.title}-copy-${Date.now().toString(36)}`);
    const { error } = await supabase.from("events").insert({
      host_id: e.host_id, title: `${e.title} (Copy)`, slug: newSlug, description: e.description,
      starts_at: e.starts_at, ends_at: e.ends_at, timezone: e.timezone, capacity: e.capacity,
      venue_type: e.venue_type, venue_address: e.venue_address, online_link: e.online_link,
      cover_image_url: e.cover_image_url, visibility: e.visibility, status: "draft", price_type: e.price_type,
    });
    if (error) return toast.error(error.message);
    toast.success("Duplicated as draft");
    load();
  }

  async function exportCsv(e: any) {
    const { data: rs, error } = await supabase.rpc("get_event_attendees", { _event_id: e.id });
    if (error) return toast.error(error.message);
    const rows = (rs ?? [])
      .slice()
      .sort((a: any, b: any) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
      .map((r: any) => ({
        name: r.name ?? "",
        email: r.email ?? "",
        "RSVP status": r.status,
        "check-in time": r.checked_in_at ?? "",
      }));
    const csv = buildCSV(rows, ["name", "email", "RSVP status", "check-in time"]);
    downloadFile(`${e.slug}-attendees.csv`, csv);
  }

  if (authLoading || loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!user) return <div className="container max-w-md mx-auto py-20 text-center"><Button asChild><Link to="/login">Sign in</Link></Button></div>;
  if (!host) return <div className="py-20 text-center">Host not found.</div>;

  const upcoming = events.filter(e => !isPast(e.ends_at));
  const past = events.filter(e => isPast(e.ends_at));

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{host.name}</h1>
          <p className="text-sm text-muted-foreground">Host dashboard</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isHost && <Button asChild><Link to="/host/$slug/events/new" params={{ slug }}><Plus className="h-4 w-4" /> New Event</Link></Button>}
          {isHost && <Button asChild variant="outline"><Link to="/host/$slug/edit" params={{ slug }}><Edit className="h-4 w-4" /> Edit Host</Link></Button>}
          {isHost && <Button asChild variant="outline"><Link to="/host/$slug/members" params={{ slug }}><Users className="h-4 w-4" /> Members</Link></Button>}
          {isHost && <Button asChild variant="outline"><Link to="/host/$slug/review" params={{ slug }}><ShieldAlert className="h-4 w-4" /> Review</Link></Button>}
          <Button asChild variant="ghost"><Link to="/hosts/$slug" params={{ slug }}>Public page</Link></Button>
        </div>
      </div>

      <Section title="Upcoming">
        {upcoming.length === 0 ? <Empty /> : upcoming.map(e => <EventRow key={e.id} e={e} stats={stats[e.id]} slug={slug} isHost={isHost} onToggle={togglePublish} onDup={duplicate} onCsv={exportCsv} />)}
      </Section>
      <Section title="Past">
        {past.length === 0 ? <Empty /> : past.map(e => <EventRow key={e.id} e={e} stats={stats[e.id]} slug={slug} isHost={isHost} onToggle={togglePublish} onDup={duplicate} onCsv={exportCsv} past />)}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h2 className="text-xl font-semibold mb-3">{title}</h2><div className="space-y-3">{children}</div></div>;
}
function Empty() { return <p className="text-sm text-muted-foreground italic">No events.</p>; }

function EventRow({ e, stats, slug, isHost, onToggle, onDup, onCsv, past }: any) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">
              <Link to="/events/$slug" params={{ slug: e.slug }} className="hover:underline">{e.title}</Link>
              {e.status === "draft" && <Badge variant="outline" className="ml-2">Draft</Badge>}
              {e.visibility === "unlisted" && <Badge variant="secondary" className="ml-2">Unlisted</Badge>}
              {past && <Badge variant="secondary" className="ml-2">Ended</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{formatDateRange(e.starts_at, e.ends_at, e.timezone)}</p>
          </div>
          <div className="flex gap-2 text-sm">
            <Stat label="Going" v={stats?.going ?? 0} />
            <Stat label="Waitlist" v={stats?.waitlist ?? 0} />
            <Stat label="Checked-in" v={stats?.checked ?? 0} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-0">
        {isHost && <Button size="sm" variant="outline" asChild><Link to="/host/$slug/events/$id/edit" params={{ slug, id: e.id }}><Edit className="h-3.5 w-3.5" /> Edit</Link></Button>}
        {isHost && <Button size="sm" variant="outline" onClick={() => onToggle(e)}>{e.status === "published" ? <><EyeOff className="h-3.5 w-3.5" /> Unpublish</> : <><Eye className="h-3.5 w-3.5" /> Publish</>}</Button>}
        {isHost && <Button size="sm" variant="outline" onClick={() => onDup(e)}><Copy className="h-3.5 w-3.5" /> Duplicate</Button>}
        <Button size="sm" variant="outline" asChild><Link to="/host/$slug/events/$id/checkin" params={{ slug, id: e.id }}>Check-in</Link></Button>
        <Button size="sm" variant="outline" onClick={() => onCsv(e)}><Download className="h-3.5 w-3.5" /> CSV</Button>
      </CardContent>
    </Card>
  );
}
function Stat({ label, v }: { label: string; v: number }) {
  return <div className="text-right"><div className="font-semibold">{v}</div><div className="text-[10px] text-muted-foreground uppercase">{label}</div></div>;
}
