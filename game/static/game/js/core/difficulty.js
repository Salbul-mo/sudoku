import {
    GIVENS_MIN,
    GIVENS_MAX,
} from "./givens.js";

export const DEFAULT_DIFFICULTY = "medium";

export const DIFFICULTIES = Object.freeze([
    Object.freeze({ id: "beginner", minGivens: 45, maxGivens: 50 }),
    Object.freeze({ id: "easy", minGivens: 38, maxGivens: 44 }),
    Object.freeze({ id: "medium", minGivens: 32, maxGivens: 37 }),
    Object.freeze({ id: "hard", minGivens: 26, maxGivens: 31 }),
    Object.freeze({ id: "expert", minGivens: 22, maxGivens: 25 }),
]);

export const DIFFICULTY_IDS = Object.freeze(DIFFICULTIES.map(({ id }) => id));

export function difficultyForId(id) {
    return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? null;
}

// Existing settings may contain any API-supported clue count, including
// 51..60 even though the dialog never offered those values. Treat those as
// beginner so every previously valid setting has a deterministic migration.
export function difficultyForGivens(givens) {
    if (!Number.isInteger(givens) || givens < GIVENS_MIN || givens > GIVENS_MAX) {
        throw new RangeError(`givens must be an integer in ${GIVENS_MIN}..${GIVENS_MAX}, got ${givens}`);
    }
    if (givens >= 45) return difficultyForId("beginner");
    if (givens >= 38) return difficultyForId("easy");
    if (givens >= 32) return difficultyForId("medium");
    if (givens >= 26) return difficultyForId("hard");
    return difficultyForId("expert");
}

export function cryptoRng() {
    if (typeof globalThis.crypto?.getRandomValues !== "function") {
        throw new Error("crypto.getRandomValues is unavailable");
    }
    const bytes = new Uint32Array(1);
    globalThis.crypto.getRandomValues(bytes);
    return bytes[0] / 0x100000000;
}

export function randomGivensForDifficulty(id, rng = cryptoRng) {
    const difficulty = difficultyForId(id);
    if (difficulty === null) throw new RangeError(`unknown difficulty: ${id}`);
    if (typeof rng !== "function") throw new TypeError("rng must be a function");
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) {
        throw new RangeError(`rng must return a finite number in [0, 1), got ${random}`);
    }
    const span = difficulty.maxGivens - difficulty.minGivens + 1;
    return difficulty.minGivens + Math.floor(random * span);
}
