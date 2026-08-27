# 스도쿠 게임 수익화 및 검색 노출 심층 분석

작성일: 2026-08-27  
분석 대상: `sudoku_django` 현재 작업 트리와 `https://sudoku-bw7.pages.dev/` 공개 배포본

---

## 0. 요약 결론

이 프로젝트는 이전 분석 시점보다 분명히 좋아졌다. 한국어 전용이라는 제약은
한국어·영어 2개 언어 지원으로 해소됐고, 단일 클래식 게임에서 `Rush`라는 별도
게임 모드가 추가됐다. 클래식은 5단계 난이도 선택을 제공하며, 생성기는 시드나
사전 퍼즐 풀 없이 매 요청마다 퍼즐을 생성하고 반환 전 유일해를 검증한다.

그러나 수익화의 가장 큰 병목은 여전히 **제품 기능이 아니라 발견성과 실제 이용자
규모**다. 2026-08-27 공개 검색에서 `site:sudoku-bw7.pages.dev` 결과를 확인하지
못했고, Search Console·Naver Search Advisor 데이터는 접근할 수 없어 실제 색인과
노출량은 미확인 상태다. 공개 페이지는 모두 HTTP `200`이고 robots와 sitemap도
정상이므로, 현재 우선순위는 기능 추가나 광고 삽입이 아니라 **최신 버전 배포,
검색엔진 소유 확인, 색인 제출, 고유 도메인·브랜드 결정, 측정 기반 확보**다.

광고는 지금 붙이지 않는 것이 합리적이다. 이유는 세 가지다.

1. 현재 사이트는 4개 앱 셸 페이지가 전부이며 검색엔진과 AdSense가 평가할 수 있는
   본문이 매우 적다. 게임 자체는 독창적인 상호작용 콘텐츠지만 AdSense의
   `low-value content` 또는 `insufficient content` 심사 위험이 실재한다.
2. Google은 게임 영역과 광고를 충분히 분리하라고 권고하며, 광고를 버튼·게임판
   근처에 두면 우발 클릭 정책 위험이 있다. 현재의 집중형 UI와 충돌한다.
3. AdSense를 사용하면 개인정보처리방침, 광고 쿠키 고지, 지역에 따른 동의 관리
   플랫폼이 필요하다. 따라서 “게임 UI 완전 무변경”과 글로벌 광고 수익화는 함께
   달성할 수 없다.

권장 전략은 다음과 같다.

- **소비자 경로:** 먼저 기술 SEO와 외부 배포를 정비하고 광고 없이 실제 유입과
  재방문을 측정한다. 검색 유입이 검증된 뒤에만 최소 광고 실험을 검토한다.
- **수익 경로:** 핵심 게임 UI를 보존하려면 접근성 중심 화이트라벨/B2B, 퍼즐 생성
  API 라이선스, 인쇄·출판 공급이 광고보다 적합하다.
- **가장 빠른 회수 경로:** 접근성·DLX 생성·유일해 검증 과정을 포트폴리오와
  기술 신뢰 자료로 사용해 개발·컨설팅 리드로 연결한다.

이 문서는 법률·세무·투자 자문이 아니다. 광고와 개인정보 처리는 실제 서비스
대상 국가와 사업자 상태에 맞춰 별도 검토해야 한다.

---

## 1. 조사 범위와 방법

### 1.1 조사 범위

- 현재 코드와 정적 배포 구조
- 실제 공개 URL의 응답·메타데이터·robots·sitemap
- Google·Naver·Bing 검색 색인 경로
- Google AdSense 승인·배치·개인정보 정책
- Cloudflare Pages/Workers 비용 구조
- 현재 제품 자산과 경쟁 서비스 대비 차별점
- 광고·구독·후원·B2B·API·출판 모델의 적합성
- UI를 훼손하지 않는 검색 노출·수익화 실행 순서

### 1.2 사실·가정·미확인 항목 구분

| 구분 | 내용 |
|---|---|
| 확인된 사실 | 공개 4개 페이지와 robots/sitemap은 HTTP `200` |
| 확인된 사실 | Pages Function은 `/api/new-puzzle/` 하나이며 요청마다 실시간 생성 |
| 확인된 사실 | 한국어·영어 클래식과 Rush 페이지가 존재 |
| 확인된 사실 | 광고, 분석 비콘, CMP, 개인정보처리방침, 결제, 계정, JSON-LD, favicon이 없음 |
| 확인된 사실 | Workers Paid 최소 요금은 월 `$5`, 정적 자산 요청은 무료·무제한 |
| 확인된 사실 | 로컬 최신 description과 공개 배포본 description이 불일치 |
| 미확인 | Google·Naver·Bing의 실제 색인 상태와 노출 수 |
| 미확인 | 월 사용자, 세션, 재방문율, 완주율, 국가 분포 |
| 미확인 | AdSense 승인 가능 여부와 실제 RPM |
| 미확인 | B2B·출판 구매자의 실제 지불 의사 |
| 가정 | 광고 수익표의 RPM `$0.5/$2/$5`는 예측이 아닌 민감도 시나리오 |

Google은 사이트별 광고 RPM을 보장하지 않는다. 따라서 본 문서는 임의 RPM 하나를
매출 예측치로 사용하지 않고 여러 값에 대한 산술 결과만 제공한다.

---

## 2. 기존 2026-08-07 분석에서 달라진 점

기존 `claude-mhj_26_08_07_04_monetization-plan.md`의 핵심 결론은 B2C 광고보다
B2B 자산 활용이 유리하다는 것이었다. 방향은 여전히 유효하지만 아래 전제는
현재 사실이 아니다.

