import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/format";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/host/new")({
  component: NewHostPage,
  head: () => ({ meta: [{ title: "Register a Host — OpenSeat" }] }),
});

function NewHostPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => { if (user) setEmail(user.email ?? ""); }, [user]);
  useEffect(() => { if (!slug || slug === slugify(name).slice(0, slug.length)) setSlug(slugify(name)); }, [name]); // eslint-disable-line

  if (loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!user) return <div className="container max-w-md mx-auto py-20 text-center"><p>Sign in first.</p><Button asChild className="mt-3"><Link to="/login">Sign in</Link></Button></div>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) { toast.error("Name and slug required"); return; }
    setBusy(true);
    let logo_url: string | null = null;
    if (logoFile) {
      const path = `${user!.id}/${Date.now()}-${logoFile.name}`;
      const up = await supabase.storage.from("host-logos").upload(path, logoFile, { upsert: true });
      if (up.error) { toast.error(up.error.message); setBusy(false); return; }
      logo_url = supabase.storage.from("host-logos").getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase.from("hosts").insert({
      name, slug, bio: bio || null, contact_email: email || null, logo_url, owner_id: user!.id,
    }).select().single();
    if (error) { toast.error(error.message); setBusy(false); return; }
    await supabase.from("host_members").insert({ host_id: data.id, user_id: user!.id, role: "host" });
    toast.success("Host created");
    nav({ to: "/host/$slug/dashboard", params: { slug: data.slug } });
  }

  return (
    <div className="container max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Register your Host</h1>
      <p className="text-sm text-muted-foreground mb-6">A Host is an organization or community that runs events on OpenSeat.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} required /></Field>
        <Field label="Slug"><Input value={slug} onChange={e => setSlug(slugify(e.target.value))} required /></Field>
        <Field label="Contact email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Bio"><Textarea rows={4} value={bio} onChange={e => setBio(e.target.value)} /></Field>
        <Field label="Logo"><Input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files?.[0] ?? null)} /></Field>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Host"}</Button>
      </form>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
