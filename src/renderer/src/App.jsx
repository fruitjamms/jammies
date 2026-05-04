import { useState, useEffect, useRef, useCallback } from "react";
import Sprite from "./Sprite";

function screenCoords(event) {
  let x = event.screenX;
  let y = event.screenY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    x = window.screenX + event.clientX;
    y = window.screenY + event.clientY;
  }
  return { x, y };
}

function uprightSpin(dt, spinDeg, spinVel) {
  const t = Math.min(1, dt / 16.67);
  const nextDeg = spinDeg + (0 - spinDeg) * (1 - 0.88 ** t) * 0.35;
  const nextVel = spinVel * 0.82 ** t;
  if (Math.abs(nextDeg) < 0.4 && Math.abs(nextVel) < 0.08) return { spinDeg: 0, spinVel: 0 };
  return { spinDeg: nextDeg, spinVel: nextVel };
}

function airborneSpin(dt, spinDeg, spinVel) {
  const t = Math.min(1, dt / 16.67);
  let nextDeg = spinDeg + spinVel * t;
  let nextVel = spinVel * 0.93 ** t;
  if (Math.abs(nextVel) < 0.03) nextVel = 0;
  const cap = 38;
  if (nextDeg > cap) {
    nextDeg = cap;
    nextVel *= -0.35;
  } else if (nextDeg < -cap) {
    nextDeg = -cap;
    nextVel *= -0.35;
  }
  return { spinDeg: nextDeg, spinVel: nextVel };
}