| 이전 전제 | 현재 상태 | 의미 |
|---|---|---|
| 한국어 전용 | 한국어·영어 정적 페이지 존재 | 해외 검색·B2B 진입 장벽 일부 해소 |
| 단일 클래식 게임 | 클래식 + Rush | 검색 의도와 재방문 동기 확장 |
| 힌트 수 직접 선택 | 5단계 난이도, 구간 내 단서 수 무작위 선택 | 일반 사용자가 이해하기 쉬운 진입 구조 |
| 별도 경쟁 요소 없음 | Rush에 점수·콤보·목숨·최고 기록 존재 | 짧은 세션형 콘텐츠 확보 |
| 퍼즐 유일해 대표 테스트 | `22..50` 각 100개, 총 2,900개 독립 검사 전부 유일해 | 품질 주장 근거 강화 |

반대로 아직 바뀌지 않은 병목도 있다.

- 고유 도메인과 서비스 브랜드가 없다.
- 검색엔진 도구 등록 여부와 실제 유입 데이터가 없다.
- 소비자 결제 이유가 될 계정·동기화·아카이브·프리미엄 콘텐츠가 없다.
- 광고를 넣기 위한 정책·개인정보·배치 준비가 없다.
- 출판용 난이도를 보장할 인간 풀이 기법 분석은 없다.

---

## 3. 현재 제품 및 인프라 실사

### 3.1 소비자 기능

클래식 모드는 다음을 제공한다.

- 입문·쉬움·보통·어려움·전문가 난이도
- 매 새 게임 실시간 퍼즐 생성
- 정답이 하나인 퍼즐만 반환
- 후보 숫자, 자동 후보 제거, 실행 취소·다시 실행
- 규칙 위반 및 정답 확인
- 키보드·터치 입력
- 진행 상태 자동 저장
- 문제·진행·메모 범위별 링크 공유
- 한국어·영어 전환
- 다크 모드와 접근성 안내

Rush는 다음을 별도로 제공한다.

- 제한시간 내 확정 칸 입력
- 점수·콤보·목숨
- 단계가 진행될수록 감소하는 제한시간
- 로컬 최고 기록
- 클래식과 분리된 URL·메타데이터

이는 “기본 스도쿠 하나”보다 제품성이 높다. 다만 소비자 입장에서 유료 결제를
유도할 만큼의 계정 동기화, 장기 기록, 독점 퍼즐, 전 세계 공통 일일 퍼즐,
멀티플레이, 광고 제거 상품은 아직 없다.

### 3.2 생성 엔진

배포 환경은 Cloudflare Pages Function에서 DLX 기반 완성 보드를 생성한 뒤 단서를
제거한다. 단서는 유일해가 유지된다고 증명될 때만 제거하며 반환 직전 전체 유일해
검사를 다시 수행한다. 퍼즐 풀이 상태는 서버에 저장하지 않는다.

난이도별 단서 범위:

| 난이도 | 단서 수 |
|---|---:|
| 입문 | 45–50 |
| 쉬움 | 38–44 |
| 보통 | 32–37 |
| 어려움 | 26–31 |
| 전문가 | 22–25 |

주의할 점은 단서 수가 인간의 체감 난이도와 일대일 대응하지 않는다는 것이다.
현재 분류는 빠르고 일관된 제품 구간으로는 유효하지만, “특정 풀이 기법이 필요한
출판용 어려움”을 보증하는 등급은 아니다.

### 3.3 배포와 비용

- 정적 파일: `game/static`
- 동적 함수: `/api/new-puzzle/`
- DB·KV·R2·사용자 계정 없음
- 정적 JavaScript 원본 합계: 약 `174,845 bytes`
- 정적 CSS 원본 합계: 약 `30,156 bytes`
- 공개 HTML 한 페이지: 약 `2.2–2.3 KB`
- Worker CPU 상한 설정: 요청당 `10,000 ms`

Cloudflare의 2026-08-25 공식 요금 기준 Workers Paid는 계정당 월 최소 `$5`다.
포함량은 월 1,000만 요청과 3,000만 CPU-ms이며 정적 자산 요청은 무료·무제한이다.
Pages Functions는 Workers로 과금된다.

평균 CPU 시간이 달라질 때 포함량 안에서 가능한 퍼즐 요청 수의 산술 상한은
다음과 같다.

| 퍼즐당 평균 CPU | CPU 기준 요청 수 | 요청 포함량 반영 상한 |
|---:|---:|---:|
| 1 ms | 30,000,000 | 10,000,000 |
| 3 ms | 10,000,000 | 10,000,000 |
| 7 ms | 약 4,285,714 | 약 4,285,714 |
| 20 ms | 1,500,000 | 1,500,000 |
| 50 ms | 600,000 | 600,000 |

이는 용량 시나리오이며 실제 Workers CPU 측정값이 아니다. 그래도 현실적인 초기
트래픽에서 인프라 비용보다 유입과 수익 모델이 먼저 병목이 된다는 결론은 강하다.

### 3.4 현재 공개 배포본

2026-08-27 직접 확인 결과:

| URL | 상태 | 비고 |
|---|---:|---|
| `/` | 200 | 한국어 클래식 |
| `/en/` | 200 | 영어 클래식 |
| `/rush/` | 200 | 한국어 Rush |
| `/en/rush/` | 200 | 영어 Rush |
| `/robots.txt` | 200 | `/api/`만 제외 |
| `/sitemap.xml` | 200 | 4개 URL과 `hreflang` 포함 |

공개 클래식 페이지는 아직 “힌트 갯수를 골라”라는 이전 description을 사용한다.
로컬 최신 정적 파일은 “난이도를 골라”로 변경돼 있으므로 배포가 뒤처진 상태다.
검색 최적화 전에 배포본과 저장소의 기준을 일치시켜야 한다.

