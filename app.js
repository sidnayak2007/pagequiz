const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    description: 'Clear recall questions with a small hint after the question.'
  },
  medium: {
    label: 'Medium',
    description: 'Understanding questions with closer answer choices.'
  },
  hard: {
    label: 'Hard',
    description: 'Application and case-based questions with close distractors.'
  },
  god: {
    label: 'God mode',
    description: 'Hard case-based questions. Correct answers appear only at the end.'
  }
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 220_000;
const MAX_FACTS = 160;
const MIN_FACTS_BY_COUNT = { 10: 6, 20: 8, 30: 10 };
const HISTORY_LIMIT = 90;

const STOP_WORDS = new Set(`the a an and or but if then than that this these those with from into onto over under about through between during before after their there where which while when what would should could have been being were will shall must also only very more most some such each both they them your our its his her not are was for you all can may does did has had any how who why other same use used using one two first second including include includes example examples following according however therefore of to in on at by as is be it its we he she i they them our your`.split(/\s+/));

const RELATION_RE = /^(.{3,100}?)\s+(is defined as|refers to|consists of|focuses on|aims to|means|involves|includes|enables|allows|explains|describes|improves|ensures|creates|determines|divides|establishes|supports|requires|provides|reduces|increases|helps|uses|covers|contains|represents|measures|compares|estimates|encourages|targets|tracks|monitors|evaluates|identifies|connects|delivers|manages|controls|calculates|collects|organizes|analyses|analyzes|predicts|is|are)\s+(.{10,360})$/i;
const BAD_SUBJECT_RE = /^(this|that|these|those|they|it|he|she|we|you|there|however|therefore|also|for example|because|although|while)\b/i;

const QUESTION_TEMPLATES = {
  topic: [
    d => `Which topic from your document best matches this description?\n\n“${cap(d)}”`,
    d => `Identify the topic connected to this idea from the uploaded material:\n\n“${cap(d)}”`,
    d => `What concept does your document associate with the following point?\n\n“${cap(d)}”`,
    d => `Choose the document topic that fits this meaning or function:\n\n“${cap(d)}”`,
    d => `Which named idea in the notes corresponds to this explanation?\n\n“${cap(d)}”`,
    d => `Match this description to the correct topic from your notes:\n\n“${cap(d)}”`,
    d => `The uploaded material links which topic to this statement?\n\n“${cap(d)}”`,
    d => `Which topic is represented by this document-based description?\n\n“${cap(d)}”`,
    d => `A key term has been removed from this note. Which topic belongs here?\n\n“${cap(d)}”`,
    d => `Which concept would complete the meaning of this note most accurately?\n\n“${cap(d)}”`,
    d => `Select the topic whose role is described below:\n\n“${cap(d)}”`,
    d => `Which topic is the best label for the following idea?\n\n“${cap(d)}”`
  ],
  definition: [
    s => `According to your document, which description best matches “${s}”?`,
    s => `What does the uploaded material say about “${s}”?`,
    s => `Which statement is correctly associated with “${s}” in your notes?`,
    s => `Choose the description that best explains “${s}”.`,
    s => `Which option most accurately represents the role or meaning of “${s}”?`,
    s => `In the document, “${s}” is connected to which idea?`,
    s => `Which explanation belongs with the topic “${s}”?`,
    s => `Select the document-based description for “${s}”.`,
    s => `Which statement would be the best revision note for “${s}”?`,
    s => `A student is reviewing “${s}”. Which explanation should they remember?`,
    s => `Which option correctly summarizes “${s}” from the uploaded material?`,
    s => `What is the closest document-supported explanation of “${s}”?`
  ],
  caseTopic: [
    d => `Case: A student sees a situation that matches this idea:\n\n“${cap(d)}”\n\nWhich topic should they apply?`,
    d => `A team needs the concept described below. Which topic from the document is relevant?\n\n“${cap(d)}”`,
    d => `A manager is dealing with a situation matching this note:\n\n“${cap(d)}”\n\nWhich concept best fits?`,
    d => `Case study: An organisation needs the idea represented here. Which topic should guide it?\n\n“${cap(d)}”`,
    d => `In a practical situation, the following function becomes important:\n\n“${cap(d)}”\n\nWhich topic explains it?`,
    d => `A project team encounters the requirement below. Which document topic is most relevant?\n\n“${cap(d)}”`,
    d => `Case study: A decision depends on this idea:\n\n“${cap(d)}”\n\nSelect the correct concept.`,
    d => `An organisation wants to use the principle described below. Which topic is it applying?\n\n“${cap(d)}”`,
    d => `A learner must identify the concept behind this practical clue:\n\n“${cap(d)}”`,
    d => `Which topic would best solve a case built around the following document point?\n\n“${cap(d)}”`,
    d => `A real-world example reflects this description. Which concept does it represent?\n\n“${cap(d)}”`,
    d => `Case: The correct decision requires recognising this idea:\n\n“${cap(d)}”\n\nWhich topic fits?`
  ],
  pairing: [
    () => 'Which option correctly matches a topic from the document with its description?',
    () => 'Choose the only topic–description pairing that is supported by the uploaded material.',
    () => 'Which pairing is accurate according to your notes?',
    () => 'Select the correctly matched concept and explanation.',
    () => 'Which topic has been paired with the correct document-based meaning?',
    () => 'Only one of these topic–description pairs is correct. Which one?',
    () => 'Which option preserves the relationship stated in the uploaded document?',
    () => 'Identify the accurate match between a topic and what the document says about it.',
    () => 'Which pairing would be safe to write in your revision notes?',
    () => 'Choose the correctly associated topic and explanation.',
    () => 'Which option contains a valid concept–description match?',
    () => 'Which matched pair is supported by the source material?'
  ]
};

