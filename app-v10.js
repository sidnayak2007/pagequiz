const DIFFICULTIES = {
  easy: { label: 'Easy', description: 'Simple recall questions with clear choices and a small hint.' },
  medium: { label: 'Medium', description: 'Clear understanding questions with short, relevant answer choices.' },
  hard: { label: 'Hard', description: 'Clear questions with closer, more challenging choices.' },
  god: { label: 'God mode', description: 'The closest answer choices and no feedback until the end.' }
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 220000;
const MAX_FACTS = 180;
const HISTORY_LIMIT = 120;
const MIN_FACTS_BY_COUNT = { 10: 6, 20: 8, 30: 10 };

const STOP_WORDS = new Set(`the a an and or but if then than that this these those with from into onto over under about through between during before after their there where which while when what would should could have been being were will shall must also only very more most some such each both they them your our its his her not are was for you all can may does did has had any how who why other same use used using one two first second including include includes example examples following according however therefore of to in on at by as is be it we he she i`.split(/\s+/));
const BAD_START_WORDS = new Set(`of to in on at by for from with without into onto over under about through between during before after as because although while if when where which who whose this that these those they them their there it its he she we you i our your his her and or but however therefore also then than`.split(/\s+/));
const BAD_END_WORDS = new Set(`of to in on at by for from with without into onto over under about through between during before after as and or but the a an`.split(/\s+/));
const RELATION_RE = /^(.{2,88}?)\s+(is defined as|refers to|means|consists of|focuses on|aims to|involves|includes|enables|allows|helps|explains|describes|improves|ensures|creates|determines|establishes|supports|requires|provides|reduces|increases|uses|covers|contains|represents|measures|compares|estimates|encourages|targets|tracks|monitors|evaluates|identifies|connects|delivers|manages|controls|calculates|collects|organizes|analyses|analyzes|predicts|is|are)\s+(.{8,330})$/i;

const TOPIC_TEMPLATES = {
  easy: [
    d => `Which topic matches this description?\n\n${sentenceCase(d)}`,
    d => `Choose the correct term.\n\n${sentenceCase(d)}`,
    d => `What topic is being described?\n\n${sentenceCase(d)}`
  ],
  medium: [
    d => `Which term best matches this description?\n\n${sentenceCase(d)}`,
    d => `Which concept is described below?\n\n${sentenceCase(d)}`,
    d => `What is the correct term for this idea?\n\n${sentenceCase(d)}`,
    d => `Which topic does this statement describe?\n\n${sentenceCase(d)}`,
    d => `Choose the concept that best fits this description.\n\n${sentenceCase(d)}`
  ],
  hard: [
    d => `Which concept best fits this description?\n\n${sentenceCase(d)}`,
    d => `Which term is most accurately described below?\n\n${sentenceCase(d)}`,
    d => `Select the concept that best matches this statement.\n\n${sentenceCase(d)}`
  ],
  god: [
    d => `Which concept is the best match?\n\n${sentenceCase(d)}`,
    d => `Choose the most accurate term for this description.\n\n${sentenceCase(d)}`
  ]
};

function cleanText(value = '') {
  return String(value).replace(/\u00ad/g, '').replace(/\r/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function cleanLine(value = '') {
  return String(value).replace(/^\s*(?:[-•▪◦–—]|\(?\d+[.)]|[A-Za-z][.)])\s*/, '').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}
function normalizeKey(value = '') {
  return String(value).toLowerCase().replace(/[“”‘’'"`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function sentenceCase(value = '') {
  const s = cleanLine(value).replace(/[.;:,]+$/, '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[?!]$/.test(s) ? '' : '.') : s;
}
function truncate(value, limit) {
  const s = cleanLine(value);
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit - 1).replace(/\s+\S*$/, '').trim();
  return `${cut || s.slice(0, limit - 1)}…`;
}
function conciseDescription(value, limit = 112) {
  let s = cleanLine(value).replace(/^(?:is|are)\s+/i, '').replace(/^(?:refers to|means)\s+/i, '').replace(/\s*\([^)]{35,}\)\s*/g, ' ').trim();
  const firstClause = s.split(/\s*;\s*|\s+(?:while|whereas|although|however)\s+/i)[0];
  if (firstClause.length >= 24) s = firstClause;
  return truncate(s, limit).replace(/[,:;-]+$/, '').trim();
}
function splitIntoCandidates(text) {
  const parts = cleanText(text).slice(0, MAX_TEXT_CHARS).split(/(?<=[.!?])\s+|\n+/).map(cleanLine).filter(Boolean);
  const out = [], seen = new Set();
  for (const item of parts) {
    if (item.length < 24 || item.length > 420 || item.split(/\s+/).length < 5) continue;
    const key = normalizeKey(item);
    if (key.length < 16 || seen.has(key)) continue;
    seen.add(key); out.push(item);
    if (out.length >= 800) break;
  }
  return out;
}
function plausibleSubject(subject) {
  const s = cleanLine(subject).replace(/[.:;,-]+$/, '').trim();
  if (!s || s.length < 2 || s.length > 72 || /^[,;:.)\]-]/.test(s) || /[,;:]$/.test(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 9) return false;
  const first = words[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
  const last = words[words.length - 1].toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (BAD_START_WORDS.has(first) || BAD_END_WORDS.has(last)) return false;
  const meaningful = words.filter(w => !STOP_WORDS.has(w.toLowerCase()) && /[a-z0-9]/i.test(w));
  if (!meaningful.length || meaningful.length / words.length < 0.45) return false;
  if (/^(?:there|here|thus|hence|therefore|however)\b/i.test(s)) return false;
  return true;
}
function deriveFact(sentence) {
  const cleaned = cleanLine(sentence).replace(/[.!?]+$/, '');
  const colon = cleaned.match(/^(.{2,70}?)\s*[:–—]\s+(.{10,300})$/);
  if (colon && plausibleSubject(colon[1])) return { subject: cleanLine(colon[1]), description: conciseDescription(colon[2], 145) };
  const relation = cleaned.match(RELATION_RE);
  if (!relation || !plausibleSubject(relation[1])) return null;
  const subject = cleanLine(relation[1]), verb = relation[2].toLowerCase(), object = cleanLine(relation[3]);
  if (!object || object.split(/\s+/).length < 3) return null;
  const description = /^(?:is|are|means|refers to|is defined as)$/.test(verb) ? conciseDescription(object, 145) : conciseDescription(`${verb} ${object}`, 145);
  return { subject, description };
}
export function extractFacts(text) {
  const facts = [], subjectSeen = new Set(), descSeen = new Set();
  for (const source of splitIntoCandidates(text)) {
    const pair = deriveFact(source);
    if (!pair) continue;
    const subject = truncate(pair.subject, 72), description = conciseDescription(pair.description, 145);
    const subjectKey = normalizeKey(subject), descKey = normalizeKey(description);
    if (!subjectKey || !descKey || subjectKey === descKey || description.split(/\s+/).length < 3) continue;
    if (subjectSeen.has(subjectKey) || descSeen.has(descKey)) continue;
    if (descKey.startsWith(subjectKey + ' ') && subjectKey.split(' ').length > 1) continue;
    subjectSeen.add(subjectKey); descSeen.add(descKey); facts.push({ subject, description, source });
    if (facts.length >= MAX_FACTS) break;
  }
  return facts;
}

function randomInt(max) { return Math.floor(Math.random() * max); }
function shuffled(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function tokenSet(value) { return new Set(normalizeKey(value).split(/\s+/).filter(w => w && !STOP_WORDS.has(w))); }
function jaccard(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let overlap = 0; for (const t of A) if (B.has(t)) overlap++;
  return overlap / (A.size + B.size - overlap);
}
function subjectShapeGap(a, b) { return Math.abs(a.subject.split(/\s+/).length - b.subject.split(/\s+/).length) + Math.abs(a.subject.length - b.subject.length) / 24; }
function chooseDistractors(facts, correct, difficulty, amount = 3) {
  const scored = facts.filter(f => f !== correct && normalizeKey(f.subject) !== normalizeKey(correct.subject)).map(f => {
    const conceptSim = jaccard(correct.subject, f.subject), descSim = jaccard(correct.description, f.description), shape = subjectShapeGap(correct, f);
    let score;
    if (difficulty === 'easy') score = descSim * 4 + conceptSim * 2 + shape * 0.25;
    else if (difficulty === 'medium') score = shape * 1.7 - conceptSim * 0.5 + (descSim > 0.55 ? 9 : descSim * 0.5);
    else if (difficulty === 'hard') score = -(descSim * 3 + conceptSim) + shape * 0.35 + (descSim > 0.72 ? 7 : 0);
    else score = -(descSim * 4 + conceptSim * 1.2) + shape * 0.3 + (descSim > 0.82 ? 10 : 0);
    return { fact: f, score };
  }).sort((a, b) => a.score - b.score);
  const bandSize = difficulty === 'medium' ? 16 : difficulty === 'easy' ? 12 : 10;
  return shuffled(scored.slice(0, Math.min(bandSize, scored.length))).slice(0, amount).map(x => x.fact);
}
function insertAt(items, item, index) { const result = [...items]; result.splice(index, 0, item); return result; }
function optionSignature(options) { return options.map(normalizeKey).sort().join('||'); }
function questionSignature(prompt, answer) { return `${normalizeKey(prompt)}::${normalizeKey(answer)}`; }

function buildTopicQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const distractorFacts = chooseDistractors(facts, fact, difficulty, 3);
    if (distractorFacts.length < 3) continue;
    const clueLimit = difficulty === 'medium' ? 105 : difficulty === 'easy' ? 115 : 125;
    const clue = conciseDescription(fact.description, clueLimit);
    if (clue.length < 18) continue;
    const templates = TOPIC_TEMPLATES[difficulty], prompt = templates[randomInt(templates.length)](clue), answer = fact.subject;
    const distractors = distractorFacts.map(f => f.subject);
    if (new Set([answer, ...distractors].map(normalizeKey)).size !== 4) continue;
    const correctIndex = (index + randomInt(4)) % 4, options = insertAt(distractors, answer, correctIndex), optSig = optionSignature(options), qSig = questionSignature(prompt, answer), promptSig = normalizeKey(prompt);
    if (usedOptionSets.has(optSig) || blocked.has(qSig) || usedPrompts.has(promptSig)) continue;
    return { prompt, answer, answerTopic: fact.subject, options, correctIndex, source: fact.source, difficulty, hint: difficulty === 'easy' ? `Hint: the answer starts with “${answer.charAt(0).toUpperCase()}”.` : null, signature: qSig, optionSignature: optSig };
  }
  return null;
}
function buildDefinitionQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const distractorFacts = chooseDistractors(facts, fact, difficulty, 3);
    if (distractorFacts.length < 3) continue;
    const prompt = `Which statement about “${fact.subject}” is correct?`, answer = conciseDescription(fact.description, 108), distractors = distractorFacts.map(f => conciseDescription(f.description, 108));
    if (new Set([answer, ...distractors].map(normalizeKey)).size !== 4) continue;
    const correctIndex = (index + randomInt(4)) % 4, options = insertAt(distractors, answer, correctIndex), lengths = options.map(x => x.length);
    if (Math.max(...lengths) - Math.min(...lengths) > 72) continue;
    const optSig = optionSignature(options), qSig = questionSignature(prompt, answer), promptSig = normalizeKey(prompt);
    if (usedOptionSets.has(optSig) || blocked.has(qSig) || usedPrompts.has(promptSig)) continue;
    return { prompt, answer, answerTopic: fact.subject, options, correctIndex, source: fact.source, difficulty, hint: null, signature: qSig, optionSignature: optSig };
  }
  return null;
}
function makeQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts) {
  if (difficulty === 'medium') return buildTopicQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts);
  if (difficulty === 'easy') return Math.random() < 0.88 ? buildTopicQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts) : buildDefinitionQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts);
  if (difficulty === 'hard') return Math.random() < 0.72 ? buildTopicQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts) : buildDefinitionQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts);
  return Math.random() < 0.55 ? buildTopicQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts) : buildDefinitionQuestion(facts, fact, difficulty, index, usedOptionSets, blocked, usedPrompts);
}
export function generateQuizFromFacts(facts, count = 10, difficulty = 'medium', blockedSignatures = new Set()) {
  if (![10, 20, 30].includes(count)) return [];
  if (!DIFFICULTIES[difficulty]) difficulty = 'medium';
  if (!Array.isArray(facts) || facts.length < MIN_FACTS_BY_COUNT[count]) return [];
  const pool = shuffled(facts.slice(0, MAX_FACTS)), usedOptionSets = new Set(), blocked = new Set(blockedSignatures), usedPrompts = new Set(), quiz = [];
  let index = 0;
  for (let pass = 0; pass < 18 && quiz.length < count; pass++) {
    for (const fact of shuffled(pool)) {
      const q = makeQuestion(pool, fact, difficulty, index++, usedOptionSets, blocked, usedPrompts);
      if (!q) continue;
      quiz.push(q); usedOptionSets.add(q.optionSignature); blocked.add(q.signature); usedPrompts.add(normalizeKey(q.prompt));
      if (quiz.length === count) break;
    }
  }
  return quiz.length === count ? quiz : [];
}