---

## 4. 검색 노출 심층 분석

### 4.1 색인과 순위를 분리해야 한다

검색 노출에는 서로 다른 두 문제가 있다.

1. **색인:** 검색엔진이 URL을 발견하고 저장했는가.
2. **순위:** 색인된 URL이 특정 검색어에서 경쟁 페이지보다 적합하다고 평가되는가.

현재 기술 상태는 색인 가능한 편이다. `200`, canonical, 상호 `hreflang`, robots,
sitemap이 존재하고 `noindex`가 없다. 그러나 sitemap 제출과 URL 소유 확인 여부를
모르며 공개 `site:` 검색에서도 결과를 찾지 못했다. 먼저 색인 문제를 Search
Console과 Search Advisor로 확인해야 한다.

Google은 sitemap이나 URL 제출이 색인을 보장하지 않는다고 명시한다. 제출은 발견을
돕는 힌트이며, 최종 색인은 콘텐츠 품질과 시스템 판단에 달려 있다.

### 4.2 현재 SEO 상태의 정성 평가

점수는 공식 지표가 아니라 우선순위를 비교하기 위한 내부 평가다.

| 영역 | 평가 | 근거 |
|---|---:|---|
| 크롤링 가능성 | 8/10 | `200`, robots 허용, sitemap 존재 |
| canonical/다국어 | 8/10 | 2개 언어, 상호 `hreflang` 구성 |
| 검색엔진 제출 | 2/10 | 계정 데이터와 제출 상태 미확인 |
| 검색 결과 문구 | 5/10 | 고유 title/description은 있으나 배포본이 오래됨 |
| 구조화 데이터 | 0/10 | JSON-LD 없음 |
| 검색 브랜딩 | 1/10 | 고유 도메인·고유 사이트명·favicon 없음 |
| 공유 미리보기 | 3/10 | OG 텍스트는 있으나 이미지 없음 |
| 본문 검색 적합성 | 2/10 | 초기 HTML은 앱 셸이고 설명 콘텐츠가 거의 없음 |
| 외부 권위 | 미확인 | 공개 검색에서 도메인 언급을 찾지 못함 |
| 측정 | 1/10 | Search Console·분석 도구 상태 미확인 |

### 4.3 UI 비변경 조건에서 가능한 검색 개선

다음 항목은 게임판과 조작 UI를 바꾸지 않는다.

#### A. 최신 배포와 검색엔진 등록

- 로컬 최신 정적 페이지 배포
- Google Search Console URL-prefix 속성 등록
- `/sitemap.xml` 제출
- 4개 URL Inspection 및 색인 요청
- Naver Search Advisor 등록·소유 확인·sitemap 제출
- Bing Webmaster Tools 등록 또는 Search Console 가져오기
- 배포 변경 시 Naver/Bing IndexNow 알림

이 단계는 순위 개선보다 “검색엔진이 사이트를 알고 있는가”를 확정한다.

#### B. 검색 의도에 맞는 정적 메타데이터

권장 제목:

| URL | 권장 제목 |
|---|---|
| `/` | `무료 온라인 스도쿠 게임 | 난이도별 새 퍼즐` |
| `/en/` | `Free Online Sudoku Game | New Puzzle by Difficulty` |
| `/rush/` | `스도쿠 러시 | 무료 타임어택 스도쿠 게임` |
| `/en/rush/` | `Sudoku Rush | Free Timed Sudoku Game` |

`meta description`은 순위를 보장하지 않지만 검색 결과 설명 후보가 된다. 페이지마다
실제 기능을 한 문장으로 설명하고 키워드를 반복하지 않는다. `meta keywords`는
Google이 색인·순위에 사용하지 않으므로 추가하지 않는다.

#### C. 검색 결과 브랜딩

- 고유 서비스명 결정
- 가능하면 고유 도메인 연결
- 기존 `pages.dev` 주소를 고유 도메인으로 `301` 리다이렉트
- `WebSite` JSON-LD로 사이트명 제공
- `SoftwareApplication` + `VideoGame` JSON-LD 제공
- 최소 48px 배수의 favicon 제공
- 클래식·Rush `1200×630` 공유 이미지 제공
- `og:image`, `twitter:image`, `summary_large_image` 적용

고유 도메인은 그 자체가 순위 보장이 아니다. 다만 링크와 브랜드를 장기간 한
주소에 축적하고 소유 확인과 B2B 신뢰를 유지하기 위해, 아직 색인·백링크가 거의
없는 지금 결정하는 편이 이전 비용이 가장 낮다.

#### D. sitemap 정확성

현재 `<changefreq>monthly</changefreq>`는 Google이 사용하지 않는다. 이를 제거하고
실제 주요 변경일을 정확히 관리할 수 있을 때만 `<lastmod>`를 제공한다. 빌드할
때마다 현재 날짜로 갱신하는 방식은 사용하지 않는다.

#### E. 외부 발견 경로

본문 설명 없이 일반 `스도쿠` 검색어 상위를 얻기는 어렵다. 자체 UI를 건드리지
않고 검색 신뢰를 만드는 현실적인 방법은 외부에서 실제 이용 가치가 있는 링크를
얻는 것이다.

- 공개 저장소 README의 라이브 데모 링크
- 개발 과정과 유일해 검증을 다룬 기술 글
- 접근성 구현 사례 글
- 웹 게임·오픈소스·접근성 관련 디렉터리 등록
- 완주 결과 공유 카드와 동일 퍼즐 도전 링크
- 스팸이 아닌 관련 커뮤니티의 실제 사용 후기·소개

