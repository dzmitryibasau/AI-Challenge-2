import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Ticket, Calendar, LayoutDashboard, ShieldAlert, Compass, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [hasHostRole, setHasHostRole] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasHostRole(false);
      return;
    }
    supabase
      .from("host_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .then(({ data }) => setHasHostRole((data?.length ?? 0) > 0));
  }, [user]);

  const link = (to: string, label: string, Icon: React.ComponentType<{ className?: string }>) => {
    const active = loc.pathname === to || loc.pathname.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden md:inline">{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b sticky top-0 z-30 bg-background/95 backdrop-blur">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <Link to="/" className="font-bold text-lg tracking-tight flex items-center gap-2">
            <span className="inline-block h-6 w-6 rounded bg-primary text-primary-foreground grid place-items-center text-xs font-bold">
              O
            </span>
            <span>OpenSeat</span>
          </Link>
          <nav className="flex items-center gap-1">
            {link("/", "Explore", Compass)}
            {user && link("/tickets", "My Tickets", Ticket)}
            {user && hasHostRole && link("/my-events", "My Events", Calendar)}
            {user && hasHostRole && link("/host", "Host Dashboard", LayoutDashboard)}
            {user && hasHostRole && link("/review", "Review", ShieldAlert)}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link to="/profile" className="text-sm hidden sm:flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <UserIcon className="h-4 w-4" /> Profile
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/" });
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        OpenSeat · task-2 · Community events platform
      </footer>
    </div>
  );
}