function App() {
  const [commentary, setCommentary] = useState("");
  const [shellHatched, setShellHatched] = useState(false);
  const hatchedRef = useRef(false);
  const buddyRootRef = useRef(null);
  const spriteStackRef = useRef(null);
  const spinWrapRef = useRef(null);
  const hitboxRef = useRef(null);
  const dragPointerId = useRef(null);
  const draggingRef = useRef(false);

  const modeRef = useRef("roaming");
  const spinDegRef = useRef(0);
  const spinVelRef = useRef(0);
  const lastEdgeBonkRef = useRef(null);
  const landFxTimerRef = useRef(null);

  const onBuddyHatched = useCallback(() => {
    hatchedRef.current = true;
    setShellHatched(true);
    window.api?.buddyHatched?.();
  }, []);

  useEffect(() => {
    if (!window.api?.onCommentary) return undefined;

    window.api.onCommentary((text) => {
      if (!hatchedRef.current) return;
      setCommentary(text);
      setTimeout(() => setCommentary(""), 4000);
    });
    return undefined;
  }, []);

  useEffect(() => {
    if (!shellHatched) return undefined;

    const makeClickable = () => window.api?.setIgnoreMouse?.(false);
    const makeClickThrough = () => {
      if (!draggingRef.current) window.api?.setIgnoreMouse?.(true);
    };

    const hb = hitboxRef.current;
    if (hb) {
      hb.addEventListener("mouseenter", makeClickable);
      hb.addEventListener("mouseleave", makeClickThrough);
    }
    return () => {
      if (hb) {
        hb.removeEventListener("mouseenter", makeClickable);
        hb.removeEventListener("mouseleave", makeClickThrough);
      }
    };
  }, [shellHatched]);

  useEffect(() => {
    if (!shellHatched || !window.api?.onBuddyState) return undefined;

    const unsub = window.api.onBuddyState((state) => {
      const el = buddyRootRef.current;
      if (!el) return;
      const changed = state.mode !== modeRef.current;
      modeRef.current = state.mode;

      el.classList.toggle("roaming", state.mode === "roaming");
      el.classList.toggle("airborne", state.mode === "airborne");
      el.dataset.laneSlot = String(state.laneSlot ?? 0);
      el.classList.toggle("left", state.direction < 0);

      if (state.edgeBonk && state.edgeBonk !== lastEdgeBonkRef.current) {
        el.classList.remove("fx-wall");
        void el.offsetWidth;
        el.classList.add("fx-wall");
      }
      lastEdgeBonkRef.current = state.edgeBonk || null;

      if (changed) {
        lastEdgeBonkRef.current = null;
      }
    });
    return () => unsub?.();
  }, [shellHatched]);

  useEffect(() => {
    if (!shellHatched || !window.api?.onBuddyFx) return undefined;

    const unsub = window.api.onBuddyFx((fx) => {
      const buddy = buddyRootRef.current;
      const spriteStack = spriteStackRef.current;
      if (!buddy) return;

      if (fx.kind === "throw") {
        buddy.classList.add("fx-air");
        const speed = fx.speed ?? 0.5;
        const kick = (fx.spinKick ?? 0) * (0.45 + Math.random() * 0.7);
        const wobble = (Math.random() - 0.5) * (12 + speed * 18);
        spinVelRef.current = kick * 0.72 + wobble;
        spinDegRef.current = (Math.random() - 0.5) * 48;
        spinWrapRef.current?.style.setProperty("--spin", `${spinDegRef.current.toFixed(2)}deg`);
      }

      if (fx.kind === "wall") {
        buddy.classList.remove("fx-wall");
        void buddy.offsetWidth;
        buddy.classList.add("fx-wall");
        const bump = 2.8 + (fx.speed ?? 0.5) * 6;
        spinVelRef.current +=
          fx.side === "left" ? bump : fx.side === "right" ? -bump : (Math.random() - 0.5) * bump;
      }

      if (fx.kind === "land") {
        buddy.classList.remove("fx-air");
        spinVelRef.current = 0;
        spinDegRef.current = 0;
        if (spriteStack) {
          spriteStack.classList.remove("fx-land");
          void spriteStack.offsetWidth;
          spriteStack.classList.add("fx-land");
        }
        if (landFxTimerRef.current) clearTimeout(landFxTimerRef.current);
        landFxTimerRef.current = setTimeout(() => {
          spriteStack?.classList.remove("fx-land");
          landFxTimerRef.current = null;
        }, 420);
      }

      if (fx.kind === "tap") {
        buddy.classList.remove("fx-tap");
        void buddy.offsetWidth;
        buddy.classList.add("fx-tap");
        setTimeout(() => buddy.classList.remove("fx-tap"), 160);
      }

      if (fx.kind === "drop") {
        spinVelRef.current = 0;
        spinDegRef.current = 0;
      }
    });
    return () => unsub?.();
  }, [shellHatched]);

  useEffect(() => {
    if (!shellHatched) return undefined;

    let alive = true;
    let lastTs = 0;

    function tick(ts) {
      if (!alive) return;
      if (!lastTs) lastTs = ts;
      const dt = Math.min(48, ts - lastTs);
      lastTs = ts;

      const buddy = buddyRootRef.current;
      const airborne =
        modeRef.current === "airborne" || buddy?.classList.contains("fx-air");

      let { spinDeg, spinVel } = { spinDeg: spinDegRef.current, spinVel: spinVelRef.current };
      if (airborne) {
        const o = airborneSpin(dt, spinDeg, spinVel);
        spinDeg = o.spinDeg;
        spinVel = o.spinVel;
      } else {
        const o = uprightSpin(dt, spinDeg, spinVel);
        spinDeg = o.spinDeg;
        spinVel = o.spinVel;
      }
      spinDegRef.current = spinDeg;
      spinVelRef.current = spinVel;
      spinWrapRef.current?.style.setProperty("--spin", `${spinDeg.toFixed(2)}deg`);

      if (alive) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    return () => {
      alive = false;
    };
  }, [shellHatched]);

  function endDrag(event) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const pid = event?.pointerId ?? dragPointerId.current;
    dragPointerId.current = null;
    buddyRootRef.current?.classList.remove("dragging");
    if (pid != null) {
      try {
        const hb = hitboxRef.current;
        if (hb?.hasPointerCapture(pid)) hb.releasePointerCapture(pid);
      } catch {
        /* ignore */
      }
    }
    window.api?.sendDragEnd?.();
    window.api?.setIgnoreMouse?.(true);
  }

  useEffect(() => {
    if (!shellHatched) return undefined;

    const onMove = (event) => {
      if (!draggingRef.current) return;
      const { x, y } = screenCoords(event);
      if (Number.isFinite(x) && Number.isFinite(y)) window.api?.sendDragging?.({ x, y });
    };

    const onBlur = () => endDrag(undefined);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onBlur);
    };
  }, [shellHatched]);

  useEffect(() => {
    if (!shellHatched) return undefined;
    const hb = hitboxRef.current;
    if (!hb) return undefined;

    const onDown = (event) => {
      if (event.button !== 0) return;
      dragPointerId.current = event.pointerId;
      hb.setPointerCapture(event.pointerId);
      buddyRootRef.current?.classList.remove("fx-air");
      spinVelRef.current = 0;
      spinDegRef.current = 0;
      spinWrapRef.current?.style.setProperty("--spin", "0deg");
      draggingRef.current = true;
      buddyRootRef.current?.classList.add("dragging");
      const { x, y } = screenCoords(event);
      window.api?.sendDragStart?.({ screenX: x, screenY: y });
    };

    const onUp = (e) => endDrag(e);
    const onCancel = (e) => endDrag(e);
    const onLost = (e) => {
      if (draggingRef.current) endDrag(e);
    };

    hb.addEventListener("pointerdown", onDown);
    hb.addEventListener("pointerup", onUp);
    hb.addEventListener("pointercancel", onCancel);
    hb.addEventListener("lostpointercapture", onLost);

    return () => {
      hb.removeEventListener("pointerdown", onDown);
      hb.removeEventListener("pointerup", onUp);
      hb.removeEventListener("pointercancel", onCancel);
      hb.removeEventListener("lostpointercapture", onLost);
    };
  }, [shellHatched]);

  return (
    <div className={`buddy-shell ${shellHatched ? "buddy-shell--hatched" : "buddy-shell--egg"}`}>
      <div ref={buddyRootRef} className="buddy">
        <div ref={spriteStackRef} className="buddy-sprite-stack">
          <div className="buddy-sprite-flip">
            <div ref={spinWrapRef} className="buddy-sprite-spin">
              <Sprite name="octo" state={commentary ? "talking" : "idle"} onHatched={onBuddyHatched} />
            </div>
          </div>
        </div>
        {commentary && <div className="buddy-commentary">{commentary}</div>}
        {shellHatched && (
          <div ref={hitboxRef} className="buddy-hitbox" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

export default App;