링크 구매, 자동 디렉터리 대량 등록, 키워드 앵커 반복은 제외한다.

### 4.4 UI 비변경 조건의 한계

Google은 사용자가 검색할 단어를 title뿐 아니라 주요 제목과 페이지의 눈에 보이는
위치에 배치하라고 권장한다. 또한 snippet은 주로 페이지 본문에서 생성한다.
현재 페이지는 JavaScript가 게임 UI를 렌더링하며 초기 HTML 본문에는 접근성용
제목과 `noscript` 안내만 있다. Google은 JavaScript를 렌더링할 수 있지만,
메타데이터만으로 콘텐츠 관련성과 사이트 권위를 충분히 만들 수는 없다.

따라서 사용자 조건을 유지하면 목표 검색어를 좁혀야 한다.

- 클래식: `무료 온라인 스도쿠 게임`, `설치 없는 스도쿠`
- Rush: `스도쿠 러시`, `타임어택 스도쿠`
- 차별점: `유일해 스도쿠`, `접근성 스도쿠`, `키보드 스도쿠`

`스도쿠` 한 단어의 상위 노출은 단기 목표로 삼지 않는다.

### 4.5 금지할 SEO 방식

- 화면 밖에 SEO 설명문 배치
- `opacity: 0`, `font-size: 0`, 흰색 글자 사용
- `<noscript>`에 키워드 문단 삽입
- 존재하지 않는 평점·리뷰 구조화 데이터
- 난이도 이름만 바꾼 중복 페이지 생성
- 무작위 퍼즐마다 색인 URL 생성
- `meta keywords` 추가
- 검색어를 반복한 title·description

화면 판독기를 위한 현재 `visually-hidden` 제목은 사용자 접근성을 위한 것이므로
유지할 수 있다. 검색 조작만을 위한 숨은 본문은 Google 스팸 정책 위험이 있다.

---

## 5. 경쟁 환경과 제품 포지션

대형 소비자 스도쿠 서비스는 단순 게임판 외에 다음을 결합한다.

- Easybrain/Sudoku.com: 여러 난이도, 일일 도전, 이벤트, 트로피, 토너먼트
- Brainium: 이유를 설명하는 힌트, 일일 퍼즐, 상세 통계, 테마
- Apple News+: 구독 번들 안의 일일 퍼즐, 아카이브, 연속 기록, 순위표, 공유
- Cracking the Cryptic: 수제 퍼즐과 상세 힌트를 유료 가치로 전환

이들과 기능 수나 일반 검색 권위로 정면 경쟁하는 것은 비효율적이다. 현재
프로젝트가 방어할 수 있는 축은 다음과 같다.

1. 요청마다 새로 생성하면서 유일해를 강제하는 엔진
2. 키보드·터치·스크린리더를 함께 고려한 접근성
3. 가벼운 정적 배포와 낮은 운영비
4. 일반 클래식과 짧은 Rush를 한 제품 안에서 제공
5. 계정·가입 없이 바로 플레이하는 단순성

포지션 문장은 다음처럼 좁히는 것이 적절하다.

> 설치와 가입 없이 바로 시작하고, 매번 새로 생성된 유일해 퍼즐을 키보드와
> 터치로 편하게 풀 수 있는 가벼운 온라인 스도쿠.

이 문장을 게임 화면에 표시할 필요는 없다. 검색 description, 외부 소개, B2B
자료에서 일관되게 사용하면 된다.

---

## 6. 수익 모델 재평가

평가는 1점이 낮고 5점이 높다. 기대수익과 시장성은 아직 검증되지 않은 정성
평가다.

| 모델 | 현재 준비도 | UI 보존 | 자산 적합도 | 초기 비용 | 권고 |
|---|---:|---:|---:|---:|---|
| AdSense 디스플레이 광고 | 1 | 1 | 2 | 2 | 트래픽 검증 후 조건부 |
| 직접 스폰서 | 1 | 3 | 2 | 2 | audience 확보 후 |
| 후원 링크 | 2 | 4 | 2 | 1 | 보조 수단 |
| B2C 구독·일회 결제 | 1 | 2 | 2 | 4 | 현재 보류 |
| 앱스토어 패키징 | 2 | 2 | 2 | 3 | 웹 수요 확인 후 |
| 생성 API 라이선스 | 2 | 5 | 4 | 3 | 중기 후보 |
| 접근성 화이트라벨/B2B | 3 | 5 | 5 | 3 | 우선 후보 |
| 인쇄·출판 퍼즐 공급 | 2 | 5 | 4 | 2 | 보조 후보 |
| 포트폴리오·컨설팅 리드 | 4 | 5 | 5 | 1 | 즉시 활용 |

### 6.1 AdSense

#### 장점

- 결제 계정이나 유료 기능 없이 수익 실험 가능
- Google은 노출 기준 지급 구조를 제공
- 트래픽이 이미 있다면 운영 자동화가 쉬움

#### 현재 문제

- 공개 페이지가 4개뿐이고 텍스트 본문이 거의 없다.
- AdSense는 고품질·독창적 콘텐츠와 실제 audience를 요구한다.
- 정책은 publisher-content가 없거나 낮은 가치인 화면에 Google 광고를 허용하지
  않는다.
- Google의 승인 안내는 텍스트가 너무 적거나 앱·이미지 중심인 사이트가
  `insufficient content`로 거절될 수 있다고 명시한다.
- 게임판 주변 광고는 우발 클릭 위험이 있다. Google은 게임 영역에서 광고를
  충분히 떨어뜨리고, 게임 조작과 광고가 혼동되지 않게 하라고 안내한다.
