import {
  workflow,
  node,
  trigger,
  newCredential,
  ifElse,
  switchCase,
  languageModel,
  outputParser,
  expr,
  sticky,
} from '@n8n/workflow-sdk';

const TEACHER_SYSTEM = 'You are Teacher, an expert tutor inside a Telegram learning-assistant bot. The user has shared a URL; the bot already fetched the page and stripped it to plain text. Turn it into a study aid the user can read in under two minutes and remember the next day.\n\nYou receive JSON: { url, rawText }. Ignore navigation noise. Focus on the substantive body.\n\nReturn ONLY a JSON object with: title (string), difficulty (beginner|intermediate|advanced), keyPoints (5-7 short bullets, each under 25 words and self-contained), mainConcepts (2-5 named terms), summary (Telegram-safe Markdown, 120-220 words, opens with one-sentence framing, walks through keyPoints, closes with why this matters; use *bold*, _italics_, bullet lines starting with "- " — NEVER # headers).\n\nDifficulty: beginner = no prior knowledge needed. Intermediate = assumes basics, covers patterns/how-to. Advanced = assumes expertise, deep architecture/research.\n\nBe specific to the content. Never fabricate facts. Tone: friendly, precise, no fluff.';

const EXAMINER_GEN_SYSTEM = 'You are Examiner, a quizmaster. Build a five-question multiple-choice quiz that tests THIS specific material. Input: { materialId, title, difficulty, summary, keyPoints, mainConcepts, rawText }. Return ONLY a JSON object: { questions: [{ id, question, options: {A,B,C,D}, correctAnswer, explanation } x5] }. IDs strictly Q1..Q5. Each question must be answerable only by someone who studied this material. One unambiguously correct answer; distractors plausible. Stems under 200 chars, options under 100 chars, explanations 1-2 sentences. No leak of correct answer in stem. Plain text only.';

const EXAMINER_VAL_SYSTEM = 'You are Examiner in grading mode. Input: { materialId, title, questions [with correctAnswer], userAnswers: [{id, choice} x5] }. Return ONLY a JSON object: { scorePercent (integer 0/20/40/60/80/100), perQuestion: [{ id, userChoice, correctAnswer, isCorrect, feedback } x5], encouragement (one short line, max 120 chars, tone-matched: celebratory 80+, constructive 40-79, kind 0-39) }. Grade by intent: match user choice letter against canonical correctAnswer letter. Feedback in second person. No condescension. Plain text only.';

const telegramTrigger = trigger({
  type: 'n8n-nodes-base.telegramTrigger',
  version: 1.3,
  config: {
    name: 'Telegram Update',
    parameters: { updates: ['message', 'callback_query'] },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [-1200, 0],
  },
  output: [
    {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 12345, first_name: 'Demo', is_bot: false },
        chat: { id: 12345, type: 'private' },
        date: 1700000000,
        text: '/learn https://example.com',
      },
      callback_query: {
        id: 'cb1',
        from: { id: 12345, first_name: 'Demo', is_bot: false },
        message: { message_id: 1, chat: { id: 12345, type: 'private' } },
        data: 'topic:LM-001',
      },
    },
  ],
});

const commandRouter = switchCase({
  version: 3.4,
  config: {
    name: 'Route Telegram Update',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            renameOutput: true,
            outputKey: 'start',
            conditions: {
              options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
              combinator: 'and',
              conditions: [
                { leftValue: expr('{{ $json.message?.text || "" }}'), rightValue: '/start', operator: { type: 'string', operation: 'startsWith' } },
              ],
            },
          },
          {
            renameOutput: true,
            outputKey: 'learn',
            conditions: {
              options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
              combinator: 'and',
              conditions: [
                { leftValue: expr('{{ $json.message?.text || "" }}'), rightValue: '/learn', operator: { type: 'string', operation: 'startsWith' } },
              ],
            },
          },
          {
            renameOutput: true,
            outputKey: 'quiz',
            conditions: {
              options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
              combinator: 'and',
              conditions: [
                { leftValue: expr('{{ ($json.message?.text || "").trim() }}'), rightValue: '/quiz', operator: { type: 'string', operation: 'equals' } },
              ],
            },
          },
          {
            renameOutput: true,
            outputKey: 'topic',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
              combinator: 'and',
              conditions: [
                { leftValue: expr('{{ $json.callback_query?.data || "" }}'), rightValue: 'topic:', operator: { type: 'string', operation: 'startsWith' } },
              ],
            },
          },
          {
            renameOutput: true,
            outputKey: 'answer',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
              combinator: 'and',
              conditions: [
                { leftValue: expr('{{ $json.callback_query?.data || "" }}'), rightValue: 'ans:', operator: { type: 'string', operation: 'startsWith' } },
              ],
            },
          },
        ],
      },
      options: { ignoreCase: false, allMatchingOutputs: false },
    },
    position: [-900, 0],
  },
});

