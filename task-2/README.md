# task-2 / OpenSeat

A lightweight event hosting and attendance platform for free community events. Browse events, RSVP, get a digital ticket with QR code, check in at the door, share photos, and review reports — all in one app.

> Submission name: **task-2 / OpenSeat**. The application is deployed from the Lovable project root for preview/deploy compatibility.

## Live demo

**Deployed URL:** https://open-seat-events-dzmitryib-task-2.lovable.app/

First-time setup: open [`/setup-demo`](https://open-seat-events-dzmitryib-task-2.lovable.app/setup-demo) and click **Run seed** to create the demo Host, the upcoming and past events, and the demo accounts listed below.

## Local development

```bash
cp .env.example .env   # publishable Supabase keys only
npm install
npm run dev
```

`.env` is git-ignored. The `.env.example` template documents the four variables the app needs.

## Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Host | `demo-host@openseat.test` | `demo1234` |
| Attendee | `demo-attendee@openseat.test` | `demo1234` |
| Checker | `demo-checker@openseat.test` | `demo1234` |

**Before first use**, open `/setup-demo` and click **Run seed**. This idempotently creates the demo users, a Host (`OpenSeat Demo Collective`), an upcoming and past event, RSVPs (going / waitlist / checked-in), one pending gallery photo, and one open report.

## Quick tour — Publish → RSVP → Ticket → Check-in

1. **Sign in** as the Host (`demo-host@openseat.test`) → **Host Dashboard** opens.
2. **New Event** → fill title, date, capacity, venue → **Publish**. (Free is active; Paid is "Coming soon".)
3. **Sign out**, sign in as the Attendee. Open the event → **RSVP**.
   - If the event is full, the user is added to the **Waitlist** automatically (FIFO).
4. Go to **My Tickets**. Each confirmed ticket shows the **QR code**, the **manual ticket code** (`EVT-XXXX-XXXX`), and an **Add to Calendar (.ics)** button. Promoted-from-waitlist tickets are flagged in the UI.
5. As Host or Checker, open the event's **Check-in** page. Enter the ticket code manually.
   - Duplicate scans are blocked with a clear warning.
   - **Undo last scan** is available.
   - Counters (Going / Waitlist / Checked-in) update live via Supabase Realtime.

## Host dashboard

`/host/{slug}/dashboard` lists upcoming and past events with per-event stats and quick actions:

- **Edit** / **Publish or Unpublish** / **Duplicate** (creates a draft copy)
- **Check-in** page link
- **CSV export** of attendees

## CSV export

CSV download from the dashboard contains exactly these columns: `name,email,RSVP status,check-in time`. Files use a UTF-8 BOM and RFC 4180 quote-escaping so they open cleanly in Excel and Google Sheets. A sample is included at `sample-export.csv`.

## Gallery approval

Signed-in attendees can upload photos from the event page. Uploads land in `pending` state and are NOT visible to the public. The Host approves or hides each photo at `/host/{slug}/review`. Only `approved` photos render on the public event page.

## Report review queue

Anyone signed in can report an event or photo. Hosts see open reports at `/host/{slug}/review` and can:
- Hide the offending event/photo (hidden content disappears from public views)
- Mark the report resolved

## Roles, invites, My Events

- A Host has full management rights (events, gallery approval, CSV exports, review queue).
- A Checker can only access check-in for events owned by the same Host.
- `/host/{slug}/members` exposes copyable invite links for both roles. The invitee opens `/invite/{token}`, signs in, and accepts.
- `/my-events` aggregates everything a user can manage or check in, with host / date / text filters and role-appropriate quick actions.

## Tech

- React + TypeScript + Vite (TanStack Start)
- Tailwind + shadcn-style UI components
- Supabase (via Lovable Cloud) for auth, Postgres, RLS, storage, and Realtime
- Atomic RPCs (`rsvp_to_event`, `cancel_rsvp`, `check_in_ticket`, `undo_check_in`, `accept_invite`) guarantee capacity, waitlist FIFO promotion, and no double check-ins under concurrent use.

## Artifacts

- `README.md` — this file
- `report.md` — build report
- `sample-export.csv` — example CSV export
