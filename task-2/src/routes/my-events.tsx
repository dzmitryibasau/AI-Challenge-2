import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatDateRange, isPast } from "@/lib/format";

export const Route = createFileRoute("/my-events")({
  component: MyEvents,
  head: () => ({ meta: [{ title: "My Events — OpenSeat" }] }),
});

type Row = { event: any; role: "host" | "checker"; host: any };

function MyEvents() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [hostFilter, setHostFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: mems } = await supabase
        .from("host_members")
        .select("role, host:hosts(id,name,slug)")
        .eq("user_id", user.id);
      const hostIds = (mems ?? []).map((m: any) => m.host?.id).filter(Boolean);
      if (hostIds.length === 0) { setRows([]); setLoading(false); return; }
      const { data: ev } = await supabase.from("events").select("*").in("host_id", hostIds).order("starts_at", { ascending: false });
      const out: Row[] = [];
      (ev ?? []).forEach((e: any) => {
        (mems ?? []).forEach((m: any) => {
          if (m.host?.id === e.host_id) out.push({ event: e, role: m.role, host: m.host });
        });
      });
      setRows(out);
      setLoading(false);
    })();
  }, [user]);

  const hosts = useMemo(() => Array.from(new Map(rows.map(r => [r.host.id, r.host])).values()), [rows]);
  const filtered = useMemo(() => rows.filter(r => {
    if (q && !r.event.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (hostFilter && r.host.id !== hostFilter) return false;
    if (from && new Date(r.event.starts_at) < new Date(from)) return false;
    if (to && new Date(r.event.starts_at) > new Date(to + "T23:59:59")) return false;
    return true;
  }), [rows, q, hostFilter, from, to]);

  if (authLoading || loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!user) return <div className="container max-w-md mx-auto py-20 text-center"><Button asChild><Link to="/login">Sign in</Link></Button></div>;

  return (
    <div className="container max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Events</h1>
        <p className="text-sm text-muted-foreground">Events you can manage or check in.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 border rounded-lg bg-card">
        <div className="sm:col-span-2"><Label>Search</Label><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Title" /></div>
        <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="sm:col-span-4 flex gap-2 flex-wrap">
          <Badge variant={!hostFilter ? "default" : "outline"} className="cursor-pointer" onClick={() => setHostFilter("")}>All hosts</Badge>
          {hosts.map(h => (
            <Badge key={h.id} variant={hostFilter === h.id ? "default" : "outline"} className="cursor-pointer" onClick={() => setHostFilter(h.id)}>{h.name}</Badge>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {filtered.length === 0 ? <p className="text-sm text-muted-foreground italic">No matching events.</p> : filtered.map(({ event: e, role, host }) => (
          <Card key={`${e.id}-${role}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <CardTitle className="text-base">
                  <Link to="/events/$slug" params={{ slug: e.slug }} className="hover:underline">{e.title}</Link>
                  <Badge className="ml-2" variant={role === "host" ? "default" : "secondary"}>{role}</Badge>
                  {isPast(e.ends_at) && <Badge variant="secondary" className="ml-2">Ended</Badge>}
                </CardTitle>
                <div className="text-xs text-muted-foreground">{host.name}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{formatDateRange(e.starts_at, e.ends_at, e.timezone)}</p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-0">
              <Button size="sm" variant="outline" asChild><Link to="/host/$slug/events/$id/checkin" params={{ slug: host.slug, id: e.id }}>Check-in</Link></Button>
              {role === "host" && <Button size="sm" variant="outline" asChild><Link to="/host/$slug/events/$id/edit" params={{ slug: host.slug, id: e.id }}>Edit</Link></Button>}
              {role === "host" && <Button size="sm" variant="ghost" asChild><Link to="/host/$slug/dashboard" params={{ slug: host.slug }}>Dashboard</Link></Button>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
