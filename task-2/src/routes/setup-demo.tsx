import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { seedDemoData } from "@/lib/demo.functions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/setup-demo")({
  component: SetupDemo,
  head: () => ({ meta: [{ title: "Setup Demo — OpenSeat" }] }),
});

function SetupDemo() {
  const seed = useServerFn(seedDemoData);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<any>(null);

  async function run() {
    if (!token.trim()) {
      toast.error("Enter the setup token");
      return;
    }
    setBusy(true);
    try {
      const r = await seed({ data: { token: token.trim() } });
      setResult(r);
      toast.success("Demo data seeded");
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container max-w-xl mx-auto px-4 py-10">
      <Card>
        <CardHeader><CardTitle>Seed demo data</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Restricted admin action. Requires a setup token configured via the <code className="font-mono">SETUP_DEMO_TOKEN</code> server secret. Creates demo users, a host, events, RSVPs, a pending photo, and an open report. Idempotent.
          </p>
          <div className="space-y-1">
            <Label htmlFor="token">Setup token</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter SETUP_DEMO_TOKEN"
              autoComplete="off"
            />
          </div>
          <Button onClick={run} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run seed"}</Button>
          {result && (
            <div className="text-sm space-y-2 mt-4 border-t pt-4">
              <p className="font-semibold">Demo credentials</p>
              <ul className="font-mono text-xs space-y-1">
                {result.credentials.map((c: any) => <li key={c.email}>{c.email} / {c.password}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground">Host: <Link to="/hosts/$slug" params={{ slug: result.hostSlug }} className="underline">/hosts/{result.hostSlug}</Link></p>
              <p className="text-xs text-muted-foreground">Upcoming: <Link to="/events/$slug" params={{ slug: result.upcomingSlug }} className="underline">/events/{result.upcomingSlug}</Link></p>
              <p className="text-xs text-muted-foreground">Past: <Link to="/events/$slug" params={{ slug: result.pastSlug }} className="underline">/events/{result.pastSlug}</Link></p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