const sendWelcome = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Welcome',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.message.chat.id }}'),
      text: '*Welcome to the Learning Assistant!*\n\nSend me a link and I will turn it into a study session.\n\nCommands:\n- `/learn <url>` — summarize an article and save it\n- `/quiz` — quiz yourself on a saved topic\n- `/start` — show this message again',
      additionalFields: { parse_mode: 'Markdown', appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [-600, -600],
  },
  output: [{ ok: true }],
});

const parseLearn = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Learn',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const msg = $input.first().json.message;\nconst text = String(msg?.text || '').trim();\nconst url = text.replace(/^\\/learn\\s*/i, '').trim();\nif (!/^https?:\\/\\//i.test(url)) {\n  return [{ json: { ok: false, chatId: msg.chat.id, uid: String(msg.from.id), error: 'Please send a URL. Example: /learn https://example.com' } }];\n}\nreturn [{ json: { ok: true, chatId: msg.chat.id, uid: String(msg.from.id), url } }];",
    },
    position: [-600, -300],
  },
  output: [{ ok: true, chatId: 12345, uid: '12345', url: 'https://example.com' }],
});

const learnUrlOk = ifElse({
  version: 2.3,
  config: {
    name: 'URL Valid?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } },
        ],
      },
    },
    position: [-400, -300],
  },
});

const sendLearnError = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Learn Error',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.error }}'),
      additionalFields: { appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [-200, -150],
  },
  output: [{ ok: true }],
});

const fetchUrl = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch URL',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.url }}'),
      options: {
        timeout: 15000,
        redirect: { redirect: { followRedirects: true, maxRedirects: 5 } },
        response: { response: { responseFormat: 'text', neverError: true } },
      },
    },
    position: [-200, -450],
  },
  output: [{ data: '<html><body><h1>Title</h1><p>Body text</p></body></html>' }],
});

const stripHtml = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Strip HTML',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const prev = $('Parse Learn').first().json;\nconst raw = $input.first()?.json?.data;\nif (!raw || typeof raw !== 'string') {\n  return [{ json: { ok: false, chatId: prev.chatId, uid: prev.uid, error: \"Couldn't fetch that URL. Is it public?\" } }];\n}\nlet text = raw.replace(/<script[\\s\\S]*?<\\/script>/gi, ' ').replace(/<style[\\s\\S]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\\s+/g, ' ').trim();\nif (text.length > 12000) text = text.slice(0, 12000);\nif (text.length < 200) {\n  return [{ json: { ok: false, chatId: prev.chatId, uid: prev.uid, error: \"That page didn't have readable text. Try a different URL.\" } }];\n}\nreturn [{ json: { ok: true, chatId: prev.chatId, uid: prev.uid, url: prev.url, rawText: text } }];",
    },
    position: [0, -450],
  },
  output: [{ ok: true, chatId: 12345, uid: '12345', url: 'https://example.com', rawText: 'Title Body text' }],
});

const stripHtmlOk = ifElse({
  version: 2.3,
  config: {
    name: 'Extracted OK?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } },
        ],
      },
    },
    position: [200, -450],
  },
});

const sendFetchError = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Fetch Error',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.error }}'),
      additionalFields: { appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [400, -600],
  },
  output: [{ ok: true }],
});

const teacherModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'Teacher Model',
    parameters: { model: { __rl: true, mode: 'list', value: 'gpt-4o-mini' }, options: { temperature: 0.3 } },
    credentials: { openAiApi: newCredential('OpenAI') },
    position: [400, -200],
  },
});

const teacherParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'Teacher Output Parser',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{ "title": "Title", "difficulty": "intermediate", "keyPoints": ["p1","p2","p3","p4","p5"], "mainConcepts": ["c1"], "summary": "*Heading* text" }',
    },
    position: [560, -200],
  },
});

const teacherAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Teacher Agent',
    parameters: {
      promptType: 'define',
      text: expr('{{ JSON.stringify({ url: $json.url, rawText: $json.rawText }) }}'),
      hasOutputParser: true,
      options: { systemMessage: TEACHER_SYSTEM, maxIterations: 3 },
    },
    subnodes: { model: teacherModel, outputParser: teacherParser },
    position: [400, -450],
  },
  output: [{ output: { title: 'Title', difficulty: 'intermediate', keyPoints: ['p1'], mainConcepts: ['c1'], summary: 'Summary' } }],
});

const persistMaterial = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Save Material',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const ai = $input.first().json;\nconst ctx = $('Strip HTML').first().json;\nconst parsed = ai.output || ai;\nif (!parsed || !parsed.title) {\n  return [{ json: { chatId: ctx.chatId, text: 'Teacher returned an unreadable response. Try again later.', cbText: '', cbData: '' } }];\n}\nconst sd = $getWorkflowStaticData('global');\nsd.users = sd.users || {};\nconst u = sd.users[ctx.uid] = sd.users[ctx.uid] || { nextLmCounter: 1, materials: {}, activeQuiz: null };\nconst id = 'LM-' + String(u.nextLmCounter).padStart(3, '0');\nu.nextLmCounter += 1;\nu.materials[id] = { id, url: ctx.url, title: String(parsed.title).slice(0, 200), content: ctx.rawText, summary: String(parsed.summary || ''), difficulty: parsed.difficulty, keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [], mainConcepts: Array.isArray(parsed.mainConcepts) ? parsed.mainConcepts : [], addedDate: new Date().toISOString() };\nconst text = '*' + parsed.title + '*\\n_Difficulty: ' + parsed.difficulty + '_\\n\\n' + (parsed.summary || '') + '\\n\\nSaved as *' + id + '*. Want a quiz?';\nreturn [{ json: { chatId: ctx.chatId, text, cbText: 'Take a quiz on this →', cbData: 'topic:' + id } }];",
    },
    position: [600, -450],
  },
  output: [{ chatId: 12345, text: 'Summary', cbText: 'Take a quiz on this →', cbData: 'topic:LM-001' }],
});

const sendSummary = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Summary',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.text }}'),
      replyMarkup: 'inlineKeyboard',
      inlineKeyboard: {
        rows: [
          {
            row: {
              buttons: [
                { text: expr('{{ $json.cbText }}'), additionalFields: { callback_data: expr('{{ $json.cbData }}') } },
              ],
            },
          },
        ],
      },
      additionalFields: { parse_mode: 'Markdown', appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [800, -450],
  },
  output: [{ ok: true }],
});

const buildTopicPicker = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Topic Picker',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const msg = $input.first().json.message;\nconst uid = String(msg.from.id);\nconst sd = $getWorkflowStaticData('global');\nconst u = sd.users && sd.users[uid];\nconst materials = u && u.materials ? Object.values(u.materials) : [];\nif (!materials.length) {\n  return [{ json: { chatId: msg.chat.id, text: 'You have no saved materials yet. Try /learn <url> first.', rows: [], hasTopics: false } }];\n}\nconst rows = materials.map(m => ({ row: { buttons: [{ text: String(m.title).slice(0, 60), additionalFields: { callback_data: 'topic:' + m.id } }] } }));\nreturn [{ json: { chatId: msg.chat.id, text: 'Pick a topic to quiz yourself on:', rows, hasTopics: true } }];",
    },
    position: [-600, 300],
  },
  output: [{ chatId: 12345, text: 'Pick a topic', rows: [{ row: { buttons: [{ text: 'Title', additionalFields: { callback_data: 'topic:LM-001' } }] } }], hasTopics: true }],
});

