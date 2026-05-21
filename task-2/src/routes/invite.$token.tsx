import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "Accept Invite — OpenSeat" }] }),
});

function InvitePage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("lookup_invite", { _token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setInvite({ id: row.id, host_id: row.host_id, role: row.role, host: { name: row.host_name, slug: row.host_slug } });
      } else {
        setInvite(null);
      }
    })();
  }, [token]);

  async function accept() {
    setBusy(true);
    const { data, error } = await supabase.rpc("accept_invite", { _token: token });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Joined as ${(data as any).role}`);
    nav({ to: "/host/$slug/dashboard", params: { slug: invite.host.slug } });
  }

  if (loading) return <Spin />;
  if (!invite) return <div className="py-20 text-center">Invite not found or invalid.</div>;

  return (
    <div className="container max-w-md mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold">You're invited</h1>
      <p>Join <strong>{invite.host?.name}</strong> as <strong>{invite.role}</strong>.</p>
      {!user ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Sign in or sign up to accept.</p>
          <div className="flex gap-2 justify-center">
            <Button asChild><Link to="/login">Sign in</Link></Button>
            <Button asChild variant="outline"><Link to="/signup">Sign up</Link></Button>
          </div>
        </div>
      ) : (
        <Button onClick={accept} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invite"}</Button>
      )}
    </div>
  );
}
function Spin() { return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>; }
