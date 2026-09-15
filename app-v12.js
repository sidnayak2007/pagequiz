const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    description: 'Direct recall questions using complete, clear ideas from your notes.'
  },
  medium: {
    label: 'Medium',
    description: 'Understanding questions built from complete ideas, with concise related options.'
  },
  hard: {
    label: 'Hard',
    description: 'Application-style questions that combine related points from the same topic.'
  },
  god: {
    label: 'God mode',
    description: 'Multi-clue inference questions with the closest valid distractors. Answers appear only at the end.'
  }
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 260_000;
const MAX_FACTS = 320;
const MAX_DESCRIPTION_CHARS = 420;
const HISTORY_LIMIT = 160;
const VALID_COUNTS = new Set([10, 20, 30]);
const MIN_FACTS_BY_COUNT = { 10: 6, 20: 8, 30: 10 };

const STOP_WORDS = new Set(`the a an and or but if then than that this these those with from into onto over under about through between during before after their there where which while when what would should could have been being were will shall must also only very more most some such each both they them your our its his her not are was for you all can may does did has had any how who why other same use used using one two first second including include includes example examples following according however therefore of to in on at by as is be it we he she they our your`.split(/\s+/));

const BAD_TOPIC_START = /^(?:a|an|the|of|to|in|on|at|by|for|from|with|without|into|onto|over|under|through|during|before|after|between|and|or|but|if|then|than|that|this|these|those|they|them|it|its|he|she|we|you|there|here|however|therefore|also|because|although|while|when|where|which|who|what|why|how|as|is|are|was|were|be|been|being|has|have|had|do|does|did|will|would|can|could|should|may|might|must)\b/i;
const BAD_TOPIC_END = /\b(?:a|an|the|of|to|in|on|at|by|for|from|with|without|into|onto|over|under|through|during|before|after|between|and|or|but|if|than|that|this|these|those|is|are|was|were|has|have|had|can|could|should|would|will|may|might|must|typically|mainly|often|usually|generally|primarily|basically|commonly|also)\s*$/i;
const CLAUSE_VERB_RE = /\b(?:is|are|was|were|has|have|had|does|do|did|can|could|should|would|will|may|might|must|needs|need|wants|want|includes|include|provides|provide|uses|use|helps|help|focuses|focus|requires|require|allows|allow|enables|enable|creates|create|reduces|reduce|increases|increase|improves|improve|ensures|ensure|means|refers)\b/i;
const RELATION_RE = /^(.{2,75}?)\s+(?:is defined as|refers to|means|is|are)\s+(.{12,380})$/i;
const ACTION_RELATION_RE = /^(.{2,75}?)\s+(?:includes|involves|focuses on|aims to|helps|supports|provides|requires|enables|allows|improves|reduces|increases|covers|contains|represents|measures|tracks|monitors|evaluates|identifies|connects|manages|controls)\s+(.{12,380})$/i;
const GENERIC_HEADINGS = new Set(['definition', 'example', 'examples', 'objectives', 'advantages', 'process', 'introduction', 'overview', 'summary']);

const QUESTION_STARTERS = {
  easy: [
    'Which term from your notes is described by the statement below?',
    'Which topic does this complete statement describe?',
    'Identify the correct concept from your notes.',
    'Which concept matches the explanation below?'
  ],
  medium: [
    'Which concept best explains the complete idea below?',
    'Which topic from your notes is being described?',
    'Based on the information below, which concept is correct?',
    'Which concept is most directly associated with these points?'
  ],
  hard: [
    'A situation has the characteristics described below. Which concept should be applied?',
    'Which topic best fits this practical situation?',
    'Which concept is most appropriate for the situation described below?',
    'Identify the concept that best explains this situation.'
  ],
  god: [
    'Use all of the clues below. Which concept is the most precise answer?',
    'Which concept is supported by the complete set of clues below?',
    'Considering all the information below, which answer is most accurate?',
    'Which closely related concept is uniquely identified by these clues?'
  ]
};

