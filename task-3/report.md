# task-3 / Telegram Learning Assistant — Build Report

## Tools & techniques

- **n8n Cloud (free trial)** as the runtime — its bundled OpenAI tokens powered every LLM call, so no external API key was needed.
- **n8n Workflow SDK** via the official n8n MCP server. Instead of clicking around the visual editor, the entire workflow was authored as code (`workflow.ts`), validated with the SDK's static analyzer, then pushed to n8n via `create_workflow_from_code` / `update_workflow`. The workflow is 41 nodes; building that in the UI by hand would have taken hours.
- **LangChain AI Agent + Structured Output Parser** for both AI roles. The agent's JSON-schema-bound output parser kills the entire class of "the model returned malformed JSON" failures — no prompt-engineering tricks needed to stay parsable.
- **Telegram Trigger** for inbound updates (both `message` and `callback_query`), and the standard **Telegram** node for outbound `sendMessage` / `answerCallbackQuery`.
- **n8n staticData** (`$workflow.staticData.global`) as the database. Single workflow, zero external storage.

## Architecture highlights

- **One Switch node, five lanes.** The Telegram trigger fan-outs into a single Switch routing on the update shape: `/start`, `/learn <url>`, `/quiz`, `callback_query → topic:…`, `callback_query → ans:…`. Every command, including inline-button callbacks, lives in the same workflow — no restart needed between commands.
- **Two distinct AI roles, three calls total.**
  - **Teacher** (one call): receives `{ url, rawText }`, returns `{ title, difficulty, keyPoints[5–7], mainConcepts, summary (Markdown) }`. Temperature 0.3.
  - **Examiner Generator** (one call when a quiz starts): receives the material, returns `{ questions: […×5 with options A–D, correctAnswer, explanation] }`. Temperature 0.4.
  - **Examiner Validator** (one call at quiz end): receives the canonical questions plus the user's choices, returns `{ scorePercent, perQuestion: [...], encouragement }`. Temperature 0.2.
- **State machine in staticData.** `$workflow.staticData.global.users[uid].materials` is a map of `LM-NNN → material`; `activeQuiz` is `null` or an in-progress quiz with `materialId / questions / currentIndex / answers[]`. The quiz state machine lives entirely in two Code nodes — one starts the quiz, one advances it on each answer — so there is no out-of-band signal to keep coherent.
- **Inline keyboards.** Each quiz question renders four inline buttons (A/B/C/D) with `callback_data = ans:<LM-id>:<Qn>:<choice>`. The topic picker for `/quiz` is built dynamically in a Code node and the entire `rows` array is handed to the Telegram node via a single expression — n8n's runtime evaluates it as an array even though the static type-checker can't see that.
- **Answer Callback Query at every callback end.** Without it, the user's Telegram client shows a hanging "loading" spinner on the tapped button. Each callback branch ends with a silent ack.
- **Graceful failure paths.** Bad URL, unreachable URL, too-short extracted text, AI returns unparsable JSON, orphan callback after a quiz expired — each has a dedicated friendly Telegram reply rather than a runtime error.

## What worked

- **Authoring via SDK + MCP** was the multiplier. Once the SDK reference and node type definitions were loaded, generating, validating, and deploying a 41-node workflow took one round-trip per iteration.
- **Structured Output Parser** combined with a tight `jsonSchemaExample` made both AI agents output usable JSON on the first try. No retry logic was needed.
- **Telegram Trigger's bundled webhook management.** Activating the workflow registers the webhook with Telegram automatically — no need to call `setWebhook` by hand or expose a public URL manually.
- **One Switch for everything.** Routing all five flows (3 commands + 2 callback prefixes) through a single Switch keeps the workflow visually one-page and avoids the worse alternative of five separate top-level triggers.

## What didn't / trade-offs

- **`.onCase('name', …)` did not wire connections** — the n8n SDK validator silently accepted named-output cases but the live workflow ended up with zero outgoing edges from the Switch nodes. Fix: use numeric `.onCase(0, …)`. The named `outputKey` field is then just display metadata and was dropped.
- **Dynamic inline-keyboard rows produce a validator warning.** Passing a Code-built `rows` array via a single expression makes the SDK validator complain ("expected array, got string") because static-time the field is still an expression string. n8n's runtime evaluates the expression to an array and the Telegram API accepts it fine, but the warning persists. Accepted as a documented trade-off.
- **`staticData` is not concurrency-safe.** Two users hitting the bot in the same millisecond could race on writes. For a single-evaluator submission this is fine; a real deployment would move state to Data Table or Postgres.
- **No `/start <args>` deep-link or `/help`.** Out of scope. The welcome message already covers what the bot does.
- **No retry on AI failure.** If OpenAI returns an unparsable response twice (rare with the structured parser), the bot replies with a friendly "Teacher returned an unreadable response" rather than retrying with a backoff.
- **Unknown commands are silently dropped.** The SDK's `switchCase` does not allow an `.onDefault(…)` (`Method 'onDefault' is not an allowed SDK method` from the security validator). The Switch's fallback output is left disconnected, so e.g. `/foo` produces no reply. Acceptable, but a more polished version would route to a "Try /start" message.

## Notable decisions

- **n8n staticData over Data Table.** The n8n suggested-nodes hint recommends Data Table for persistence, but the original task plan locked in `staticData`. Sticking with staticData kept the workflow self-contained — no separate table to pre-create, no extra credential setup for the reviewer.
- **Two Examiner invocations rather than one mega-prompt.** Splitting "generate quiz" and "grade quiz" into two prompts is cheaper (the validator doesn't need the source text again), gives the model a clearer task each time, and lets us run the generator at a slightly higher temperature for variety while grading deterministically at 0.2.
- **Validator grades by intent, not by string match.** Both `userChoice` and `correctAnswer` are single letters (A/B/C/D) so the equality is trivial, but the *Validator* still owns the comparison so it can produce humanized per-question feedback in the same call instead of in a separate stitch step.
- **All five lane branches inside one Switch** instead of three separate webhook triggers (one for `/start`, one for `/learn`, one for `/quiz`) — the inline-button callbacks would have demanded a fourth trigger anyway, and visually grouping all of them on one canvas reads better.
- **Prompts checked in as Markdown.** `prompts/teacher.md`, `prompts/examiner-generator.md`, `prompts/examiner-validator.md` mirror what's embedded in the workflow JSON, so any future tuning can happen in the Markdown and then be pasted back into the n8n node — much easier to review than diffing escaped strings inside the workflow JSON.

## Verification checklist

Run this from a fresh Telegram chat against the activated bot:

1. `/start` → welcome message with command list arrives in under a second.
2. `/learn https://react.dev/reference/react/useState` → within 10–20 s, structured summary with 5–7 bullet points, difficulty label, and a *"Take a quiz on this →"* inline button.
3. Tap the inline button → question 1/5 arrives with 4 lettered buttons.
4. Answer all 5 → results message arrives with `Your score: NN%`, per-question marks (✅/❌), short feedback per question, and a closing line of encouragement.
5. `/quiz` (no args) → bot lists every saved material as inline buttons. Tap one → fresh quiz starts on it. Confirms persistence across sessions.
6. `/learn https://example.invalid` → friendly *"Couldn't fetch that URL"* reply, no crash.
7. `/learn not-a-url` → friendly *"Please send a URL"* reply.
8. Two `/learn` commands in a row → both materials show up under `/quiz` with distinct `LM-NNN` ids.
