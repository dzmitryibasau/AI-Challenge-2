# task-2 / OpenSeat — Build Report

## Tools & techniques

- **Stack**: TanStack Start (React 19 + Vite 7), TypeScript strict, Tailwind v4, shadcn/ui, lucide-react.
- **Backend**: Supabase via Lovable Cloud — Postgres, Row-Level Security, Storage buckets, Realtime, edge auth.
- **Libraries**: `qrcode.react` (QR rendering on tickets), `ics` (we hand-build the .ics ourselves in `src/lib/format.ts` for full control), `sonner` (toasts).
- **Routing**: TanStack file-based routing with separate route per page so each gets its own `head()` metadata and SSR.

## Architecture highlights

- **Atomic RPCs**: All race-prone logic lives in `SECURITY DEFINER` Postgres functions that take row locks (`FOR UPDATE`) on the event before mutating RSVPs:
  - `rsvp_to_event` — checks capacity, assigns `going` or `waitlist`, generates a unique `EVT-XXXX-XXXX` ticket code.
  - `cancel_rsvp` — cancels an RSVP and, if it freed a `going` seat, promotes the earliest waitlisted RSVP (FIFO by `created_at`), setting `promoted_at` so the UI can flag it.
  - `check_in_ticket` — validates membership, prevents duplicate check-ins, returns structured `{ok, reason}` responses.
  - `undo_check_in` — host/checker can revert the last scan.
  - `accept_invite` — converts a token into a `host_members` row.
- **RLS**: Every table has explicit policies (see migration). Hosts see their own RSVPs and reports, attendees see only their own tickets, public sees only published & non-hidden events.
- **Roles**: A separate `host_members(host_id, user_id, role)` table — never a role column on profiles. Helper functions `is_host_member` / `is_any_host_member` keep policies recursion-free.
- **Storage**: Three public buckets — `host-logos`, `event-covers`, `gallery` — with path-scoped policies.
- **Realtime**: The check-in page subscribes to `postgres_changes` on the `rsvps` table filtered by event for live counters.
- **CSV**: `buildCSV()` adds a UTF-8 BOM and quote-escapes per RFC 4180, with the exact columns required by the spec.
- **Ticket codes**: Server-side `generate_ticket_code()` uses an alphabet with no ambiguous characters (no O/0/1/I/L) and retries on collision.

## What worked

- Atomic RPCs eliminated entire classes of race conditions. RSVP + waitlist promotion is testable in a single SQL call.
- File-based routing made the surface area (Explore, Event, Host pages, Tickets, Dashboard, Check-in, Review, Members, Invites, My Events, Profile, Setup Demo) easy to grow without a central route table.
- TanStack `createServerFn` + the admin Supabase client made seeding demo auth users straightforward via `/setup-demo`, idempotent on repeat.
- Tailwind's design tokens (semantic colors via `src/styles.css`) kept the UI consistent in dark and light without ad-hoc hex codes.

## What didn't / trade-offs

- Auth users can't be created from a SQL migration safely, so demo accounts are seeded via a server function called from `/setup-demo`. This is a one-click step on first run.
- Camera-based QR scanning was out of scope per the brief — manual ticket-code entry only.
- Paid ticketing is intentionally **disabled** in the editor UI with a "Coming soon" tooltip.
- We don't enforce per-event `checker` membership for check-in beyond host_members — a checker for Host A could in principle hit Host B's events only if added to that host. The RPC validates membership against the event's host.
- We hand-rolled `.ics` text rather than pulling the runtime API of the `ics` package to keep the worker bundle tiny.

## Notable decisions

- **Build at Lovable project root** (not in a `task-2/` subfolder) so the preview and the deployed app keep working. The submission is documented as "task-2 / OpenSeat" in README and report.
- **Realtime over polling** for check-in counters — the spec allowed either; Realtime gave a better experience for the demo.
- **Idempotent seed** (`/setup-demo`) instead of bundling SQL inserts that depend on auth.users IDs we can't predict.
- **Single shared `EventEditor` component** powers `/host/$slug/events/new` and `.../edit`. Less drift, one place to update validation.

## Verification checklist

- Demo seed runs cleanly and is re-runnable.
- RSVP fills the event, then a 6th attempt is placed on the waitlist; cancelling a going-RSVP promotes that waitlisted user.
- Check-in increments the live counter; a duplicate scan shows a duplicate warning; Undo reverts; CSV download contains exactly `name,email,RSVP status,check-in time` with BOM.
- Pending gallery photos do not appear publicly until approved.
- Hidden events/photos disappear from the public Explore / event / gallery views.
- Past events display **Ended** and hide RSVP controls.
