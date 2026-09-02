# 홈페이지 완성도 향상 계획

작성일: 2026-09-02
근거 문서:

- `docs/codex-mhj_26_08_27_03_monetization-search-visibility-deep-analysis.md`
- `docs/codex-mhj_26_08_27_04_advertising-deep-research.md`
- `docs/codex-mhj_26_08_27_05_monetization-seo-advertising-master-plan.md`

근거 문서는 2026-08-27 기준이다. 이 계획서는 그 시점 이후의 실제 저장소 상태를
다시 실사한 결과를 반영한다.

---

## 0. 결론

근거 문서가 "필요"라고 적은 검색 메타데이터 작업의 상당 부분은 이미 구현돼 있다.
남은 완성도 격차는 **브랜드 자산(favicon·공유 이미지·구조화 데이터)**, **측정
기반**, **재방문 기능**, 그리고 **실제 기능을 제공하는 별도 URL**이다.

광고 구현은 이 계획서의 범위에 포함하지 않는다. 근거 문서 05 §15가 승인과 완주량
확인 전 구현을 금지하고 있고, 현재 방문·완주 데이터가 존재하지 않아 판단 근거가
없기 때문이다.

---

## 1. 현재 상태 실사

근거 문서 대비, 실제 코드에서 확인한 사실이다.

### 1.1 이미 구현되어 있음

- `tools/build_pages.mjs`가 4개 페이지(`/`, `/en/`, `/rush/`, `/en/rush/`)를
  `game/static/game/js/i18n/messages.js`에서 생성한다.
- URL별 고유 `title`·`meta description`
- 자기 참조 canonical
- ko / en / x-default `hreflang` 상호 참조 (게임 단위로 그룹 분리)
- `og:type`, `og:url`, `og:title`, `og:description`, `og:locale`
- `robots.txt` — `/api/` 차단과 sitemap 선언
- `sitemap.xml` — 그룹별 `xhtml:link` alternate, 자기 참조 포함
- 게임 간·언어 간 실제 `<a>` 링크 (`game/static/game/js/ui/page-links.js`)
- 시각적으로 숨긴 `h1`과 `noscript` 폴백
- 라이트/다크 `theme-color`

### 1.2 없음

| 항목 | 확인 방법 |
|---|---|
| favicon 일체 | `grep -rl favicon game/static game/templates` → 0건 |
| `og:image` / `twitter:image` | 0건. `twitter:card`는 `summary` |
| JSON-LD | `application/ld+json` 0건 |
| web manifest | 0건 |
| footer / 개인정보처리방침 | 페이지 자체가 없음 |
| Classic 완주 결과 카드 | `ui/app-shell.js`는 `dataset.state="solved"`와 announce만 |
| 개인 기록 영속화 | 없음 |
| 분석 비콘 | 없음 (기준선 데이터 0) |
| 기능형 별도 URL | 없음 |
| 독립 도메인 | `tools/build_pages.mjs:11`의 `ORIGIN`이 `sudoku-bw7.pages.dev` 고정 |

### 1.3 재사용 가능한 기존 자산

`game/static/game/js/rush/techniques.js`는 순수 함수로 다음을 이미 제공한다.

- `findAll(values)` — 현재 판에서 성립하는 확정 추론 전체를 기법 종류와 함께 반환
- 각 후보가 자기 추론의 **근거 유닛**을 함께 보유
- `assistCells` / `assistUnits` / `visibleSupports` — 근거만 남기고 가리는 뷰 지원
- `TECHNIQUES`, `HARDNESS`, `ASSISTS` 상수
- ko/en 기법 설명 문자열이 `messages.js`에 `rush.technique.*` 키로 존재
- `tests/js/techniques.test.mjs`가 "판을 근거 유닛만 남기고 마스킹한 뒤 추론이
  재현되는가"로 이 파일의 정직성을 검증

현재 구현된 기법은 `naked-single`, `hidden-single-box`, `hidden-single-line`
3종이다. 파일 주석이 밝힌 대로 pointing pair 등 **소거형 기법은 칸을 확정하지
못해 Rush의 출제 형식에 맞지 않으므로 의도적으로 제외**돼 있다.

