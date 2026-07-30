// The on-screen chrome for TouchAdapter: the 1-9 digit bar plus the pencil
// and memo controls. TouchAdapter itself stays DOM-free -- a source-level test
// asserts it never creates an input, textarea, or contenteditable element, and
// mixing element construction into it would make that invariant untestable.
//
// Every control here is a plain <button> for the same reason: a focusable
// text-entry element pops the software keyboard the moment it is tapped, which
// is exactly what the touch design exists to avoid.
const DIM = 9;
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
    for (const name of ["onDigitTap", "onPencilTap", "onMemoTap"]) {
        if (typeof adapter?.[name] !== "function") {
            throw new TypeError(`mountTouchControls: adapter.${name} must be a function`);
        }
    }

    const bar = document.createElement("div");
    bar.className = "digit-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "숫자 입력");

    const digitButtons = [];
    for (let d = 1; d <= DIM; d++) {
        const button = controlButton(String(d));
        button.dataset.digit = String(d);
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => {
            adapter.onDigitTap(d);
            sync();
        });
        bar.appendChild(button);
        digitButtons.push(button);
    }

    const pencil = controlButton("후보");
    pencil.dataset.role = "pencil";
    pencil.setAttribute("aria-pressed", "false");
    pencil.addEventListener("click", () => {
        adapter.onPencilTap();
        sync();
        deps.onStickyChange?.(adapter.sticky === true);
    });

    const memo = controlButton("메모");
    memo.dataset.role = "memo";
    memo.addEventListener("click", () => adapter.onMemoTap());

    bar.appendChild(pencil);
    bar.appendChild(memo);
    root.appendChild(bar);

    function sync() {
        const active = adapter.activeDigit ?? null;
        for (const button of digitButtons) {
            const pressed = Number(button.dataset.digit) === active;
            button.setAttribute("aria-pressed", pressed ? "true" : "false");
            button.dataset.active = pressed ? "1" : "0";
        }
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
