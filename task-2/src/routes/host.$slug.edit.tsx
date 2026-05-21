import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/host/$slug/edit")({
  component: EditHost,
  head: () => ({ meta: [{ title: "Edit Host — OpenSeat" }] }),
});

function EditHost() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [host, setHost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("hosts").select("*").eq("slug", slug).maybeSingle();
      setHost(data);
      setLoading(false);
    })();
  }, [slug, user]);

  if (authLoading || loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!user) return <div className="container max-w-md mx-auto py-20 text-center"><Button asChild><Link to="/login">Sign in</Link></Button></div>;
  if (!host) return <div className="py-20 text-center">Host not found.</div>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let logo_url = host.logo_url;
    if (logoFile) {
      const path = `${user!.id}/${Date.now()}-${logoFile.name}`;
      const up = await supabase.storage.from("host-logos").upload(path, logoFile, { upsert: true });
      if (up.error) { toast.error(up.error.message); setBusy(false); return; }
      logo_url = supabase.storage.from("host-logos").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("hosts").update({
      name: host.name, bio: host.bio, contact_email: host.contact_email, logo_url,
    }).eq("id", host.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    nav({ to: "/host/$slug/dashboard", params: { slug: host.slug } });
  }

  return (
    <div className="container max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Edit Host</h1>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><Input value={host.name} onChange={e => setHost({ ...host, name: e.target.value })} required /></Field>
        <Field label="Contact email"><Input type="email" value={host.contact_email ?? ""} onChange={e => setHost({ ...host, contact_email: e.target.value })} /></Field>
        <Field label="Bio"><Textarea rows={4} value={host.bio ?? ""} onChange={e => setHost({ ...host, bio: e.target.value })} /></Field>
        <Field label="Logo">
          {host.logo_url && <img src={host.logo_url} alt="" className="h-16 w-16 rounded mb-2 object-cover" />}
          <Input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
      </form>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
