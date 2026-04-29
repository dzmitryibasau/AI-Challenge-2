# Task 1 — Vibe Coding: Leaderboard Clone

## Tool Used

**Claude Code** (Anthropic, model `claude-opus-4-6`) running as a VS Code extension — used as the primary vibe-coding assistant throughout the entire task.

---

## How I Worked

### Step 1 — Captured the original UI structure

I took screenshots of the leaderboard and examined the page HTML source through browser DevTools. This gave me the full picture of every component: the header, filter bar, podium, ranked list rows, expanded activity drawers, color palette, and filter logic.

I saved the page locally to `sample/EDU - Company Leader Board 2025.html` and used Claude Code to extract CSS rules from the SPFx component's embedded `<style>` block (class suffix `_2943a085`). This gave ground-truth values for every style property.

### Step 2 — Chose the stack

Pure HTML + CSS + JavaScript with no build step. Deployed to GitHub Pages via a GitHub Actions workflow — no `package.json`, no bundler needed.

### Step 3 — Generated and iterated the code

| File | Purpose |
|---|---|
| `data.js` | 30 fictional employees with invented names, department codes, and activity histories |
| `index.html` | Static HTML skeleton: filter bar, podium placeholder, list placeholder |
| `styles.css` | Pixel-accurate recreation of the original Fluent UI–inspired design with mobile responsiveness |
| `app.js` | Filter/search/sort/render/expand logic — ~275 lines of vanilla JS |

Each iteration was verified by opening the file in a browser and comparing it to the original screenshots.

### Step 4 — Data replacement

All 30 employee records are entirely fictional:

- **Names** — invented (e.g., "Alex Rivera", "Morgan Chen") with no connection to real people
- **Avatars** — colored initials circles; background color derived from the name via a hash function
- **Job titles** — generic tech roles (Software Engineer, QA Engineer, HR Manager, etc.)
- **Department codes** — made-up alphanumeric codes (e.g., `AA.U1.D1.G1`) following the original structural pattern
- **Activity titles** — invented names: `[LAB]` lectures, `[REG]` meetups/conferences, `[UNI]` guest lectures
- **Points** — same structure as the original: Education 16–96 pts, Public Speaking 32–64 pts, University Partnership 32 pts

### Step 5 — Features verified

- [x] Three dropdown filters: Year, Quarter, Category
- [x] Live employee search by name (120 ms debounce)
- [x] Podium for top 3 with gold/silver/bronze styling and CSS `order`-based reordering
- [x] Ranked list with avatar, name, role, per-category icons with tooltips, total score
- [x] Expand/collapse → activity table with color-coded category badges, date, and points
- [x] Real-time filter/re-sort; employees with zero filtered score are hidden
- [x] Mobile responsive layout

### What was intentionally omitted

- **Dark/light theme toggle** — the original header contains a round button that switches the page between light and dark color schemes. Since the challenge focuses on the leaderboard functionality and the page works in a single theme, this toggle was excluded as non-essential.

### Step 6 — Deployment & final polish

- Added a GitHub Actions workflow (`.github/workflows/deploy.yml`) for static site deployment to GitHub Pages
- Aligned filter-bar control backgrounds with the original Fluent UI palette (`#f3f2f1` neutralLighter instead of plain white)
- Corrected search icon and placeholder color to `#605e5c` (neutralSecondary) to match the original

---

## Responsible AI Use

### Rule 1 — AI in Client Projects

**Not applicable.** Internal company challenge — no client involvement or data.

### Rule 2 — Protect Sensitive Data

The source material contains real employee names, job titles, and department identifiers.

**Before sharing any material with the AI:**

- **Screenshots** — employee names, avatars, and scores were masked. The AI saw only layout geometry and component structure.
- **Saved HTML** — JSON payload and employee records were removed; only `<style>` blocks and minimal DOM skeleton were kept.

**Never shared with the AI:** real employee names/photos, internal department codes, any confidential business data.

The approach treated the original page as a *design reference*, not a *data source*. Every piece of identifiable information in the output is fictional.

### Rule 3 — Double-Check AI Outputs

Every iteration went through manual review:

1. **Visual verification** — compared in browser against original screenshots
2. **DevTools comparison** — 40+ CSS values cross-checked against extracted ground-truth
3. **Functional testing** — filters, search, podium, expand/collapse, mobile layout
4. **Data consistency** — activity prefixes reviewed per category; one inconsistency found and corrected

### Rule 4 — Stay in Control

All decisions were mine: scope, design values, data structure, architecture (static HTML/CSS/JS), and quality. When the AI's output differed from the original, I provided exact corrected values from DevTools. The AI accelerated implementation; I was accountable for correctness.

### Rule 5 — Use Approved AI Tools

Claude Code (`claude-opus-4-6`) — **Minimal Risk** profile: no sensitive/confidential data processed, internal non-client task, standard coding assistance use case.

---

## Key Principle

> *"AI supports your work, but you remain responsible for its outcomes."*

Claude generated the code fast; I ensured it was correct, that no real employee data was exposed, and that every CSS value matched the original. The AI was the assistant; I was the engineer.
