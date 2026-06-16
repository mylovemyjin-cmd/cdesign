# 중앙 서버 연동 가이드 (매뉴얼 배포)

IT 도우미 에이전트는 시작 시 또는 "매뉴얼 새로고침" 시 중앙 서버에서
매뉴얼(지식베이스) JSON을 내려받아 로컬에 캐시합니다. 서버 측은
**정적 JSON 파일 하나만 제공**하면 됩니다.

## 1. 엔드포인트

- 에이전트 설정의 `knowledgeBase.manifestUrl` 이 가리키는 URL로 `GET` 요청
- 응답: `Content-Type: application/json`, 본 폴더의 `manifest.example.json` 형식
- 인증이 필요하면 사내망(VPN)/IP 화이트리스트 또는 리버스 프록시에서 처리하세요.

## 2. JSON 스키마

| 필드 | 타입 | 설명 |
|---|---|---|
| `version` | string | 매뉴얼 버전. **이전과 다르면** 에이전트가 캐시를 갱신합니다. |
| `updatedAt` | string | 갱신일(표시용) |
| `synonyms` | object | `{ 대표어: [동의어...] }` — 검색 동의어 사전(양방향 적용) |
| `entries` | array | 매뉴얼 항목 목록 (아래) |

### entries[] 항목

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✅ | 고유 식별자 |
| `title` | string | ✅ | 항목 제목(답변 헤더로 표시) |
| `category` | string |  | 카테고리(추천 칩/태그로 사용) |
| `keywords` | string[] |  | 검색 가중치 가장 높음 |
| `tags` | string[] |  | 보조 키워드 |
| `content` | string |  | 본문(경량 마크다운: `##`, `**굵게**`, `` `코드` ``, `1.`/`-` 목록) |
| `links` | `{label,url}[]` |  | 클릭 시 기본 브라우저로 열리는 링크 |

## 3. 동작 방식

1. 앱 시작 → 로컬 캐시(`userData/knowledge-base.cache.json`) 또는 번들 기본본 로드
2. 백그라운드로 `manifestUrl` 동기화 시도 (타임아웃 `syncTimeoutMs`)
3. `version`이 바뀌었으면 캐시 갱신, 동일하면 생략
4. **오프라인/실패 시** 기존(캐시/번들) 매뉴얼을 그대로 사용 — 검색은 항상 오프라인 동작

## 4. 운영자 설정 덮어쓰기

배포 PC에서 서버 주소 등을 바꾸려면
`%APPDATA%/it-support-agent/config.local.json` 에 일부 키만 작성하면 됩니다.

```json
{
  "knowledgeBase": { "manifestUrl": "https://intranet/it/manifest.json" },
  "helpdesk": { "phone": "내선 9999" }
}
```
