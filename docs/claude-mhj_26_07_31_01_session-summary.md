# Session Summary — 스도쿠 프론트엔드 조립 계층 구현 및 감사

**Date:** 2026-07-31
**Artifact:** `docs/claude-mhj_26_07_31_01_session-summary.md`
**Workflow:** `/staged-development` (Phase 1~4), `/run`, `/logging`

---

## 1. 세션 목표

"스도쿠 화면에 아무것도 안 뜬다"는 신고에서 출발해 원인을 규명하고, 전체 프로젝트를 분석한 뒤,
P0(화면 미표시) + P1(조립 후 드러나는 결함 8건)을 모두 해소해 실제 플레이 가능 상태로 만든다.

## 2. 진행 경과

| 단계 | 내용 | 결과 |
| --- | --- | --- |
| 원인 규명 | `main.js`가 빈 div만 생성. `bootstrap()`·`mountShell()`·`mountBoard()` 호출부 0건. CSS 링크 없음 | 근본 원인 확정 |
| 전체 분석 | JS 23개 모듈·CSS·Django·git 정독. P1 8건 + P2 5건 도출 | 분석 보고 완료 |
| Phase 1 설계 | 승인된 계획의 `enableAdapters`(step 8)가 소유 블록 없이 누락된 것이 근본 원인임을 확인 | 사용자 승인 |
| **충돌 발견** | 설계 중 다른 세션이 `index.html`(00:29)·`main.js`(00:33)·`store.js`/`app-shell.js`(00:32)를 선행 구현 | 아래 "핵심 결정" 참조 |
| Phase 2~4 | B-01~B-08 구현. 사용자가 접두사 예외 + 연속 진행 승인 | 구현 완료 |
| 1차 브라우저 검증 | 헤드리스 Chrome + CDP 직접 구동 | 18/18 PASS |
| 추가 감사 | 미검증 경로(공유 왕복·새 게임·실행취소·메모·설정) 구동 | 40/40 PASS |

### 폐기·수정된 시도 (반복 방지)

| 시도 | 왜 틀렸는가 | 올바른 방법 |
| --- | --- | --- |
| `node --test tests/js` | Node v24/Windows에서 `MODULE_NOT_FOUND`. `tests/js/README.md`가 이 명령을 안내하고 있었음 | `node --test "tests/js/*.test.mjs"` |
| `bootstrap`에 `enableAdapters`를 **필수** deps로 추가 | 선행 구현된 `main.js`가 부팅 불가가 되어 트리를 깨뜨림 | 선택적 deps(`deps.enableAdapters?.()`)로 완화 |
| `Page.navigate`로 `#s=...` 링크 열기 | same-document navigation이라 앱이 재실행되지 않음. 보드는 이전 로드 그대로 | `about:blank` 경유 후 이동 |
| 페이지 내 `localStorage.clear()` 후 이탈 | `pagehide` 훅이 세션을 다시 기록해 되살아남 | CDP `Storage.clearDataForOrigin` |
| 캐시 켠 상태로 수정 검증 | Chrome 모듈 캐시로 옛 코드가 실행되어 "수정이 반영 안 됨"으로 오판 | `Network.setCacheDisabled` 후 전 회차 재실행 |
| `clearAll`이 `notify` 없이 직접 변이한다고 판단 | 세션 초반 읽은 내용 기준. 다른 세션이 00:32에 `store.notifyAll()`을 추가해 이미 해결됨 | 측정으로 확인(probe2) |

## 3. 핵심 결정

| 항목 | 결정 |
| --- | --- |
| 조립 위치 | `bootstrap.js`에 직접 넣지 않고 `deps.enableAdapters(store)` 주입. `bootstrap.js`의 DOM-free 단위 테스트 설계를 보존 |
| 진입점 구조 | `main.js`는 얇게(첫 페인트 + 동적 import), 조립은 신규 `app.js`. `main.test.mjs`의 "node import 시 부작용 없음" 계약 유지 |
| **경합 해소** | 사용자 승인 하에 다른 세션의 `main.js`(250줄) 덮어쓰기. 원본은 scratchpad에 보존(§5.2). 해당 구현에는 `startNewGame()`이 store 대신 session을 넘기는 버그 존재 |
| 파일 명명 | 사용자가 런타임 소스에 `claude-mhj_` 접두사 **예외 승인**. 문서 산출물만 접두사 적용 |
| 터치 컨트롤 DOM | `touch-adapter.js`가 아닌 신규 `ui/touch-controls.js`가 소유. `touch-adapter.js`의 "input/textarea 생성 금지" 소스 레벨 불변식 보존 |
| CSS 배치 | `tokens.css`(대비 게이트 파싱)·`board.css`/`layout.css`(정규식 테스트) 간섭 회피 위해 신규 `chrome.css` |
| `showConflicts=false` | 시각 표시만 억제. `aria-label`의 "규칙 위반"은 유지(접근성 정보 삭제 금지) |
| API 응답 | `/api/new-puzzle/`의 `solution` 필드는 `test_views.py`가 계약 고정 중이므로 **변경하지 않음** |

