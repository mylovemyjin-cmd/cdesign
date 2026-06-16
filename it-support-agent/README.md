# IT 도우미 (IT Support Agent)

사내 IT 시스템 사용을 돕는 **개별 PC용 데스크톱 어시스턴트**입니다.
시스템 트레이의 작은 아이콘을 클릭하면 채팅창이 뜨고, 사용자가 자연어로
입력한 내용을 해석해 **매뉴얼 기반 설명**을 제공하거나 **관련 링크로 연결**합니다.

> 별도 저장소의 웹 기반 프로젝트(`/backend`, `/frontend`의 DT Weekly Task Tracker)와는
> 독립적인 standalone 앱이며, 이 `it-support-agent/` 디렉터리 안에서 완결됩니다.

## 핵심 특징

- **트레이 상주 + 채팅 UI**: 트레이 아이콘 클릭 → 트레이 근처에 채팅창 토글
- **오프라인 자연어 검색**: 외부 LLM/네트워크 없이 키워드·동의어·점수 기반 매칭
  - 한글 조사 처리(부분 문자열 포함), 동의어 사전(예: 비번=비밀번호=password)
- **매뉴얼 답변 + 링크 연결**: 단계별 설명을 보여주고, 관련 페이지는 기본 브라우저로 열기
- **중앙 서버 동기화**: 시작 시/수동으로 매뉴얼 JSON을 받아 캐시. 오프라인이면 캐시·번들 폴백
- **보안 구성**: `contextIsolation`, `nodeIntegration:false`, 엄격한 CSP, URL 화이트리스트(`https?`만 외부 열기)

## 디렉터리 구조

```
it-support-agent/
├── package.json
├── config.default.json        # 기본 설정(서버 URL, 헬프데스크 등)
├── scripts/
│   └── generate-icon.js       # 트레이 PNG 아이콘 생성(의존성 없음)
├── resources/
│   ├── knowledge-base.json     # 번들 기본 매뉴얼(오프라인 폴백)
│   └── tray-icon.png           # 트레이 아이콘(생성물)
├── src/
│   ├── main/
│   │   ├── main.js             # Electron 메인: 트레이/창/IPC/설정
│   │   ├── preload.js          # contextBridge로 안전한 window.api 노출
│   │   └── knowledgeBase.js    # KB 로드/서버 동기화/캐시
│   ├── shared/
│   │   └── searchEngine.js     # 오프라인 검색·랭킹(순수 함수, 테스트 대상)
│   └── renderer/
│       ├── index.html          # 채팅창 UI
│       ├── styles.css
│       └── renderer.js         # 채팅 로직 + 경량 마크다운 렌더러
├── server-example/             # 중앙 서버 연동 규격 및 예시 매니페스트
└── test/
    └── searchEngine.test.js    # 검색 엔진 단위 테스트
```

## 개발 / 실행

```bash
cd it-support-agent
npm install
npm run icon     # 트레이 아이콘 생성(최초 1회, 이미 커밋되어 있음)
npm run dev      # 개발 모드 실행(창 자동 표시 + DevTools)
npm start        # 일반 실행(트레이 상주)
npm test         # 검색 엔진 단위 테스트
```

> 헤드리스/서버 환경에서는 GUI를 띄울 수 없으므로 `npm start`는 데스크톱
> 환경(Windows 등)에서 실행하세요. 로직 검증은 `npm test`로 가능합니다.

## 배포 (.exe)

```bash
npm run dist     # electron-builder로 Windows 설치 파일 생성
```

NSIS 인스톤러가 생성되며, 사용자가 설치하면 트레이에 상주합니다.

## 설정

`config.default.json`을 기본값으로 사용하고, 배포 PC에서는
`%APPDATA%/it-support-agent/config.local.json`으로 일부 키만 덮어쓸 수 있습니다.
중앙 서버 매뉴얼 형식과 연동 방법은 [`server-example/README.md`](server-example/README.md)를 참고하세요.

## 매뉴얼 추가/수정

- **간단히**: `resources/knowledge-base.json`의 `entries`에 항목 추가
- **운영 배포**: 중앙 서버에 동일 형식 JSON을 올리고 `version`을 올리면 전 PC가 자동 갱신

각 항목 필드와 검색 가중치는 `server-example/README.md`에 정리되어 있습니다.

## 다음 단계(선택)

- 정확도가 더 필요하면 `searchEngine`을 유지한 채 **Claude API / 사내 LLM**을 RAG 백엔드로 추가 가능
- 사용 로그(익명) 수집으로 "결과 없음" 질의를 분석해 매뉴얼 보강
```