function cleanText(value = '') {
  return String(value)
    .replace(/\u00ad/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanLine(value = '') {
  return String(value)
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function stripBullet(value = '') {
  return cleanLine(value)
    .replace(/^\s*(?:[•▪▫◦●○■□◆◇►▸‣]|[-–—])\s*/, '')
    .replace(/^\s*\(?\d{1,2}\)?[.)]\s*/, '')
    .trim();
}

function stripNumbering(value = '') {
  return cleanLine(value).replace(/^\s*\(?\d{1,2}\)?[.)]\s*/, '').trim();
}

function normalizeKey(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[“”‘’'"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cap(value = '') {
  const s = String(value).trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function isBoilerplate(line) {
  const s = cleanLine(line);
  return !s ||
    /^department of commerce\b/i.test(s) ||
    /\bMAHE\b.*\bManipal\b.*\bEmail:/i.test(s) ||
    /^https?:\/\//i.test(s) ||
    /^www\./i.test(s) ||
    /^\d{1,3}$/.test(s) ||
    /^unit\s+\d+$/i.test(s);
}

function topicWords(value) {
  return stripNumbering(String(value).replace(/[:;]+$/, ''))
    .split(/\s+/)
    .filter(Boolean);
}

function isTopicLabel(value) {
  const s = stripNumbering(stripBullet(value)).replace(/[:;]+$/, '').trim();
  if (!s || s.length < 2 || s.length > 64) return false;

  const words = topicWords(s);
  if (!words.length || words.length > 10) return false;
  if (BAD_TOPIC_START.test(s) || BAD_TOPIC_END.test(s)) return false;
  if (/[,!?;:]/.test(s) || /^\([^()]+\)$/.test(s)) return false;
  if (/^[a-z]/.test(s) && words.length > 3) return false;
  if (CLAUSE_VERB_RE.test(s) && words.length > 3) return false;
  if (/\b(?:stage|step)\b/i.test(s) && /^(?:the|in|this|here)\b/i.test(s)) return false;
  if (/\b(?:product|products|service|services|goods|materials)\s*$/i.test(s) && words.length > 5) return false;

  return words.some(word => /[A-Za-z]{2}/.test(word) && !STOP_WORDS.has(word.toLowerCase()));
}

function titleCaseRatio(value) {
  const words = topicWords(value).filter(word => /[A-Za-z]/.test(word));
  if (!words.length) return 0;
  const titled = words.filter(word => /^[A-Z][A-Za-z0-9&()/-]*$/.test(word) || /^[A-Z]{2,}$/.test(word));
  return titled.length / words.length;
}

function cleanTopic(value) {
  return stripNumbering(stripBullet(value)).replace(/[:;]+$/, '').trim();
}

function looksLikeHeading(raw) {
  const original = cleanLine(raw);
  if (!original || isBoilerplate(original)) return false;

  const numbered = /^\s*\d{1,2}[.)]\s+/.test(original);
  const colon = /:\s*$/.test(original);
  const topic = cleanTopic(original);

  if (!isTopicLabel(topic)) return false;
  if (numbered || colon) return true;
  if (/[.!?]$/.test(original)) return false;
  if (topicWords(topic).length <= 7 && titleCaseRatio(topic) >= 0.5) return true;
  return /^[A-Z0-9 &()\-/]+$/.test(topic) && topic.length <= 64;
}

function isBulletLine(value) {
  return /^\s*(?:[•▪▫◦●○■□◆◇►▸‣]|[-–—])\s*/.test(String(value));
}

function makeBlocks(lines) {
  const blocks = [];
  let current = null;

  function flush() {
    if (current?.text) blocks.push(current);
    current = null;
  }

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line || isBoilerplate(line)) continue;

    if (looksLikeHeading(line)) {
      flush();
      blocks.push({ type: 'heading', text: cleanTopic(line), raw: line });
      continue;
    }

    if (isBulletLine(line)) {
      flush();
      current = { type: 'bullet', text: stripBullet(line), raw: line };
      continue;
    }

    if (/^\s*\d{1,2}[.)]\s+/.test(line)) {
      flush();
      current = { type: 'bullet', text: stripNumbering(line), raw: line };
      continue;
    }

    if (current && current.type !== 'heading') {
      current.text = cleanLine(`${current.text} ${line}`);
      current.raw = cleanLine(`${current.raw} ${line}`);
    } else {
      flush();
      current = { type: 'paragraph', text: line, raw: line };
    }
  }

  flush();
  return blocks;
}

function splitLabelDescription(text) {
  const s = cleanLine(text);
  const match = s.match(/^(.{2,70}?)\s*[:–—-]\s+(.{8,700})$/);
  if (!match) return null;

  const subject = cleanTopic(match[1]);
  const description = cleanLine(match[2]);
  if (!isTopicLabel(subject) || description.split(/\s+/).length < 3) return null;
  return { subject, description };
}

