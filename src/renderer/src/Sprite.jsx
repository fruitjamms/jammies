import { useState, useEffect, useRef, useCallback } from "react";
import buddies from "./buddies";

const FRAME_SIZE = 16;

function SpriteCanvas({ src, frameIndex, size }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const frameRef = useRef(frameIndex);
  frameRef.current = frameIndex;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      frameRef.current * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
      0, 0, size, size
    );
  }, [size]);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => { imgRef.current = img; draw(); };
  }, [src, draw]);

  useEffect(() => { draw(); }, [frameIndex, draw]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function EggSprite({ eggConfig, size, onHatched }) {
  const { src, idleFrames, idleMs, hatchSequence, hatchMs, clicksToHatch } = eggConfig;
  const [clicks, setClicks] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [frame, setFrame] = useState(idleFrames[0]);
  const [shakeOffset, setShakeOffset] = useState(0);
  const hatchIndexRef = useRef(0);
  const timerRef = useRef(null);

  // idle animation
  useEffect(() => {
    if (phase !== "idle") return;
    let i = 0;
    timerRef.current = setInterval(() => {
      i = (i + 1) % idleFrames.length;
      setFrame(idleFrames[i]);
    }, idleMs);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // hatch animation
  useEffect(() => {
    if (phase !== "hatching") return;
    hatchIndexRef.current = 0;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const i = hatchIndexRef.current;
      if (i >= hatchSequence.length) {
        clearInterval(timerRef.current);
        onHatched();
        return;
      }
      setFrame(hatchSequence[i]);
      hatchIndexRef.current += 1;
    }, hatchMs);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  function shake() {
    const offsets = [4, -4, 4, -4, 0];
    let i = 0;
    const interval = setInterval(() => {
      setShakeOffset(offsets[i++]);
      if (i >= offsets.length) clearInterval(interval);
    }, 60);
  }

  function handleClick() {
    if (phase === "hatching") return;
    shake();
    const next = clicks + 1;
    setClicks(next);
    if (next >= clicksToHatch) setPhase("hatching");
  }

  return (
    <div
      onClick={handleClick}
      style={{ transform: `translateX(${shakeOffset}px)`, cursor: "pointer", display: "inline-block", WebkitAppRegion: "no-drag" }}
    >
      <SpriteCanvas src={src} frameIndex={frame} size={size} />
    </div>
  );
}

function BuddySprite({ config, state, size }) {
  const stateConfig = config.states[state] ?? config.states[Object.keys(config.states)[0]];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0);
    const frames = stateConfig.frames;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frames);
    }, stateConfig.ms);
    return () => clearInterval(interval);
  }, [state, stateConfig.frames, stateConfig.ms]);

  return <SpriteCanvas src={stateConfig.src} frameIndex={frame} size={size} />;
}

function Sprite({ name, size = 128, state = "idle", skipEgg = false, onHatched }) {
  const config = buddies[name];
  const [hatched, setHatched] = useState(!config?.egg || skipEgg);

  useEffect(() => {
    if (!hatched || !config) return;
    onHatched?.();
  }, [hatched, onHatched, config]);

  if (!config) return null;

  if (!hatched) {
    return (
      <EggSprite
        eggConfig={config.egg}
        size={size}
        onHatched={() => setHatched(true)}
      />
    );
  }

  return <BuddySprite config={config} state={state} size={size} />;
}

export default Sprite;
