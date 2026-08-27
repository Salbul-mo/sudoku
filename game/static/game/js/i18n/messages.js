// Every user-facing string in the app, in each supported language.
//
// The active language comes from <html lang>, which the build sets per
// generated page (/ is ko, /en/ is en). It is deliberately not stored in
// localStorage: the URL is what search engines index, and a saved
// preference that disagreed with it would show one language at an address
// advertised as another.
//
// A missing key throws rather than falling back. A silent fallback would let
// an untranslated string ship looking like a deliberate choice; an exception
// surfaces it the first time the code path runs.
export const LOCALES = Object.freeze(["ko", "en"]);
const DEFAULT_LOCALE = "ko";

export function resolveLocale(lang) {
    return String(lang ?? "").toLowerCase().startsWith("en") ? "en" : DEFAULT_LOCALE;
}

// CSS variable -> message key. These three strings live in ::before/::after
// content, which JavaScript cannot write into directly, so applyCssStrings
// pushes them onto :root as custom properties instead.
export const CSS_STRING_KEYS = Object.freeze([
    ["--i18n-candidate", "css.candidateBadge"],
    ["--i18n-solved", "css.solved"],
    ["--i18n-hint", "css.hint"],
]);

export const MESSAGES = Object.freeze({
    ko: Object.freeze({
        "meta.title": "스도쿠 - 매번 새로 만드는 무료 온라인 퍼즐",
        "meta.description": "난이도를 골라 새 퍼즐을 만드는 무료 온라인 스도쿠. 매번 새로 생성되며 정답이 하나뿐인 것이 보장됩니다. 설치 없이 브라우저에서 바로, 키보드와 터치 모두 지원합니다.",
        "meta.ogDescription": "난이도를 골라 새 퍼즐을 만드는 무료 온라인 스도쿠. 정답이 하나뿐인 것이 보장됩니다.",
        "meta.heading": "스도쿠",
        "meta.noscript": "이 스도쿠는 자바스크립트로 동작합니다. 브라우저에서 자바스크립트를 켜면 퍼즐이 나타납니다.",

        "css.candidateBadge": "후보",
        "css.solved": "완성",
        "css.hint": "방향키로 이동하고 숫자키로 입력하세요. ? 키로 도움말을 엽니다.",

        "nav.otherLanguage": "English",
        "nav.playRush": "러시",
        "nav.playClassic": "클래식",

        "action.check": "정답 체크",
        "action.newGame": "새 게임",
        "action.clearAll": "전체 지우기",
        "action.share": "공유",
        "action.settings": "설정",
        "action.help": "도움말",

        "board.label": "스도쿠 {dim}x{dim} 퍼즐",
        "cell.position": "{row}행 {col}열",
        "cell.given": "고정 숫자 {digit}",
        "cell.empty": "빈 칸",
        "cell.candidates": "후보 {digits}",
        "cell.conflict": "규칙 위반",
        "cell.target": "채워야 하는 칸",
        "cell.givenRejected": "고정된 칸입니다",

        "check.solved": "퍼즐을 완성했습니다",
        "check.wrongCount": "정답과 다른 칸 {count}개",
        "check.allCorrect": "지금까지 입력한 답이 모두 맞습니다",
        "check.violationCount": "규칙 위반 {count}칸",
        "check.noViolations": "지금까지 규칙 위반이 없습니다",

        "newGame.title": "새 게임",
        "newGame.body": "난이도를 고르세요. 지금 진행 중인 퍼즐은 사라집니다.",
        "newGame.started": "새 게임을 시작했습니다",
        "newGame.givensShortfall": "힌트 {requested}개로 요청했지만 {actual}개로 만들었습니다",

        "difficulty.beginner": "입문",
        "difficulty.easy": "쉬움",
        "difficulty.medium": "보통",
        "difficulty.hard": "어려움",
        "difficulty.expert": "전문가",

        "clearAll.question": "입력한 숫자와 후보를 모두 지울까요?",

        "dialog.confirmTitle": "확인",
        "dialog.cancel": "취소",
        "dialog.continue": "계속",
        "dialog.close": "닫기",

        "touch.digitBar": "숫자 입력",
        "touch.pencil": "후보",
        "touch.erase": "지우기",
        "touch.stickyOn": "후보 입력 모드 켜짐",
        "touch.stickyOff": "후보 입력 모드 꺼짐",

        "settings.autoRemoveCandidates": "값 입력 시 후보 자동 제거",
        "settings.showConflicts": "규칙 위반 강조 표시",
        "settings.shiftQuasimode": "Shift+숫자로 후보 입력",
        "settings.touchAuto": "자동",
        "settings.touchShow": "항상 표시",
        "settings.touchHide": "항상 숨김",

        "keymap.arrows.combo": "방향키",
        "keymap.arrows.desc": "한 칸 이동",
        "keymap.ctrlArrows.combo": "Ctrl+방향키",
        "keymap.ctrlArrows.desc": "한 박스(3칸) 이동",
        "keymap.homeEnd.combo": "Home/End",
        "keymap.homeEnd.desc": "행 처음/끝으로 이동",
        "keymap.ctrlHomeEnd.combo": "Ctrl+Home/End",
        "keymap.ctrlHomeEnd.desc": "격자 처음/끝으로 이동",
        "keymap.digits.combo": "숫자키 1-9",
        "keymap.digits.desc": "값 입력, 재입력 시 지움",
        "keymap.shiftDigits.combo": "Shift+숫자키",
        "keymap.shiftDigits.desc": "후보 토글 (shiftQuasimode 설정 시)",
        "keymap.space.combo": "Space",
        "keymap.space.desc": "후보 입력 모드 고정 토글",
        "keymap.delete.combo": "Delete / Backspace",
        "keymap.delete.desc": "칸 지우기",
        "keymap.undo.combo": "Ctrl+Z",
        "keymap.undo.desc": "실행 취소",
        "keymap.redo.combo": "Ctrl+Shift+Z 또는 Ctrl+Y",
        "keymap.redo.desc": "다시 실행",
        "keymap.help.combo": "? 또는 F1",
        "keymap.help.desc": "도움말 열기",

        "share.scopePrompt": "공유 범위를 선택하세요.",
        "share.sc1Label": "문제만",
        "share.sc1Desc": "빈 퍼즐만 공유합니다.",
        "share.sc2Label": "진행 포함",
        "share.sc2Desc": "입력한 숫자와 후보까지 공유합니다.",
        "share.resultTitle": "공유 링크",
        "share.ready": "링크가 준비되었습니다 ({length}자).",
        "share.readyLong": "링크가 준비되었습니다 ({length}자). 일부 앱에서 잘릴 수 있습니다.",
        "share.copy": "복사",
        "share.copied": "링크를 복사했습니다",
        "share.copyFallback": "복사 권한이 없어 직접 선택할 수 있게 표시했습니다",

        "session.storageWarning": "저장 공간을 사용할 수 없어 이번 진행은 기기에 저장되지 않습니다",
        "session.archived": "이전 진행을 보관함으로 옮기고 8초 안에 되돌릴 수 있습니다",
        "session.conflictTitle": "진행 상태 선택",
        "session.conflictBody": "어느 진행을 쓸까요?",
        "session.useLocal": "이 기기",
        "session.useShared": "공유된 진행",
        "session.decodeFailed": "공유 링크를 해석하지 못했습니다 ({code}). 무시하고 계속할까요?",

        "retry.offline": "오프라인 상태입니다. 연결 후 다시 시도하세요.",
        "retry.server": "서버에 문제가 있습니다. 잠시 후 다시 시도하세요.",
        "retry.network": "네트워크에 연결할 수 없습니다. 다시 시도하세요.",
        "retry.button": "다시 시도",

        "fatal.mount": "화면을 준비하지 못했습니다. 페이지를 새로고침해 주세요.",
        "fatal.load": "앱을 불러오지 못했습니다. 페이지를 새로고침해 주세요.",

        "meta.rushTitle": "스도쿠 러시 - 제한시간 안에 한 칸씩",
        "meta.rushDescription": "제한시간 안에 확정된 칸을 찾아 채우는 스피드 스도쿠. 시간이 갈수록 짧아지는 제한시간과 콤보로 점수를 겨룹니다. 설치 없이 브라우저에서 바로 즐기세요.",
        "meta.rushOgDescription": "제한시간 안에 확정된 칸을 찾아 채우는 스피드 스도쿠. 콤보를 이어 최고 점수에 도전하세요.",
        "meta.rushHeading": "스도쿠 러시",
        "meta.rushNoscript": "스도쿠 러시는 자바스크립트로 동작합니다. 브라우저에서 자바스크립트를 켜면 게임이 나타납니다.",

        "rush.start": "시작",
        "rush.restart": "다시 하기",
        "rush.howTo": "숫자가 하나로 확정되는 칸이 표시됩니다. 제한시간 안에 그 숫자를 누르세요.",
        "rush.score": "점수",
        "rush.combo": "콤보",
        "rush.lives": "목숨",
        "rush.timeLeft": "{seconds}초",
        "rush.gameOver": "게임 종료. 점수 {score}점, 최고 콤보 {combo}.",
        "rush.best": "최고 기록 {score}점",
        "rush.newBest": "최고 기록 경신! {score}점",
        "rush.noRecord": "이 브라우저에서는 기록이 저장되지 않습니다.",
        "rush.boardCleared": "보드 완성. 새 보드를 시작합니다.",
        "rush.technique.naked-single": "이 칸에 들어갈 수 있는 숫자가 하나뿐입니다.",
        "rush.technique.hidden-single-box": "이 박스에서 그 숫자가 들어갈 칸은 여기뿐입니다.",
        "rush.technique.hidden-single-line": "이 줄에서 그 숫자가 들어갈 칸은 여기뿐입니다.",
        "rush.swap": "새 판",
        "rush.swapFree": "새 판 (무료)",
        "rush.boardSwapped": "새 보드로 교체했습니다. 콤보가 초기화됩니다.",
        "rush.boardSwappedFree": "새 보드로 교체했습니다. 콤보는 유지됩니다.",
    }),

    en: Object.freeze({
        "meta.title": "Sudoku - a fresh puzzle with one solution, every time",
        "meta.description": "A free online Sudoku that builds a new puzzle on every request. Choose a difficulty; every puzzle is guaranteed to have exactly one solution. No install, keyboard and touch alike.",
        "meta.ogDescription": "A free online Sudoku that builds a new puzzle every time. Choose a difficulty; every puzzle has exactly one solution.",
        "meta.heading": "Sudoku",
        "meta.noscript": "This Sudoku runs on JavaScript. Turn it on in your browser and the puzzle will appear.",

        "css.candidateBadge": "note",
        "css.solved": "Solved",
        "css.hint": "Move with the arrow keys and type a digit to fill a cell. Press ? for help.",

        "nav.otherLanguage": "한국어",
        "nav.playRush": "Rush",
        "nav.playClassic": "Classic",

        "action.check": "Check answer",
        "action.newGame": "New game",
        "action.clearAll": "Clear all",
        "action.share": "Share",
        "action.settings": "Settings",
        "action.help": "Help",

        "board.label": "Sudoku {dim}x{dim} puzzle",
        "cell.position": "row {row}, column {col}",
        "cell.given": "given {digit}",
        "cell.empty": "empty",
        "cell.candidates": "candidates {digits}",
        "cell.conflict": "breaks a rule",
        "cell.target": "the cell to fill",
        "cell.givenRejected": "That cell is fixed",

        "check.solved": "Puzzle complete",
        "check.wrongCount": "{count} cells differ from the solution",
        "check.allCorrect": "Everything you have entered so far is correct",
        "check.violationCount": "{count} cells break a rule",
        "check.noViolations": "No rules are broken so far",

        "newGame.title": "New game",
        "newGame.body": "Choose a difficulty. The puzzle in progress will be discarded.",
        "newGame.started": "New game started",
        "newGame.givensShortfall": "You asked for {requested} clues; this puzzle has {actual}",

        "difficulty.beginner": "Beginner",
        "difficulty.easy": "Easy",
        "difficulty.medium": "Medium",
        "difficulty.hard": "Hard",
        "difficulty.expert": "Expert",

        "clearAll.question": "Clear every digit and note you have entered?",

        "dialog.confirmTitle": "Confirm",
        "dialog.cancel": "Cancel",
        "dialog.continue": "Continue",
        "dialog.close": "Close",

        "touch.digitBar": "Digit entry",
        "touch.pencil": "Notes",
        "touch.erase": "Erase",
        "touch.stickyOn": "Note entry on",
        "touch.stickyOff": "Note entry off",

        "settings.autoRemoveCandidates": "Clear notes automatically when a digit is entered",
        "settings.showConflicts": "Highlight cells that break a rule",
        "settings.shiftQuasimode": "Shift+digit enters a note",
        "settings.touchAuto": "Automatic",
        "settings.touchShow": "Always show",
        "settings.touchHide": "Always hide",

        "keymap.arrows.combo": "Arrow keys",
        "keymap.arrows.desc": "Move one cell",
        "keymap.ctrlArrows.combo": "Ctrl+Arrow keys",
        "keymap.ctrlArrows.desc": "Move one box (3 cells)",
        "keymap.homeEnd.combo": "Home/End",
        "keymap.homeEnd.desc": "Move to the start/end of the row",
        "keymap.ctrlHomeEnd.combo": "Ctrl+Home/End",
        "keymap.ctrlHomeEnd.desc": "Move to the start/end of the grid",
        "keymap.digits.combo": "Digits 1-9",
        "keymap.digits.desc": "Enter a digit; repeat it to clear",
        "keymap.shiftDigits.combo": "Shift+digit",
        "keymap.shiftDigits.desc": "Toggle a note (when the shift setting is on)",
        "keymap.space.combo": "Space",
        "keymap.space.desc": "Lock note entry on or off",
        "keymap.delete.combo": "Delete / Backspace",
        "keymap.delete.desc": "Clear the cell",
        "keymap.undo.combo": "Ctrl+Z",
        "keymap.undo.desc": "Undo",
        "keymap.redo.combo": "Ctrl+Shift+Z or Ctrl+Y",
        "keymap.redo.desc": "Redo",
        "keymap.help.combo": "? or F1",
        "keymap.help.desc": "Open help",

        "share.scopePrompt": "Choose what to share.",
        "share.sc1Label": "Puzzle only",
        "share.sc1Desc": "Shares the empty puzzle by itself.",
        "share.sc2Label": "Include progress",
        "share.sc2Desc": "Shares the digits and notes you have entered as well.",
        "share.resultTitle": "Share link",
        "share.ready": "Your link is ready ({length} characters).",
        "share.readyLong": "Your link is ready ({length} characters). Some apps may cut it short.",
        "share.copy": "Copy",
        "share.copied": "Link copied",
        "share.copyFallback": "Copying was not permitted, so the link is shown for you to select",

        "session.storageWarning": "Storage is unavailable, so this game will not be saved on your device",
        "session.archived": "Your previous game was moved to the archive; you can undo this for 8 seconds",
        "session.conflictTitle": "Choose a game",
        "session.conflictBody": "Which progress would you like to keep?",
        "session.useLocal": "This device",
        "session.useShared": "The shared game",
        "session.decodeFailed": "That share link could not be read ({code}). Ignore it and carry on?",

        "retry.offline": "You are offline. Reconnect and try again.",
        "retry.server": "The server is having trouble. Try again shortly.",
        "retry.network": "Could not reach the network. Try again.",
        "retry.button": "Try again",

        "fatal.mount": "The page could not be prepared. Please reload.",
        "fatal.load": "The app could not be loaded. Please reload.",

        "meta.rushTitle": "Sudoku Rush - one cell at a time, against the clock",
        "meta.rushDescription": "A speed Sudoku where you find the cell that has only one possible digit and fill it before time runs out. The limit shrinks as you go, and a combo multiplies your score. No install, playable straight from the browser.",
        "meta.rushOgDescription": "A speed Sudoku: find the cell with only one possible digit before time runs out, and keep the combo going.",
        "meta.rushHeading": "Sudoku Rush",
        "meta.rushNoscript": "Sudoku Rush runs on JavaScript. Turn it on in your browser and the game will appear.",

        "rush.start": "Start",
        "rush.restart": "Play again",
        "rush.howTo": "One cell is marked whose digit is already decided. Type that digit before the time runs out.",
        "rush.score": "Score",
        "rush.combo": "Combo",
        "rush.lives": "Lives",
        "rush.timeLeft": "{seconds}s",
        "rush.gameOver": "Game over. Score {score}, best combo {combo}.",
        "rush.best": "Best {score}",
        "rush.newBest": "New best! {score}",
        "rush.noRecord": "This browser will not save your record.",
        "rush.boardCleared": "Board complete. Starting a new one.",
        "rush.technique.naked-single": "Only one digit fits this cell.",
        "rush.technique.hidden-single-box": "In this box, that digit fits only here.",
        "rush.technique.hidden-single-line": "In this line, that digit fits only here.",
        "rush.swap": "New board",
        "rush.swapFree": "New board (free)",
        "rush.boardSwapped": "Swapped in a new board. Your combo is reset.",
        "rush.boardSwappedFree": "Swapped in a new board. Your combo is kept.",
    }),
});

export function t(key, params) {
    const locale = resolveLocale(globalThis.document?.documentElement?.lang);
    const raw = MESSAGES[locale][key];
    if (raw === undefined) throw new Error(`unknown message key: ${key}`);
    return raw.replace(/\{(\w+)\}/g, (_, name) => {
        if (params == null || !(name in params)) {
            throw new Error(`missing parameter "${name}" for message: ${key}`);
        }
        return String(params[name]);
    });
}

// Pushes the pseudo-element strings onto :root. JSON.stringify supplies the
// quotes CSS `content` requires and escapes anything awkward inside.
export function applyCssStrings(root) {
    for (const [cssVar, key] of CSS_STRING_KEYS) {
        root.style.setProperty(cssVar, JSON.stringify(t(key)));
    }
}
