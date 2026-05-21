import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate({ to: search.redirect ?? "/" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Signed in");
    navigate({ to: search.redirect ?? "/" });
  }

  function fill(role: "host" | "attendee" | "checker") {
    const map = {
      host: "demo-host@openseat.test",
      attendee: "demo-attendee@openseat.test",
      checker: "demo-checker@openseat.test",
    };
    setEmail(map[role]);
    setPassword("demo1234");
  }

  return (
    <div className="container max-w-md mx-auto px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to OpenSeat</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-6 space-y-2 text-sm">
            <p className="text-muted-foreground">Demo accounts (password: <code>demo1234</code>):</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fill("host")}>Host</Button>
              <Button size="sm" variant="outline" onClick={() => fill("attendee")}>Attendee</Button>
              <Button size="sm" variant="outline" onClick={() => fill("checker")}>Checker</Button>
            </div>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            No account? <Link to="/signup" className="text-primary underline">Sign up</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
