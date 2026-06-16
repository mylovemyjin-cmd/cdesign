'use strict';

/* 채팅 UI 로직. 메인 프로세스(window.api)와 IPC로만 통신한다. */

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const chipsEl = document.getElementById('chips');
const refreshBtn = document.getElementById('refresh-btn');
const closeBtn = document.getElementById('close-btn');
const productNameEl = document.getElementById('product-name');

let helpdesk = {};

// ── HTML 이스케이프 + 경량 마크다운 → DOM ────────────────
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 신뢰된 매뉴얼 content(마크다운 일부 문법)를 안전한 HTML로 변환.
 * 지원: ## 제목, **굵게**, `코드`, 1. 순서목록, - 비순서목록, 빈 줄 = 문단.
 */
function renderMarkdown(md) {
  const lines = String(md).split('\n');
  const html = [];
  let listType = null; // 'ol' | 'ul' | null

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const inline = (text) =>
    escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') {
      closeList();
      continue;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);

    if (h2) {
      closeList();
      html.push(`<h2>${inline(h2[1])}</h2>`);
    } else if (ol) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${inline(ol[1])}</li>`);
    } else if (ul) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${inline(ul[1])}</li>`);
    } else {
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return html.join('');
}

// ── 메시지 추가 ──────────────────────────────────────────
function addUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg user';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function addBotPlain(text) {
  const el = document.createElement('div');
  el.className = 'msg bot';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function makeLinkButtons(links) {
  if (!links || links.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.className = 'links';
  for (const link of links) {
    const btn = document.createElement('button');
    btn.className = 'link-btn';
    btn.textContent = `🔗 ${link.label}`;
    btn.addEventListener('click', () => window.api.openExternal(link.url));
    wrap.appendChild(btn);
  }
  return wrap;
}

/** 검색 결과를 답변 말풍선으로 렌더 */
function addAnswer(best, alternatives) {
  const el = document.createElement('div');
  el.className = 'msg bot';

  if (best.category) {
    const tag = document.createElement('span');
    tag.className = 'category-tag';
    tag.textContent = best.category;
    el.appendChild(tag);
  }

  const title = document.createElement('div');
  title.className = 'answer-title';
  title.textContent = best.title;
  el.appendChild(title);

  const content = document.createElement('div');
  content.className = 'content';
  content.innerHTML = renderMarkdown(best.content);
  el.appendChild(content);

  const links = makeLinkButtons(best.links);
  if (links) el.appendChild(links);

  // 다른 후보들
  if (alternatives && alternatives.length > 0) {
    const alt = document.createElement('div');
    alt.className = 'alt-results';
    const label = document.createElement('div');
    label.className = 'alt-label';
    label.textContent = '혹시 이런 내용을 찾으셨나요?';
    alt.appendChild(label);
    for (const a of alternatives) {
      const b = document.createElement('button');
      b.className = 'alt-btn';
      b.textContent = `${a.title}`;
      b.addEventListener('click', () => runQuery(a.title));
      alt.appendChild(b);
    }
    el.appendChild(alt);
  }

  messagesEl.appendChild(el);
  scrollToBottom();
}

/** 결과 없음 → 헬프데스크 안내 */
function addNoResult(query) {
  const el = document.createElement('div');
  el.className = 'msg bot';
  const p = document.createElement('div');
  p.innerHTML = renderMarkdown(
    `**"${escapeHtml(query)}"** 에 대한 매뉴얼을 찾지 못했어요.\n\n` +
      `다른 표현으로 다시 물어보시거나, 아래 IT 헬프데스크로 문의해 주세요.`
  );
  el.appendChild(p);

  const esc = document.createElement('div');
  esc.className = 'escalate';
  const parts = [];
  if (helpdesk.name) parts.push(helpdesk.name);
  if (helpdesk.phone) parts.push(`☎ ${helpdesk.phone}`);
  if (helpdesk.email) parts.push(`✉ ${helpdesk.email}`);
  esc.textContent = parts.join('  ·  ');
  el.appendChild(esc);

  const links = [];
  if (helpdesk.portalUrl) links.push({ label: 'IT 포털 열기', url: helpdesk.portalUrl });
  if (helpdesk.email) links.push({ label: '메일 문의', url: `mailto:${helpdesk.email}` });
  const lb = makeLinkButtons(links);
  if (lb) el.appendChild(lb);

  messagesEl.appendChild(el);
  scrollToBottom();
}

function addToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── 질의 실행 ────────────────────────────────────────────
async function runQuery(query) {
  const q = (query || '').trim();
  if (!q) return;
  addUserMessage(q);
  inputEl.value = '';

  try {
    const { results } = await window.api.search(q);
    if (!results || results.length === 0) {
      addNoResult(q);
      return;
    }
    const [best, ...rest] = results;
    addAnswer(best, rest.slice(0, 3));
  } catch (err) {
    addBotPlain(`검색 중 오류가 발생했습니다: ${err.message}`);
  }
}

// ── 추천 칩(카테고리별 대표 항목) ────────────────────────
async function loadChips() {
  try {
    const categories = await window.api.getCategories();
    chipsEl.innerHTML = '';
    // 카테고리별 첫 항목을 빠른 진입점으로 노출 (최대 6개)
    const picks = [];
    for (const c of categories) {
      if (c.items[0]) picks.push(c.items[0]);
      if (picks.length >= 6) break;
    }
    for (const p of picks) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = p.title;
      chip.addEventListener('click', () => runQuery(p.title));
      chipsEl.appendChild(chip);
    }
  } catch {
    /* 무시 */
  }
}

// ── 초기화 ───────────────────────────────────────────────
async function init() {
  try {
    const cfg = await window.api.getConfig();
    helpdesk = cfg.helpdesk || {};
    if (cfg.productName) productNameEl.textContent = cfg.productName;
  } catch {
    /* 기본값 사용 */
  }

  addBotPlain(
    '안녕하세요! 사내 IT 사용을 도와드리는 도우미입니다. 😊\n' +
      '비밀번호, VPN, 프린터, 메일 등 궁금한 점을 자연어로 입력해 보세요.'
  );
  loadChips();

  // 매뉴얼이 백그라운드에서 갱신되면 칩 새로고침
  window.api.onKbUpdated((status) => {
    loadChips();
  });
}

// ── 이벤트 바인딩 ────────────────────────────────────────
sendBtn.addEventListener('click', () => runQuery(inputEl.value));
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runQuery(inputEl.value);
  if (e.key === 'Escape') window.api.hideWindow();
});
closeBtn.addEventListener('click', () => window.api.hideWindow());
refreshBtn.addEventListener('click', async () => {
  addToast('매뉴얼을 새로고침하는 중...');
  const r = await window.api.refreshKB();
  if (r.updated) addToast(`매뉴얼이 최신 버전(v${r.status.version})으로 업데이트되었습니다.`);
  else if (r.error) addToast(`업데이트 실패: ${r.error} (기존 매뉴얼 사용)`);
  else addToast('이미 최신 매뉴얼입니다.');
  loadChips();
});

init();