- 광고 쿠키를 사용하면 개인정보처리방침이 필수다.
- EEA·영국·스위스 사용자에게 광고를 제공하면 Google 요구에 맞는 인증 CMP를
  검토해야 한다.

#### UI 정책 결론

광고를 도입하는 순간 다음은 눈에 보인다.

- 광고 슬롯
- 개인정보처리방침 링크
- 대상 지역의 동의 또는 거부 UI
- 경우에 따라 광고 설정 링크

따라서 “UI를 전혀 바꾸지 않는 광고”는 목표에서 제외해야 한다. UI 보존이
최우선이면 광고가 아닌 B2B·API·출판 경로를 택해야 한다.

#### 광고를 시험한다면

- Rush 플레이 중에는 광고를 표시하지 않는다.
- 숫자 패드, 새 게임, 정답 확인, 타이머 근처에는 배치하지 않는다.
- 광고 클릭을 후원이나 보상으로 표현하지 않는다.
- 새 퍼즐 생성 때 광고를 강제 새로고침하지 않는다.
- 모바일에서 게임판을 밀어내거나 화면을 가리는 광고를 사용하지 않는다.
- 한 번에 광고 단위 하나로 시작한다.
- Google 정책상 gameplay 영역과 충분한 거리를 확보한다.
- AdSense 승인 후 발급된 ID만 사용해 `ads.txt`를 만든다. placeholder publisher
  ID는 저장소에 넣지 않는다.

### 6.2 광고 수익 민감도

AdSense는 실제 RPM을 보장하지 않는다. 다음은 월 monetized pageview와 가상의
page RPM을 곱한 산술표일 뿐이다.

| 월 pageview | RPM $0.5 | RPM $2 | RPM $5 |
|---:|---:|---:|---:|
| 1,000 | $0.50 | $2 | $5 |
| 10,000 | $5 | $20 | $50 |
| 50,000 | $25 | $100 | $250 |
| 100,000 | $50 | $200 | $500 |
| 500,000 | $250 | $1,000 | $2,500 |

이 앱은 SPA라 여러 퍼즐을 풀어도 정상적인 새 문서 pageview가 자동으로 생기지
않는다. 사용자 한 명이 한 방문에서 여러 판을 풀더라도 광고 매출이 같은 비율로
늘어난다고 가정하면 안 된다.

월 `$5` 인프라 최소 비용만 회수하는 데 필요한 pageview도 RPM에 따라 크게
달라진다.

| 가정 RPM | 월 $5 회수 pageview |
|---:|---:|
| $0.5 | 10,000 |
| $2 | 2,500 |
| $5 | 1,000 |

이 계산은 광고 승인·fill rate·viewability·무효 트래픽·세금·CMP 비용을 반영하지
않는다. 인프라 손익분기는 낮지만, 사용자 경험을 희생할 만큼의 의미 있는 수익을
얻는 문턱은 훨씬 높다.

### 6.3 B2C 구독·일회 결제

현재 무료 게임을 유료로 바꿀 근거가 부족하다. 유료 전환에 필요한 전형적인
가치는 다음과 같다.

- 계정 간 기록 동기화
- 광고 제거
- 독점 수제 퍼즐·변형 퍼즐
- 상세 풀이 힌트와 학습 과정
- 일일 퍼즐 아카이브
- 통계·연속 기록·친구 경쟁

이 기능은 계정, 데이터베이스, 결제, 환불, 고객지원, 개인정보 처리 범위를 크게
늘린다. 검색 유입과 재방문이 검증되기 전에 구축하면 비용이 수요보다 앞선다.

### 6.4 후원과 직접 스폰서

후원 링크는 광고보다 UI 영향과 정책 부담이 작지만 audience가 없으면 수익도 거의
없다. 직접 스폰서는 이용자 성격이 명확하고 월간 이용량을 제시할 수 있을 때
AdSense보다 단가와 UI 통제가 좋아질 수 있다.

적합한 형태:

- 완주 결과 하단의 한 줄 스폰서
- 별도 B2B 페이지의 공식 후원
- 접근성·교육 관련 기관과의 캠페인

이 역시 게임판 조작 영역에는 넣지 않는다.

### 6.5 생성 API 라이선스

강점:

- 유일해 강제
- 단서 수 제어
- 밀리초급 일반 생성
- 서버 상태와 DB가 필요 없음
- JavaScript Worker에서 직접 실행

현재 부족한 것:

- API 키와 사용량 제한
- 고객별 계측과 청구
- 버전이 있는 명세
- 오류·가용성 기준
- 사용 예제와 영문 문서
- 남용·비용 폭주 방지
- 인간 풀이 기법 기반 난이도 보증

무료 오픈소스 생성기와 경쟁해야 하므로 단순히 “퍼즐 JSON 반환”만으로는 약하다.
접근성 위젯, 화이트라벨 UI, 대량 PDF 출력과 결합할 때 판매 가능성이 높아진다.

### 6.6 접근성 화이트라벨/B2B

현재 자산과 가장 잘 맞는 경로다.

잠재 고객:

- 교육·복지·시니어 프로그램
- 도서관·공공기관의 온라인 활동
- 접근성 요구가 있는 포털·미디어
- 자체 게임 개발 인력이 없는 소규모 콘텐츠 사업자

판매 단위:

- 브랜드·색상 교체가 가능한 임베드 위젯
- 자체 도메인 설치형 패키지
- 접근성 테스트 결과와 유지보수
- 한국어·영어 제공
- 클래식 또는 Rush 선택

주의할 점:

- 현재 자동 테스트가 강하다는 사실과 공식 접근성 인증은 다르다.
- “WCAG 완전 준수” 또는 “인증 완료”라고 판매하면 안 된다.
- 실제 납품 전 수동 스크린리더·모바일·브라우저 검증과 계약 범위 정의가 필요하다.

### 6.7 인쇄·출판 공급

장점:

- 생성 비용이 매우 낮다.
- 유일해 검증을 자동화할 수 있다.
- 원하는 단서 수로 대량 생성할 수 있다.

필요한 제품화:

- 중복 퍼즐 검출
- 정답지 자동 편집
- PDF/SVG 인쇄 출력
- 대량 배치 명령
- 페이지당 퍼즐 수와 여백 템플릿
- 사람 기준 난이도 검수

현재 단서 수 기반 난이도는 웹에서 빠르게 새 게임을 제공하는 데는 적합하지만,
출판사에 특정 난이도를 계약상 보장하는 기준으로는 부족하다. 이 모델을 택할 때만
오프라인 배치 분석으로 풀이 기법을 계산하면 되며, 실시간 생성 속도에는 영향을
주지 않아도 된다.

### 6.8 포트폴리오·컨설팅 리드

가장 즉시 실행할 수 있고 기대 손실이 작은 경로다.

- DLX를 Worker로 이식한 과정
- 유일해 보장 불변식
- 22–50 단서 전 구간 독립 검증
- 생성 성능 측정과 범위 결정
- 키보드·터치·스크린리더 설계
- 자동 명암비 게이트와 회귀 테스트
- Cloudflare 무상태 배포 구조

이 자료는 게임 매출이 작더라도 개발·접근성·성능 컨설팅의 신뢰 자료로 사용할 수
있다. B2B 판매의 선행 신뢰 자산이기도 하다.

---

## 7. 검색과 수익화를 결합한 권장 전략

### 7.1 1순위: 검색 기반과 측정 확보

게임 UI를 바꾸지 않고 수행한다.

1. 로컬 최신 정적 파일 배포
2. 고유 도메인·서비스명 결정
3. canonical과 sitemap을 최종 도메인으로 이전
4. `pages.dev`에서 고유 도메인으로 `301` 리다이렉트
5. Google·Naver·Bing 소유 확인과 sitemap 제출
6. 검색 의도형 title·description 적용
7. favicon·OG 이미지·JSON-LD 적용
8. sitemap `changefreq` 제거
9. Cloudflare Web Analytics 활성화
10. 4개 URL의 색인과 28일 검색 데이터를 기록

Cloudflare Web Analytics는 공식 문서상 무료이고 방문자의 개인 데이터를 수집하거나
사용하지 않는 privacy-first 분석 도구다. 페이지뷰·방문·referrer·성능을 보는
초기 도구로 적합하다. 게임 완주율까지 제공한다고 가정하지 않는다.

### 7.2 2순위: 외부 발견성과 재방문 강화

SEO 설명문을 게임 화면에 넣지 않고 진행한다.

- GitHub 또는 기술 블로그에 개발 과정 공개
- 접근성 테스트 사례 공개
- 결과 공유 카드에 난이도·시간·실수·힌트 사용 여부 표시
- 동일 퍼즐 도전 링크 제공
- 로컬 “오늘의 1판”과 연속 완주 기록 검토
- 클래식 완주 통계 제공

시드 기반 생성은 사용하지 않는다. 오늘의 1판은 해당 날짜 첫 생성 결과를
`localStorage`에 저장하는 로컬 방식으로 구현할 수 있다. 전 세계 공통 퍼즐과
글로벌 순위표가 필요하다면 시드가 아니라 서버 저장 퍼즐 ID와 영속 저장소가
필요하며, 이는 별도 제품 범위다.

### 7.3 3순위: B2B 수요 검증

트래픽과 무관하게 병행할 수 있다.

- 접근성 위젯 한 장짜리 제품 사양 작성
- 자동 검증 결과와 수동 검증 범위를 명확히 분리
- 교육·복지·퍼즐 콘텐츠 사업자 20곳을 대상으로 문제 인터뷰
- 가격표보다 파일럿 요구와 구매 절차를 먼저 확인
- 20곳에서 유의미한 회신이 전혀 없으면 화이트라벨 투자를 중단
- 생성 API 또는 인쇄 공급으로 전환

이 단계의 목표는 코드 추가가 아니라 지불 의사 검증이다.

### 7.4 4순위: 조건부 광고 실험

다음 조건을 모두 만족할 때만 진행한다.

- Google·Naver에서 핵심 URL이 색인됨
- 최소 3개의 연속 28일 데이터 구간을 확보
- 월 유기적 방문과 재방문 추세가 상승
- 개인정보처리방침과 동의 관리 준비 완료
- AdSense 승인
- 광고로 인한 UI 변경을 명시적으로 승인
- 실제 관측 RPM으로 예상 매출이 운영·정책 비용보다 충분히 큼

내부 운영 기준으로 월 유기적 세션이 10,000 미만이면 광고를 우선하지 않는다.
이는 Google의 공식 최소 트래픽 기준이 아니라, 낮은 예상 매출 때문에 UI와 정책
복잡도를 감수하지 않기 위한 프로젝트 기준이다. 월 50,000 세션 이상에서야
RPM `$0.5–$5` 시나리오가 월 `$25–$250` 범위가 되므로 제한된 광고 실험의 정보
가치가 생긴다.

---

## 8. 실행 로드맵과 중단 기준

### 단계 A — 배포·색인 기반

산출물:

- 최신 4개 정적 페이지
- 고유 title·description
- favicon과 OG 이미지
- `WebSite`/`SoftwareApplication` JSON-LD
- 정리된 sitemap
- Search Console·Search Advisor·Bing 등록 기록
- UI 무변경 스크린샷 검증