## 4. 검증 실적

| 항목 | 상태 |
| --- | --- |
| `node --test "tests/js/*.test.mjs"` | **PASS** 239 (세션 시작 시 193, +46) |
| `manage.py test game` | **PASS** 88 (시작 시 87, +1) |
| `node tools/check-contrast.mjs` | **PASS** 76/76 pairs |
| CDP 드라이버 `drive.mjs` | **PASS** 18/18 |
| CDP 감사 `audit.mjs` | **PASS** 40/40 |
| 콘솔 에러 / 미처리 예외 | **PASS** — `favicon.ico` 404 외 0 / 0 |
| dev 서버 자산 전달(11 URL, 상태·MIME) | **PASS** |
| 상대 import 32개 해석 검사 | **PASS** |
| axe 스캔 | **NOT RUN** (도구 미보유) |
| 실제 스크린리더 통과 | **NOT RUN** (자동화 불가) |
| 실기기 터치 / VisualViewport | **NOT RUN** (기기 없음) |
| 사용성 kill-criteria 3종 | **NOT RUN** (피험자 필요) |

## 5. 작성·수정한 파일

기준 경로: `C:\Users\mhj21\Desktop\workspace\sudoku_django`

| 파일 | 설명 | 상태 |
| --- | --- | --- |
| `game/static/game/js/app.js` | **신규.** Composition Root — deps 조립, `enableAdapters`, 세이브 배선, 공유/설정/도움말 다이얼로그, `restart()` | 유효 |
| `game/static/game/js/main.js` | 얇은 진입점으로 **교체**. 첫 페인트 + `app.js` 동적 import + 로드 실패 폴백 | 유효 |
| `game/static/game/js/ui/touch-controls.js` | **신규.** `.digit-bar` DOM(숫자 9 + 후보/메모), `aria-pressed`, 가시성 제어 | 유효 |
| `game/static/game/js/ui/board-view.js` | 재작성. 셀별 포인터 리스너, `highlightConflicts`, `showConflicts`, `data-peer`, conflict diff 갱신, `setCandidateMode` 범위 수정 | 유효 |
| `game/static/game/js/bootstrap.js` | `stripFragmentPrefix` 추가, step 8 `enableAdapters` 훅(선택적), `teardown`, **SC3 메모 유실 수정** | 유효 |
| `game/static/game/js/ui/key-resolve.js` | ctrl 분기에서 방향키·Home·End 통과(`CTRL_NAV_CODES`) | 유효 |
| `game/static/game/css/chrome.css` | **신규.** `.visually-hidden`, dialog, note-editor, notes-list, settings-form, hint-strip, retry-panel, 48px 컨트롤 하한, digit-bar 2행 대응 | 유효 |
| `game/templates/game/index.html` | `chrome.css` 링크 추가 (tokens/layout/board 3종은 다른 세션이 선행 추가) | 유효 |
| `game/tests/test_views.py` | 스타일시트 4종 링크 계약 테스트 추가 | 유효 |
| `tests/js/app-composition.test.mjs` | **신규.** 조립 통합 — 마운트, 세이브 배선, 선택 시드, 클릭→키보드 동기화, teardown, 프래그먼트 | 유효 |
| `tests/js/board-view-mount.test.mjs` | **신규.** conflict diff, showConflicts, highlightConflicts, peer, candidate-mode 범위, 포인터 | 유효 |
| `tests/js/touch-controls.test.mjs` | **신규.** digit-bar 렌더·press 상태·가시성·입력요소 금지 불변식 | 유효 |
| `tests/js/ctrl-navigation.test.mjs` | **신규.** Ctrl+방향키/Home/End 회귀, OS 단축키 비침범 | 유효 |
| `tests/js/css-dom-contract.test.mjs` | **신규.** CSS 셀렉터 ↔ JS 생성 DOM 대조(선행 결함의 회귀 가드) | 유효 |
| `tests/js/bootstrap.test.mjs` | SC3 메모 채택 회귀 테스트 2건 추가 | 유효 |
| `tests/js/README.md` | 실패하던 실행 명령·`STATICFILES_DIRS` 서술 정정 | 유효 |

### 5.1 참조한 파일 (수정하지 않음)

| 파일 | 설명 |
| --- | --- |
| `docs/claude-mhj_26_07_30_01_sudoku-unified-plan.xml` | 승인된 통합 계획. UI-B12 의사코드(line 4693)의 `enableAdapters(store)`가 근본 원인 규명 근거 |
| `docs/unified-acceptance-report.md` | "wired through `main.js`" 서술이 작성 시점엔 사실이 아니었음. 다른 세션 기록이라 미수정 |
| `game/sudoku/{dlx,solver,generator,spec}.py` | Python 엔진. 품질 양호, 변경 불필요 판정 |
| `game/static/game/js/core/store.js`, `ui/app-shell.js` | 다른 세션이 00:32에 `store.notifyAll()` 추가. 본 세션 작업과 충돌 없음 |
| `tests/js/helpers/fake-dom.mjs` | 테스트 하네스 능력 조사(리스너·focus·closest·inert 지원 확인) |

