import { createFileRoute } from "@tanstack/react-router";
import { EventEditor } from "@/components/EventEditor";

export const Route = createFileRoute("/host/$slug/events/new")({
  component: () => {
    const { slug } = Route.useParams();
    return <EventEditor hostSlug={slug} />;
  },
  head: () => ({ meta: [{ title: "New Event — OpenSeat" }] }),
});
