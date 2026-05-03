import sprites from "./sprites";

// Renders a 16x16 pixel art sprite scaled up with crisp pixelated rendering.
// Props:
//   name   — key from sprites/index.js (e.g. "egg")
//   size   — display size in px (default 128, must be a multiple of 16)
//   alt    — accessible label
function Sprite({ name, size = 128, alt = "" }) {
  const src = sprites[name];
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export default Sprite;