function deriveRelation(text) {
  const s = cleanLine(text).replace(/[.!?]+$/, '');
  const match = s.match(RELATION_RE) || s.match(ACTION_RELATION_RE);
  if (!match) return null;

  let subject = cleanTopic(match[1]);
  subject = subject.replace(/\s+(?:typically|mainly|often|usually|generally|primarily|basically|commonly|also)$/i, '').trim();
  const description = cleanLine(match[2]);

  if (!isTopicLabel(subject) || description.split(/\s+/).length < 3) return null;
  return { subject, description };
}

function sentenceAwareLimit(value, maxChars = MAX_DESCRIPTION_CHARS) {
  const s = cleanLine(value);
  if (s.length <= maxChars) return s;

  const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  let result = '';
  for (const sentence of sentences) {
    const candidate = result ? `${result} ${sentence}` : sentence;
    if (candidate.length > maxChars) break;
    result = candidate;
  }

  if (result.length >= 45) return result;

  const cut = s.slice(0, maxChars);
  const lastSafe = Math.max(cut.lastIndexOf(','), cut.lastIndexOf(';'));
  if (lastSafe > 80) return `${cut.slice(0, lastSafe).trim()}.`;
  return `${cut.replace(/\s+\S*$/, '').trim()}.`;
}

function looksLikeTitleFragment(value) {
  const s = cleanLine(value);
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 12 && !/[.!?]/.test(s) && titleCaseRatio(s) >= 0.65;
}

function addFact(target, seen, fact) {
  const subject = cleanTopic(fact.subject);
  const description = sentenceAwareLimit(fact.description, MAX_DESCRIPTION_CHARS).trim();
  const group = cleanTopic(fact.group || '');

  if (!isTopicLabel(subject)) return;
  if (!description || description.length < 35 || description.split(/\s+/).length < 6 || isBoilerplate(description)) return;
  if (looksLikeTitleFragment(description)) return;
  if (/[•▪▫◦●○■□◆◇►▸‣]/.test(description)) return;
  if (/[,;:]\.?$/.test(description)) return;

  const subjectKey = normalizeKey(subject);
  const descriptionKey = normalizeKey(description);
  if (!subjectKey || !descriptionKey || subjectKey === descriptionKey) return;
  if (BAD_TOPIC_START.test(subject) || BAD_TOPIC_END.test(subject)) return;

  const key = `${subjectKey}::${descriptionKey}`;
  if (seen.has(key)) return;
  seen.add(key);

  target.push({
    subject,
    description,
    group: isTopicLabel(group) ? group : '',
    source: cleanLine(fact.source || fact.description),
    kind: fact.kind || 'document'
  });
}

function extractFactsFromPage(pageText, facts, seen) {
  const lines = String(pageText).split(/\n+/).map(cleanLine).filter(Boolean);
  const blocks = makeBlocks(lines);
  if (!blocks.length) return;

  const headings = blocks.filter(block => block.type === 'heading');
  let pageGroup = '';

  for (const heading of headings) {
    const key = normalizeKey(heading.text);
    if (!GENERIC_HEADINGS.has(key) && isTopicLabel(heading.text)) {
      pageGroup = heading.text;
      break;
    }
  }

  let currentTopic = pageGroup;
  let hasSubtopic = false;

  for (const block of blocks) {
    if (block.type === 'heading') {
      const heading = cleanTopic(block.text);
      if (!pageGroup) pageGroup = heading;

      if (normalizeKey(heading) === normalizeKey(pageGroup) && !hasSubtopic) {
        currentTopic = pageGroup;
      } else if (isTopicLabel(heading) && !GENERIC_HEADINGS.has(normalizeKey(heading))) {
        currentTopic = heading;
        hasSubtopic = true;
      }
      continue;
    }

    const labelPair = splitLabelDescription(block.text);
    if (labelPair) {
      addFact(facts, seen, {
        ...labelPair,
        group: pageGroup,
        source: block.text,
        kind: 'label'
      });
      continue;
    }

    if (!hasSubtopic) {
      const relation = deriveRelation(block.text);
      if (relation) {
        addFact(facts, seen, {
          ...relation,
          group: pageGroup,
          source: block.text,
          kind: 'definition'
        });
      }
    }

    if (currentTopic && isTopicLabel(currentTopic)) {
      const description = cleanLine(block.text);
      if (description.length >= 24 && description.split(/\s+/).length >= 5) {
        addFact(facts, seen, {
          subject: currentTopic,
          description,
          group: pageGroup,
          source: block.text,
          kind: hasSubtopic ? 'section' : 'page-topic'
        });
      }
    }
  }
}