### 5.2 임시 산출물에서 프로젝트로 이관 완료

세션 종료 시 소실되는 scratchpad에 있던 자산 중 아래 3개를 프로젝트로 옮겼다 (2026-07-31).

| 이관 후 경로 | 설명 | 상태 |
| --- | --- | --- |
| `docs/claude-mhj_26_07_31_02_superseded-main-js.js` | 다른 세션이 작성한 250줄 조립 구현. **git 히스토리에 없는 유일한 사본**(overwrite 당시 untracked). 상단에 supersede 배너 추가 | SUPERSEDED — `js/main.js` + `js/app.js`가 대체 |
| `tools/browser-smoke.mjs` | CDP 스모크 드라이버 18항목. 렌더·키보드·Ctrl+방향키·포인터·다이얼로그·persistence | 유효 |
| `tools/browser-audit.mjs` | CDP 감사 드라이버 40항목. 실행취소·후보 모드·메모·설정·공유 왕복·손상 프래그먼트·새 게임·전체 지우기 | 유효 |

두 도구는 이관 후 새 경로에서 재실행해 **18/18, 40/40 PASS 및 exit 0**을 확인했다.
엔드포인트는 `APP_URL`/`CDP_URL` 환경변수로 바꿀 수 있고, 실행 전제(runserver + headless Chrome CDP)는
각 파일 헤더에 기재했다.

**이관하지 않고 소실되는 것 (재현 가능하므로 보존 불필요):** `probe*.mjs`(개별 결함 측정),
`shot*.mjs`·`board*.png`(스크린샷), `dom.html`, `server*.log`, `chrome*.log`, `chrome-*/`(프로필).

### 5.3 저장소 상태

| 경로 | branch | 비고 |
| --- | --- | --- |
| `C:\Users\mhj21\Desktop\workspace\sudoku_django` | `main` | 커밋·푸시 **미수행**. 소스 파일 수정함 |

- `game/static/`, `tests/`, `tools/`는 여전히 **untracked(`??`)**. 본 세션 산출물 대부분이 여기 포함된다.
- `game/templates/game/index.html`은 ` M`.
- **git 인덱스 불일치: 해결됨 (2026-07-31).** 이전에는 `game/dlx.py`의 삭제가 미스테이징(` D`)이고
  `legacy/game.js`·`legacy/style.css`는 rename만 스테이징된 채 실체가 없어(`RD`), 커밋 시 디스크에 없는
  파일이 기록되고 구버전 `game/dlx.py`가 트리에 남는 상태였다. 세 건의 삭제를 스테이징해 인덱스와
  워킹트리를 일치시켰다. 현재 staged 상태:

  ```
  D  game/dlx.py
  D  game/static/game/css/style.css
  D  game/static/game/js/game.js
  ```

  세 파일 모두 커밋 `01d8051`에 그대로 남아 있어 되돌릴 수 있다:
  `git checkout 01d8051 -- <path>` (각각 7067 / 1407 / 2948 bytes).
- **커밋은 여전히 미수행.** 삭제 스테이징 외에 새 파일은 스테이징하지 않았다.

---

## 6. 다음 단계 대기 항목

| 구분 | 항목 |
| --- | --- |
| 대기 | **커밋 미수행.** 인덱스 불일치는 해소되었으므로 차단 요인은 없다. 새 파일(`game/static/`, `tests/`, `tools/`, `docs/`)의 스테이징 범위와 커밋 메시지만 정하면 된다 |
| 승인 대기 | Phase 1 System Design 문서를 파일로 남길지 여부(OQ-2). 현재 대화에만 존재하며 파일 미작성 |
| 승인 대기 | `docs/unified-acceptance-report.md`의 "wired through `main.js`" 서술 정정 여부 |
| 기능 개선 | 이미 열린 탭에 공유 링크를 붙여넣어도 반응 없음(`hashchange` 리스너 부재, 새로고침 필요) |
| 기능 개선 | 공유 다이얼로그가 링크 문자열을 표시하지 않음(클립보드 거부 시에만 선택 가능 입력 노출) |
| 기능 개선 | 메모 편집기 Escape 미배선. `notes-view.js`에 `isOpen` 노출이 선행 필요 |
| 기능 개선 | `favicon.ico` 404 (콘솔에 남는 유일한 에러, 무해) |
| 검토 | `/api/new-puzzle/`가 클라이언트가 버리는 `solution`을 전송. 변경 시 `test_views.py` 계약 수정 동반 |
| 검증 | axe·스크린리더·실기기 항목은 `NOT RUN` 상태로 남아 있음 |
