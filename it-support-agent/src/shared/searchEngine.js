'use strict';

/**
 * 오프라인 키워드/검색 기반 매칭 엔진.
 *
 * 외부 LLM/네트워크 없이 동작한다. 지식베이스(knowledge base)의 각 항목을
 * 사용자의 자연어 질의와 비교하여 점수를 매기고 가장 적합한 항목을 돌려준다.
 *
 * 점수 구성(가중치):
 *   - 제목(title)에 질의 토큰이 포함        : 가중치 높음
 *   - keywords 배열에 토큰 일치             : 가중치 가장 높음
 *   - category/tags 일치                    : 중간
 *   - content 본문에 토큰 포함              : 낮음
 *   - 동의어(synonyms)로 확장된 토큰 일치   : 원본 토큰과 동일 가중치
 *
 * 한글은 형태소 분석 없이 공백 토큰화 + 부분 문자열 포함으로 처리한다.
 * (조사가 붙어도 "비밀번호를" 안에 "비밀번호"가 포함되므로 매칭된다.)
 */

const DEFAULT_WEIGHTS = {
  keyword: 10,
  title: 6,
  titleExact: 25,
  category: 3,
  tag: 4,
  content: 1.5,
  synonymBonus: 0, // 동의어로 확장된 토큰도 원본과 동일 가중치 사용
};

/** 질의/텍스트를 소문자화하고 비단어 문자를 공백으로 치환 후 토큰 배열로 변환 */
function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[\s,./\\!?()[\]{}:;"'`~|<>+=*&^%$#@\-_]+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * 동의어 맵을 이용해 토큰 목록을 확장한다.
 * synonyms: { "비밀번호": ["비번", "패스워드", "password", "암호"] , ... }
 * 어느 방향(대표어→동의어, 동의어→대표어)으로도 매칭되도록 양방향 인덱스를 만든다.
 */
function buildSynonymIndex(synonyms = {}) {
  const index = new Map(); // term -> Set(관련 term들)
  const add = (a, b) => {
    if (!index.has(a)) index.set(a, new Set());
    index.get(a).add(b);
  };
  for (const [head, list] of Object.entries(synonyms)) {
    const headT = head.toLowerCase();
    const members = (list || []).map((s) => String(s).toLowerCase());
    const all = [headT, ...members];
    for (const a of all) {
      for (const b of all) {
        if (a !== b) add(a, b);
      }
    }
  }
  return index;
}

function expandTokens(tokens, synonymIndex) {
  const expanded = new Set(tokens);
  for (const t of tokens) {
    const related = synonymIndex.get(t);
    if (related) for (const r of related) expanded.add(r);
  }
  return [...expanded];
}

/** 항목의 검색 대상 텍스트들을 미리 소문자화하여 캐시 */
function indexEntry(entry) {
  return {
    entry,
    titleLower: (entry.title || '').toLowerCase(),
    titleTokens: tokenize(entry.title),
    keywordTokens: (entry.keywords || []).map((k) => String(k).toLowerCase()),
    tagTokens: (entry.tags || []).map((t) => String(t).toLowerCase()),
    categoryLower: (entry.category || '').toLowerCase(),
    contentLower: (entry.content || '').toLowerCase(),
  };
}

/** 토큰 한 개가 후보 텍스트(또는 토큰 배열)에 포함되는지 */
function tokenHitsList(token, list) {
  for (const item of list) {
    if (item === token || item.includes(token) || token.includes(item)) return true;
  }
  return false;
}

function tokenInText(token, text) {
  return text.includes(token);
}

/**
 * 단일 항목 점수 계산.
 * @returns {number}
 */
function scoreEntry(indexed, queryTokens, expandedTokens, weights) {
  const { titleLower, titleTokens, keywordTokens, tagTokens, categoryLower, contentLower } = indexed;
  let score = 0;

  // 제목 전체가 질의에 그대로 포함되면 강한 가산점
  const queryJoined = queryTokens.join(' ');
  if (titleLower && queryJoined.includes(titleLower)) {
    score += weights.titleExact;
  }

  // 원본 토큰 + 동의어 확장 토큰을 모두 평가 (중복 토큰은 한 번만)
  const seen = new Set();
  for (const token of expandedTokens) {
    if (token.length < 2 && !/[가-힣]/.test(token)) continue; // 너무 짧은 영문 토큰 무시
    if (seen.has(token)) continue;
    seen.add(token);

    if (tokenHitsList(token, keywordTokens)) score += weights.keyword;
    if (tokenHitsList(token, tagTokens)) score += weights.tag;
    if (tokenHitsList(token, titleTokens)) score += weights.title;
    if (categoryLower && tokenInText(token, categoryLower)) score += weights.category;
    if (contentLower && tokenInText(token, contentLower)) score += weights.content;
  }

  return score;
}

/**
 * 검색 실행.
 * @param {object} kb  - { entries: [...], synonyms: {...} }
 * @param {string} query
 * @param {object} [opts] - { limit, minScore, weights }
 * @returns {{results: Array, query: string}}
 */
function search(kb, query, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const limit = opts.limit ?? 5;
  const minScore = opts.minScore ?? 4;

  const entries = (kb && kb.entries) || [];
  const synonymIndex = buildSynonymIndex((kb && kb.synonyms) || {});

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return { results: [], query };
  const expandedTokens = expandTokens(queryTokens, synonymIndex);

  const scored = entries.map((entry) => {
    const indexed = indexEntry(entry);
    const score = scoreEntry(indexed, queryTokens, expandedTokens, weights);
    return { entry, score };
  });

  const results = scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      id: s.entry.id,
      title: s.entry.title,
      category: s.entry.category,
      content: s.entry.content,
      links: s.entry.links || [],
      score: Number(s.score.toFixed(2)),
    }));

  return { results, query };
}

/** 카테고리 목록과 대표 항목(빠른 추천 칩 용도) 추출 */
function listCategories(kb) {
  const entries = (kb && kb.entries) || [];
  const map = new Map();
  for (const e of entries) {
    const cat = e.category || '기타';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push({ id: e.id, title: e.title });
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}

module.exports = {
  search,
  tokenize,
  buildSynonymIndex,
  expandTokens,
  listCategories,
  DEFAULT_WEIGHTS,
};