---

## 2. 제약 조건

근거 문서 05 §1에서 확정된 제품 원칙을 전부 유지한다.

- 퍼즐 생성에 시드를 사용하지 않는다.
- 게임 화면에 규칙 설명이나 SEO용 본문을 추가하지 않는다.
- 게임판·조작 버튼 주변에 광고를 배치하지 않는다.
- 숨은 설명문, 화면 밖 텍스트, 키워드 반복을 사용하지 않는다.
- 실시간 퍼즐 생성 성능을 저하시키지 않는다.
- 계정·데이터베이스를 도입하지 않는다.

추가로 이 저장소의 기존 결정을 유지한다.

- npm 의존성을 추가하지 않는다 (현재 `package.json` 자체가 없다).
- 브라우저가 필요한 도구는 CDP를 직접 사용한다 (`tools/browser-*.mjs` 방식).

---

## 3. 작업 블록

### 블록 A — 브랜드 자산

게임 UI를 변경하지 않고, 도메인 결정에도 의존하지 않는다.

1. favicon 세트 — SVG 마스터, `favicon.ico`, 48px 배수 PNG(48/96/192/512),
   `apple-touch-icon` 180px
2. `1200×630` OG 이미지 2종 (Classic / Rush)
3. `og:image`·`twitter:image` 주입, `twitter:card`를 `summary_large_image`로 승격
4. `site.webmanifest` — 이름, 아이콘, `theme_color`, `display: standalone`
5. JSON-LD — 4페이지 공통 `WebSite` + 페이지별 `VideoGame`

JSON-LD에 가격·평점·리뷰 필드를 넣지 않는다. 실제로 제공하지 않는 구조화 데이터는
근거 문서 05 §3.6의 금지 항목이다.

구현 지점은 `tools/build_pages.mjs`와 `game/templates/game/*.html`이며, 문자열은
`i18n/messages.js`에 `meta.*` 키로 추가한다
(`tests/js/no-hardcoded-strings.test.mjs`가 이미 이를 강제한다).

### 블록 B — 도메인·측정 기반

6. 독립 도메인·서비스명 확정 → `ORIGIN` 상수 한 곳 교체로 canonical·hreflang·
   sitemap·OG가 모두 따라간다
7. `pages.dev` → 신규 도메인 301
8. Cloudflare Web Analytics 삽입 (쿠키 없음 → CMP 불필요)
9. Search Console / Naver Search Advisor / Bing 소유 확인, sitemap 제출, 색인 검사

**6은 사용자 결정 사항이고, 8·9는 계정 접근이 필요해 에이전트가 실행할 수 없다.**
코드 측 준비(ORIGIN 파라미터화, 소유확인 파일 배치 경로, 리다이렉트 규칙)까지가
구현 범위다.

### 블록 C — 재방문 기능

근거 문서 05 §4.1의 상위 항목만 채택한다.

10. Classic 완주 결과 카드 — 난이도 / 시간 / 실수 수 / 개인 최고 기록.
    기존 `ui/dialog-host.js` 재사용, 완주 시점에만 표시
11. 로컬 개인 기록 — 난이도별 최고 시간, 총 완주 수.
    `state/persistence.js` 스키마 확장
12. Rush 최고 점수·최고 콤보 영속화 — 값 계산은 `rush/score.js`에 이미 있음

근거 문서 05 §4.2대로 한 번에 하나씩 추가하고 완주·재시작 지표를 비교한다.

`/daily-sudoku/`는 제외한다. 전 세계 공통 퍼즐은 서버 영속 저장소를 요구해
"데이터베이스 없음" 구조를 깨고, 로컬 전용 버전은 검색 가치가 낮다.

### 블록 E — `/learn/` 풀이 연습 페이지

근거 문서 05 §3.4가 요구한 "설명용 글이 아니라 실제 기능을 제공하는 별도 URL"에
해당한다. 동시에 근거 문서 03이 지적한 `low-value content` 리스크(본문이 거의 없는
앱 셸 4개)에 대한 실질적 대응이다.

**URL:** `/learn/`, `/en/learn/`
`build_pages.mjs`의 `PAGE_KINDS`에 세 번째 종류를 추가하면 hreflang·sitemap·
canonical이 자동으로 따라간다.

