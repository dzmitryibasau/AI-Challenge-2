# Task 1 — Vibe Coding: Leaderboard Clone

## Tool Used

**Claude Code** (Anthropic, model `claude-opus-4-6`) running as a VS Code extension — used as the primary vibe-coding assistant throughout the entire task.

---

## How I Worked

### Step 1 — Captured the original UI structure

I took screenshots of the leaderboard and examined the page HTML source through browser DevTools. This gave me the full picture of every component: the header layout, the three-dropdown filter bar, the podium section for the top 3, the ranked list row anatomy (avatar, name, category stats, score, expand button), the expanded activity drawer, the color palette, and the filter logic.

I then saved the page locally to `sample/EDU - Company Leader Board 2025.html` and used Claude Code to extract the exact CSS rules from the SPFx component's embedded `<style>` block (class suffix `_2943a085`). This gave me ground-truth values for every style property rather than approximations.

### Step 2 — Chose the stack

Pure HTML + CSS + JavaScript with no build step. This deploys directly to GitHub Pages from the `task-1/` folder with zero configuration: no `package.json`, no bundler, no CI pipeline needed.

### Step 3 — Generated and iterated the code

Four files were produced through iterative prompting and visual testing in a local browser:

| File | Purpose |
|---|---|
| `data.js` | 30 fictional employees with invented names, made-up department codes, and realistic activity histories |
| `index.html` | Static HTML skeleton: filter bar, podium placeholder, list placeholder |
| `styles.css` | Pixel-accurate recreation of the original Fluent UI–inspired design, with full mobile responsiveness (`@media (max-width: 768px)`) |
| `app.js` | Filter/search/sort/render/expand logic — ~275 lines of vanilla JS |

Each iteration was verified by opening the file in a browser and comparing it to the original screenshots.

### Step 4 — Data replacement

All 30 employee records are entirely fictional:

- **Names** — invented English-language names (e.g., "Alex Rivera", "Morgan Chen") with no connection to real people
- **Avatars** — colored initials circles; background color deterministically derived from the name via a hash function; no photos, no external URLs
- **Job titles** — generic tech roles from the same taxonomy (Software Engineer, QA Engineer, HR Manager, etc.) with no identifying information
- **Department codes** — made-up alphanumeric codes (e.g., `AA.U1.D1.G1`) following the same structural pattern but with no correspondence to real units
- **Activity titles** — invented names using common tech topics: `[LAB]` lectures, `[REG]` meetups and conferences, `[UNI]` guest lectures
- **Points** — follow the same point structure as the original: Education lectures 16 pts, mentoring 64–96 pts; Public Speaking meetups 32 pts, conferences 64 pts; University Partnership 32 pts

### Step 5 — Features verified

- [x] Three dropdown filters: Year (2024 / 2025), Quarter (Q1–Q4), Category (Education / Public Speaking / University Partnership)
- [x] Live employee search by name (120 ms debounce)
- [x] Podium for top 3 with gold/silver/bronze styling and CSS `order`-based visual reordering (rank 2 left, rank 1 center, rank 3 right)
- [x] Ranked list: rank number, colored initials avatar, name, role + dept, per-category activity count icons with tooltips, total score
- [x] Expand/collapse row → activity table with color-coded category badges (blue for Education, purple for Public Speaking, green for University Partnership), date, and points
- [x] Filters re-score and re-sort the entire list in real time; employees with zero filtered score are hidden
- [x] Mobile responsive layout: podium stacks vertically, filter bar goes column, total section hides on narrow screens

---

## Responsible AI Use

This section documents how the task was completed in alignment with the company's AI usage policy and the five rules for responsible AI use.

### Rule 1 — AI in Client Projects (Approval Required)

**Not applicable.** This was an internal company challenge task with no client involvement. No client data was processed, and no client consent was required.

### Rule 2 — Protect Sensitive Data

