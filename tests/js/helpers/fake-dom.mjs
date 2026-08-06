// A minimal in-repo stand-in for the tiny slice of the DOM that ui/*.js
// modules touch (createElement, setAttribute, appendChild, textContent,
// dataset, classList, tabIndex, focus, closest/matches/contains). Not a
// general DOM implementation -- U2/DEC-UI-02 forbid adding a dependency like
// jsdom, so this covers exactly what these modules call and nothing more.

// Supports only what this codebase's selectors actually use: a tag name, or
// one or more comma-separated simple clauses each built from a tag name
// and/or `[attr="value"]` / `[attr]` attribute clauses (no descendant combinators).
function matchesSimpleSelector(node, selector) {
    return selector.split(",").some((clause) => {
        clause = clause.trim();
        const attrRe = /\[([\w-]+)(?:="([^"]*)")?\]/g;
        let tagPart = clause.replace(attrRe, "").trim();
        let m;
        attrRe.lastIndex = 0;
        while ((m = attrRe.exec(clause))) {
            const [, name, value] = m;
            const actual = node.getAttribute(name);
            if (actual === null) return false;
            if (value !== undefined && actual !== value) return false;
        }
        if (tagPart && node.tagName.toLowerCase() !== tagPart.toLowerCase()) return false;
        return true;
    });
}

// Common base so both elements and text nodes satisfy `instanceof Node`,
// mirroring the one real DOM interface these modules type-check against.
class FakeNode {
    get parentNode() {
        return this._parentNode ?? null;
    }

    set parentNode(v) {
        this._parentNode = v;
    }
}

class FakeElement extends FakeNode {
    constructor(tag) {
        super();
        this.tagName = tag;
        this.attributes = {};
        this.children = [];
        this.dataset = {};
        // Only the custom-property surface the app actually uses: the message
        // catalogue writes the pseudo-element strings onto :root this way.
        this.style = {
            properties: {},
            setProperty(name, value) { this.properties[name] = value; },
            getPropertyValue(name) { return this.properties[name] ?? ""; },
            removeProperty(name) { delete this.properties[name]; },
        };
        this._className = "";
        this._textContent = "";
        this._tabIndex = -1;
        this._value = "";
        this._maxLength = null;
        this.focused = false;
        this.parentNode = null;
        this._listeners = {};
    }

    addEventListener(type, fn) {
        (this._listeners[type] ??= []).push(fn);
    }

    removeEventListener(type, fn) {
        const list = this._listeners[type];
        if (!list) return;
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
    }

    dispatch(type, event = {}) {
        for (const fn of this._listeners[type] ?? []) fn(event);
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (this.parentNode) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx >= 0) this.parentNode.children.splice(idx, 1);
            this.parentNode = null;
        }
    }

    querySelectorAll(selector) {
        const found = [];
        const walk = (node) => {
            for (const child of node.children) {
                if (matchesSimpleSelector(child, selector)) found.push(child);
                walk(child);
            }
        };
        walk(this);
        return found;
    }

    matches(selector) {
        return matchesSimpleSelector(this, selector);
    }

    closest(selector) {
        let node = this;
        while (node) {
            if (matchesSimpleSelector(node, selector)) return node;
            node = node.parentNode;
        }
        return null;
    }

    contains(node) {
        let cur = node;
        while (cur) {
            if (cur === this) return true;
            cur = cur.parentNode;
        }
        return false;
    }

    focus() {
        this.focused = true;
        if (globalThis.document) globalThis.document.activeElement = this;
    }

    get inert() {
        return this._inert ?? false;
    }

    set inert(v) {
        this._inert = v;
    }

    get className() {
        return this._className;
    }

    set className(v) {
        this._className = v;
    }

    get textContent() {
        return this._textContent;
    }

    set textContent(v) {
        this._textContent = v;
    }

    get tabIndex() {
        return this._tabIndex;
    }

    get value() {
        return this._value;
    }

    set value(v) {
        this._value = v;
    }

    get maxLength() {
        return this._maxLength;
    }

    set maxLength(v) {
        this._maxLength = v;
    }

    set tabIndex(v) {
        this._tabIndex = v;
    }
}

class FakeTextNode extends FakeNode {
    constructor(text) {
        super();
        this._textContent = text;
        this.children = [];
    }

    get textContent() {
        return this._textContent;
    }

    set textContent(v) {
        this._textContent = v;
    }
}

export function installFakeDocument() {
    const originalDocument = globalThis.document;
    const originalElement = globalThis.Element;
    const originalNode = globalThis.Node;
    const body = new FakeElement("body");
    // The real documentElement carries the lang the message catalogue reads
    // and the style object the CSS strings are written onto. Tests may set
    // `document.documentElement.lang` to exercise the other language.
    const documentElement = new FakeElement("html");
    documentElement.lang = "ko";
    const docListeners = {};
    globalThis.document = {
        createElement: (tag) => new FakeElement(tag),
        createTextNode: (text) => new FakeTextNode(text),
        documentElement,
        body,
        activeElement: body,
        visibilityState: "visible",
        addEventListener(type, fn) { (docListeners[type] ??= []).push(fn); },
        removeEventListener(type, fn) {
            const list = docListeners[type];
            if (!list) return;
            const idx = list.indexOf(fn);
            if (idx >= 0) list.splice(idx, 1);
        },
        dispatch(type, event = {}) {
            for (const fn of docListeners[type] ?? []) fn(event);
        },
    };
    globalThis.Element = FakeElement;
    globalThis.Node = FakeNode;
    return function uninstall() {
        globalThis.document = originalDocument;
        globalThis.Element = originalElement;
        globalThis.Node = originalNode;
    };
}

export function fakeRoot() {
    return new FakeElement("div");
}

export { FakeElement };