export function extractFacts(text) {
  const cleaned = cleanText(text).slice(0, MAX_TEXT_CHARS);
  const facts = [];
  const seen = new Set();

  for (const page of cleaned.split(/\f+/)) {
    extractFactsFromPage(page, facts, seen);
    if (facts.length >= MAX_FACTS) break;
  }

  if (facts.length < 8) {
    for (const sentence of cleaned
      .split(/(?<=[.!?])\s+|\n+/)
      .map(cleanLine)
      .filter(s => s.length >= 28 && s.length <= 420 && !isBoilerplate(s))) {
      const pair = splitLabelDescription(sentence) || deriveRelation(sentence);
      if (pair) addFact(facts, seen, { ...pair, source: sentence, kind: 'fallback' });
      if (facts.length >= MAX_FACTS) break;
    }
  }

  return facts.slice(0, MAX_FACTS);
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
  return new Set(
    normalizeKey(value)
      .split(/\s+/)
      .filter(word => word && !STOP_WORDS.has(word))
  );
}

function lexicalSimilarity(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;

  let overlap = 0;
  for (const token of A) if (B.has(token)) overlap++;
  return overlap / (A.size + B.size - overlap);
}

function subjectSimilarity(a, b) {
  return lexicalSimilarity(a, b) * 4 + 1 / (1 + Math.abs(topicWords(a).length - topicWords(b).length));
}

function uniqueSubjectFacts(facts) {
  const seen = new Set();
  const result = [];

  for (const fact of facts) {
    const key = normalizeKey(fact.subject);
    if (!key || seen.has(key) || !isTopicLabel(fact.subject)) continue;
    seen.add(key);
    result.push(fact);
  }
  return result;
}

function subjectsTooSimilar(a, b) {
  const A = normalizeKey(a);
  const B = normalizeKey(b);
  if (!A || !B) return true;
  if (A === B) return true;
  if (A.length >= 3 && B.length >= 3 && (A.includes(B) || B.includes(A))) return true;

  const acronym = value => topicWords(value)
    .filter(word => /^[A-Za-z]/.test(word))
    .map(word => word[0].toLowerCase())
    .join('');
  const acronymA = acronym(a);
  const acronymB = acronym(b);
  if (acronymA.length >= 2 && acronymA === B.replace(/\s+/g, '')) return true;
  if (acronymB.length >= 2 && acronymB === A.replace(/\s+/g, '')) return true;
  return false;
}

function factsForSubject(facts, subject) {
  const key = normalizeKey(subject);
  return facts.filter(fact => normalizeKey(fact.subject) === key);
}

function pickDistractorSubjects(facts, correct, difficulty, amount = 3) {
  const correctKey = normalizeKey(correct.subject);
  const groupKey = normalizeKey(correct.group || '');

  const candidates = uniqueSubjectFacts(facts).filter(fact => {
    const key = normalizeKey(fact.subject);
    return key !== correctKey &&
      key !== groupKey &&
      isTopicLabel(fact.subject) &&
      !subjectsTooSimilar(fact.subject, correct.subject);
  });

  const sameGroup = groupKey
    ? candidates.filter(fact => normalizeKey(fact.group) === groupKey)
    : [];
  const sameKind = candidates.filter(fact => fact.kind === correct.kind && !sameGroup.includes(fact));
  const rest = candidates.filter(fact => !sameGroup.includes(fact) && !sameKind.includes(fact));

  const rankClose = list => [...list].sort((a, b) => {
    const scoreA = subjectSimilarity(correct.subject, a.subject) + lexicalSimilarity(correct.description, a.description) * 2;
    const scoreB = subjectSimilarity(correct.subject, b.subject) + lexicalSimilarity(correct.description, b.description) * 2;
    return scoreB - scoreA;
  });

  let ordered;
  if (sameGroup.length >= amount) {
    const groupOnly = rankClose(sameGroup);
    ordered = difficulty === 'easy' ? shuffled(groupOnly) : groupOnly;
  } else if (difficulty === 'easy') {
    ordered = [...shuffled(sameGroup), ...shuffled(sameKind), ...shuffled(rest)];
  } else if (difficulty === 'medium') {
    ordered = [...rankClose(sameGroup), ...rankClose(sameKind), ...rankClose(rest)];
  } else {
    const close = rankClose([...sameGroup, ...sameKind, ...rest]);
    ordered = [...close.slice(0, Math.min(10, close.length)), ...close.slice(10)];
  }

  const picked = [];
  const used = new Set([correctKey]);
  for (const fact of ordered) {
    const key = normalizeKey(fact.subject);
    if (!key || used.has(key)) continue;
    used.add(key);
    picked.push(fact.subject);
    if (picked.length === amount) break;
  }

  return picked;
}

