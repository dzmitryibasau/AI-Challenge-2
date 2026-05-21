import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  component: Profile,
  head: () => ({ meta: [{ title: "Profile — OpenSeat" }] }),
});

function Profile() {
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      setName(data?.name ?? "");
      setAvatarUrl(data?.avatar_url ?? null);
      setLoading(false);
    })();
  }, [user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    let avatar = avatarUrl;
    if (avatarFile) {
      const path = `${user.id}/${Date.now()}-${avatarFile.name}`;
      const up = await supabase.storage.from("host-logos").upload(path, avatarFile, { upsert: true });
      if (!up.error) avatar = supabase.storage.from("host-logos").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("profiles").update({ name, avatar_url: avatar }).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setAvatarUrl(avatar);
    toast.success("Saved");
  }

  if (authLoading || loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!user) return <div className="container max-w-md mx-auto py-20 text-center"><Button asChild><Link to="/login">Sign in</Link></Button></div>;

  return (
    <div className="container max-w-md mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold">Profile</h1>
      <form onSubmit={save} className="space-y-4">
        <div><Label>Email</Label><Input value={user.email ?? ""} disabled /></div>
        <div><Label>Display name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
        <div>
          <Label>Avatar</Label>
          {avatarUrl && <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full mb-2 object-cover" />}
          <Input type="file" accept="image/*" onChange={e => setAvatarFile(e.target.files?.[0] ?? null)} />
        </div>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
      </form>
    </div>
  );
}
