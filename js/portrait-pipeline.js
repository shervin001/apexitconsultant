/* ============================================================
   Apex IT Consultant — portrait-pipeline.js
   Shared photo → masked-person pipeline used by the team pages
   (team.html and themes_v2.html).

   computePersonSample(img) removes the background in the browser:
     a. MediaPipe selfie segmentation (person mask, ~250 KB model)
     b. fallback: corner-color keying (uniform backgrounds)
     c. fallback: feathered oval vignette
   and returns the masked pixels plus the person's bounding box,
   so any renderer can turn them into geometry.
   ============================================================ */

const MEDIAPIPE_VERSION = '0.10.14';
const MEDIAPIPE_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const SELFIE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(
      `Could not load "${src}". Save the photo at that exact path under profile_pic/ (see js/team-config.js).`
    ));
    img.src = src;
  });
}

/* Draw an image scaled down to at most `maxDim` on a canvas. */
function drawScaled(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  return c;
}

/* Fraction of border pixels a mask claims as "person" — a person
   mask in a portrait touches little of the border, a background
   mask touches most of it. Used to auto-pick mask polarity. */
function borderScore(alpha, w, h) {
  let cnt = 0;
  let tot = 0;
  for (let x = 0; x < w; x++) {
    tot += 2;
    if (alpha[x] > 0.5) cnt++;
    if (alpha[(h - 1) * w + x] > 0.5) cnt++;
  }
  for (let y = 0; y < h; y++) {
    tot += 2;
    if (alpha[y * w] > 0.5) cnt++;
    if (alpha[y * w + (w - 1)] > 0.5) cnt++;
  }
  return cnt / tot;
}

function coverage(alpha) {
  let sum = 0;
  for (let i = 0; i < alpha.length; i++) sum += alpha[i] > 0.5 ? 1 : 0;
  return sum / alpha.length;
}

/* A mask is plausible if it is mostly centered (small border touch)
   and covers a sane share of the frame. */
function maskLooksValid(alpha, w, h) {
  const cov = coverage(alpha);
  return cov > 0.04 && cov < 0.88 && borderScore(alpha, w, h) < 0.45;
}

let segmenterPromise = null;
function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await import(`${MEDIAPIPE_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE}/wasm`);
      return vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SELFIE_MODEL_URL },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
      });
    })();
  }
  return segmenterPromise;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms)),
  ]);
}

/* Strategy a: ML person segmentation. Returns alpha 0..1 per pixel
   of the given canvas, or null if unavailable/implausible. */
async function maskWithSegmenter(srcCanvas) {
  try {
    const segmenter = await withTimeout(getSegmenter(), 15000, 'Segmentation model');
    const result = segmenter.segment(srcCanvas);
    const w = srcCanvas.width;
    const h = srcCanvas.height;

    // Evaluate every returned confidence mask in both polarities and
    // keep the most person-like one (centered, sane coverage).
    let best = null;
    let bestScore = Infinity;
    for (const mask of result.confidenceMasks || []) {
      const data = mask.getAsFloat32Array();
      for (const invert of [false, true]) {
        const alpha = new Float32Array(w * h);
        for (let i = 0; i < alpha.length; i++) {
          alpha[i] = invert ? 1 - data[i] : data[i];
        }
        if (!maskLooksValid(alpha, w, h)) continue;
        const score = borderScore(alpha, w, h);
        if (score < bestScore) {
          bestScore = score;
          best = alpha;
        }
      }
    }
    result.close();
    return best;
  } catch (err) {
    console.warn('Person segmentation unavailable, falling back:', err.message);
    return null;
  }
}

/* Strategy b: corner-color keying — treat anything close to the
   average color of the image corners as background. Works well on
   fairly uniform backdrops. */
function maskWithCornerKey(imageData) {
  const { data, width: w, height: h } = imageData;
  const block = Math.max(4, Math.round(Math.min(w, h) * 0.06));
  const corners = [[0, 0], [w - block, 0], [0, h - block], [w - block, h - block]].map(([cx, cy]) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy; y < cy + block; y++) {
      for (let x = cx; x < cx + block; x++) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  });

  const alpha = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    let minDist = Infinity;
    for (const [cr, cg, cb] of corners) {
      const d = Math.abs(data[i] - cr) + Math.abs(data[i + 1] - cg) + Math.abs(data[i + 2] - cb);
      if (d < minDist) minDist = d;
    }
    // 0 at <60, 1 at >150 of summed RGB distance (0..765 scale)
    alpha[p] = Math.min(1, Math.max(0, (minDist - 60) / 90));
  }
  return maskLooksValid(alpha, w, h) ? alpha : null;
}

/* Strategy c: feathered oval — never fails, head-and-shoulders guess. */
function maskWithOval(w, h) {
  const alpha = new Float32Array(w * h);
  const cx = 0.5, cy = 0.44, rx = 0.34, ry = 0.42;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x / w - cx) / rx;
      const dy = (y / h - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      alpha[y * w + x] = Math.min(1, Math.max(0, (1.05 - d) / 0.18));
    }
  }
  return alpha;
}

/* Full pipeline: image element → masked pixels + person bbox.
   Returns { w, h, imageData, alpha, bbox: { minX, minY, maxX, maxY,
   bw, bh, cx, cy } }. */
export async function computePersonSample(img, workSize = 480) {
  const work = drawScaled(img, workSize);
  const g = work.getContext('2d', { willReadFrequently: true });
  const imageData = g.getImageData(0, 0, work.width, work.height);
  const w = work.width;
  const h = work.height;

  let alpha = await maskWithSegmenter(work);
  if (!alpha) alpha = maskWithCornerKey(imageData);
  if (!alpha) alpha = maskWithOval(w, h);

  // Bounding box of the person (so any framing fills the stage).
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) {
    minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  return {
    w, h, imageData, alpha,
    bbox: { minX, minY, maxX, maxY, bw, bh, cx: minX + bw / 2, cy: minY + bh / 2 },
  };
}

/* The masked person cropped to the bbox, as a canvas with real
   alpha — ready to become a texture (hologram mode etc.). */
export function makeMaskedCanvas(sample) {
  const { w, imageData, alpha, bbox } = sample;
  const out = document.createElement('canvas');
  out.width = bbox.bw;
  out.height = bbox.bh;
  const g = out.getContext('2d');
  const outData = g.createImageData(bbox.bw, bbox.bh);
  const src = imageData.data;
  for (let y = 0; y < bbox.bh; y++) {
    for (let x = 0; x < bbox.bw; x++) {
      const si = ((y + bbox.minY) * w + (x + bbox.minX)) * 4;
      const di = (y * bbox.bw + x) * 4;
      outData.data[di] = src[si];
      outData.data[di + 1] = src[si + 1];
      outData.data[di + 2] = src[si + 2];
      outData.data[di + 3] = Math.round(alpha[(y + bbox.minY) * w + (x + bbox.minX)] * 255);
    }
  }
  g.putImageData(outData, 0, 0);
  return out;
}
