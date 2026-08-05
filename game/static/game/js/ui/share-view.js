// Length has a single threshold: 2,000 is a soft warning that a shared link
// is getting long.
const SCOPES = ["SC1", "SC2"];
const WARN_LENGTH = 2000;

export async function buildLink(deps, scope, savedAt) {
    const { location, session, encode } = deps;
    if (!SCOPES.includes(scope)) throw new RangeError(`unknown scope: ${scope}`);
    if (typeof encode !== "function") throw new TypeError("buildLink: deps.encode must be a function");

    const fragment = await encode(session, scope, savedAt);
    const link = `${location.origin}${location.pathname}#s=${fragment}`;
    // Never assigns location.hash and never calls pushState here (V4-12):
    // building a link must not touch the address bar as a side effect.
    return { ok: true, link, length: link.length, warn: link.length > WARN_LENGTH };
}

export function createShareView(deps) {
    let currentLink = null;

    async function copy(link) {
        try {
            await navigator.clipboard.writeText(link);
            deps.announcer.announce("link-copied", "링크를 복사했습니다");
            return { ok: true };
        } catch {
            deps.showSelectableInput?.(link);
            deps.announcer.announce("link-copied", "복사 권한이 없어 직접 선택할 수 있게 표시했습니다");
            return { ok: false, fallback: true };
        }
    }

    function share(link) {
        // Must be called synchronously from within the click handler that
        // triggered it -- calling later would fall outside user activation.
        if (navigator.share) navigator.share({ url: link }).catch(() => {});
    }

    async function build(scope) {
        const result = await buildLink(deps, scope, deps.savedAt ?? null);
        if (result.ok) currentLink = result.link;
        return result;
    }

    return {
        build,
        copy: () => copy(currentLink),
        share: () => share(currentLink),
        get currentLink() { return currentLink; },
    };
}