function genericSubjectPlaceholder(subject) {
  const s = cleanTopic(subject).toLowerCase();
  if (/flow$/.test(s)) return 'flow';
  if (/management$/.test(s)) return 'management approach';
  if (/process$/.test(s)) return 'process';
  if (/costs?$/.test(s)) return 'cost category';
  if (/performance$/.test(s)) return 'performance measure';
  if (/selection$/.test(s)) return 'selection process';
  if (/sourcing$/.test(s)) return 'sourcing approach';
  if (/relationship management/.test(s)) return 'relationship approach';
  if (/^(plan|execute|deliver|return|develop(?: \(source\))?)$/i.test(subject)) return 'stage';
  return 'concept';
}

function removeSubjectMention(text, subject) {
  let result = cleanLine(text);
  const normalizedSubject = cleanTopic(subject);
  if (normalizedSubject.length < 3) return result;

  const escaped = normalizedSubject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const placeholder = genericSubjectPlaceholder(normalizedSubject);
  try {
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'ig'), placeholder);
  } catch {
    // Keep original text if a rare subject cannot be used in a RegExp safely.
  }
  return result;
}

function polishClueSentence(text, subject) {
  let s = removeSubjectMention(text, subject)
    .replace(/^Here,\s*/i, '')
    .replace(/^Also\s+/i, 'It is also ')
    .replace(/^In this stage,\s*/i, 'At this stage, ')
    .replace(/^This stage\s+/i, 'The stage ')
    .replace(/^The stage\s+is\s+considered\s+as\s+/i, 'The stage is ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!/[.!?]$/.test(s)) s += '.';
  return cap(s);
}

function chooseDistinctFacts(bundle, count, maxChars = 300) {
  if (!bundle.length) return [];
  const preferred = bundle.filter(fact => fact.description.length <= maxChars);
  const source = preferred.length >= count ? preferred : bundle;
  const result = [];
  const used = new Set();

  for (const fact of shuffled(source)) {
    const key = normalizeKey(fact.description);
    if (!key || used.has(key)) continue;
    used.add(key);
    result.push(fact);
    if (result.length === count) break;
  }
  return result;
}

function contextualQuestionLead(fact, difficulty) {
  const hasGroup = fact.group && normalizeKey(fact.group) !== normalizeKey(fact.subject);
  if (!hasGroup) return QUESTION_STARTERS[difficulty][randomInt(QUESTION_STARTERS[difficulty].length)];

  if (difficulty === 'easy') {
    return `Which topic under “${fact.group}” is described below?`;
  }
  if (difficulty === 'medium') {
    return `Within “${fact.group}”, which concept best matches the complete explanation below?`;
  }
  if (difficulty === 'hard') {
    return `A situation relates to “${fact.group}”. Which specific concept best fits the details below?`;
  }
  return `Within “${fact.group}”, use all the clues below to identify the most precise concept.`;
}

function buildEasyStem(fact) {
  const clue = polishClueSentence(fact.description, fact.subject);
  return `${contextualQuestionLead(fact, 'easy')}\n\n${clue}`;
}

function buildMediumStem(fact, bundle) {
  const base = polishClueSentence(fact.description, fact.subject);
  const support = chooseDistinctFacts(bundle.filter(item => item !== fact), 1, 220)
    .map(item => polishClueSentence(item.description, fact.subject));

  const includeSupport = support.length && (base.length + support[0].length <= 330);
  const body = includeSupport ? `${base} ${support[0]}` : base;
  return `${contextualQuestionLead(fact, 'medium')}\n\n${body}`;
}

function buildHardStem(fact, bundle) {
  const base = polishClueSentence(fact.description, fact.subject);
  const support = chooseDistinctFacts(bundle.filter(item => item !== fact), 2, 250)
    .map(item => polishClueSentence(item.description, fact.subject));

  const clues = [base];
  for (const clue of support) {
    if (clues.join(' ').length + clue.length <= 520) clues.push(clue);
    if (clues.length === 2) break;
  }

  return `${contextualQuestionLead(fact, 'hard')}\n\n${clues.join(' ')}`;
}

function buildGodStem(fact, bundle) {
  const base = polishClueSentence(fact.description, fact.subject);
  const support = chooseDistinctFacts(bundle.filter(item => item !== fact), 3, 260)
    .map(item => polishClueSentence(item.description, fact.subject));

  const clues = [base];
  for (const clue of support) {
    if (clues.join(' ').length + clue.length <= 680) clues.push(clue);
    if (clues.length === 3) break;
  }

  const numbered = clues.map((clue, index) => `${index + 1}. ${clue}`).join('\n');
  return `${contextualQuestionLead(fact, 'god')}\n\n${numbered}`;
}

function buildQuestionStem(fact, facts, difficulty) {
  const bundle = factsForSubject(facts, fact.subject);
  if (difficulty === 'easy') return buildEasyStem(fact);
  if (difficulty === 'medium') return buildMediumStem(fact, bundle);
  if (difficulty === 'hard') return buildHardStem(fact, bundle);
  return buildGodStem(fact, bundle);
}

function optionSignature(options) {
  return options.map(normalizeKey).sort().join('||');
}

function questionSignature(fact, prompt, options) {
  return `${normalizeKey(fact.subject)}::${normalizeKey(prompt)}::${optionSignature(options)}`;
}

function validateQuestion(question) {
  if (!question?.prompt || !question?.answer || !Array.isArray(question.options)) return false;
  if (question.options.length !== 4) return false;
  if (!question.options.every(option => isTopicLabel(option) && option.length <= 64)) return false;
  if (new Set(question.options.map(normalizeKey)).size !== 4) return false;
  if (!question.options.some(option => normalizeKey(option) === normalizeKey(question.answer))) return false;
  if (/…|\.\.\./.test(question.prompt)) return false;
  if (question.prompt.split(/\s+/).length < 12) return false;
  return true;
}

function makeQuestion(facts, fact, difficulty, index, usedOptionSets, blockedQuestions, usedPrompts) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const distractors = pickDistractorSubjects(facts, fact, difficulty, 3);
    if (distractors.length < 3) return null;

    const answer = fact.subject;
    const prompt = buildQuestionStem(fact, facts, difficulty);
    const correctIndex = (index + randomInt(4)) % 4;
    const options = [...distractors];
    options.splice(correctIndex, 0, answer);

    const question = {
      prompt,
      answer,
      answerTopic: answer,
      options,
      correctIndex,
      source: fact.source,
      difficulty,
      hint: difficulty === 'easy' ? `Hint: the answer starts with “${answer.charAt(0).toUpperCase()}”.` : null
    };

    if (!validateQuestion(question)) continue;

    const optionSig = optionSignature(options);
    const promptSig = normalizeKey(prompt);
    const signature = questionSignature(fact, prompt, options);

    if (usedOptionSets.has(optionSig) || usedPrompts.has(promptSig) || blockedQuestions.has(signature)) continue;

    question.optionSignature = optionSig;
    question.signature = signature;
    return question;
  }

  return null;
}

