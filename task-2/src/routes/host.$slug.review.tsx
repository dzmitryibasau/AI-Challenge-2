import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/host/$slug/review")({
  component: Review,
  head: () => ({ meta: [{ title: "Review Queue — OpenSeat" }] }),
});

function Review() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const [host, setHost] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: h } = await supabase.from("hosts").select("*").eq("slug", slug).maybeSingle();
    if (!h) { setLoading(false); return; }
    setHost(h);
    const { data: ev } = await supabase.from("events").select("id,title,slug").eq("host_id", h.id);
    const ids = (ev ?? []).map((e: any) => e.id);
    const evMap = Object.fromEntries((ev ?? []).map((e: any) => [e.id, e]));
    if (ids.length === 0) { setPhotos([]); setReports([]); setLoading(false); return; }
    const [{ data: ph }, { data: rep }] = await Promise.all([
      supabase.from("gallery_photos").select("*").in("event_id", ids).neq("status", "hidden").order("created_at", { ascending: false }),
      supabase.from("reports").select("*").eq("status", "open").order("created_at", { ascending: false }),
    ]);
    setPhotos((ph ?? []).map((p: any) => ({ ...p, event: evMap[p.event_id] })));
    setReports((rep ?? []).filter((r: any) => {
      if (r.target_type === "event") return ids.includes(r.target_id);
      return true; // photo reports filtered below by lookup
    }));
    setLoading(false);
  }, [slug]);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function setPhotoStatus(id: string, status: "approved" | "hidden") {
    const { error } = await supabase.from("gallery_photos").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Photo ${status}`);
    load();
  }
  async function resolveReport(id: string) {
    const { error } = await supabase.from("reports").update({ status: "resolved" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Report resolved");
    load();
  }
  async function hideEvent(eventId: string, reportId: string) {
    await supabase.from("events").update({ hidden: true }).eq("id", eventId);
    await resolveReport(reportId);
  }
  async function hidePhoto(photoId: string, reportId: string) {
    await supabase.from("gallery_photos").update({ status: "hidden" }).eq("id", photoId);
    await resolveReport(reportId);
  }

  if (authLoading || loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!user) return <div className="container max-w-md mx-auto py-20 text-center"><Button asChild><Link to="/login">Sign in</Link></Button></div>;
  if (!host) return <div className="py-20 text-center">Host not found.</div>;

  const pendingPhotos = photos.filter(p => p.status === "pending");

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">{host.name} · Review</h1>

      <section>
        <h2 className="text-lg font-semibold mb-3">Pending photos ({pendingPhotos.length})</h2>
        {pendingPhotos.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pendingPhotos.map(p => (
              <Card key={p.id}>
                <a href={p.image_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden">
                  <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                </a>
                <CardContent className="p-2 space-y-1">
                  <p className="text-xs text-muted-foreground truncate">{p.event?.title}</p>
                  <div className="flex gap-1">
                    <Button size="sm" className="flex-1" onClick={() => setPhotoStatus(p.id, "approved")}><Check className="h-3.5 w-3.5" /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => setPhotoStatus(p.id, "hidden")}><EyeOff className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Open reports ({reports.length})</h2>
        {reports.length === 0 ? <Empty /> : reports.map(r => (
          <Card key={r.id} className="mb-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm"><Badge variant="outline" className="mr-2">{r.target_type}</Badge>Report</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="whitespace-pre-wrap">{r.reason}</p>
              <div className="flex flex-wrap gap-2">
                {r.target_type === "event" && <Button size="sm" variant="destructive" onClick={() => hideEvent(r.target_id, r.id)}><EyeOff className="h-3.5 w-3.5" /> Hide event</Button>}
                {r.target_type === "photo" && <Button size="sm" variant="destructive" onClick={() => hidePhoto(r.target_id, r.id)}><EyeOff className="h-3.5 w-3.5" /> Hide photo</Button>}
                <Button size="sm" variant="outline" onClick={() => resolveReport(r.id)}>Mark resolved</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
function Empty() { return <p className="text-sm text-muted-foreground italic">Nothing pending.</p>; }
