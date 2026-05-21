import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/host/$slug/members")({
  component: Members,
  head: () => ({ meta: [{ title: "Host Members — OpenSeat" }] }),
});

function randToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
}

function Members() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const [host, setHost] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: h } = await supabase.from("hosts").select("*").eq("slug", slug).maybeSingle();
    if (!h) { setLoading(false); return; }
    setHost(h);
    const [{ data: m }, { data: i }] = await Promise.all([
      supabase.rpc("get_host_member_profiles", { _host_id: h.id }),
      supabase.from("member_invites").select("*").eq("host_id", h.id),
    ]);
    // Normalize RPC rows to keep existing UI shape ({ id, role, user_id, profile: { name, email } })
    setMembers((m ?? []).map((r: any) => ({
      id: `${r.user_id}-${r.role}`,
      user_id: r.user_id,
      role: r.role,
      profile: { name: r.name, email: r.email },
    })));
    setInvites(i ?? []);
    setLoading(false);
  }, [slug]);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function createInvite(role: "host" | "checker") {
    const token = randToken();
    const { error } = await supabase.from("member_invites").insert({ host_id: host.id, role, token });
    if (error) return toast.error(error.message);
    toast.success(`${role} invite created`);
    load();
  }
  async function removeInvite(id: string) {
    const { error } = await supabase.from("member_invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }
  async function removeMember(m: any) {
    const { error } = await supabase.from("host_members").delete()
      .eq("host_id", host.id).eq("user_id", m.user_id).eq("role", m.role);
    if (error) return toast.error(error.message);
    load();
  }
  function copyLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  }

  if (authLoading || loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  if (!user) return <div className="container max-w-md mx-auto py-20 text-center"><Button asChild><Link to="/login">Sign in</Link></Button></div>;
  if (!host) return <div className="py-20 text-center">Host not found.</div>;

  return (
    <div className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold">{host.name} · Members</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Team</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {members.length === 0 ? <p className="text-sm text-muted-foreground italic">No members yet.</p> :
            members.map(m => (
              <div key={m.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  <p className="text-sm font-medium">{m.profile?.name || m.profile?.email || m.user_id}</p>
                  <p className="text-xs text-muted-foreground">{m.profile?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.role === "host" ? "default" : "secondary"}>{m.role}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => removeMember(m)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Invite links</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createInvite("host")}>+ Host invite</Button>
            <Button size="sm" variant="outline" onClick={() => createInvite("checker")}>+ Checker invite</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {invites.length === 0 ? <p className="text-sm text-muted-foreground italic">No active invites.</p> :
            invites.map(i => {
              const url = typeof window !== "undefined" ? `${window.location.origin}/invite/${i.token}` : `/invite/${i.token}`;
              return (
                <div key={i.id} className="flex items-center justify-between gap-2 border rounded p-2">
                  <div className="min-w-0 flex-1">
                    <Badge variant={i.role === "host" ? "default" : "secondary"} className="mb-1">{i.role}</Badge>
                    <p className="text-xs text-muted-foreground truncate font-mono">{url}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => copyLink(i.token)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
                  <Button size="sm" variant="ghost" onClick={() => removeInvite(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
