import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Undo2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/host/$slug/events/$id/checkin")({
  component: CheckinPage,
  head: () => ({ meta: [{ title: "Check-in — OpenSeat" }] }),
});

type Counts = { going: number; waitlist: number; checked: number };

function CheckinPage() {
  const { slug, id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<any>(null);
  const [counts, setCounts] = useState<Counts>({ going: 0, waitlist: 0, checked: 0 });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<{ rsvp_id: string; name: string } | null>(null);
  const [log, setLog] = useState<Array<{ ok: boolean; msg: string; time: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshCounts = useCallback(async () => {
    const { data: rs } = await supabase.from("rsvps").select("status,checked_in_at").eq("event_id", id);
    const c: Counts = { going: 0, waitlist: 0, checked: 0 };
    (rs ?? []).forEach((r: any) => {
      if (r.status === "going") c.going++;
      if (r.status === "waitlist") c.waitlist++;
      if (r.checked_in_at) c.checked++;
    });
    setCounts(c);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data: e } = await supabase.from("events").select("*, host:hosts(slug,name)").eq("id", id).maybeSingle();
      setEvent(e);
      refreshCounts();
    })();
    const ch = supabase.channel(`checkin-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rsvps", filter: `event_id=eq.${id}` }, () => refreshCounts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refreshCounts]);

  async function submit(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("check_in_ticket", { _event_id: id, _code: code.trim() });
    setBusy(false);
    const time = new Date().toLocaleTimeString();
    if (error) {
      toast.error(error.message);
      setLog(l => [{ ok: false, msg: error.message, time }, ...l].slice(0, 10));
    } else {
      const r = data as any;
      if (r.ok) {
        toast.success(`Checked in: ${r.name}`);
        setLastSuccess({ rsvp_id: r.rsvp_id, name: r.name });
        setLog(l => [{ ok: true, msg: `${r.name} (${code.trim()})`, time }, ...l].slice(0, 10));
      } else {
        const reason = r.reason === "duplicate" ? `Already checked in: ${r.name}` :
          r.reason === "not_found" ? "Ticket not found" :
          r.reason === "cancelled" ? "RSVP cancelled" :
          r.reason === "waitlist" ? "Waitlisted — not allowed" : r.reason;
        toast.warning(reason);
        setLog(l => [{ ok: false, msg: reason, time }, ...l].slice(0, 10));
      }
    }
    setCode("");
    inputRef.current?.focus();
    refreshCounts();
  }

  async function undo() {
    if (!lastSuccess) return;
    const { error } = await supabase.rpc("undo_check_in", { _rsvp_id: lastSuccess.rsvp_id });
    if (error) return toast.error(error.message);
    toast.success(`Undone: ${lastSuccess.name}`);
    setLastSuccess(null);
    refreshCounts();
  }

  if (authLoading) return <Spin />;
  if (!user) return <div className="container max-w-md mx-auto py-20 text-center"><Button asChild><Link to="/login">Sign in</Link></Button></div>;
  if (!event) return <Spin />;

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{event.title}</h1>
        <p className="text-sm text-muted-foreground">Check-in</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Going" v={counts.going} />
        <Stat label="Waitlist" v={counts.waitlist} />
        <Stat label="Checked-in" v={counts.checked} highlight />
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <Input ref={inputRef} autoFocus placeholder="EVT-XXXX-XXXX" value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="font-mono tracking-wider" />
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check in"}</Button>
        {lastSuccess && <Button type="button" variant="outline" onClick={undo}><Undo2 className="h-4 w-4" /> Undo</Button>}
      </form>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recent scans</CardTitle></CardHeader>
        <CardContent>
          {log.length === 0 ? <p className="text-xs text-muted-foreground">No scans yet.</p> : (
            <ul className="space-y-1.5">
              {log.map((l, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {l.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
                  <span className="font-mono text-xs text-muted-foreground">{l.time}</span>
                  <span>{l.msg}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Live counters refresh in real time. Duplicate scans are blocked. <Link to="/host/$slug/dashboard" params={{ slug }} className="underline">Back to dashboard</Link></p>
    </div>
  );
}

function Stat({ label, v, highlight }: { label: string; v: number; highlight?: boolean }) {
  return <div className={`rounded-lg border p-4 text-center ${highlight ? "bg-primary/5 border-primary/30" : "bg-card"}`}>
    <div className="text-3xl font-bold">{v}</div>
    <div className="text-xs text-muted-foreground uppercase mt-1">{label}</div>
  </div>;
}
function Spin() { return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>; }