function hashString(input) { let h = 0x811c9dc5; for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
function docFingerprint(file, text) { const sample = `${text.slice(0, 7000)}|${text.slice(-7000)}`; return `${hashString(sample)}-${file.size}-${hashString(file.name.toLowerCase())}`; }
function historyKey(fingerprint) { return `pagequiz-history-v4:${fingerprint}`; }
function readHistory(fingerprint) { try { const raw = JSON.parse(sessionStorage.getItem(historyKey(fingerprint)) || '[]'); return new Set(Array.isArray(raw) ? raw.slice(-HISTORY_LIMIT) : []); } catch { return new Set(); } }
function saveHistory(fingerprint, quiz) { try { const merged = [...readHistory(fingerprint), ...quiz.map(q => q.signature)].slice(-HISTORY_LIMIT); sessionStorage.setItem(historyKey(fingerprint), JSON.stringify(merged)); } catch {} }

let pdfjs = null, mammoth = null, JSZip = null;
async function loadPdfJs() { if (!pdfjs) { pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs'; } return pdfjs; }
async function loadMammoth() { if (!mammoth) { const mod = await import('https://cdn.jsdelivr.net/npm/mammoth@1.12.3/+esm'); mammoth = mod.default || mod; } return mammoth; }
async function loadJSZip() { if (!JSZip) { const mod = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.2/+esm'); JSZip = mod.default || mod; } return JSZip; }
function pdfItemsToText(items) {
  let out = '', lastY = null;
  for (const item of items) {
    const str = item.str || ''; if (!str) continue;
    const y = item.transform?.[5];
    if (lastY !== null && Number.isFinite(y) && Math.abs(y - lastY) > 2.5) out += '\n';
    else if (out && !out.endsWith('\n')) out += ' ';
    out += str; if (Number.isFinite(y)) lastY = y;
  }
  return out;
}
async function extractPdf(file, onProgress = () => {}) {
  const lib = await loadPdfJs(), data = new Uint8Array(await file.arrayBuffer()), task = lib.getDocument({ data, disableAutoFetch: true, disableStream: true }), pdf = await task.promise;
  const pageLimit = Math.min(pdf.numPages, 160); let text = '';
  try {
    for (let pageNo = 1; pageNo <= pageLimit; pageNo++) {
      onProgress(`Reading page ${pageNo} of ${pageLimit}…`);
      const page = await pdf.getPage(pageNo), content = await page.getTextContent({ disableCombineTextItems: false });
      text += pdfItemsToText(content.items) + '\n'; page.cleanup?.();
      if (text.length >= MAX_TEXT_CHARS) break;
      if (pageNo % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally { try { pdf.cleanup?.(); } catch {} try { await task.destroy?.(); } catch {} }
  return text.slice(0, MAX_TEXT_CHARS);
}
async function extractDocx(file, onProgress = () => {}) { onProgress('Reading Word document…'); const lib = await loadMammoth(), result = await lib.extractRawText({ arrayBuffer: await file.arrayBuffer() }); return cleanText(result.value || '').slice(0, MAX_TEXT_CHARS); }
function decodeXml(text) { return text.replace(/&#(x?[0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code[0].toLowerCase() === 'x' ? code.slice(1) : code, code[0].toLowerCase() === 'x' ? 16 : 10))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
async function extractPptx(file, onProgress = () => {}) {
  const Zip = await loadJSZip(), zip = await Zip.loadAsync(await file.arrayBuffer()), slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!slides.length) throw new Error('This PowerPoint does not contain readable slides.');
  if (slides.length > 150) throw new Error('Please use a presentation with 150 slides or fewer.');
  let text = '';
  for (let i = 0; i < slides.length; i++) {
    onProgress(`Reading slide ${i + 1} of ${slides.length}…`);
    const xml = await zip.file(slides[i]).async('string'), paragraphs = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/gi)].map(p => [...p[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)].map(t => decodeXml(t[1])).join(' ').trim()).filter(Boolean);
    text += paragraphs.join('. ') + '.\n'; if (text.length >= MAX_TEXT_CHARS) break;
  }
  return text.slice(0, MAX_TEXT_CHARS);
}
async function extractText(file, onProgress) { if (/\.pdf$/i.test(file.name)) return extractPdf(file, onProgress); if (/\.docx$/i.test(file.name)) return extractDocx(file, onProgress); if (/\.pptx$/i.test(file.name)) return extractPptx(file, onProgress); throw new Error('Please choose a PDF, DOCX or PPTX file.'); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }

if (typeof document !== 'undefined') {
  const app = document.querySelector('#app');
  let selectedFile = null, quiz = [], answers = [], currentIndex = 0, selectedIndex = null, isBusy = false, difficulty = 'medium', questionCount = 10, currentFingerprint = '';
  const fileIcon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';
  function setStatus(message = '') { const status = document.querySelector('#status'); if (status) status.innerHTML = message ? `<div class="error">${escapeHtml(message)}</div>` : ''; }
  function home() {
    selectedFile = null; quiz = []; answers = []; currentIndex = 0; selectedIndex = null; isBusy = false;
    app.innerHTML = `<p class="eyebrow">Notes in. Knowledge out.</p><h1>Turn your notes into<br><em>your next practice session.</em></h1><p class="sub">Upload a document. Take it one question at a time.</p><div class="layout"><section class="card"><label class="drop" id="drop"><span class="docicon">${fileIcon}</span><strong id="fileLabel">Drop your study material here</strong><span class="muted" id="fileHint">or <span class="browse">browse files</span> on your device</span><span class="muted">PDF, DOCX or PPTX · up to 20 MB</span><input id="file" type="file" accept=".pdf,.docx,.pptx" aria-label="Upload a PDF, DOCX or PPTX document"></label><div class="settings"><label for="count">Number of questions</label><select id="count"><option value="10" ${questionCount === 10 ? 'selected' : ''}>10 questions</option><option value="20" ${questionCount === 20 ? 'selected' : ''}>20 questions</option><option value="30" ${questionCount === 30 ? 'selected' : ''}>30 questions</option></select></div><fieldset class="difficulty"><legend>Choose your difficulty</legend><div class="mode-grid">${Object.entries(DIFFICULTIES).map(([key, mode]) => `<label class="mode-choice"><input type="radio" name="difficulty" value="${key}" ${key === difficulty ? 'checked' : ''}><span>${mode.label}</span></label>`).join('')}</div><p class="muted" id="modeHelp">${DIFFICULTIES[difficulty].description}</p></fieldset><button class="primary full" id="generate" disabled>Generate my quiz →</button><div id="status" role="status" aria-live="polite"></div><p class="notice">Creates document-based MCQs from English text. Text-based PDFs, DOCX and PPTX are supported; scanned image-only pages are not.</p></section><aside class="aside"><h2>A simple study rhythm</h2><div class="step"><span class="num">01</span><div><strong>Bring your notes</strong><small>Lecture notes, a chapter, or a study guide.</small></div></div><div class="step"><span class="num">02</span><div><strong>Pick your answer</strong><small>Clear questions with comparable choices.</small></div></div><div class="step"><span class="num">03</span><div><strong>See how you did</strong><small>Correct, wrong, and a review of your answers.</small></div></div><div class="privacy">No document history. Your file stays in your browser.</div></aside></div>`;
    const input = document.querySelector('#file'), drop = document.querySelector('#drop');
    input.onchange = () => selectFile(input.files?.[0]);
    ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('drag'); }));
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); if (!isBusy) selectFile(e.dataTransfer.files?.[0]); };
    document.querySelectorAll('[name=difficulty]').forEach(el => el.onchange = () => { difficulty = el.value; document.querySelector('#modeHelp').textContent = DIFFICULTIES[difficulty].description; });
    document.querySelector('#generate').onclick = generate;
  }
  function selectFile(file) {
    selectedFile = null; document.querySelector('#generate').disabled = true; setStatus(''); if (!file) return;
    if (!/\.(pdf|docx|pptx)$/i.test(file.name)) return setStatus('Please choose a PDF, DOCX or PPTX file.');
    if (file.size > MAX_FILE_BYTES) return setStatus('This file is too large. Please upload a file smaller than 20 MB.');
    selectedFile = file; document.querySelector('#fileLabel').textContent = file.name; document.querySelector('#fileHint').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · Tap to change file`; document.querySelector('#generate').disabled = false;
  }
  async function generate() {
    if (!selectedFile || isBusy) return; isBusy = true;
    const button = document.querySelector('#generate'); questionCount = Number(document.querySelector('#count').value); const controls = document.querySelectorAll('#file, #count, [name=difficulty]'); controls.forEach(el => el.disabled = true); button.disabled = true; button.innerHTML = '<span class="loading"></span>Reading document…'; setStatus('');
    try {
      const text = await extractText(selectedFile, progress => button.innerHTML = `<span class="loading"></span>${escapeHtml(progress)}`);
      if (cleanText(text).length < 180) throw new Error('I could not find enough readable text. If this is a scanned PDF, use a text-based copy or run OCR first.');
      button.innerHTML = '<span class="loading"></span>Building clear questions…'; await new Promise(resolve => setTimeout(resolve, 0));
      const facts = extractFacts(text), required = MIN_FACTS_BY_COUNT[questionCount];
      if (facts.length < required) throw new Error(`I found ${facts.length} clear topics, but ${questionCount} varied questions need at least ${required}. Try a longer document or fewer questions.`);
      currentFingerprint = docFingerprint(selectedFile, text); const blocked = readHistory(currentFingerprint); quiz = generateQuizFromFacts(facts, questionCount, difficulty, blocked);
      if (quiz.length !== questionCount && blocked.size) quiz = generateQuizFromFacts(facts, questionCount, difficulty, new Set());
      if (quiz.length !== questionCount) throw new Error(`I could not make ${questionCount} clear, non-repeating questions from this file. Try fewer questions or a document with more clearly defined topics.`);
      saveHistory(currentFingerprint, quiz); answers = Array(questionCount).fill(null); currentIndex = 0; selectedIndex = null; renderQuestion();
    } catch (error) { console.error(error); setStatus(error?.message || 'Something went wrong while reading this file.'); controls.forEach(el => el.disabled = false); button.disabled = false; button.textContent = 'Generate my quiz →'; isBusy = false; }
  }
  function renderQuestion() {
    isBusy = false; const q = quiz[currentIndex]; selectedIndex = answers[currentIndex]?.selectedIndex ?? null; const answered = answers[currentIndex] !== null, godMode = difficulty === 'god';
    app.innerHTML = `<section class="quiz"><div class="topline"><span class="filename">${escapeHtml(selectedFile?.name || 'Document')}</span><span>Question ${currentIndex + 1} of ${quiz.length} · ${DIFFICULTIES[difficulty].label}</span></div><div class="progress"><span style="width:${((currentIndex + 1) / quiz.length) * 100}%"></span></div><p class="eyebrow">${DIFFICULTIES[difficulty].label}</p><h2 class="qtitle">${escapeHtml(q.prompt)}</h2>${q.hint ? `<div class="answer-hint">${escapeHtml(q.hint)}</div>` : ''}<div class="options">${q.options.map((option, i) => { let cls = 'option'; if (selectedIndex === i) cls += ' selected'; if (answered && !godMode && i === q.correctIndex) cls += ' correct'; if (answered && !godMode && selectedIndex === i && i !== q.correctIndex) cls += ' wrong'; return `<button class="${cls}" data-index="${i}" ${answered ? 'disabled' : ''}><span class="letter">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(option)}</span></button>`; }).join('')}</div>${answered && !godMode ? `<div class="feedback"><strong>${answers[currentIndex].correct ? 'Correct.' : 'Not quite.'}</strong><p>The correct answer is <b>${escapeHtml(q.answer)}</b>.</p></div>` : ''}<div class="actions"><button class="secondary" id="quit">New document</button><button class="primary" id="next" ${answered ? '' : 'disabled'}>${currentIndex === quiz.length - 1 ? 'See results' : 'Next question →'}</button></div></section>`;
    document.querySelectorAll('.option').forEach(btn => btn.onclick = () => chooseAnswer(Number(btn.dataset.index))); document.querySelector('#next').onclick = nextQuestion; document.querySelector('#quit').onclick = home;
  }
  function chooseAnswer(index) { if (answers[currentIndex] !== null) return; const q = quiz[currentIndex]; answers[currentIndex] = { selectedIndex: index, selectedText: q.options[index], correct: index === q.correctIndex }; renderQuestion(); }
  function nextQuestion() { if (answers[currentIndex] === null) return; if (currentIndex < quiz.length - 1) { currentIndex++; renderQuestion(); } else renderResults(); }
  function renderResults() {
    const correct = answers.filter(a => a?.correct).length, wrong = quiz.length - correct, percentage = Math.round(correct / quiz.length * 100), message = percentage >= 90 ? 'Excellent recall.' : percentage >= 75 ? 'Strong work.' : percentage >= 55 ? 'Good practice.' : 'Keep going — another round will help.';
    app.innerHTML = `<section class="quiz results"><div class="badge">✓</div><p class="eyebrow">Quiz complete</p><h1>${message}</h1><p class="sub">You answered ${correct} of ${quiz.length} questions correctly.</p><div class="score">${percentage}%</div><div class="stats"><div class="stat"><b>${correct}</b><span>Correct</span></div><div class="stat wrong"><b>${wrong}</b><span>Wrong</span></div></div><div class="actions results-actions"><button class="secondary" id="newDoc">New document</button><button class="primary" id="again">Generate another quiz</button></div><details class="review"><summary>Review all ${quiz.length} answers</summary>${quiz.map((q, i) => `<div class="review-item"><strong>${i + 1}. ${escapeHtml(q.prompt)}</strong><p>Your answer: <b>${escapeHtml(answers[i]?.selectedText || 'No answer')}</b> ${answers[i]?.correct ? '✓' : '✕'}</p>${answers[i]?.correct ? '' : `<p>Correct answer: <b>${escapeHtml(q.answer)}</b></p>`}<small>From your document: ${escapeHtml(q.source)}</small></div>`).join('')}</details></section>`;
    document.querySelector('#newDoc').onclick = home; document.querySelector('#again').onclick = regenerate;
  }
  async function regenerate() {
    if (!selectedFile) return home(); const file = selectedFile, oldDifficulty = difficulty, oldCount = questionCount; home(); selectFile(file); difficulty = oldDifficulty; questionCount = oldCount; document.querySelector('#count').value = String(oldCount); const radio = document.querySelector(`[name=difficulty][value="${oldDifficulty}"]`); if (radio) radio.checked = true; document.querySelector('#modeHelp').textContent = DIFFICULTIES[oldDifficulty].description; await generate();
  }
  home();
}