export function generateQuizFromFacts(facts, count = 10, difficulty = 'medium', blockedSignatures = new Set()) {
  if (!VALID_COUNTS.has(count)) return [];
  if (!DIFFICULTIES[difficulty]) difficulty = 'medium';

  const requiredFacts = MIN_FACTS_BY_COUNT[count] || 6;
  if (!Array.isArray(facts) || facts.length < requiredFacts || uniqueSubjectFacts(facts).length < 4) return [];

  const pool = shuffled(facts.filter(fact => isTopicLabel(fact.subject)).slice(0, MAX_FACTS));
  const usedOptionSets = new Set();
  const usedPrompts = new Set();
  const forbidden = new Set(blockedSignatures);
  const quiz = [];
  let cursor = 0;

  for (let pass = 0; pass < 24 && quiz.length < count; pass++) {
    for (const fact of shuffled(pool)) {
      const question = makeQuestion(
        pool,
        fact,
        difficulty,
        cursor++,
        usedOptionSets,
        forbidden,
        usedPrompts
      );

      if (!question) continue;
      usedOptionSets.add(question.optionSignature);
      usedPrompts.add(normalizeKey(question.prompt));
      forbidden.add(question.signature);
      quiz.push(question);
      if (quiz.length === count) break;
    }
  }

  return quiz.length === count ? quiz : [];
}