통과 기준:

- 4개 공개 URL 모두 `200`
- canonical 자기 참조
- `hreflang` 상호 참조
- 구조화 데이터 구문 오류 0
- favicon·OG 이미지 `200`
- sitemap 처리 오류 0
- 로컬 UI 회귀 테스트 통과

중단 기준:

- 없음. 비용이 낮고 이후 모든 경로의 기반이므로 완료한다.

### 단계 B — 측정

산출물:

- Search Console 28일 기준표
- Naver 노출·클릭 기준표
- Cloudflare 방문·referrer·성능 기준표
- Workers `/api/new-puzzle/` 요청량 기준표

기록 지표:

- 색인 URL 수
- 검색 노출·클릭·CTR·평균 위치
- 검색어와 국가·언어 페이지
- 월 방문자·방문·referrer
- 정적 페이지 성능
- 퍼즐 API 성공·오류·CPU 시간

주의:

- API 요청 수는 새 퍼즐 수의 근사치이며 재시도가 포함될 수 있다.
- 현재 서버는 완주 이벤트를 수집하지 않으므로 완주율을 알고 있다고 주장하지
  않는다.

중단 기준:

- 3개 연속 28일 구간에서도 검색 노출이 거의 없다면 메타데이터 반복 수정 대신
  외부 배포와 B2B에 집중한다.

### 단계 C — 소비자 성장 실험

후보 실험:

- 완주 결과 공유 카드
- 개인 최고 기록
- 로컬 오늘의 1판
- 설명형 힌트의 요청 시 계산

성공 기준:

- 공유 링크 유입 증가
- 재방문율 증가
- 새 퍼즐 요청/방문 증가
- Core Web Vitals와 접근성 회귀 없음

한 번에 하나만 실험해 원인을 분리한다.

### 단계 D — B2B 검증

후보 순서:

1. 접근성 화이트라벨
2. 생성 API
3. 출판·인쇄 공급

통과 기준:

- 20개 적격 대상 중 2건 이상의 문제 인터뷰
- 최소 1건의 파일럿 또는 유상 견적 요청

미달 시 대규모 인증·계정·청구 시스템 개발을 시작하지 않는다.

### 단계 E — 수익화 구현

수요가 검증된 한 모델만 제품화한다.

- 광고: 개인정보·CMP·ads.txt·배치·정책 모니터링
- API: 인증·요율 제한·계측·청구·버전 문서
- 화이트라벨: 설정 계약·배포 옵션·수동 접근성 검수
- 출판: 배치 생성·중복 검출·난이도 검수·PDF 출력

여러 모델을 동시에 구현하지 않는다.

---

## 9. 측정 대시보드 정의

### 9.1 획득

| 지표 | 출처 | 목적 |
|---|---|---|
| 색인 URL | Search Console/Naver/Bing | 기술 색인 확인 |
| 검색 노출 | Search Console/Search Advisor | 발견성 |
| 검색 클릭 | 동일 | 실제 유입 |
| CTR | 동일 | title·snippet 품질 |
| 검색어 | 동일 | 사용자 의도 |
| referrer | Cloudflare Web Analytics | 외부 배포 효과 |

### 9.2 참여

| 지표 | 현재 가능 여부 | 비고 |
|---|---|---|
| 방문·순 방문자 | 가능 | Cloudflare Web Analytics |
| 새 퍼즐 요청 | 가능 | Worker 요청량, 재시도 포함 가능 |
| 언어·게임 페이지별 방문 | 가능 | URL 분리 |
| 완주율 | 불가 | 별도 이벤트 필요 |
| 재방문율 | 도구 확인 필요 | 개인 식별 없이 제공 범위 확인 |
| 평균 판 수 | 근사만 가능 | pageview와 API 요청의 비율 |

### 9.3 수익

| 지표 | 광고 | B2B/API |
|---|---|---|
| 매출 | AdSense 보고서 | 계약·청구 |
| page RPM | AdSense | 해당 없음 |
| viewability | AdSense | 해당 없음 |
| 정책 경고 | AdSense Policy Center | 해당 없음 |
| 적격 리드 | 해당 없음 | 문의·인터뷰 |
| 파일럿 전환 | 해당 없음 | 파일럿/리드 |
| 고객 획득 비용 | 외부 홍보비/고객 | 영업비/고객 |
| 월 유지 비용 | CMP·도메인·Workers | Workers·지원·청구 |

---

## 10. 주요 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| 검색 미색인 | 유입 0 | Search Console·Naver 등록과 URL 검사 우선 |
| 메타데이터만 반복 수정 | 시간 낭비 | 28일 데이터와 외부 링크를 기준으로 판단 |
| AdSense 저가치 콘텐츠 거절 | 광고 지연 | 광고를 전제하지 않고 audience와 원본 가치 먼저 증명 |
| 광고 우발 클릭 | 계정·수익 위험 | 게임판·버튼·타이머와 충분히 분리 |
| CMP·개인정보 복잡성 | UI·운영비 증가 | 광고 전 명시 승인, 필요 지역과 정책 검토 |
| `.pages.dev` 브랜드 한계 | 신뢰·이전 비용 | 초기 고유 도메인 결정, 301·canonical 통합 |
| 단서 수 난이도 편차 | 사용자·출판 품질 | 웹은 구간형 유지, 출판은 오프라인 기법 분석 추가 |
| 가짜/부풀린 구조화 데이터 | 검색 정책 위험 | 실제 기능·가격만 표시, 평점 제외 |
| B2B 인증 과장 | 계약 위험 | 자동 테스트와 공식 인증을 명확히 분리 |
| 여러 모델 동시 개발 | 집중력 분산 | 수요 검증 후 한 모델만 구현 |
| 사용자 소유 변경과 충돌 | 코드 손상 | 관련 없는 dirty worktree 파일 보존 |