const topicsExist = ifElse({
  version: 2.3,
  config: {
    name: 'Has Topics?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ $json.hasTopics }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } },
        ],
      },
    },
    position: [-400, 300],
  },
});

const sendNoTopics = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send No Topics',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.text }}'),
      additionalFields: { appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [-200, 450],
  },
  output: [{ ok: true }],
});

const sendTopicList = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Topic List',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.text }}'),
      replyMarkup: 'inlineKeyboard',
      inlineKeyboard: { rows: expr('={{ $json.rows }}') },
      additionalFields: { appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [-200, 150],
  },
  output: [{ ok: true }],
});

const parseTopicCallback = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Topic Click',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const cq = $input.first().json.callback_query;\nconst data = String(cq.data || '');\nconst parts = data.split(':');\nconst uid = String(cq.from.id);\nconst chatId = cq.message.chat.id;\nconst sd = $getWorkflowStaticData('global');\nconst u = sd.users && sd.users[uid];\nconst material = u && u.materials && u.materials[parts[1]];\nif (!material) {\n  return [{ json: { ok: false, chatId, callbackQueryId: cq.id, error: 'That topic is no longer available.' } }];\n}\nreturn [{ json: { ok: true, chatId, uid, callbackQueryId: cq.id, material } }];",
    },
    position: [-600, 600],
  },
  output: [{ ok: true, chatId: 12345, uid: '12345', callbackQueryId: 'cb1', material: { id: 'LM-001', title: 'T', difficulty: 'intermediate', summary: 's', keyPoints: [], mainConcepts: [], content: 'text' } }],
});

const materialOk = ifElse({
  version: 2.3,
  config: {
    name: 'Material Found?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [
          { leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } },
        ],
      },
    },
    position: [-400, 600],
  },
});

const sendMaterialMissing = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Material Missing',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.error }}'),
      additionalFields: { appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [-200, 800],
  },
  output: [{ ok: true }],
});

const examinerGenModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'Examiner Gen Model',
    parameters: { model: { __rl: true, mode: 'list', value: 'gpt-4o-mini' }, options: { temperature: 0.4 } },
    credentials: { openAiApi: newCredential('OpenAI') },
    position: [200, 700],
  },
});

const examinerGenParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'Examiner Gen Parser',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{ "questions": [{ "id": "Q1", "question": "What does useState return?", "options": { "A": "Value", "B": "Array", "C": "Object", "D": "Func" }, "correctAnswer": "B", "explanation": "Returns a tuple." }] }',
    },
    position: [360, 700],
  },
});

const examinerGenAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Examiner Generate',
    parameters: {
      promptType: 'define',
      text: expr('{{ JSON.stringify({ materialId: $json.material.id, title: $json.material.title, difficulty: $json.material.difficulty, summary: $json.material.summary, keyPoints: $json.material.keyPoints, mainConcepts: $json.material.mainConcepts, rawText: $json.material.content }) }}'),
      hasOutputParser: true,
      options: { systemMessage: EXAMINER_GEN_SYSTEM, maxIterations: 3 },
    },
    subnodes: { model: examinerGenModel, outputParser: examinerGenParser },
    position: [-200, 500],
  },
  output: [{ output: { questions: [{ id: 'Q1', question: 'q', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctAnswer: 'A', explanation: 'e' }] } }],
});

