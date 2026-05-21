import { createFileRoute } from "@tanstack/react-router";
import { EventEditor } from "@/components/EventEditor";

export const Route = createFileRoute("/host/$slug/events/$id/edit")({
  component: () => {
    const { slug, id } = Route.useParams();
    return <EventEditor hostSlug={slug} eventId={id} />;
  },
  head: () => ({ meta: [{ title: "Edit Event — OpenSeat" }] }),
});