function hashString(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function docFingerprint(file, text) {
  const sample = `${text.slice(0, 7000)}|${text.slice(-7000)}`;
  return `${hashString(sample)}-${file.size}-${hashString(file.name.toLowerCase())}`;
}

function historyKey(fingerprint) {
  return `pagequiz-history-v4:${fingerprint}`;
}

function readHistory(fingerprint) {
  if (typeof sessionStorage === 'undefined') return new Set();
  try {
    const raw = JSON.parse(sessionStorage.getItem(historyKey(fingerprint)) || '[]');
    return new Set((Array.isArray(raw) ? raw : []).slice(-HISTORY_LIMIT));
  } catch {
    return new Set();
  }
}

function saveHistory(fingerprint, quiz) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const merged = [...readHistory(fingerprint), ...quiz.map(question => question.signature)].slice(-HISTORY_LIMIT);
    sessionStorage.setItem(historyKey(fingerprint), JSON.stringify(merged));
  } catch {
    // Quiz generation still works if browser storage is unavailable.
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
    const module = await import('https://cdn.jsdelivr.net/npm/mammoth@1.12.3/+esm');
    mammoth = module.default || module;
  }
  return mammoth;
}

async function loadJSZip() {
  if (!JSZip) {
    const module = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.2/+esm');
    JSZip = module.default || module;
  }
  return JSZip;
}

