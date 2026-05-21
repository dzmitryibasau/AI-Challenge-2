import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { slugify } from "@/lib/format";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, Link } from "@tanstack/react-router";

type EventForm = {
  id?: string;
  title: string;
  description: string;
  slug: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: number;
  venue_type: "in_person" | "online";
  venue_address: string;
  online_link: string;
  cover_image_url: string | null;
  visibility: "public" | "unlisted";
  status: "draft" | "published";
};

const tzList = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney"];

function toLocalInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function EventEditor({ hostSlug, eventId }: { hostSlug: string; eventId?: string }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [host, setHost] = useState<any>(null);
  const [form, setForm] = useState<EventForm>({
    title: "", description: "", slug: "", starts_at: "", ends_at: "", timezone: "UTC",
    capacity: 50, venue_type: "in_person", venue_address: "", online_link: "",
    cover_image_url: null, visibility: "public", status: "draft",
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  useEffect(() => {
    (async () => {
      const { data: h } = await supabase.from("hosts").select("*").eq("slug", hostSlug).maybeSingle();
      setHost(h);
      if (eventId) {
        const { data: e } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
        if (e) setForm({
          id: e.id, title: e.title, description: e.description, slug: e.slug,
          starts_at: toLocalInput(e.starts_at), ends_at: toLocalInput(e.ends_at),
          timezone: e.timezone, capacity: e.capacity, venue_type: e.venue_type,
          venue_address: e.venue_address ?? "", online_link: e.online_link ?? "",
          cover_image_url: e.cover_image_url, visibility: e.visibility, status: e.status,
        });
      }
      setLoading(false);
    })();
  }, [hostSlug, eventId]);

  async function save(publish: boolean) {
    if (!host || !user) return;
    if (!form.title || !form.starts_at || !form.ends_at) { toast.error("Title, start and end required"); return; }
    setBusy(true);
    let cover = form.cover_image_url;
    if (coverFile) {
      const path = `${host.id}/${Date.now()}-${coverFile.name}`;
      const up = await supabase.storage.from("event-covers").upload(path, coverFile, { upsert: true });
      if (up.error) { toast.error(up.error.message); setBusy(false); return; }
      cover = supabase.storage.from("event-covers").getPublicUrl(path).data.publicUrl;
    }
    const payload = {
      title: form.title, description: form.description, slug: form.slug || slugify(form.title),
      starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(),
      timezone: form.timezone, capacity: form.capacity, venue_type: form.venue_type,
      venue_address: form.venue_type === "in_person" ? form.venue_address : null,
      online_link: form.venue_type === "online" ? form.online_link : null,
      cover_image_url: cover, visibility: form.visibility,
      status: publish ? "published" as const : form.status,
      host_id: host.id,
    };
    let res;
    if (form.id) res = await supabase.from("events").update(payload).eq("id", form.id).select().single();
    else res = await supabase.from("events").insert(payload).select().single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Saved");
    nav({ to: "/host/$slug/dashboard", params: { slug: hostSlug } });
  }

  if (loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!host) return <div className="py-20 text-center">Host not found.</div>;
  if (!user) return <div className="py-20 text-center"><Button asChild><Link to="/login">Sign in</Link></Button></div>;

  return (
    <div className="container max-w-2xl mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold">{form.id ? "Edit event" : "New event"}</h1>
      <F label="Title"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value, slug: form.id ? form.slug : slugify(e.target.value) })} /></F>
      <F label="Slug"><Input value={form.slug} onChange={e => setForm({ ...form, slug: slugify(e.target.value) })} /></F>
      <F label="Description"><Textarea rows={5} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></F>
      <div className="grid grid-cols-2 gap-3">
        <F label="Starts"><Input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></F>
        <F label="Ends"><Input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} /></F>
      </div>
      <F label="Timezone">
        <Select value={form.timezone} onValueChange={v => setForm({ ...form, timezone: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{tzList.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
        </Select>
      </F>
      <F label="Venue type">
        <Select value={form.venue_type} onValueChange={v => setForm({ ...form, venue_type: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="in_person">In person</SelectItem>
            <SelectItem value="online">Online</SelectItem>
          </SelectContent>
        </Select>
      </F>
      {form.venue_type === "in_person"
        ? <F label="Venue address"><Input value={form.venue_address} onChange={e => setForm({ ...form, venue_address: e.target.value })} /></F>
        : <F label="Online link"><Input value={form.online_link} onChange={e => setForm({ ...form, online_link: e.target.value })} /></F>}
      <F label="Capacity"><Input type="number" min={1} value={form.capacity} onChange={e => setForm({ ...form, capacity: Math.max(1, +e.target.value || 1) })} /></F>
      <F label="Cover image">
        {form.cover_image_url && <img src={form.cover_image_url} alt="" className="h-32 rounded mb-2" />}
        <Input type="file" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] ?? null)} />
      </F>
      <div className="grid grid-cols-2 gap-3">
        <F label="Visibility">
          <Select value={form.visibility} onValueChange={v => setForm({ ...form, visibility: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="Price">
          <div className="h-9 flex items-center gap-2">
            <Switch checked={true} disabled />
            <span className="text-sm">Free</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><span className="text-xs text-muted-foreground underline cursor-help">Paid</span></TooltipTrigger>
                <TooltipContent>Coming soon</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </F>
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => save(false)} variant="outline" disabled={busy}>Save draft</Button>
        <Button onClick={() => save(true)} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}</Button>
      </div>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
