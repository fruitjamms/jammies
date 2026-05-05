import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import Sprite from "./Sprite";
import { BUDDY_SPRITE_SIZE } from "../../shared/buddyLayout.js";

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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function readPersistedHatched() {
  try {
    return window.api?.getBuddyHatchedSync?.() === true;
  } catch {
    return false;
  }
}

function App() {
  const persistedHatchedRef = useRef(null);
  if (persistedHatchedRef.current === null) {
    persistedHatchedRef.current = readPersistedHatched();
  }
  const initialHatched = persistedHatchedRef.current;

  const [commentary, setCommentary] = useState("");
  const [petting, setPetting] = useState(false);
  const [shellHatched, setShellHatched] = useState(initialHatched);
  const hatchedRef = useRef(initialHatched);
  const buddyRootRef = useRef(null);
  const spriteStackRef = useRef(null);
  const spinWrapRef = useRef(null);
  const hitboxRef = useRef(null);
  const dragPointerId = useRef(null);
  const draggingRef = useRef(false);

  const modeRef = useRef("roaming");
  const spinDegRef = useRef(0);
  const spinVelRef = useRef(0);
  const spinBumpRef = useRef(0);
  const airVelRef = useRef({ vx: 0, vy: 0 });
  const airVelSmoothRef = useRef({ vx: 0, vy: 0 });
  const lastEdgeBonkRef = useRef(null);
  const landFxTimerRef = useRef(null);
  const lastRubSampleRef = useRef(null);

  const rubFirstMoveAtRef = useRef(null);

  const rubPathAccumRef = useRef(0);
  const rubHoverRef = useRef(false);
  const pettingRubRef = useRef(false);

  const petBlushLatchedRef = useRef(false);

  const rubLeaveGraceTimerRef = useRef(null);

  function buddyIsAirborne() {
    const buddy = buddyRootRef.current;
    return modeRef.current === "airborne" || !!buddy?.classList.contains("fx-air");
  }

  const setPettingSynced = useCallback((next) => {
    if (pettingRubRef.current === next) return;
    pettingRubRef.current = next;
    setPetting(next);
  }, []);
  const commentaryClearTimerRef = useRef(null);
  const startCommentaryRef = useRef(() => {});
  const silenceCommentaryRef = useRef(() => {});

  const onBuddyHatched = useCallback(() => {
    hatchedRef.current = true;
    setShellHatched(true);
    window.api?.buddyHatched?.();
  }, []);

  useLayoutEffect(() => {
    if (initialHatched) window.api?.buddyHatched?.();
  }, []);

  useEffect(() => {
    if (!window.api?.onSystemResume) return undefined;
    return window.api.onSystemResume(() => {
      if (!hatchedRef.current) return;
      window.api?.buddyHatched?.();
    });
  }, []);

  silenceCommentaryRef.current = () => {
    if (commentaryClearTimerRef.current != null) {
      clearTimeout(commentaryClearTimerRef.current);
      commentaryClearTimerRef.current = null;
    }
    setCommentary("");
  };

  startCommentaryRef.current = (text) => {
    if (commentaryClearTimerRef.current != null) {
      clearTimeout(commentaryClearTimerRef.current);
      commentaryClearTimerRef.current = null;
    }
    setCommentary(text);
    commentaryClearTimerRef.current = setTimeout(() => {
      setCommentary("");
      commentaryClearTimerRef.current = null;
    }, 4000);
  };

  useEffect(() => {
    if (!window.api?.onCommentary) return undefined;

    window.api.onCommentary((text) => {
      if (!hatchedRef.current) return;
      if (modeRef.current === "airborne") return;
      startCommentaryRef.current(text);
    });
    return undefined;
  }, []);

  useEffect(
    () => () => {
      if (commentaryClearTimerRef.current != null) {
        clearTimeout(commentaryClearTimerRef.current);
        commentaryClearTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!shellHatched || !window.api?.setCommentaryActive) return undefined;
    window.api.setCommentaryActive(!!commentary);
    return undefined;
  }, [commentary, shellHatched]);

  useEffect(() => {
    if (!shellHatched) {
      if (rubLeaveGraceTimerRef.current != null) {
        clearTimeout(rubLeaveGraceTimerRef.current);
        rubLeaveGraceTimerRef.current = null;
      }
      lastRubSampleRef.current = null;
      rubFirstMoveAtRef.current = null;
      rubPathAccumRef.current = 0;
      rubHoverRef.current = false;
      petBlushLatchedRef.current = false;
      setPettingSynced(false);
      window.api?.setPettingActive?.(false);
      return undefined;
    }
    window.api?.setPettingActive?.(petting);
    return () => {
      window.api?.setPettingActive?.(false);
    };
  }, [petting, shellHatched, setPettingSynced]);

  useEffect(() => {
    if (!shellHatched) return undefined;

    const RUB_LEAVE_GRACE_MS = 180;

    function cancelRubLeaveGrace() {
      if (rubLeaveGraceTimerRef.current != null) {
        clearTimeout(rubLeaveGraceTimerRef.current);
        rubLeaveGraceTimerRef.current = null;
      }
    }

    function finalizeRubPetLeave() {
      petBlushLatchedRef.current = false;
      setPettingSynced(false);
      lastRubSampleRef.current = null;
      rubFirstMoveAtRef.current = null;
      rubPathAccumRef.current = 0;
    }

    const onEnter = () => {
      cancelRubLeaveGrace();
      window.api?.setIgnoreMouse?.(false);
      rubHoverRef.current = true;
      lastRubSampleRef.current = null;
      rubFirstMoveAtRef.current = null;
      rubPathAccumRef.current = 0;
    };
    const onLeave = () => {
      if (!draggingRef.current) window.api?.setIgnoreMouse?.(true);
      rubHoverRef.current = false;
      cancelRubLeaveGrace();
      rubLeaveGraceTimerRef.current = setTimeout(() => {
        rubLeaveGraceTimerRef.current = null;
        finalizeRubPetLeave();
      }, RUB_LEAVE_GRACE_MS);
    };

    const hb = hitboxRef.current;
    if (hb) {
      hb.addEventListener("pointerenter", onEnter);
      hb.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelRubLeaveGrace();
      if (hb) {
        hb.removeEventListener("pointerenter", onEnter);
        hb.removeEventListener("pointerleave", onLeave);
      }
    };
  }, [shellHatched, setPettingSynced]);

  useEffect(() => {
    if (!shellHatched || !window.api?.onBuddyState) return undefined;

    const unsub = window.api.onBuddyState((state) => {
      const el = buddyRootRef.current;
      if (!el) return;
      const was = modeRef.current;
      const changed = state.mode !== was;
      modeRef.current = state.mode;

      if (state.mode === "airborne" && was !== "airborne") {
        silenceCommentaryRef.current();
        if (rubLeaveGraceTimerRef.current != null) {
          clearTimeout(rubLeaveGraceTimerRef.current);
          rubLeaveGraceTimerRef.current = null;
        }
        petBlushLatchedRef.current = false;
        setPettingSynced(false);
        lastRubSampleRef.current = null;
        rubFirstMoveAtRef.current = null;
        rubPathAccumRef.current = 0;
      }

      if (state.mode === "airborne" && Number.isFinite(state.vx)) {
        airVelRef.current = {
          vx: state.vx,
          vy: Number.isFinite(state.vy) ? state.vy : 0,
        };
      } else if (state.mode === "roaming") {
        airVelRef.current = { vx: 0, vy: 0 };
      }

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
  }, [shellHatched, setPettingSynced]);

  useEffect(() => {
    if (!shellHatched || !window.api?.onBuddyFx) return undefined;

    const unsub = window.api.onBuddyFx((fx) => {
      const buddy = buddyRootRef.current;
      const spriteStack = spriteStackRef.current;
      if (!buddy) return;

      if (fx.kind === "throw") {
        buddy.classList.add("fx-air");
        spinBumpRef.current = 0;
        spinVelRef.current = 0;
        spinDegRef.current = 0;
        spinWrapRef.current?.style.setProperty("--spin", "0deg");
        if (rubLeaveGraceTimerRef.current != null) {
          clearTimeout(rubLeaveGraceTimerRef.current);
          rubLeaveGraceTimerRef.current = null;
        }
        petBlushLatchedRef.current = false;
        setPettingSynced(false);
        lastRubSampleRef.current = null;
        rubFirstMoveAtRef.current = null;
        rubPathAccumRef.current = 0;
      }

      if (fx.kind === "wall") {
        buddy.classList.remove("fx-wall");
        void buddy.offsetWidth;
        buddy.classList.add("fx-wall");
        const bump = 1.6 + (fx.speed ?? 0.5) * 3.2;
        if (fx.side === "left") spinBumpRef.current += bump;
        else if (fx.side === "right") spinBumpRef.current -= bump;
        else spinBumpRef.current += (Math.random() - 0.5) * bump * 0.4;
        spinBumpRef.current = clamp(spinBumpRef.current, -18, 18);
      }

      if (fx.kind === "land") {
        buddy.classList.remove("fx-air");
        spinBumpRef.current = 0;
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
        spinBumpRef.current = 0;
        spinVelRef.current = 0;
        spinDegRef.current = 0;
      }
    });
    return () => unsub?.();
  }, [shellHatched, setPettingSynced]);

  useEffect(() => {
    if (!shellHatched) return undefined;
    const hb = hitboxRef.current;
    if (!hb) return undefined;

    function onRubMove(event) {
      if (draggingRef.current || buddyIsAirborne()) return;
      const last = lastRubSampleRef.current;
      let dist = 0;
      if (last) {
        dist = Math.hypot(event.clientX - last.x, event.clientY - last.y);
      }
      lastRubSampleRef.current = { x: event.clientX, y: event.clientY };
      if (pettingRubRef.current) return;

      if (dist < 0.35) return;

      rubPathAccumRef.current += dist;
      if (rubFirstMoveAtRef.current === null) rubFirstMoveAtRef.current = performance.now();

      const RUB_MS = 240;
      const RUB_PATH_IMMEDIATE_PX = 52;
      const elapsed = performance.now() - rubFirstMoveAtRef.current;
      if (rubPathAccumRef.current >= RUB_PATH_IMMEDIATE_PX || elapsed >= RUB_MS) {
        petBlushLatchedRef.current = true;
        setPettingSynced(true);
      }
    }

    hb.addEventListener("pointermove", onRubMove);
    return () => hb.removeEventListener("pointermove", onRubMove);
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
        const t = dt / 16.67;
        spinBumpRef.current *= 0.9 ** Math.min(1, t);
        if (Math.abs(spinBumpRef.current) < 0.08) spinBumpRef.current = 0;

        const v = airVelRef.current;
        const sm = airVelSmoothRef.current;
        const k = Math.min(1, dt * 0.028);
        const vxSm = sm.vx + (v.vx - sm.vx) * k;
        const vySm = sm.vy + (v.vy - sm.vy) * k;
        airVelSmoothRef.current = { vx: vxSm, vy: vySm };

        const lean = clamp(-vxSm * 0.34, -11, 11);
        const target = lean + spinBumpRef.current;
        const follow = Math.min(1, dt * 0.02);
        spinDeg += (target - spinDeg) * follow;
        spinVel = 0;
      } else {
        airVelSmoothRef.current = { vx: 0, vy: 0 };
        spinBumpRef.current = 0;
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
      if (rubLeaveGraceTimerRef.current != null) {
        clearTimeout(rubLeaveGraceTimerRef.current);
        rubLeaveGraceTimerRef.current = null;
      }
      lastRubSampleRef.current = null;
      rubFirstMoveAtRef.current = null;
      rubPathAccumRef.current = 0;
      petBlushLatchedRef.current = false;
      setPettingSynced(false);
      silenceCommentaryRef.current();
      dragPointerId.current = event.pointerId;
      hb.setPointerCapture(event.pointerId);
      buddyRootRef.current?.classList.remove("fx-air");
      spinBumpRef.current = 0;
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
  }, [shellHatched, setPettingSynced]);

  return (
    <div
      className={`buddy-shell ${shellHatched ? "buddy-shell--hatched" : "buddy-shell--egg"}`}
      style={{ "--buddy-sprite-px": `${BUDDY_SPRITE_SIZE}px` }}
    >
      <div ref={buddyRootRef} className="buddy">
        <div ref={spriteStackRef} className="buddy-sprite-stack">
          <div className="buddy-sprite-flip">
            <div ref={spinWrapRef} className="buddy-sprite-spin">
              <Sprite
                name="octo"
                skipEgg={shellHatched}
                state={petting ? "pet" : commentary ? "talking" : "idle"}
                onHatched={onBuddyHatched}
              />
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
