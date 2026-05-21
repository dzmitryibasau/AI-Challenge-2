import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from "qrcode.react";
import { formatDateRange, buildICS, downloadFile } from "@/lib/format";
import { Loader2, Calendar, Ticket as TicketIcon, Download, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/tickets")({
  component: TicketsPage,
  head: () => ({
    meta: [
      { title: "My Tickets — OpenSeat" },
      { name: "description", content: "Your OpenSeat tickets with QR codes and calendar downloads." },
    ],
  }),
});

type T = {
  id: string;
  status: "going" | "waitlist" | "cancelled";
  ticket_code: string;
  promoted_at: string | null;
  checked_in_at: string | null;
  event: {
    id: string;
    title: string;
    slug: string;
    description: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    venue_type: "in_person" | "online";
    venue_address: string | null;
    online_link: string | null;
    ends_at_ts?: number;
  };
};

function TicketsPage() {
  const { user, loading: authLoading } = useAuth();
  const [tickets, setTickets] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("rsvps")
      .select("id,status,ticket_code,promoted_at,checked_in_at,event:events(id,title,slug,description,starts_at,ends_at,timezone,venue_type,venue_address,online_link)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTickets((data as unknown as T[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function cancel(id: string) {
    const { error } = await supabase.rpc("cancel_rsvp", { _rsvp_id: id });
    if (error) return toast.error(error.message);
    toast.success("RSVP cancelled");
    load();
  }

  if (authLoading) return <Loader full />;
  if (!user)
    return (
      <Center>
        <p className="text-muted-foreground">Sign in to view your tickets.</p>
        <Button asChild className="mt-3"><Link to="/login">Sign in</Link></Button>
      </Center>
    );
  if (loading) return <Loader full />;

  const now = Date.now();
  const upcoming = tickets.filter(t => new Date(t.event.ends_at).getTime() >= now);
  const past = tickets.filter(t => new Date(t.event.ends_at).getTime() < now);

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Tickets</h1>
        <p className="text-sm text-muted-foreground mt-1">Your RSVPs, ticket codes, and calendar files.</p>
      </div>
      <Section title="Upcoming" empty="No upcoming tickets. Browse events on Explore.">
        {upcoming.map(t => <TicketCard key={t.id} t={t} onCancel={cancel} />)}
      </Section>
      <Section title="Past" empty="No past tickets.">
        {past.map(t => <TicketCard key={t.id} t={t} onCancel={cancel} past />)}
      </Section>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty: string }) {
  const arr = Array.isArray(children) ? children : [children];
  const has = arr.flat().filter(Boolean).length > 0;
  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      {has ? <div className="grid sm:grid-cols-2 gap-4">{children}</div> : <p className="text-sm text-muted-foreground italic">{empty}</p>}
    </div>
  );
}

function TicketCard({ t, onCancel, past }: { t: T; onCancel: (id: string) => void; past?: boolean }) {
  const e = t.event;
  function dlIcs() {
    const ics = buildICS({
      uid: t.id, title: e.title, description: e.description ?? "",
      location: e.venue_type === "online" ? (e.online_link ?? "Online") : (e.venue_address ?? ""),
      startISO: e.starts_at, endISO: e.ends_at,
      url: typeof window !== "undefined" ? `${window.location.origin}/events/${e.slug}` : undefined,
    });
    downloadFile(`${e.slug}.ics`, ics, "text/calendar;charset=utf-8");
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">
            <Link to="/events/$slug" params={{ slug: e.slug }} className="hover:underline">{e.title}</Link>
          </CardTitle>
          <StatusBadge status={t.status} checked={!!t.checked_in_at} />
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Calendar className="h-3.5 w-3.5" />{formatDateRange(e.starts_at, e.ends_at, e.timezone)}</p>
        {t.promoted_at && t.status === "going" && (
          <p className="text-xs text-emerald-600 mt-1">Promoted from waitlist 🎉</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {t.status === "going" && !past && (
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded border">
              <QRCodeSVG value={t.ticket_code} size={96} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ticket code</p>
              <p className="font-mono font-semibold tracking-wider">{t.ticket_code}</p>
              {t.checked_in_at && <p className="text-xs text-emerald-600 mt-1">Checked in ✓</p>}
            </div>
          </div>
        )}
        {t.status === "waitlist" && (
          <p className="text-sm text-muted-foreground">You're on the waitlist. We'll promote you if a seat opens.</p>
        )}
        {t.status === "cancelled" && (
          <p className="text-sm text-muted-foreground">RSVP cancelled.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {t.status === "going" && (
            <Button size="sm" variant="outline" onClick={dlIcs}><Download className="h-3.5 w-3.5" /> .ics</Button>
          )}
          {!past && t.status !== "cancelled" && (
            <Button size="sm" variant="ghost" onClick={() => onCancel(t.id)}><X className="h-3.5 w-3.5" /> Cancel</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, checked }: { status: string; checked: boolean }) {
  if (checked) return <Badge className="bg-emerald-600">Checked in</Badge>;
  if (status === "going") return <Badge><TicketIcon className="h-3 w-3" /> Going</Badge>;
  if (status === "waitlist") return <Badge variant="secondary">Waitlist</Badge>;
  return <Badge variant="outline">Cancelled</Badge>;
}

function Loader({ full }: { full?: boolean }) {
  return <div className={full ? "py-20 grid place-items-center" : ""}><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div className="container max-w-md mx-auto px-4 py-20 text-center">{children}</div>;
}
