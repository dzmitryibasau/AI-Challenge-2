// Landing for "/host" — picks first host owned/managed by the user, or /host/new
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/host/")({
  component: HostIndex,
  head: () => ({ meta: [{ title: "Host — OpenSeat" }] }),
});

function HostIndex() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      const { data } = await supabase
        .from("host_members")
        .select("host:hosts(slug)")
        .eq("user_id", user.id)
        .eq("role", "host")
        .limit(1);
      const slug = (data?.[0] as any)?.host?.slug;
      if (slug) nav({ to: "/host/$slug/dashboard", params: { slug }, replace: true });
      else nav({ to: "/host/new", replace: true });
    })();
  }, [user, loading, nav]);
  if (!loading && !user) return (
    <div className="container max-w-md mx-auto py-20 text-center">
      <p>Sign in to manage a host.</p>
      <Button asChild className="mt-3"><Link to="/login">Sign in</Link></Button>
    </div>
  );
  return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
}
