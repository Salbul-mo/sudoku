// The only real modal in the app. Nested dialogs are not supported --
// restoring inert state in the wrong order would leave the background
// half-interactive.
export function createDialogHost(root, backgroundEls) {
    let current = null;

    function firstFocusable(container) {
        const focusable = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        return focusable[0] ?? null;
    }

    function trapTab(ev, dialogEl) {
        if (ev.key !== "Tab") return;
        const focusable = dialogEl.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
            ev.preventDefault();
            last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
            ev.preventDefault();
            first.focus();
        }
    }

    function open(spec) {
        if (current) throw new Error("DialogHost does not support nested dialogs");
        if (!Array.isArray(spec.actions) || spec.actions.length === 0) {
            throw new RangeError("DialogHost.open: spec.actions must be non-empty");
        }
        if (!(spec.body instanceof Node)) {
            throw new TypeError("DialogHost.open: spec.body must be a Node, not a markup string");
        }

        return new Promise((resolve) => {
            const previous = document.activeElement;
            for (const el of backgroundEls) el.inert = true;

            const dialog = document.createElement("div");
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");
            if (spec.title) dialog.setAttribute("aria-label", spec.title);
            dialog.appendChild(spec.body);

            const actionButtons = [];
            for (const action of spec.actions) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = action.label;
                button.addEventListener("click", () => finish(action.id));
                dialog.appendChild(button);
                actionButtons.push({ action, button });
            }

            const keydownHandler = (ev) => {
                if (ev.key === "Escape") {
                    finish("cancel");
                    return;
                }
                trapTab(ev, dialog);
            };
            dialog.addEventListener("keydown", keydownHandler);

            root.appendChild(dialog);

            const preferred = actionButtons.find((a) => a.action.initialFocus)?.button;
            (preferred ?? firstFocusable(dialog))?.focus();

            current = { dialog };

            function finish(result) {
                for (const el of backgroundEls) el.inert = false;
                dialog.remove();
                current = null;
                previous?.focus();
                resolve(result);
            }
        });
    }

    function confirm(question) {
        if (!question) throw new RangeError("DialogHost.confirm: question must not be empty");
        const body = document.createElement("p");
        body.textContent = question;
        return open({
            kind: "confirm",
            title: "확인",
            body,
            actions: [
                { id: "cancel", label: "취소", initialFocus: true },
                { id: "ok", label: "계속", destructive: true },
            ],
        }).then((r) => r === "ok");
    }

    return { open, confirm };
}
