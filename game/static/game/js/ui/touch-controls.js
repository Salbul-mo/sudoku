// The on-screen chrome for TouchAdapter: the 1-9 digit bar plus the pencil
// control. TouchAdapter itself stays DOM-free -- a source-level test
// asserts it never creates an input, textarea, or contenteditable element, and
// mixing element construction into it would make that invariant untestable.
//
// Every control here is a plain <button> for the same reason: a focusable
// text-entry element pops the software keyboard the moment it is tapped, which
// is exactly what the touch design exists to avoid.
const DIM = 9;
import { t } from "../i18n/messages.js";
const VISIBILITY = new Set(["visible", "collapsed"]);

function controlButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control";
    button.textContent = label;
    return button;
}

export function mountTouchControls(root, adapter, deps = {}) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("mountTouchControls: root must be an Element");
    }
    for (const name of ["onDigitTap", "onPencilTap", "onEraseTap"]) {
        if (typeof adapter?.[name] !== "function") {
            throw new TypeError(`mountTouchControls: adapter.${name} must be a function`);
        }
    }

    const bar = document.createElement("div");
    bar.className = "digit-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", t("touch.digitBar"));

    // Deliberately no aria-pressed on the digits: under Cell First they act
    // on the selected cell the moment they are tapped rather than staying
    // armed for a later cell tap, so they are momentary push buttons and
    // announcing a pressed state would misdescribe them. The pencil control
    // below is a real toggle and keeps aria-pressed.
    for (let d = 1; d <= DIM; d++) {
        const button = controlButton(String(d));
        button.dataset.digit = String(d);
        button.addEventListener("click", () => {
            adapter.onDigitTap(d);
        });
        bar.appendChild(button);
    }

    const pencil = controlButton(t("touch.pencil"));
    pencil.dataset.role = "pencil";
    pencil.setAttribute("aria-pressed", "false");
    pencil.addEventListener("click", () => {
        adapter.onPencilTap();
        sync();
        deps.onStickyChange?.(adapter.sticky === true);
    });

    const erase = controlButton(t("touch.erase"));
    erase.dataset.role = "erase";
    erase.addEventListener("click", () => {
        adapter.onEraseTap();
    });

    bar.appendChild(pencil);
    bar.appendChild(erase);
    root.appendChild(bar);

    function sync() {
        const sticky = adapter.sticky === true;
        pencil.setAttribute("aria-pressed", sticky ? "true" : "false");
        pencil.dataset.active = sticky ? "1" : "0";
    }

    function setVisibility(value) {
        if (!VISIBILITY.has(value)) {
            throw new RangeError(`unknown visibility: ${value}`);
        }
        bar.dataset.visibility = value;
        // aria-hidden is deliberately not set: `display: none` already removes
        // the bar from the accessibility tree, and setting both risks hiding a
        // focused control from assistive tech while it still has focus.
        return value;
    }

    sync();
    setVisibility("visible");

    function destroy() {
        bar.remove();
    }

    return { element: bar, sync, setVisibility, destroy };
}