This rule was the primary design constraint throughout the task, because the source material — the internal EDU leaderboard — contains real employee names, job titles, and department identifiers.

**Proactive steps taken before sharing any material with the AI:**

- **Screenshots** — all employee names, avatars, department labels, and score values visible in the UI were covered/masked before the screenshots were passed to the AI. What the AI saw was layout geometry, color areas, and component structure — not any individual's data.
- **Saved HTML page** — before providing the file for CSS extraction, I manually removed the JSON payload and rendered employee records from the HTML, retaining only the `<style>` blocks and the minimum DOM skeleton needed to locate the SPFx component's CSS rules. The file handed to the AI contained design tokens, not personal data.

**What was shared with the AI (after sanitization):**

- Masked screenshots showing visual layout: component placement, color blocks, spacing — no readable personal data.
- HTML source excerpt showing DOM structure (tag nesting, CSS class names, attribute patterns). Class names carry no personal data; only the structure was relevant.
- Sanitized HTML file for CSS extraction: `<style>` blocks only, employee records stripped out.

**What was never shared with the AI:**

- Real employee names, photos, or personal identifiers
- Internal department codes or organizational structure
- Any confidential business data

The approach treated the original page as a *design reference* rather than a *data source*. Sensitive content was removed or obscured manually before any material reached the AI. The AI analyzed visual structure and CSS values; no real employee data was ever present in its input.

**The result:** every piece of identifiable information in the output is fictional. Real employees are completely absent from the clone.

### Rule 3 — Double-Check AI Outputs

AI-generated code was not shipped as-is. Every iteration went through a manual review cycle:

1. **Visual verification** — the page was opened in a browser and compared against the original screenshots after every significant change.
2. **DevTools comparison** — specific CSS property values (colors, sizes, border radii, gradients) were cross-checked against the values I extracted directly from the original page using browser DevTools. Approximately 40+ individual CSS values were verified this way.
3. **Functional testing** — filters, search, podium reordering, expand/collapse, and mobile layout were each tested manually in the browser.
4. **Data consistency check** — activity prefixes (`[LAB]`, `[REG]`, `[UNI]`) were reviewed to match the correct category; one inconsistency found and corrected (two mentoring entries had `[REG]` prefix instead of `[LAB]`).

AI output was treated as a draft; every value that mattered was verified against an authoritative source.

### Rule 4 — Stay in Control

The AI served as a code-generation tool; all decisions were made by me:

- **Scope decisions**: what to replicate, what to simplify (e.g., theme toggle was omitted as it adds no value for the challenge)
- **Design decisions**: when the AI's first interpretation differed from the original, I provided the exact corrected values from DevTools rather than accepting the guess
- **Data decisions**: what categories of fictional data to generate, the point structure, the number of employees
- **Architecture decisions**: pure static HTML/CSS/JS (no frameworks, no build step) for maximum simplicity and GitHub Pages compatibility
- **Quality decisions**: all bugs and inconsistencies were caught and fixed by me through manual testing

The AI accelerated implementation; I remained accountable for correctness and quality at every step.

### Rule 5 — Use Approved AI Tools

Claude Code (`claude-sonnet-4-6`) was used as the AI assistant. This task falls into the **Minimal Risk** profile:

- No sensitive personal data was input into the tool
- No confidential business data (financial, legal, HR records) was processed
- The task was internal and non-client-facing
- The output is a static demo page for a company-internal challenge
- The use case is standard coding assistance: generating HTML, CSS, and JavaScript from a visual specification

No Risk Assessment was required under the Minimal Use Profile criteria. The tool was used for its intended purpose (software development assistance) within the boundaries that make AI coding assistance low-risk.

---

## Key Responsible AI Principle in Practice

> *"AI supports your work, but you remain responsible for its outcomes."*

In this task that meant: Claude generated the code fast; I ensured it was correct, that no real employee data was exposed, and that every CSS value was verified against the original. The AI was the assistant; I was the engineer.