function cleanText(value = '') {
  return String(value)
    .replace(/\u00ad/g, '')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanLine(value = '') {
  return String(value)
    .replace(/^\s*(?:[-•▪◦–—]|\(?\d+[.)]|[A-Za-z][.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function cap(value = '') {
  const s = String(value).trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function normalizeKey(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[“”‘’'"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function truncate(value, limit = 145) {
  const s = cleanLine(value);
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit - 1).replace(/\s+\S*$/, '').trim();
  return `${cut || s.slice(0, limit - 1)}…`;
}

function splitIntoCandidates(text) {
  const cleaned = cleanText(text).slice(0, MAX_TEXT_CHARS);
  const rough = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanLine)
    .filter(Boolean);

  const candidates = [];
  const seen = new Set();
  for (const item of rough) {
    if (item.length < 28 || item.length > 430) continue;
    if (item.split(/\s+/).length < 5) continue;
    const key = normalizeKey(item);
    if (key.length < 18 || seen.has(key)) continue;
    seen.add(key);
    candidates.push(item);
    if (candidates.length >= 700) break;
  }
  return candidates;
}

function plausibleSubject(subject) {
  const s = cleanLine(subject).replace(/[.:;,-]+$/, '').trim();
  if (!s || s.length < 3 || s.length > 92) return false;
  const words = s.split(/\s+/);
  if (words.length > 12 || BAD_SUBJECT_RE.test(s)) return false;
  const meaningful = words.filter(w => !STOP_WORDS.has(w.toLowerCase()) && /[a-z]/i.test(w));
  return meaningful.length >= 1;
}

function deriveSubject(sentence) {
  const colon = sentence.match(/^(.{3,80}?)\s*[:–—-]\s+(.{12,330})$/);
  if (colon && plausibleSubject(colon[1])) return { subject: cleanLine(colon[1]), description: cleanLine(colon[2]) };

  const relation = sentence.replace(/[.!?]+$/, '').match(RELATION_RE);
  if (relation && plausibleSubject(relation[1])) {
    const verb = relation[2].toLowerCase();
    const object = cleanLine(relation[3]);
    const description = /^(is|are|means|refers to|is defined as)$/.test(verb)
      ? object
      : `${verb} ${object}`;
    return { subject: cleanLine(relation[1]), description: cleanLine(description) };
  }

  const verbSplit = sentence.match(/^(.{3,90}?)\s+(helps|supports|uses|provides|creates|requires|allows|enables|improves|reduces|increases|focuses|involves|contains|covers|represents)\b\s+(.{10,300})$/i);
  if (verbSplit && plausibleSubject(verbSplit[1])) {
    return {
      subject: cleanLine(verbSplit[1]),
      description: cleanLine(`${verbSplit[2].toLowerCase()} ${verbSplit[3]}`)
    };
  }

  return null;
}

export function extractFacts(text) {
  const candidates = splitIntoCandidates(text);
  const facts = [];
  const subjectSeen = new Set();
  const descSeen = new Set();

  for (const sentence of candidates) {
    const pair = deriveSubject(sentence);
    if (!pair) continue;

    const subject = truncate(pair.subject, 92);
    const description = truncate(pair.description, 175).replace(/[.!?]+$/, '');
    const subjectKey = normalizeKey(subject);
    const descKey = normalizeKey(description);

    if (!subjectKey || !descKey || subjectKey === descKey) continue;
    if (description.split(/\s+/).length < 3) continue;
    if (normalizeKey(description).includes(subjectKey) && subjectKey.split(' ').length > 1) continue;
    if (subjectSeen.has(subjectKey) || descSeen.has(descKey)) continue;

    subjectSeen.add(subjectKey);
    descSeen.add(descKey);
    facts.push({ subject, description, source: sentence });
    if (facts.length >= MAX_FACTS) break;
  }

  return facts;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function tokenSet(value) {
  return new Set(normalizeKey(value).split(/\s+/).filter(w => w && !STOP_WORDS.has(w)));
}

function similarity(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0;
  for (const token of A) if (B.has(token)) overlap++;
  const union = A.size + B.size - overlap;
  const lexical = union ? overlap / union : 0;
  const lengthScore = 1 / (1 + Math.abs(String(a).length - String(b).length) / 30);
  return lexical * 5 + lengthScore;
}

function pickDistractorFacts(facts, correct, difficulty, amount = 3) {
  const pool = facts.filter(f => f !== correct);
  const scored = pool.map(f => ({ f, score: similarity(correct.description, f.description) + similarity(correct.subject, f.subject) }));
  scored.sort((a, b) => difficulty === 'easy' ? a.score - b.score : b.score - a.score);

  const bandSize = difficulty === 'easy'
    ? Math.min(scored.length, Math.max(amount + 3, 10))
    : Math.min(scored.length, Math.max(amount + 5, 14));

  const band = scored.slice(0, bandSize).map(x => x.f);
  return shuffled(band).slice(0, amount);
}

function insertAnswer(answer, distractors, position) {
  const options = [...distractors];
  options.splice(position, 0, answer);
  return options;
}

function compactDescription(fact, limit = 128) {
  return truncate(fact.description, limit);
}

function correctPair(fact) {
  return `${fact.subject} — ${compactDescription(fact, 105)}`;
}

function wrongPair(a, b) {
  return `${a.subject} — ${compactDescription(b, 105)}`;
}

function optionSignature(options) {
  return options.map(normalizeKey).sort().join('||');
}

function questionSignature(prompt, answer) {
  return `${normalizeKey(prompt)}::${normalizeKey(answer)}`;
}

function makeQuestion(facts, fact, difficulty, index, usedOptionSets, blockedQuestions, usedPrompts) {
  const hard = difficulty === 'hard' || difficulty === 'god';
  const typeChoices = hard
    ? ['caseTopic', 'pairing', 'definition', 'caseTopic', 'pairing']
    : difficulty === 'easy'
      ? ['topic', 'definition', 'topic']
      : ['topic', 'definition', 'pairing', 'definition'];

  for (let attempt = 0; attempt < 90; attempt++) {
    const type = typeChoices[randomInt(typeChoices.length)];
    const distractorFacts = pickDistractorFacts(facts, fact, difficulty, 3);
    if (distractorFacts.length < 3) continue;

    const templateList = QUESTION_TEMPLATES[type];
    const template = templateList[randomInt(templateList.length)];
    let prompt;
    let answer;
    let distractors;
    let answerTopic = fact.subject;

    if (type === 'definition') {
      prompt = template(fact.subject);
      answer = compactDescription(fact, 145);
      distractors = distractorFacts.map(f => compactDescription(f, 145));
    } else if (type === 'pairing') {
      prompt = template();
      answer = correctPair(fact);
      const rotated = shuffled(facts.filter(f => f !== fact));
      distractors = [];
      for (const subjectFact of distractorFacts) {
        const descFact = rotated.find(f => f !== subjectFact && f !== fact && !distractors.includes(wrongPair(subjectFact, f)));
        if (descFact) distractors.push(wrongPair(subjectFact, descFact));
      }
      if (distractors.length < 3) continue;
    } else {
      prompt = template(fact.description);
      answer = fact.subject;
      distractors = distractorFacts.map(f => f.subject);
    }

    const normalized = [answer, ...distractors].map(normalizeKey);
    if (new Set(normalized).size !== 4) continue;

    const position = (index + randomInt(4)) % 4;
    const options = insertAnswer(answer, distractors, position);
    const optSig = optionSignature(options);
    const qSig = questionSignature(prompt, answer);
    const promptSig = normalizeKey(prompt);

    if (usedOptionSets.has(optSig) || blockedQuestions.has(qSig) || usedPrompts.has(promptSig)) continue;

    return {
      prompt,
      answer,
      answerTopic,
      options,
      correctIndex: position,
      source: fact.source,
      difficulty,
      hint: difficulty === 'easy'
        ? `Hint: the correct topic/answer starts with “${answer.trim().charAt(0).toUpperCase()}”.`
        : null,
      signature: qSig,
      optionSignature: optSig
    };
  }

  return null;
}

export function generateQuizFromFacts(facts, count = 10, difficulty = 'medium', blockedSignatures = new Set()) {
  if (!Number.isInteger(count) || ![10, 20, 30].includes(count)) return [];
  if (!DIFFICULTIES[difficulty]) difficulty = 'medium';
  const minFacts = MIN_FACTS_BY_COUNT[count] || 6;
  if (!Array.isArray(facts) || facts.length < minFacts) return [];

  const pool = shuffled(facts.slice(0, MAX_FACTS));
  const usedOptionSets = new Set();
  const forbiddenQuestions = new Set(blockedSignatures);
  const usedPrompts = new Set();
  const quiz = [];
  let cursor = 0;
  let passes = 0;

  while (quiz.length < count && passes < 12) {
    const order = shuffled(pool);
    for (const fact of order) {
      const question = makeQuestion(pool, fact, difficulty, cursor++, usedOptionSets, forbiddenQuestions, usedPrompts);
      if (!question) continue;
      usedOptionSets.add(question.optionSignature);
      forbiddenQuestions.add(question.signature);
      usedPrompts.add(normalizeKey(question.prompt));
      quiz.push(question);
      if (quiz.length === count) break;
    }
    passes++;
  }

  return quiz.length === count ? quiz : [];
}

function hashString(input) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36);
}

function docFingerprint(file, text) {
  const sample = `${text.slice(0, 7000)}|${text.slice(-7000)}`;
  return `${hashString(sample)}-${file.size}-${hashString(file.name.toLowerCase())}`;
}

function historyKey(fingerprint) {
  return `pagequiz-history-v2:${fingerprint}`;
}

function readHistory(fingerprint) {
  if (typeof sessionStorage === 'undefined') return new Set();
  try {
    const raw = JSON.parse(sessionStorage.getItem(historyKey(fingerprint)) || '[]');
    return new Set(Array.isArray(raw) ? raw.slice(-HISTORY_LIMIT) : []);
  } catch {
    return new Set();
  }
}

function saveHistory(fingerprint, quiz) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const previous = [...readHistory(fingerprint)];
    const merged = [...previous, ...quiz.map(q => q.signature)].slice(-HISTORY_LIMIT);
    sessionStorage.setItem(historyKey(fingerprint), JSON.stringify(merged));
  } catch {
    // Browsers can disable storage; random generation still gives a fresh quiz.
  }
}

let pdfjs = null;
let mammoth = null;
let JSZip = null;

async function loadPdfJs() {
  if (!pdfjs) {
    pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
  }
  return pdfjs;
}

async function loadMammoth() {
  if (!mammoth) {
    const mod = await import('https://cdn.jsdelivr.net/npm/mammoth@1.12.3/+esm');
    mammoth = mod.default || mod;
  }
  return mammoth;
}

async function loadJSZip() {
  if (!JSZip) {
    const mod = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.2/+esm');
    JSZip = mod.default || mod;
  }
  return JSZip;
}

async function extractPdf(file, onProgress = () => {}) {
  const lib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({ data, disableAutoFetch: true, disableStream: true });
  const pdf = await task.promise;
  const pageLimit = Math.min(pdf.numPages, 160);
  let text = '';

  try {
    for (let pageNo = 1; pageNo <= pageLimit; pageNo++) {
      onProgress(`Reading page ${pageNo} of ${pageLimit}…`);
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent({ disableCombineTextItems: false });
      const line = content.items.map(item => item.str || '').join(' ');
      text += `${line}\n`;
      page.cleanup?.();
      if (text.length >= MAX_TEXT_CHARS) break;
      if (pageNo % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally {
    await pdf.destroy();
  }

  return text.slice(0, MAX_TEXT_CHARS);
}

async function extractDocx(file, onProgress = () => {}) {
  onProgress('Reading Word document…');
  const lib = await loadMammoth();
  const result = await lib.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return cleanText(result.value || '').slice(0, MAX_TEXT_CHARS);
}

function decodeXml(text) {
  return text
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code[0].toLowerCase() === 'x' ? code.slice(1) : code, code[0].toLowerCase() === 'x' ? 16 : 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function extractPptx(file, onProgress = () => {}) {
  const Zip = await loadJSZip();
  const zip = await Zip.loadAsync(await file.arrayBuffer());
  const slides = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  if (!slides.length) throw new Error('This PowerPoint does not contain readable slides.');
  if (slides.length > 150) throw new Error('Please use a presentation with 150 slides or fewer.');

  let text = '';
  for (let i = 0; i < slides.length; i++) {
    onProgress(`Reading slide ${i + 1} of ${slides.length}…`);
    const xml = await zip.file(slides[i]).async('string');
    const paragraphs = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/gi)]
      .map(p => [...p[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
        .map(t => decodeXml(t[1]))
        .join(' ')
        .trim())
      .filter(Boolean);
    text += `${paragraphs.join('. ')}.\n`;
    if (text.length >= MAX_TEXT_CHARS) break;
    if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return text.slice(0, MAX_TEXT_CHARS);
}

async function extractText(file, onProgress) {
  if (/\.pdf$/i.test(file.name)) return extractPdf(file, onProgress);
  if (/\.docx$/i.test(file.name)) return extractDocx(file, onProgress);
  if (/\.pptx$/i.test(file.name)) return extractPptx(file, onProgress);
  throw new Error('Please choose a PDF, DOCX or PPTX file.');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

if (typeof document !== 'undefined') {
  const app = document.querySelector('#app');
  let selectedFile = null;
  let quiz = [];
  let answers = [];
  let currentIndex = 0;
  let selectedIndex = null;
  let isBusy = false;
  let difficulty = 'medium';
  let questionCount = 10;
  let currentFingerprint = '';

  const fileIcon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';

  function setStatus(message = '', kind = 'error') {
    const status = document.querySelector('#status');
    if (!status) return;
    status.innerHTML = message ? `<div class="${kind}">${escapeHtml(message)}</div>` : '';
  }

  function home() {
    selectedFile = null;
    quiz = [];
    answers = [];
    currentIndex = 0;
    selectedIndex = null;
    isBusy = false;

    app.innerHTML = `
      <p class="eyebrow">Notes in. Knowledge out.</p>
      <h1>Turn your notes into<br><em>your next practice session.</em></h1>
      <p class="sub">Upload a document. Take it one question at a time.</p>
      <div class="layout">
        <section class="card">
          <label class="drop" id="drop">
            <span class="docicon">${fileIcon}</span>
            <strong id="fileLabel">Drop your study material here</strong>
            <span class="muted" id="fileHint">or <span class="browse">browse files</span> on your device</span>
            <span class="muted">PDF, DOCX or PPTX · up to 20 MB</span>
            <input id="file" type="file" accept=".pdf,.docx,.pptx" aria-label="Upload a PDF, DOCX or PPTX document">
          </label>

          <div class="settings">
            <label for="count">Number of questions</label>
            <select id="count">
              <option value="10" ${questionCount === 10 ? 'selected' : ''}>10 questions</option>
              <option value="20" ${questionCount === 20 ? 'selected' : ''}>20 questions</option>
              <option value="30" ${questionCount === 30 ? 'selected' : ''}>30 questions</option>
            </select>
          </div>

          <fieldset class="difficulty">
            <legend>Choose your difficulty</legend>
            <div class="mode-grid">
              ${Object.entries(DIFFICULTIES).map(([key, mode]) => `
                <label class="mode-choice">
                  <input type="radio" name="difficulty" value="${key}" ${key === difficulty ? 'checked' : ''}>
                  <span>${mode.label}</span>
                </label>`).join('')}
            </div>
            <p class="muted" id="modeHelp" aria-live="polite">${DIFFICULTIES[difficulty].description}</p>
          </fieldset>

          <button class="primary full" id="generate" disabled>Generate my quiz →</button>
          <div id="status" role="status" aria-live="polite"></div>
          <p class="notice">Creates document-based MCQs from English text. Text-based PDFs, DOCX and PPTX are supported; scanned image-only pages are not.</p>
        </section>

        <aside class="aside">
          <h2>A simple study rhythm</h2>
          <div class="step"><span class="num">01</span><div><strong>Bring your notes</strong><small>Lecture notes, a chapter, or a study guide.</small></div></div>
          <div class="step"><span class="num">02</span><div><strong>Pick your answer</strong><small>Recall, understanding and case-based questions.</small></div></div>
          <div class="step"><span class="num">03</span><div><strong>See how you did</strong><small>Correct, wrong, and a review of your answers.</small></div></div>
          <div class="privacy">No document history. Every quiz starts with a fresh upload, and the file stays in your browser.</div>
        </aside>
      </div>`;

    const input = document.querySelector('#file');
    const drop = document.querySelector('#drop');
    input.addEventListener('change', () => selectFile(input.files?.[0]));

    ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => {
      event.preventDefault();
      drop.classList.add('drag');
    }));
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', event => {
      event.preventDefault();
      drop.classList.remove('drag');
      if (!isBusy) selectFile(event.dataTransfer.files?.[0]);
    });

    document.querySelectorAll('[name=difficulty]').forEach(inputEl => {
      inputEl.addEventListener('change', () => {
        difficulty = inputEl.value;
        document.querySelector('#modeHelp').textContent = DIFFICULTIES[difficulty].description;
      });
    });

    document.querySelector('#generate').addEventListener('click', generate);
  }

  function selectFile(file) {
    selectedFile = null;
    document.querySelector('#generate').disabled = true;
    setStatus('');
    if (!file) return;

    if (!/\.(pdf|docx|pptx)$/i.test(file.name)) {
      setStatus('Please choose a PDF, DOCX or PPTX file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus('This file is too large. Please upload a file smaller than 20 MB.');
      return;
    }

    selectedFile = file;
    document.querySelector('#fileLabel').textContent = file.name;
    document.querySelector('#fileHint').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · Tap to change file`;
    document.querySelector('#generate').disabled = false;
  }

  async function generate() {
    if (!selectedFile || isBusy) return;
    isBusy = true;

    const button = document.querySelector('#generate');
    const count = Number(document.querySelector('#count').value);
    questionCount = count;
    const controls = document.querySelectorAll('#file, #count, [name=difficulty]');
    controls.forEach(el => { el.disabled = true; });
    button.disabled = true;
    button.innerHTML = '<span class="loading"></span>Reading document…';
    setStatus('');

    try {
      const text = await extractText(selectedFile, progress => {
        button.innerHTML = `<span class="loading"></span>${escapeHtml(progress)}`;
      });

      if (cleanText(text).length < 180) {
        throw new Error('I could not find enough readable text. If this is a scanned PDF, use a text-based copy or run OCR first.');
      }

      button.innerHTML = '<span class="loading"></span>Building questions…';
      await new Promise(resolve => setTimeout(resolve, 0));

      const facts = extractFacts(text);
      const required = MIN_FACTS_BY_COUNT[count];
      if (facts.length < required) {
        throw new Error(`I found ${facts.length} reliable topic${facts.length === 1 ? '' : 's'}, but ${count} varied questions need at least ${required}. Use a document with more clear topic–description statements.`);
      }

      currentFingerprint = docFingerprint(selectedFile, text);
      const blocked = readHistory(currentFingerprint);
      quiz = generateQuizFromFacts(facts, count, difficulty, blocked);

      // If the session already used nearly every viable prompt, relax old-history blocking
      // but still retain per-quiz uniqueness. This prevents a dead end after many re-generations.
      if (quiz.length !== count && blocked.size) {
        quiz = generateQuizFromFacts(facts, count, difficulty, new Set());
      }

      if (quiz.length !== count) {
        throw new Error(`This document does not contain enough distinct material to make ${count} non-repeating questions safely. Try a longer document or choose fewer questions.`);
      }

      saveHistory(currentFingerprint, quiz);
      answers = Array(count).fill(null);
      currentIndex = 0;
      selectedIndex = null;
      renderQuestion();
    } catch (error) {
      console.error(error);
      const message = error?.message || 'Something went wrong while reading this file. Please try another document.';
      setStatus(message);
      controls.forEach(el => { el.disabled = false; });
      button.disabled = false;
      button.textContent = 'Generate my quiz →';
      isBusy = false;
    }
  }

  function renderQuestion() {
    isBusy = false;
    const q = quiz[currentIndex];
    selectedIndex = answers[currentIndex]?.selectedIndex ?? null;
    const answered = answers[currentIndex] !== null;
    const godMode = difficulty === 'god';

    app.innerHTML = `
      <section class="quiz">
        <div class="topline">
          <span class="filename" title="${escapeHtml(selectedFile?.name || '')}">${escapeHtml(selectedFile?.name || 'Document')}</span>
          <span>Question ${currentIndex + 1} of ${quiz.length} · ${DIFFICULTIES[difficulty].label}</span>
        </div>
        <div class="progress" aria-label="Quiz progress"><span style="width:${((currentIndex + 1) / quiz.length) * 100}%"></span></div>
        <p class="eyebrow">${DIFFICULTIES[difficulty].label}</p>
        <h2 class="qtitle">${escapeHtml(q.prompt)}</h2>
        ${q.hint ? `<div class="answer-hint">${escapeHtml(q.hint)}</div>` : ''}
        <div class="options" role="group" aria-label="Answer choices">
          ${q.options.map((option, index) => {
            let cls = 'option';
            if (selectedIndex === index) cls += ' selected';
            if (answered && !godMode && index === q.correctIndex) cls += ' correct';
            if (answered && !godMode && selectedIndex === index && index !== q.correctIndex) cls += ' wrong';
            return `<button class="${cls}" data-index="${index}" ${answered ? 'disabled' : ''}><span class="letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></button>`;
          }).join('')}
        </div>
        ${answered && !godMode ? `
          <div class="feedback">
            <strong>${answers[currentIndex].correct ? 'Correct.' : 'Not quite.'}</strong>
            <p>The correct answer is <b>${escapeHtml(q.answer)}</b>.</p>
          </div>` : ''}
        <div class="actions">
          <button class="secondary" id="quit">New document</button>
          <button class="primary" id="next" ${answered ? '' : 'disabled'}>${currentIndex === quiz.length - 1 ? 'See results' : 'Next question →'}</button>
        </div>
      </section>`;

    document.querySelectorAll('.option').forEach(button => {
      button.addEventListener('click', () => chooseAnswer(Number(button.dataset.index)));
    });
    document.querySelector('#next').addEventListener('click', nextQuestion);
    document.querySelector('#quit').addEventListener('click', home);

    document.onkeydown = event => {
      if (/^[1-4]$/.test(event.key) && !answers[currentIndex]) chooseAnswer(Number(event.key) - 1);
      if (event.key === 'Enter' && answers[currentIndex]) nextQuestion();
    };
  }

  function chooseAnswer(index) {
    if (answers[currentIndex] !== null) return;
    const q = quiz[currentIndex];
    answers[currentIndex] = {
      selectedIndex: index,
      selectedText: q.options[index],
      correct: index === q.correctIndex
    };
    renderQuestion();
  }

  function nextQuestion() {
    if (answers[currentIndex] === null) return;
    if (currentIndex < quiz.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      renderResults();
    }
  }

  function renderResults() {
    document.onkeydown = null;
    const correct = answers.filter(a => a?.correct).length;
    const wrong = quiz.length - correct;
    const percentage = Math.round((correct / quiz.length) * 100);
    const message = percentage >= 90 ? 'Excellent recall.' : percentage >= 75 ? 'Strong work.' : percentage >= 55 ? 'Good practice.' : 'Keep going — another round will help.';

    app.innerHTML = `
      <section class="quiz results">
        <div class="badge">✓</div>
        <p class="eyebrow">Quiz complete</p>
        <h1>${message}</h1>
        <p class="sub">You answered ${correct} of ${quiz.length} questions correctly.</p>
        <div class="score">${percentage}%</div>
        <div class="stats">
          <div class="stat"><b>${correct}</b><span>Correct</span></div>
          <div class="stat wrong"><b>${wrong}</b><span>Wrong</span></div>
        </div>
        <div class="actions results-actions">
          <button class="secondary" id="newDoc">New document</button>
          <button class="primary" id="again">Generate another quiz</button>
        </div>
        <details class="review">
          <summary>Review all ${quiz.length} answers</summary>
          ${quiz.map((q, i) => {
            const answer = answers[i];
            return `<div class="review-item">
              <strong>${i + 1}. ${escapeHtml(q.prompt)}</strong>
              <p>Your answer: <b>${escapeHtml(answer?.selectedText || 'No answer')}</b> ${answer?.correct ? '✓' : '✕'}</p>
              ${answer?.correct ? '' : `<p>Correct answer: <b>${escapeHtml(q.answer)}</b></p>`}
              <small>From your document: ${escapeHtml(q.source)}</small>
            </div>`;
          }).join('')}
        </details>
      </section>`;

    document.querySelector('#newDoc').addEventListener('click', home);
    document.querySelector('#again').addEventListener('click', regenerateFromSameFile);
  }

  async function regenerateFromSameFile() {
    if (!selectedFile) return home();
    const file = selectedFile;
    home();
    selectFile(file);
    document.querySelector('#count').value = String(questionCount);
    difficulty = difficulty || 'medium';
    const radio = document.querySelector(`[name=difficulty][value="${difficulty}"]`);
    if (radio) radio.checked = true;
    await generate();
  }

  home();
}
