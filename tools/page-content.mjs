// Prose for the pages that are text rather than an app: /privacy/ and
// /business/.
//
// Kept out of game/static/game/js/i18n/messages.js on purpose. That catalogue
// is imported by main.js and shipped to every visitor of every game page, and
// several kilobytes of policy text would be paid for by people who came to
// solve a puzzle and will never open either page. Nothing here is ever sent to
// a browser -- tools/build_pages.mjs reads it at build time and bakes the
// result into the HTML.
//
// The short strings these pages share with the rest of the site (title,
// description, the footer's own label) do still live in the message catalogue,
// because they are the same kind of thing every other page keeps there.
//
// Shape: a list of blocks. `h` is a subheading, `p` a paragraph, `ul` a list.
// Deliberately not raw HTML -- build_pages escapes every string it is handed,
// so nothing here can inject markup into a page even by accident.

// The address published on both pages. One constant, because a contact that
// disagrees between the policy and the enquiry page is worse than either.
export const CONTACT_EMAIL = 'salbul.mo91@gmail.com';

export const PAGE_CONTENT = {
  privacy: {
    ko: [
      { h: '요약' },
      { p: `이 사이트는 계정이 없고, 서버에 개인정보를 저장하지 않으며, 광고를 게재하지 않습니다. 게임 진행 상황과 기록은 사용자의 브라우저 안에만 저장됩니다.` },

      { h: '브라우저에 저장하는 것' },
      { p: `진행 중인 퍼즐과 설정, 개인 기록은 브라우저의 localStorage에 저장됩니다. 이 값은 사용자의 기기를 떠나지 않으며, 사이트 운영자를 포함해 누구도 열람할 수 없습니다.` },
      { ul: [
        '진행 중인 퍼즐 — 판, 입력한 숫자, 후보 표시, 진행 시간, 정답 체크가 찾아낸 오답 칸',
        '설정 — 언어별 페이지 주소로 구분되므로 언어 자체는 저장하지 않습니다',
        '개인 기록 — 난이도별 최고 시간과 완주 횟수',
        '러시 최고 점수와 최고 콤보',
        '풀이 연습의 기법별 시도·완료 횟수',
      ] },
      { p: `브라우저의 사이트 데이터 삭제 기능으로 언제든 전부 지울 수 있습니다. 지우면 진행 중인 퍼즐과 기록도 함께 사라지며, 복구할 방법은 없습니다.` },

      { h: '쿠키' },
      { p: `이 사이트는 쿠키를 사용하지 않습니다. localStorage는 쿠키와 달리 요청에 자동으로 실려 서버로 전송되지 않습니다.` },

      { h: '서버로 전송되는 것' },
      { p: `새 퍼즐을 만들 때 브라우저가 퍼즐 생성 API에 요청을 보냅니다. 이 요청에는 원하는 단서 개수만 담기며, 진행 상황이나 기록은 포함되지 않습니다. 서버는 퍼즐을 만들어 돌려줄 뿐 저장하지 않습니다.` },
      { p: `모든 웹 요청과 마찬가지로 호스팅 사업자(Cloudflare)의 인프라를 거치며, 사업자는 자체 운영과 보안 목적으로 접속 로그를 처리할 수 있습니다. 이는 사이트 운영자가 통제하거나 열람하는 데이터가 아닙니다.` },

      { h: '분석 도구와 광고' },
      { p: `현재 분석 도구, 추적 스크립트, 광고를 사용하지 않습니다. 도입하게 되면 이 문서를 먼저 갱신합니다.` },

      { h: '공유 링크' },
      { p: `공유 기능은 판과 입력 상태를 링크 주소의 fragment(# 뒤)에 담습니다. fragment는 서버로 전송되지 않는 부분이지만, 링크를 받은 사람은 그 내용을 볼 수 있습니다. 공유는 사용자가 직접 실행할 때만 일어납니다.` },

      { h: '문의' },
      { p: `개인정보 처리에 관한 문의는 아래로 보내주세요.` },
    ],
    en: [
      { h: 'In short' },
      { p: `There are no accounts, nothing personal is stored on a server, and there are no ads. Your progress and your records live in your own browser.` },

      { h: 'What is kept in your browser' },
      { p: `The puzzle in progress, your settings and your personal records are stored in your browser's localStorage. None of it leaves your device, and nobody — the site's operator included — can read it.` },
      { ul: [
        'The puzzle in progress — the board, the digits you entered, your candidate marks, elapsed time, and the cells the answer check found wrong',
        'Settings — language is not among them, because each language has its own address',
        'Personal records — best time and completion count per difficulty',
        'Your best Rush score and combo',
        'Practice attempts and completions per technique',
      ] },
      { p: `Clearing site data in your browser removes all of it at any time. The puzzle in progress and your records go with it, and there is no way to get them back.` },

      { h: 'Cookies' },
      { p: `This site sets no cookies. Unlike a cookie, localStorage is never attached to a request and sent to a server.` },

      { h: 'What is sent to a server' },
      { p: `Building a new puzzle sends a request to the puzzle API. It carries the number of clues you asked for and nothing else — no progress, no records. The server builds a puzzle, returns it, and keeps nothing.` },
      { p: `Like any web request it passes through the hosting provider's infrastructure (Cloudflare), which may process access logs for its own operations and security. That is not data the site's operator controls or reads.` },

      { h: 'Analytics and advertising' },
      { p: `There is no analytics, no tracking script and no advertising on this site today. This page will be updated before any of that changes.` },

      { h: 'Share links' },
      { p: `Sharing puts the board and your entries in the fragment of a link — the part after the #. A fragment is never sent to a server, but anyone you give the link to can read it. Sharing only ever happens when you ask for it.` },

      { h: 'Contact' },
      { p: `Questions about any of this can go to the address below.` },
    ],
  },

  business: {
    ko: [
      { h: '무엇을 제공하나요' },
      { p: `이 사이트의 스도쿠를 기관·교육·사내 서비스에 임베드하거나, 화이트라벨로 제공하는 것을 논의할 수 있습니다. 접근성이 핵심 요구사항인 곳을 염두에 두고 만들었습니다.` },

      { h: '현재 구현된 것' },
      { ul: [
        '한국어·영어 지원, 언어별 고유 주소',
        '키보드만으로 완결되는 조작 — 방향키 이동, 숫자 입력, 후보 표시, 실행 취소',
        '스크린리더를 고려한 격자 구조와 안내 문구',
        '색상 단독에 의존하지 않는 상태 표시 (충돌, 완료, 근거 강조)',
        'WCAG 대비 기준을 자동 검사로 유지 (텍스트 4.5:1, 비텍스트 3:1)',
        '요청마다 새로 생성되며 정답이 하나뿐인 것이 검증된 퍼즐',
        '난이도 5단계, 타임어택 모드, 풀이 기법 연습 모드',
        '계정·서버 저장 없이 동작 — 개인정보 수집 표면이 작습니다',
      ] },

      { h: '가능한 형태' },
      { ul: [
        '임베드 — 기존 사이트나 앱 안에 게임 화면을 넣는 형태',
        '화이트라벨 — 색상·문구·언어를 요구에 맞춰 조정한 별도 배포',
        '퍼즐 공급 — 생성 API 또는 인쇄·출판용 퍼즐 묶음',
        '접근성 검토 — 기존 퍼즐 서비스의 키보드·스크린리더 대응 점검',
      ] },

      { h: '아직 없는 것' },
      { p: `계정, 서버 저장 진행 상황, 결제, 다중 사용자 기능은 구현되어 있지 않습니다. 필요하다면 요구사항을 먼저 확인한 뒤 논의합니다.` },
      { p: `난이도는 단서 개수 구간을 기준으로 하며, 인간이 체감하는 난이도와 정확히 일치한다고 보증하지 않습니다. 정밀한 난이도 등급이 필요한 출판 용도라면 별도 분석이 필요합니다.` },

      { h: '문의' },
      { p: `필요한 범위와 일정을 적어 아래로 보내주세요.` },
    ],
    en: [
      { h: 'What is on offer' },
      { p: `This Sudoku can be embedded in an institutional, educational or internal service, or delivered white-labelled. It was built with accessibility as a requirement rather than an afterthought.` },

      { h: 'What exists today' },
      { ul: [
        'Korean and English, each at its own address',
        'A complete keyboard path — arrow movement, digit entry, candidate marks, undo',
        'A grid structure and announcements written for screen readers',
        'State shown by more than colour alone (conflicts, completion, evidence highlighting)',
        'WCAG contrast held by an automated check (4.5:1 text, 3:1 non-text)',
        'Puzzles built per request and verified to have exactly one solution',
        'Five difficulties, a timed mode, and a technique-practice mode',
        'No accounts and no server-side storage, so the data surface is small',
      ] },

      { h: 'Possible shapes' },
      { ul: [
        'Embedding — the game inside an existing site or app',
        'White label — a separate deployment with colours, wording and languages to suit',
        'Puzzle supply — the generation API, or batches for print and publishing',
        'An accessibility review of an existing puzzle service',
      ] },

      { h: 'What does not exist' },
      { p: `There are no accounts, no server-side progress, no payments and no multi-user features. If you need them, the requirements come first and the discussion second.` },
      { p: `Difficulty is based on clue-count bands and is not claimed to match perceived human difficulty exactly. Publishing work that needs graded difficulty would need separate analysis.` },

      { h: 'Get in touch' },
      { p: `Send the scope and timeline you have in mind to the address below.` },
    ],
  },
};
