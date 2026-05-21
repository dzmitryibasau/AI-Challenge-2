import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { EventCard } from "@/components/EventCard";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/hosts/$slug")({
  component: HostPage,
  loader: async ({ params }) => {
    const { data: host } = await supabase.from("hosts").select("id,name,slug,bio,logo_url,owner_id,created_at").eq("slug", params.slug).maybeSingle();
    if (!host) return { host: null, events: [] };
    const { data: events } = await supabase
      .from("events")
      .select("*, host:hosts(name,slug,logo_url)")
      .eq("host_id", host.id)
      .eq("status", "published")
      .eq("visibility", "public")
      .eq("hidden", false)
      .order("starts_at", { ascending: true });
    return { host, events: events ?? [] };
  },
  head: ({ loaderData }) => {
    const h = loaderData?.host as { name?: string; bio?: string | null; logo_url?: string | null } | null;
    if (!h) return { meta: [{ title: "Host — OpenSeat" }] };
    const title = `${h.name} — OpenSeat`;
    const desc = (h.bio ?? `Events from ${h.name} on OpenSeat`).slice(0, 160);
    const img = h.logo_url ?? undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        ...(img ? [{ property: "og:image", content: img }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        ...(img ? [{ name: "twitter:image", content: img }] : []),
      ],
    };
  },
});

function HostPage() {
  const { host, events } = Route.useLoaderData() as { host: any; events: any[] };
  if (!host) {
    return (
      <div className="container max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Host not found</h1>
        <Link to="/" className="text-primary underline">Back to Explore</Link>
      </div>
    );
  }
  return (
    <div className="container max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="h-20 w-20 rounded-xl bg-muted overflow-hidden grid place-items-center text-2xl font-bold text-muted-foreground">
          {host.logo_url ? <img src={host.logo_url} alt="" className="h-full w-full object-cover" /> : host.name[0]}
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{host.name}</h1>
          {host.bio && <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{host.bio}</p>}
          {host.contact_email && (
            <a href={`mailto:${host.contact_email}`} className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline">
              <Mail className="h-3.5 w-3.5" /> {host.contact_email}
            </a>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-3">Events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No public events yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}
      </div>
    </div>
  );
}
