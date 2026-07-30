// Settings form and help content. Rendered as plain Nodes handed to
// UI-B11's DialogHost, which owns modal presentation -- this module never
// creates a dialog itself.
import { KEYMAP } from "./keyboard-adapter.js";

const BOOLEAN_FIELDS = [
    ["autoRemoveCandidates", "값 입력 시 후보 자동 제거"],
    ["showConflicts", "규칙 위반 강조 표시"],
    ["shiftQuasimode", "Shift+숫자로 후보 입력"],
];
const TOUCH_CONTROLS_OPTIONS = [
    ["auto", "자동"], ["show", "항상 표시"], ["hide", "항상 숨김"],
];

export function renderSettings(settings) {
    const form = document.createElement("div");
    form.className = "settings-form";

    for (const [field, label] of BOOLEAN_FIELDS) {
        const row = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(settings.get()[field]);
        input.addEventListener("change", () => settings.set(field, input.checked));
        const text = document.createElement("span");
        text.textContent = label;
        row.appendChild(input);
        row.appendChild(text);
        form.appendChild(row);
    }

    const touchGroup = document.createElement("fieldset");
    const current = settings.get().touchControls;
    for (const [value, label] of TOUCH_CONTROLS_OPTIONS) {
        const row = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "touchControls";
        input.value = value;
        input.checked = current === value;
        input.addEventListener("change", () => { if (input.checked) settings.set("touchControls", value); });
        const text = document.createElement("span");
        text.textContent = label;
        row.appendChild(input);
        row.appendChild(text);
        touchGroup.appendChild(row);
    }
    form.appendChild(touchGroup);

    return form;
}

export function renderHelp(keymap = KEYMAP) {
    if (!keymap.length) throw new Error("help cannot render an empty keymap");
    const table = document.createElement("table");
    for (const entry of keymap) {
        const row = document.createElement("tr");
        const combo = document.createElement("td");
        combo.textContent = entry.combo;
        const desc = document.createElement("td");
        desc.textContent = entry.desc;
        row.appendChild(combo);
        row.appendChild(desc);
        table.appendChild(row);
    }
    return table;
}
