import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EventCard, type EventRow } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Explore,
  head: () => ({
    meta: [
      { title: "Explore — OpenSeat" },
      { name: "description", content: "Browse upcoming community events on OpenSeat." },
    ],
  }),
});

type Row = EventRow & { host_id: string };

function Explore() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [includePast, setIncludePast] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    supabase
      .from("events")
      .select("*, host:hosts(name,slug,logo_url)")
      .eq("status", "published")
      .eq("hidden", false)
      .eq("visibility", "public")
      .order("starts_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) console.error(error);
        setRows((data as unknown as Row[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    return rows.filter((e) => {
      const ended = new Date(e.ends_at).getTime() < now;
      if (!includePast && ended) return false;
      if (q && !`${e.title} ${e.description}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (location && !(e.venue_address ?? "").toLowerCase().includes(location.toLowerCase())) return false;
      if (from && new Date(e.starts_at) < new Date(from)) return false;
      if (to && new Date(e.starts_at) > new Date(to + "T23:59:59")) return false;
      return true;
    });
  }, [rows, q, includePast, location, from, to]);

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Explore events</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Free community events you can attend. RSVP with one click.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 p-4 rounded-xl border bg-card">
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="q">Search</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="q" className="pl-8" placeholder="Title or description" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loc">Location</Label>
          <Input id="loc" placeholder="City or venue" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Include past</Label>
          <div className="h-9 flex items-center">
            <Switch checked={includePast} onCheckedChange={setIncludePast} />
            <span className="ml-2 text-sm text-muted-foreground">{includePast ? "Showing past too" : "Upcoming only"}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border rounded-xl bg-card">
          <p className="text-lg font-medium">No events found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Try clearing filters or toggling "Include past".
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
