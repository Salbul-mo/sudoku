// VisualViewport geometry: on-screen keyboards shrink the visual viewport
// while the layout viewport stays put (R4), and resize/scroll events can
// fire out of sync with each other (RK2), so every observer coalesces into
// one rAF-scheduled recompute.
const MIN_SCALE = 0.1;

export function computeGeometry(vv, fallbackHeight, boardWidth, reserved) {
    if (!(boardWidth > 0)) throw new RangeError(`boardWidth must be > 0, got ${boardWidth}`);
    if (reserved < 0) throw new RangeError(`reserved must be >= 0, got ${reserved}`);

    const visibleTop = vv?.offsetTop ?? 0;
    const visibleHeight = vv?.height ?? fallbackHeight;
    const available = Math.max(0, visibleHeight - reserved);
    const scale = Math.min(1, available / boardWidth);
    return { visibleTop, boardScale: Math.max(scale, MIN_SCALE) };
}

export function observeViewport(vv, cb, deps = {}) {
    const raf = deps.requestAnimationFrame ?? requestAnimationFrame;
    let queued = false;
    const onEvent = () => {
        if (queued) return;
        queued = true;
        raf(() => {
            queued = false;
            cb(vv);
        });
    };
    vv.addEventListener("resize", onEvent);
    vv.addEventListener("scroll", onEvent);
    return () => {
        vv.removeEventListener("resize", onEvent);
        vv.removeEventListener("scroll", onEvent);
    };
}