function pdfItemsToLines(items) {
  const positioned = items
    .filter(item => item?.str && item.str.trim())
    .map(item => ({
      text: item.str.trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0)
    }))
    .sort((a, b) => Math.abs(b.y - a.y) > 2.2 ? b.y - a.y : a.x - b.x);

  const rows = [];
  for (const item of positioned) {
    let row = rows.find(candidate => Math.abs(candidate.y - item.y) <= 2.2);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }

  rows.sort((a, b) => b.y - a.y);
  return rows
    .map(row => row.items
      .sort((a, b) => a.x - b.x)
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
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
      const lines = pdfItemsToLines(content.items);
      text += `${lines.join('\n')}\n\f\n`;
      page.cleanup?.();

      if (text.length >= MAX_TEXT_CHARS) break;
      if (pageNo % 6 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally {
    try { pdf.cleanup?.(); } catch {}
    try { await task.destroy?.(); } catch {}
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
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => {
      const hex = code[0].toLowerCase() === 'x';
      return String.fromCodePoint(parseInt(hex ? code.slice(1) : code, hex ? 16 : 10));
    })
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
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));

  if (!slides.length) throw new Error('This PowerPoint does not contain readable slides.');
  if (slides.length > 150) throw new Error('Please use a presentation with 150 slides or fewer.');

  let text = '';
  for (let i = 0; i < slides.length; i++) {
    onProgress(`Reading slide ${i + 1} of ${slides.length}…`);
    const xml = await zip.file(slides[i]).async('string');
    const paragraphs = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/gi)]
      .map(paragraph => [...paragraph[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
        .map(textMatch => decodeXml(textMatch[1]))
        .join(' ')
        .trim())
      .filter(Boolean);

    text += `${paragraphs.join('\n')}\n\f\n`;
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
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
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

  function setStatus(message = '') {
    const status = document.querySelector('#status');
    if (!status) return;
    status.innerHTML = message ? `<div class="error">${escapeHtml(message)}</div>` : '';
  }

  function home() {
    selectedFile = null;
    quiz = [];
    answers = [];
    currentIndex = 0;
    selectedIndex = null;
    isBusy = false;
    document.onkeydown = null;

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
            <input id="file" type="file" accept=".pdf,.docx,.pptx">
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
            <p class="muted" id="modeHelp">${DIFFICULTIES[difficulty].description}</p>
          </fieldset>

          <button class="primary full" id="generate" disabled>Generate my quiz →</button>
          <div id="status" role="status"></div>
          <p class="notice">Questions use complete ideas from readable text in your document. Scanned image-only pages need OCR first.</p>
        </section>

        <aside class="aside">
          <h2>A simple study rhythm</h2>
          <div class="step"><span class="num">01</span><div><strong>Bring your notes</strong><small>Lecture notes, a chapter, or a study guide.</small></div></div>
          <div class="step"><span class="num">02</span><div><strong>Answer real questions</strong><small>Complete clues, short concept options, and mode-appropriate difficulty.</small></div></div>
          <div class="step"><span class="num">03</span><div><strong>See how you did</strong><small>Correct, wrong, and a review of your answers.</small></div></div>
          <div class="privacy">No document history. Your file stays in your browser.</div>
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

    document.querySelectorAll('[name=difficulty]').forEach(element => {
      element.addEventListener('change', () => {
        difficulty = element.value;
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
    questionCount = Number(document.querySelector('#count').value);
    const controls = document.querySelectorAll('#file, #count, [name=difficulty]');
    controls.forEach(element => { element.disabled = true; });
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

      button.innerHTML = '<span class="loading"></span>Building complete questions…';
      await new Promise(resolve => setTimeout(resolve, 0));

      const facts = extractFacts(text);
      const topics = uniqueSubjectFacts(facts);
      const required = MIN_FACTS_BY_COUNT[questionCount];

      if (facts.length < required || topics.length < 4) {
        throw new Error(`I found ${topics.length} reliable answer topics and ${facts.length} usable facts. This document needs at least 4 clear topics and more usable statements for a ${questionCount}-question quiz.`);
      }

      currentFingerprint = docFingerprint(selectedFile, text);
      const blocked = readHistory(currentFingerprint);
      quiz = generateQuizFromFacts(facts, questionCount, difficulty, blocked);

      if (quiz.length !== questionCount && blocked.size) {
        quiz = generateQuizFromFacts(facts, questionCount, difficulty, new Set());
      }

      if (quiz.length !== questionCount) {
        throw new Error(`I could not create ${questionCount} clean, non-repeating questions from this document without lowering question quality. Try fewer questions or a document with more distinct topics.`);
      }

      saveHistory(currentFingerprint, quiz);
      answers = Array(questionCount).fill(null);
      currentIndex = 0;
      selectedIndex = null;
      renderQuestion();
    } catch (error) {
      console.error(error);
      setStatus(error?.message || 'Something went wrong while reading this file.');
      controls.forEach(element => { element.disabled = false; });
      button.disabled = false;
      button.textContent = 'Generate my quiz →';
      isBusy = false;
    }
  }

  function renderQuestion() {
    isBusy = false;
    const question = quiz[currentIndex];
    selectedIndex = answers[currentIndex]?.selectedIndex ?? null;
    const answered = answers[currentIndex] !== null;
    const godMode = difficulty === 'god';

    app.innerHTML = `
      <section class="quiz">
        <div class="topline">
          <span class="filename">${escapeHtml(selectedFile?.name || 'Document')}</span>
          <span>Question ${currentIndex + 1} of ${quiz.length} · ${DIFFICULTIES[difficulty].label}</span>
        </div>
        <div class="progress"><span style="width:${((currentIndex + 1) / quiz.length) * 100}%"></span></div>
        <p class="eyebrow">${DIFFICULTIES[difficulty].label}</p>
        <h2 class="qtitle">${escapeHtml(question.prompt)}</h2>
        ${question.hint ? `<div class="answer-hint">${escapeHtml(question.hint)}</div>` : ''}
        <div class="options">
          ${question.options.map((option, index) => {
            let className = 'option';
            if (selectedIndex === index) className += ' selected';
            if (answered && !godMode && index === question.correctIndex) className += ' correct';
            if (answered && !godMode && selectedIndex === index && index !== question.correctIndex) className += ' wrong';
            return `<button class="${className}" data-index="${index}" ${answered ? 'disabled' : ''}><span class="letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></button>`;
          }).join('')}
        </div>
        ${answered && !godMode ? `
          <div class="feedback">
            <strong>${answers[currentIndex].correct ? 'Correct.' : 'Not quite.'}</strong>
            <p>The correct answer is <b>${escapeHtml(question.answer)}</b>.</p>
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
    const question = quiz[currentIndex];
    answers[currentIndex] = {
      selectedIndex: index,
      selectedText: question.options[index],
      correct: index === question.correctIndex
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
    const correct = answers.filter(answer => answer?.correct).length;
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
          ${quiz.map((question, index) => {
            const answer = answers[index];
            return `<div class="review-item">
              <strong>${index + 1}. ${escapeHtml(question.prompt)}</strong>
              <p>Your answer: <b>${escapeHtml(answer?.selectedText || 'No answer')}</b> ${answer?.correct ? '✓' : '✕'}</p>
              ${answer?.correct ? '' : `<p>Correct answer: <b>${escapeHtml(question.answer)}</b></p>`}
              <small>Source idea: ${escapeHtml(question.source)}</small>
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
    const count = questionCount;
    const mode = difficulty;

    home();
    questionCount = count;
    difficulty = mode;
    selectFile(file);
    document.querySelector('#count').value = String(count);

    const radio = document.querySelector(`[name=difficulty][value="${mode}"]`);
    if (radio) radio.checked = true;
    document.querySelector('#modeHelp').textContent = DIFFICULTIES[mode].description;
    await generate();
  }

  home();
}
