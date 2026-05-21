import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, Globe, Users, Loader2, Star, Flag, Upload } from "lucide-react";
import { formatDateRange, isPast } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/events/$slug")({
  component: EventPage,
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("events")
      .select("*, host:hosts(id,name,slug,bio,logo_url,owner_id,created_at)")
      .eq("slug", params.slug)
      .maybeSingle();
    return { event: data };
  },
  head: ({ loaderData }) => {
    const e = loaderData?.event as any;
    if (!e) return { meta: [{ title: "Event — OpenSeat" }] };
    const title = `${e.title} — OpenSeat`;
    const desc = (e.description || "Free community event").slice(0, 160);
    const img = e.cover_image_url || undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        ...(img ? [{ property: "og:image", content: img }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        ...(img ? [{ name: "twitter:image", content: img }] : []),
      ],
    };
  },
});

function EventPage() {
  const { event: initialEvent } = Route.useLoaderData() as { event: any };
  const params = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState(initialEvent);
  const [rsvp, setRsvp] = useState<any>(null);
  const [counts, setCounts] = useState({ going: 0, waitlist: 0 });
  const [feedback, setFeedback] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function reload() {
    if (!event) return;
    const [c1, c2, fb, ph, myRsvp] = await Promise.all([
      supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("status", "going"),
      supabase.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("status", "waitlist"),
      supabase.from("feedback").select("*, profile:profiles(name,avatar_url)").eq("event_id", event.id).order("created_at", { ascending: false }),
      supabase.from("gallery_photos").select("*").eq("event_id", event.id).eq("status", "approved").order("created_at", { ascending: false }),
      user
        ? supabase.from("rsvps").select("*").eq("event_id", event.id).eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setCounts({ going: c1.count ?? 0, waitlist: c2.count ?? 0 });
    setFeedback(fb.data ?? []);
    setPhotos(ph.data ?? []);
    setRsvp(myRsvp.data ?? null);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, user?.id]);

  if (!event) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">Event not found</h1>
        <Link to="/" className="text-primary underline mt-2 inline-block">Back to Explore</Link>
      </div>
    );
  }

  const ended = isPast(event.ends_at);
  const goingFull = counts.going >= event.capacity;

  async function handleRSVP() {
    if (!user) {
      navigate({ to: "/login", search: { redirect: `/events/${params.slug}` } });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("rsvp_to_event", { _event_id: event.id });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = data as any;
    if (r.status === "going") toast.success("You're going! Ticket added.");
    else if (r.status === "waitlist") toast.info("Event full — you're on the waitlist.");
    setRsvp(r);
    reload();
  }

  async function handleCancel() {
    if (!rsvp) return;
    setLoading(true);
    const { error } = await supabase.rpc("cancel_rsvp", { _rsvp_id: rsvp.id });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("RSVP cancelled");
    reload();
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="aspect-[16/7] rounded-xl overflow-hidden bg-muted relative">
        {event.cover_image_url ? (
          <img src={event.cover_image_url} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full grid place-items-center text-muted-foreground bg-gradient-to-br from-primary/10 to-accent/30">
            <Calendar className="h-16 w-16" />
          </div>
        )}
        {ended && (
          <div className="absolute top-3 left-3">
            <Badge variant="secondary" className="text-sm">Ended</Badge>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div>
            <h1 className="text-3xl font-bold leading-tight">{event.title}</h1>
            {event.host && (
              <Link to="/hosts/$slug" params={{ slug: event.host.slug }} className="inline-flex items-center gap-2 mt-2 text-sm text-muted-foreground hover:text-foreground">
                {event.host.logo_url && <img src={event.host.logo_url} alt="" className="h-5 w-5 rounded-full object-cover" />}
                by {event.host.name}
              </Link>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> {formatDateRange(event.starts_at, event.ends_at, event.timezone)}</p>
            <p className="flex items-center gap-2">
              {event.venue_type === "online" ? <Globe className="h-4 w-4 text-muted-foreground" /> : <MapPin className="h-4 w-4 text-muted-foreground" />}
              {event.venue_type === "online" ? (event.online_link ?? "Online") : (event.venue_address ?? "TBA")}
            </p>
            <p className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> {counts.going} going · {counts.waitlist} waitlisted · capacity {event.capacity}</p>
          </div>

          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground/90">
            {event.description || <span className="text-muted-foreground italic">No description yet.</span>}
          </div>

          {photos.length > 0 && (
            <div>
              <h2 className="font-semibold mb-2">Gallery</h2>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <a key={p.id} href={p.image_url} target="_blank" rel="noreferrer" className="aspect-square block overflow-hidden rounded-md bg-muted">
                    <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <FeedbackSection event={event} ended={ended} user={user} feedback={feedback} onChange={reload} rsvp={rsvp} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {ended ? "Event ended" : rsvp && rsvp.status !== "cancelled" ? "You're in" : "Attend"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!ended && (!rsvp || rsvp.status === "cancelled") && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {goingFull ? "Event is full — you'll join the waitlist." : "Free to attend. Get a digital ticket."}
                  </p>
                  <Button className="w-full" onClick={handleRSVP} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (goingFull ? "Join waitlist" : "RSVP")}
                  </Button>
                </>
              )}
              {!ended && rsvp && rsvp.status === "going" && (
                <>
                  <Badge>Going</Badge>
                  <p className="text-xs text-muted-foreground">Ticket code: <code className="font-mono">{rsvp.ticket_code}</code></p>
                  <Button asChild className="w-full" variant="secondary">
                    <Link to="/tickets">View ticket</Link>
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handleCancel} disabled={loading}>Cancel RSVP</Button>
                </>
              )}
              {!ended && rsvp && rsvp.status === "waitlist" && (
                <>
                  <Badge variant="secondary">Waitlisted</Badge>
                  <p className="text-xs text-muted-foreground">You'll be promoted if a spot opens.</p>
                  <Button variant="outline" className="w-full" onClick={handleCancel} disabled={loading}>Leave waitlist</Button>
                </>
              )}
              {ended && (
                <p className="text-sm text-muted-foreground">This event has ended.</p>
              )}
            </CardContent>
          </Card>
          <ReportButton targetType="event" targetId={event.id} />
          {!ended && user && rsvp?.status === "going" && (
            <UploadPhoto eventId={event.id} userId={user.id} onUploaded={reload} />
          )}
          {ended && user && (
            <UploadPhoto eventId={event.id} userId={user.id} onUploaded={reload} />
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackSection({ event, ended, user, feedback, onChange, rsvp }: any) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const avg = feedback.length ? feedback.reduce((a: number, f: any) => a + f.rating, 0) / feedback.length : 0;
  const can = ended && user && rsvp?.status === "going";
  const mine = feedback.find((f: any) => f.user_id === user?.id);

  async function submit() {
    setSubmitting(true);
    const { error } = await supabase.from("feedback").upsert(
      { event_id: event.id, user_id: user.id, rating, comment: comment || null },
      { onConflict: "event_id,user_id" },
    );
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Thanks for the feedback!");
      setComment("");
      onChange();
    }
  }

  return (
    <div>
      <h2 className="font-semibold mb-2">Feedback {feedback.length > 0 && <span className="text-muted-foreground text-sm font-normal">· {avg.toFixed(1)} ★ ({feedback.length})</span>}</h2>
      {can && !mine && (
        <div className="border rounded-md p-3 mb-3 space-y-2">
          <Label>Your rating</Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} type="button">
                <Star className={`h-5 w-5 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
          <Textarea placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button size="sm" onClick={submit} disabled={submitting}>Post feedback</Button>
        </div>
      )}
      {feedback.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback yet.</p>
      ) : (
        <ul className="space-y-3">
          {feedback.map((f: any) => (
            <li key={f.id} className="border rounded-md p-3">
              <div className="flex items-center gap-2 text-sm">
                <strong>{f.profile?.name || "Attendee"}</strong>
                <span className="text-primary">{"★".repeat(f.rating)}<span className="text-muted-foreground">{"★".repeat(5 - f.rating)}</span></span>
              </div>
              {f.comment && <p className="text-sm mt-1">{f.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportButton({ targetType, targetId }: { targetType: "event" | "photo"; targetId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!user) {
      toast.error("Sign in to report");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Reported. A host will review.");
      setOpen(false);
      setReason("");
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground"><Flag className="h-4 w-4 mr-1" />Report</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {targetType}</DialogTitle>
        </DialogHeader>
        <Textarea placeholder="Why are you reporting this?" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button onClick={submit} disabled={!reason || busy}>Submit report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadPhoto({ eventId, userId, onUploaded }: { eventId: string; userId: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const path = `${eventId}/${userId}/${Date.now()}-${f.name}`;
    const up = await supabase.storage.from("gallery").upload(path, f, { upsert: false });
    if (up.error) {
      toast.error(up.error.message);
      setBusy(false);
      return;
    }
    const { data: pub } = supabase.storage.from("gallery").getPublicUrl(path);
    const ins = await supabase.from("gallery_photos").insert({ event_id: eventId, user_id: userId, image_url: pub.publicUrl });
    setBusy(false);
    if (ins.error) toast.error(ins.error.message);
    else {
      toast.success("Uploaded — pending host approval");
      onUploaded();
    }
  }
  return (
    <div className="border rounded-md p-3">
      <Label className="text-sm flex items-center gap-2"><Upload className="h-4 w-4" /> Share a photo</Label>
      <Input type="file" accept="image/*" onChange={onChange} disabled={busy} className="mt-2" />
      <p className="text-xs text-muted-foreground mt-1">Photos appear after host approval.</p>
    </div>
  );
}