---

## 11. 최종 권고

### 지금 해야 할 것

1. 최신 난이도 메타데이터를 실제 사이트에 배포한다.
2. 고유 도메인과 고유 서비스명을 결정한다.
3. Google Search Console, Naver Search Advisor, Bing Webmaster Tools를 연결한다.
4. favicon·공유 이미지·JSON-LD·검색 의도형 title을 추가한다.
5. Cloudflare Web Analytics와 Worker 지표로 28일 기준 데이터를 만든다.
6. 개발 과정과 접근성 근거를 외부에 공개해 자연스러운 링크와 B2B 신뢰를 만든다.
7. 접근성 화이트라벨 수요를 20개 대상에게 먼저 검증한다.

### 지금 하지 말아야 할 것

- 트래픽 데이터 없이 AdSense부터 신청·배치
- 검색용 숨은 설명문 추가
- 난이도별 중복 페이지 대량 생성
- 유료 광고로 무료 게임 트래픽 구매
- 계정·구독·결제 전체를 한 번에 개발
- 공식 인증 없이 접근성 준수를 보증
- 실제 RPM 없이 광고 매출을 확정값으로 예측

### 한 문장 판단

> 이 프로젝트의 단기 목표는 광고 매출이 아니라 색인·브랜드·측정·외부 신뢰를
> 확보하는 것이며, 첫 직접 수익은 소비자 광고보다 접근성 화이트라벨 또는 기술
> 리드에서 발생할 가능성이 높다.

---

## 12. 참고 자료

모든 웹 자료는 2026-08-27 확인 기준이다.

### Google Search

- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
- [Google 검색의 동작 방식](https://developers.google.com/search/docs/fundamentals/how-search-works)
- [URL 재크롤링 요청](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Sitemap 작성·제출](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [JavaScript SEO 기본](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [검색 결과 title 링크](https://developers.google.com/search/docs/appearance/title-link)
- [검색 snippet과 meta description](https://developers.google.com/search/docs/appearance/snippet)
- [Google 지원 meta 태그](https://developers.google.com/search/docs/crawling-indexing/special-tags)
- [숨겨진 텍스트·키워드 스팸 정책](https://developers.google.com/search/docs/essentials/spam-policies)
- [SoftwareApplication 구조화 데이터](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [구조화 데이터 일반 정책](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google 검색 사이트명](https://developers.google.com/search/docs/appearance/site-names)
- [검색 결과 favicon](https://developers.google.com/search/docs/appearance/favicon-in-search)

### Naver·Bing

- [Naver Search Advisor 시작하기](https://searchadvisor.naver.com/start)
- [Naver robots.txt 설정](https://searchadvisor.naver.com/guide/seo-basic-robots)
- [Naver SEO 기본 가이드](https://searchadvisor.naver.com/guide/seo-help)
- [Naver IndexNow 소개](https://searchadvisor.naver.com/guide/indexnow-about)
- [Bing URL 제출](https://www.bing.com/webmasters/help/URL-Submission-62f2860b)
- [Bing URL Inspection](https://www.bing.com/webmasters/help/URL-Inspection-55a30305)

### Google AdSense

- [AdSense 자격 요구사항](https://support.google.com/adsense/answer/9724)
- [AdSense 페이지 준비](https://support.google.com/adsense/answer/7299563)
- [Google Publisher Policies](https://support.google.com/adsense/answer/10502938)
- [AdSense 승인 거절 사유](https://support.google.com/adsense/answer/81904)
- [게임 페이지 광고 배치](https://support.google.com/adsense/answer/2768340)
- [광고 배치 정책](https://support.google.com/adsense/answer/1346295)
- [AdSense 광고 쿠키](https://support.google.com/adsense/answer/7549925)
- [AdSense 개인정보처리방침 필수 내용](https://support.google.com/adsense/answer/1348695)
- [EEA·영국·스위스 CMP 요구](https://support.google.com/adsense/answer/13554020)
- [ads.txt 크롤링 요구](https://support.google.com/adsense/answer/7679060)
- [AdSense 수익 배분 구조 변경](https://blog.google/products/adsense/evolving-how-publishers-monetize-with-adsense/)

### Cloudflare

- [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers 한도](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/)
- [Pages custom domain](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [`pages.dev`에서 custom domain 리다이렉트](https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/)

### 경쟁 서비스 참고

- [Easybrain Sudoku.com](https://easybrain.com/sudoku)
- [Brainium Sudoku](https://brainium.com/games/sudoku/)
- [Apple News+ 퍼즐·통계·연속 기록](https://support.apple.com/ko-kr/guide/iphone/iph4883822da/26/ios/26)
- [Cracking the Cryptic 앱](https://crackingthecryptic.com/apps)

### 저장소 근거

- [`wrangler.jsonc`](../wrangler.jsonc)
- [Cloudflare Pages 배포 문서](./codex-mhj_26_08_02_08_cloudflare-pages-deployment.md)
- [퍼즐 생성기](../functions/_lib/sudoku/claude-mhj_26_08_05_04_generator.js)
- [난이도 정의](../game/static/game/js/core/codex-mhj_26_08_27_01_difficulty.js)
- [한국어·영어 메시지](../game/static/game/js/i18n/claude-mhj_26_08_07_05_messages.js)
- [robots.txt](../game/static/robots.txt)
- [sitemap.xml](../game/static/sitemap.xml)

