// Source-image coordinates keep the camera stable across viewport changes.
export const SCENE = Object.freeze({ width: 1672, height: 941, vanishingX: .5, vanishingY: .75,
  focal: .48, cameraHeight: 1.7, roadHalfWidth: 3, near: .8, length: 180, seconds: 30 });
export const wrap = (x, period) => ((x % period) + period) % period;
export const distanceAt = seconds => wrap(seconds, SCENE.seconds) * SCENE.length / SCENE.seconds;
export function depthAt(seed, seconds) { return SCENE.near + wrap(seed - distanceAt(seconds), SCENE.length); }
export function project(x, z, elevation = 0) {
  return { x: SCENE.vanishingX + SCENE.focal * x / z,
    y: SCENE.vanishingY + (SCENE.cameraHeight - elevation * SCENE.focal * SCENE.width / SCENE.height) / z };
}
export function coverLayout(width, height, anchor = 'center bottom') {
  const scale = Math.max(width / SCENE.width, height / SCENE.height);
  const drawWidth = SCENE.width * scale, drawHeight = SCENE.height * scale;
  const [horizontal, vertical = 'center'] = anchor.split(' ');
  const ax = horizontal === 'left' ? 0 : horizontal === 'right' ? 1 : .5;
  const ay = vertical === 'top' ? 0 : vertical === 'bottom' ? 1 : .5;
  return { width: drawWidth, height: drawHeight, x: (width - drawWidth) * ax, y: (height - drawHeight) * ay };
}

// Atlas regions exclude neighboring objects; PNG alpha is preserved at runtime.
export const SPRITES = Object.freeze([
  { name: 'cottage', rect: [24, 130, 506, 498] },
  { name: 'slate-cottage', rect: [550, 209, 1033, 505] },
  { name: 'oak', rect: [1044, 64, 1528, 520] },
  { name: 'poplar', rect: [157, 526, 354, 1000] },
  { name: 'hedge', rect: [514, 718, 1015, 951] },
  { name: 'wall', rect: [1065, 799, 1515, 966] }
]);
export function makeRoadside() {
  const objects = [];
  for (let row = 0; row < 12; row++) {
    for (const side of [-1, 1]) {
      const seed = row * 15 + (side > 0 ? 7 : 0);
      if (row % 3 !== 2) objects.push({ type: row % 2, x: side * (8.2 + row % 3 * 2.6), seed: seed + 1.5, width: 2.8 });
      objects.push({ type: row % 3 === 0 ? 3 : 2, x: side * (6.2 + row % 4 * 1.15), seed: seed + 7.7,
        width: row % 3 === 0 ? .85 : 1.9 });
      objects.push({ type: 4, x: side * (3.65 + row % 2 * .25), seed: seed + 4, width: 1.4 });
      if (row % 2 === 0) objects.push({ type: 5, x: side * 4.6, seed: seed + 10, width: 1.8 });
      objects.push({ type: 4, x: side * (14 + row % 3 * 5), seed: seed + 12, width: 3.2 });
    }
  }
  return objects;
}
