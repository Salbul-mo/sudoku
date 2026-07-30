// Grouped undo/redo, decoupled from the store so mutation-grouping concerns
// (CF4's "value change + auto candidate removal undo together") stay separate
// from state ownership. History does not apply entries -- that is the
// store's job; this class only remembers what happened and in what order.
const MAX_GROUPS = 200;

export class History {
    #undoStack = [];
    #redoStack = [];
    #open = null;
    #groupSeq = 0;

    beginGroup() {
        if (this.#open) throw new Error("a group is already open");
        this.#open = [];
        return ++this.#groupSeq;
    }

    record(entry) {
        if (!this.#open) throw new Error("record() called without an open group");
        this.#open.push(entry);
    }

    endGroup() {
        if (!this.#open) throw new Error("endGroup() called without an open group");
        if (this.#open.length) {
            this.#undoStack.push(this.#open);
            this.#redoStack.length = 0;
            if (this.#undoStack.length > MAX_GROUPS) this.#undoStack.shift();
        }
        this.#open = null;
    }

    undo() {
        if (this.#open) throw new Error("undo() called with an open group");
        const group = this.#undoStack.pop();
        if (!group) return null;
        this.#redoStack.push(group);
        return [...group].reverse();
    }

    redo() {
        if (this.#open) throw new Error("redo() called with an open group");
        const group = this.#redoStack.pop();
        if (!group) return null;
        this.#undoStack.push(group);
        return [...group];
    }
}