const buildQ1 = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Save Quiz Build Q1',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const ai = $input.first().json;\nconst ctx = $('Parse Topic Click').first().json;\nconst parsed = ai.output || ai;\nif (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {\n  return [{ json: { chatId: ctx.chatId, callbackQueryId: ctx.callbackQueryId, text: 'Examiner returned an unreadable response.', aText: '-', aCb: 'noop', bText: '-', bCb: 'noop', cText: '-', cCb: 'noop', dText: '-', dCb: 'noop' } }];\n}\nconst sd = $getWorkflowStaticData('global');\nconst u = sd.users[ctx.uid];\nu.activeQuiz = { materialId: ctx.material.id, questions: parsed.questions.slice(0, 5), currentIndex: 0, answers: [] };\nconst q = u.activeQuiz.questions[0];\nconst cb = L => 'ans:' + ctx.material.id + ':' + q.id + ':' + L;\nreturn [{ json: { chatId: ctx.chatId, callbackQueryId: ctx.callbackQueryId, text: '*Question 1/' + u.activeQuiz.questions.length + '*\\n\\n' + q.question, aText: 'A. ' + q.options.A, aCb: cb('A'), bText: 'B. ' + q.options.B, bCb: cb('B'), cText: 'C. ' + q.options.C, cCb: cb('C'), dText: 'D. ' + q.options.D, dCb: cb('D') } }];",
    },
    position: [0, 500],
  },
  output: [{ chatId: 12345, callbackQueryId: 'cb1', text: '*Question 1/5*\n\nq?', aText: 'A. a', aCb: 'ans:LM-001:Q1:A', bText: 'B. b', bCb: 'ans:LM-001:Q1:B', cText: 'C. c', cCb: 'ans:LM-001:Q1:C', dText: 'D. d', dCb: 'ans:LM-001:Q1:D' }],
});

const sendQuestionFirst = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Question 1',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.text }}'),
      replyMarkup: 'inlineKeyboard',
      inlineKeyboard: {
        rows: [
          { row: { buttons: [{ text: expr('{{ $json.aText }}'), additionalFields: { callback_data: expr('{{ $json.aCb }}') } }] } },
          { row: { buttons: [{ text: expr('{{ $json.bText }}'), additionalFields: { callback_data: expr('{{ $json.bCb }}') } }] } },
          { row: { buttons: [{ text: expr('{{ $json.cText }}'), additionalFields: { callback_data: expr('{{ $json.cCb }}') } }] } },
          { row: { buttons: [{ text: expr('{{ $json.dText }}'), additionalFields: { callback_data: expr('{{ $json.dCb }}') } }] } },
        ],
      },
      additionalFields: { parse_mode: 'Markdown', appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [200, 500],
  },
  output: [{ ok: true }],
});

const ackTopicClick = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Ack Topic Click',
    parameters: {
      resource: 'callback',
      operation: 'answerQuery',
      queryId: expr("{{ $('Parse Topic Click').item.json.callbackQueryId }}"),
      additionalFields: {},
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [400, 500],
  },
  output: [{ ok: true }],
});

const parseAnswerCallback = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Answer Click',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const cq = $input.first().json.callback_query;\nconst data = String(cq.data || '');\nconst parts = data.split(':');\nconst uid = String(cq.from.id);\nconst chatId = cq.message.chat.id;\nconst lmId = parts[1];\nconst qId = parts[2];\nconst choice = parts[3];\nconst sd = $getWorkflowStaticData('global');\nconst u = sd.users && sd.users[uid];\nconst quiz = u && u.activeQuiz;\nif (!quiz || quiz.materialId !== lmId) {\n  return [{ json: { stage: 'orphan', chatId, callbackQueryId: cq.id, text: 'This quiz has ended. Send /quiz to start a new one.', aText: '-', aCb: 'noop', bText: '-', bCb: 'noop', cText: '-', cCb: 'noop', dText: '-', dCb: 'noop' } }];\n}\nquiz.answers.push({ id: qId, choice });\nquiz.currentIndex += 1;\nconst cb = (qid, L) => 'ans:' + quiz.materialId + ':' + qid + ':' + L;\nif (quiz.currentIndex < quiz.questions.length) {\n  const q = quiz.questions[quiz.currentIndex];\n  return [{ json: { stage: 'next', chatId, callbackQueryId: cq.id, text: '*Question ' + (quiz.currentIndex + 1) + '/' + quiz.questions.length + '*\\n\\n' + q.question, aText: 'A. ' + q.options.A, aCb: cb(q.id, 'A'), bText: 'B. ' + q.options.B, bCb: cb(q.id, 'B'), cText: 'C. ' + q.options.C, cCb: cb(q.id, 'C'), dText: 'D. ' + q.options.D, dCb: cb(q.id, 'D') } }];\n}\nconst material = u.materials[quiz.materialId];\nreturn [{ json: { stage: 'finish', chatId, callbackQueryId: cq.id, uid, validatorInput: { materialId: material.id, title: material.title, questions: quiz.questions, userAnswers: quiz.answers } } }];",
    },
    position: [-600, 900],
  },
  output: [{ stage: 'next', chatId: 12345, callbackQueryId: 'cb1', text: '*Q*', aText: 'A.', aCb: 'ans:LM-001:Q2:A', bText: 'B.', bCb: 'ans:LM-001:Q2:B', cText: 'C.', cCb: 'ans:LM-001:Q2:C', dText: 'D.', dCb: 'ans:LM-001:Q2:D' }],
});

