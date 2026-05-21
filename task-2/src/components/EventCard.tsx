import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Globe } from "lucide-react";
import { formatDateRange, isPast } from "@/lib/format";

export type EventRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_type: "in_person" | "online";
  venue_address: string | null;
  online_link: string | null;
  cover_image_url: string | null;
  capacity: number;
  visibility: "public" | "unlisted";
  status: "draft" | "published";
  host?: { name: string; slug: string; logo_url: string | null } | null;
};

export function EventCard({ event }: { event: EventRow }) {
  const ended = isPast(event.ends_at);
  return (
    <Link
      to="/events/$slug"
      params={{ slug: event.slug }}
      className="group block rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="aspect-[16/9] bg-muted relative overflow-hidden">
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full grid place-items-center text-muted-foreground bg-gradient-to-br from-primary/10 to-accent/30">
            <Calendar className="h-10 w-10" />
          </div>
        )}
        {ended && (
          <div className="absolute top-2 left-2">
            <Badge variant="secondary">Ended</Badge>
          </div>
        )}
        {event.visibility === "unlisted" && (
          <div className="absolute top-2 right-2">
            <Badge variant="outline">Unlisted</Badge>
          </div>
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold leading-tight line-clamp-2">{event.title}</h3>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" /> {formatDateRange(event.starts_at, event.ends_at, event.timezone)}
        </p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {event.venue_type === "online" ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
          {event.venue_type === "online" ? "Online" : event.venue_address ?? "TBA"}
        </p>
        {event.host && (
          <p className="text-xs text-muted-foreground pt-1">by {event.host.name}</p>
        )}
      </div>
    </Link>
  );
}
