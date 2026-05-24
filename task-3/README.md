# task-3 / Telegram Learning Assistant

A Telegram bot, powered by an n8n workflow, that turns any URL into a study session: a *Teacher* AI agent summarizes the article, then an *Examiner* AI agent quizzes you on it.

## Live bot

Open **[@learn_assistant_dzmitryib_bot](https://t.me/learn_assistant_dzmitryib_bot)** in Telegram and send `/start`.

> If the bot doesn't reply, the workflow has been paused — see *Run it yourself* below to host your own copy.

## Commands

| Command | What it does |
| --- | --- |
| `/start` | Show the welcome message and the list of commands. |
| `/learn <url>` | Fetch the page at `<url>`, summarize it (5–7 key points + a Telegram-formatted recap), save it as `LM-NNN`, and offer an inline button to start a quiz on it. |
| `/quiz` | Show a list of every material you have saved so far. Tap one to start a 5-question multiple-choice quiz. |

## End-to-end flow

1. **Learn something.** Send `/learn https://react.dev/reference/react/useState` (or any other public article). Within ~10–20 seconds the bot replies with a structured summary, the difficulty label (`beginner` / `intermediate` / `advanced`), and a *"Take a quiz on this →"* inline button.
2. **Take the quiz.** Either tap the inline button right away or send `/quiz` later to pick from your saved materials. The bot sends questions one by one, each with four inline-keyboard buttons (A / B / C / D).
3. **Get graded.** After the fifth answer the *Examiner* agent grades your run, sends your percentage score, and writes a one-line per-question feedback — including a short explanation of any wrong answers and one closing line of encouragement.
4. **Come back later.** Your saved materials and their summaries persist across executions (state lives in `$workflow.staticData`), so you can quiz yourself on the same material again days later.

## Run it yourself

You will need:

- An n8n account (free n8n Cloud trial is enough — it includes free OpenAI tokens for the AI nodes).
- A Telegram bot token from `@BotFather` (one-time, takes 60 seconds).

Then:

1. **Download** `task-3/workflow.json` from this repo.
2. In n8n, **Import from File** and pick `workflow.json`. You will see 41 nodes laid out across four lanes (welcome, learn, quiz, callback).
3. **Set up two credentials.** Each Telegram and OpenAI node will show a yellow warning; click into one and create the matching credential:
   - **Telegram account** — paste the BotFather token, save. n8n will reuse it for every Telegram node.
   - **OpenAI account** — if you're on the n8n Cloud trial, use the *n8n free* preset; otherwise paste your own OpenAI API key.
4. **Set up commands in BotFather.** Once, run `/setcommands` in BotFather, pick your bot, and paste:
   ```
   start - Welcome message and command list
   learn - Save and summarize a URL: /learn <url>
   quiz - Take a quiz on one of your saved topics
   ```
5. **Activate** the workflow with the toggle in the top-right of the n8n editor. The webhook URL for the Telegram trigger goes live immediately.
6. Open Telegram, find your bot, send `/start`. You should see the welcome message.

The bot does **not** require a workflow restart between commands — it routes every Telegram update through one Switch node and runs the matching branch.

## Files in this folder

| File | Purpose |
| --- | --- |
| `workflow.json` | Importable n8n workflow (41 nodes). Re-import into any n8n instance and connect Telegram + OpenAI credentials. |
| `workflow.ts` | Source-of-truth in the n8n Workflow SDK. Useful for diffing changes; not needed for importing. |
| `prompts/teacher.md` | The system prompt for the Teacher agent. |
| `prompts/examiner-generator.md` | The system prompt for the Examiner agent when generating a quiz. |
| `prompts/examiner-validator.md` | The system prompt for the Examiner agent when grading answers. |
| `report.md` | Build report — tools used, what worked, what didn't, notable decisions. |

## Data model

Each material is stored as:

```js
{
  id: "LM-001",
  url: "https://...",
  title: "React Hooks Guide",
  content: "<raw text extracted from the page>",
  summary: "<Telegram-formatted Markdown summary>",
  difficulty: "intermediate",
  keyPoints: ["...", "..."],
  mainConcepts: ["useState", "useEffect"],
  addedDate: "2026-05-24T18:30:00Z"
}
```

State lives under `$workflow.staticData.global.users[<telegramUserId>]` with two keys: `materials` (a map of `LM-NNN → material`) and `activeQuiz` (the currently in-progress quiz, or `null`).