const stageRouter = switchCase({
  version: 3.4,
  config: {
    name: 'Answer Stage',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            renameOutput: true,
            outputKey: 'next',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
              combinator: 'and',
              conditions: [{ leftValue: expr('{{ $json.stage }}'), rightValue: 'next', operator: { type: 'string', operation: 'equals' } }],
            },
          },
          {
            renameOutput: true,
            outputKey: 'finish',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
              combinator: 'and',
              conditions: [{ leftValue: expr('{{ $json.stage }}'), rightValue: 'finish', operator: { type: 'string', operation: 'equals' } }],
            },
          },
          {
            renameOutput: true,
            outputKey: 'orphan',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
              combinator: 'and',
              conditions: [{ leftValue: expr('{{ $json.stage }}'), rightValue: 'orphan', operator: { type: 'string', operation: 'equals' } }],
            },
          },
        ],
      },
      options: { ignoreCase: false },
    },
    position: [-400, 900],
  },
});

const sendNextQuestion = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Next Question',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.text }}'),
      replyMarkup: 'inlineKeyboard',
      inlineKeyboard: {
        rows: [
          { row: { buttons: [{ text: expr('{{ $json.aText }}'), additionalFields: { callback_data: expr('{{ $json.aCb }}') } }] } },
          { row: { buttons: [{ text: expr('{{ $json.bText }}'), additionalFields: { callback_data: expr('{{ $json.bCb }}') } }] } },
          { row: { buttons: [{ text: expr('{{ $json.cText }}'), additionalFields: { callback_data: expr('{{ $json.cCb }}') } }] } },
          { row: { buttons: [{ text: expr('{{ $json.dText }}'), additionalFields: { callback_data: expr('{{ $json.dCb }}') } }] } },
        ],
      },
      additionalFields: { parse_mode: 'Markdown', appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [-200, 850],
  },
  output: [{ ok: true }],
});

const ackNext = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Ack Next',
    parameters: {
      resource: 'callback',
      operation: 'answerQuery',
      queryId: expr("{{ $('Parse Answer Click').item.json.callbackQueryId }}"),
      additionalFields: {},
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [0, 850],
  },
  output: [{ ok: true }],
});

const sendOrphan = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Orphan Notice',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.text }}'),
      additionalFields: { appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [-200, 1100],
  },
  output: [{ ok: true }],
});

const ackOrphan = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Ack Orphan',
    parameters: {
      resource: 'callback',
      operation: 'answerQuery',
      queryId: expr("{{ $('Parse Answer Click').item.json.callbackQueryId }}"),
      additionalFields: {},
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [0, 1100],
  },
  output: [{ ok: true }],
});

const examinerValModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'Examiner Val Model',
    parameters: { model: { __rl: true, mode: 'list', value: 'gpt-4o-mini' }, options: { temperature: 0.2 } },
    credentials: { openAiApi: newCredential('OpenAI') },
    position: [200, 1400],
  },
});

const examinerValParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'Examiner Val Parser',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{ "scorePercent": 80, "perQuestion": [{ "id": "Q1", "userChoice": "A", "correctAnswer": "A", "isCorrect": true, "feedback": "Right because X." }], "encouragement": "Great job." }',
    },
    position: [360, 1400],
  },
});

const examinerValAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Examiner Validate',
    parameters: {
      promptType: 'define',
      text: expr('{{ JSON.stringify($json.validatorInput) }}'),
      hasOutputParser: true,
      options: { systemMessage: EXAMINER_VAL_SYSTEM, maxIterations: 3 },
    },
    subnodes: { model: examinerValModel, outputParser: examinerValParser },
    position: [200, 1200],
  },
  output: [{ output: { scorePercent: 80, perQuestion: [], encouragement: 'Great' } }],
});

const buildResults = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Results',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const ai = $input.first().json;\nconst ctx = $('Parse Answer Click').first().json;\nconst r = ai.output || ai;\nif (!r || typeof r.scorePercent !== 'number') {\n  return [{ json: { chatId: ctx.chatId, callbackQueryId: ctx.callbackQueryId, text: 'Validator returned an unreadable response.' } }];\n}\nconst sd = $getWorkflowStaticData('global');\nif (sd.users && sd.users[ctx.uid]) sd.users[ctx.uid].activeQuiz = null;\nconst lines = ['*Your score: ' + r.scorePercent + '%*', ''];\nfor (const item of (r.perQuestion || [])) {\n  const mark = item.isCorrect ? '✅' : '❌';\n  lines.push(mark + ' *' + item.id + '* — you picked ' + item.userChoice + ', correct: ' + item.correctAnswer);\n  lines.push('_' + (item.feedback || '') + '_');\n  lines.push('');\n}\nlines.push(r.encouragement || '');\nreturn [{ json: { chatId: ctx.chatId, callbackQueryId: ctx.callbackQueryId, text: lines.join('\\n') } }];",
    },
    position: [400, 1200],
  },
  output: [{ chatId: 12345, callbackQueryId: 'cb1', text: '*Your score: 80%*' }],
});

const sendResults = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Results',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $json.chatId }}'),
      text: expr('{{ $json.text }}'),
      additionalFields: { parse_mode: 'Markdown', appendAttribution: false },
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [600, 1200],
  },
  output: [{ ok: true }],
});

const ackFinish = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Ack Finish',
    parameters: {
      resource: 'callback',
      operation: 'answerQuery',
      queryId: expr("{{ $('Parse Answer Click').item.json.callbackQueryId }}"),
      additionalFields: {},
    },
    credentials: { telegramApi: newCredential('Telegram Bot') },
    position: [800, 1200],
  },
  output: [{ ok: true }],
});

const overviewNote = sticky(
  '## Telegram Learning Assistant\n\n**Commands**: /start, /learn <url>, /quiz\n\nState lives in $workflow.staticData.global.users[telegramUserId]. Teacher and Examiner agents both call OpenAI with strict JSON output parsers.',
  [telegramTrigger, commandRouter],
  { color: 5, width: 460, height: 200 },
);

export default workflow('task-3-learning-assistant', 'Telegram Learning Assistant')
  .add(overviewNote)
  .add(telegramTrigger)
  .to(
    commandRouter
      .onCase(0, sendWelcome)
      .onCase(
        1,
        parseLearn.to(
          learnUrlOk
            .onTrue(
              fetchUrl.to(
                stripHtml.to(
                  stripHtmlOk
                    .onTrue(teacherAgent.to(persistMaterial.to(sendSummary)))
                    .onFalse(sendFetchError),
                ),
              ),
            )
            .onFalse(sendLearnError),
        ),
      )
      .onCase(
        2,
        buildTopicPicker.to(topicsExist.onTrue(sendTopicList).onFalse(sendNoTopics)),
      )
      .onCase(
        3,
        parseTopicCallback.to(
          materialOk
            .onTrue(examinerGenAgent.to(buildQ1.to(sendQuestionFirst.to(ackTopicClick))))
            .onFalse(sendMaterialMissing),
        ),
      )
      .onCase(
        4,
        parseAnswerCallback.to(
          stageRouter
            .onCase(0, sendNextQuestion.to(ackNext))
            .onCase(1, examinerValAgent.to(buildResults.to(sendResults.to(ackFinish))))
            .onCase(2, sendOrphan.to(ackOrphan)),
        ),
      ),
  );