**동작 (한 스텝 루프):**

1. `/api/new-puzzle/`로 판을 받아 목표 기법이 성립할 때까지 진행 —
   별도 퍼즐 저장소 불필요, 시드 미사용 원칙 유지
2. `findAll`로 대상을 고르고 출제
3. 답하면 `assistCells`가 반환한 근거만 강조하고 이유 문장을 표시
4. 틀리면 근거를 먼저 보여주고 재시도 — 시간 제한·생명·점수 없음 (Rush와 구별)

**엔진 확장 (결정됨):** 1차부터 소거형 기법을 포함하도록 `techniques.js`를 확장한다.
확정형 3기법만 먼저 내는 축소안은 채택하지 않는다.

소거형 기법은 칸을 확정하지 않고 후보를 지우므로, 출제 형식과 근거 표현 모두
새로 정의해야 한다. 상세 설계는 별도 staged-development 문서에서 다룬다.

**재사용:** `techniques.js`, `core/spec.js`, `ui/board-view.js`, `ui/dialog-host.js`,
`ui/announcer.js`, `ui/page-links.js`

**제외:** 계정, 서버 저장 진도. 진도는 `localStorage`.

### 블록 D — 기능형 페이지

13. 작은 footer 1줄 — 개인정보처리방침, 문의
14. `/privacy/` — 분석 도구·`localStorage` 사용 범위 고지 (블록 B 8번과 세트)
15. `/printable-sudoku/` — 실제 무료 샘플 PDF
16. `/business/` — 접근성 화이트라벨 문의

---

## 4. 순서

```
A 브랜드 자산  ─┐
                ├─→ C 재방문 기능
B 도메인·측정  ─┤
                └─→ E /learn/  ─→  D 기능형 페이지
```

확정된 착수 순서는 **A → E**다.

E를 D보다 앞에 두는 이유: `/printable-sudoku/`나 `/business/`와 달리 E는 새
인프라도, 도메인 결정도, PDF 파이프라인도 요구하지 않고 기존 엔진을 재사용하므로
완성도 대비 비용이 가장 낮다. 검색 측면에서도 풀이 기법 관련 검색어는 근거 문서
05 §3.3의 목표 검색어보다 경쟁이 현실적이다.

---

## 5. 검증 게이트

블록 완료 시마다 다음을 실행한다.

```
node --test "tests/js/*.test.mjs"
```

디렉터리가 아니라 glob을 넘겨야 한다 (`tests/js/README.md` 참조).

블록별 중점 항목:

| 블록 | 중점 검증 |
|---|---|
| A | `localized-pages`, `cloudflare-pages`, `canonical`, `no-hardcoded-strings` / 신규 자산 URL `200` |
| B | `canonical`, `cloudflare-pages` / 4 URL `200`, canonical 자기 참조, sitemap 오류 0 |
| C | `persistence`, `serialize`, `store`, `rush-state` |
| E | `techniques`, `rush-engine`, `rush-swap` 무회귀 / `localized-pages`에 `/learn/` 추가 |

공통:

- 생성·유일해 회귀 — `generator.test.mjs`, `new-puzzle-generation.test.mjs`
- 접근성 회귀 0 — `tools/check-contrast.mjs`, `tools/browser-audit.mjs`
- 근거 강조가 색상만으로 전달되지 않을 것 (블록 E)

---

## 6. 결정 기록

| 일자 | 결정 |
|---|---|
| 2026-09-02 | 착수 순서를 A → E로 확정 |
| 2026-09-02 | 블록 E는 1차부터 소거형 기법을 포함하도록 엔진을 확장한다 |
| 2026-09-02 | 광고 구현은 이 계획서 범위에서 제외 |
| 2026-09-02 | `/daily-sudoku/`는 서버 저장소 요구로 제외 |

## 7. 미결 사항

- 독립 도메인과 서비스명 (블록 B 전체가 여기서 대기)
- Search Console / Naver / Bing 계정 접근 (에이전트 실행 불가)
- 블록 E 소거형 기법의 출제 형식과 근거 표현 — staged-development System Design에서 확정
