'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const engine = require('../src/shared/searchEngine');

const kb = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'resources', 'knowledge-base.json'), 'utf8')
);

test('tokenize: 한글 조사/특수문자 분리', () => {
  const t = engine.tokenize('비밀번호를 잊어버렸어요!');
  assert.ok(t.includes('비밀번호를'));
  assert.ok(t.includes('잊어버렸어요'));
});

test('동의어 인덱스: 양방향 매핑', () => {
  const idx = engine.buildSynonymIndex({ 비밀번호: ['비번', 'password'] });
  assert.ok(idx.get('비번').has('비밀번호'));
  assert.ok(idx.get('비밀번호').has('password'));
});

test('검색: "비번 초기화" → 비밀번호 항목이 1순위', () => {
  const { results } = engine.search(kb, '비번 초기화');
  assert.ok(results.length > 0, '결과가 있어야 함');
  assert.strictEqual(results[0].id, 'pw-reset');
});

test('검색: 동의어 "와이파이" → "wifi" 항목 매칭', () => {
  const { results } = engine.search(kb, '와이파이 연결 안돼요');
  assert.ok(results.some((r) => r.id === 'wifi'));
});

test('검색: 영문 약어 "vpn 재택"', () => {
  const { results } = engine.search(kb, 'vpn 재택근무 설정');
  assert.strictEqual(results[0].id, 'vpn-setup');
});

test('검색: 오탈자성/무관 질의는 결과 없음', () => {
  const { results } = engine.search(kb, 'asdf zxcv 점심메뉴');
  assert.strictEqual(results.length, 0);
});

test('검색: "프린터 인쇄" 동의어 매칭', () => {
  const { results } = engine.search(kb, '출력이 안돼요 복합기');
  assert.strictEqual(results[0].id, 'printer');
});

test('결과에 links 배열 포함', () => {
  const { results } = engine.search(kb, '비밀번호 변경');
  assert.ok(Array.isArray(results[0].links));
});

test('listCategories: 카테고리 그룹화', () => {
  const cats = engine.listCategories(kb);
  assert.ok(cats.length > 0);
  assert.ok(cats.every((c) => c.category && Array.isArray(c.items)));
});
