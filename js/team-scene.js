/* ============================================================
   Apex IT Consultant — team-scene.js
   Standalone 3D particle portrait page.

   Pipeline (fully automatic, works for any portrait photo):
     1. Load the photos listed in js/team-config.js
     2. Remove the background in the browser:
        a. MediaPipe selfie segmentation (person mask, ~250 KB model)
        b. fallback: corner-color keying (uniform backgrounds)
        c. fallback: feathered oval vignette
     3. Crop to the person, sample pixels onto a grid, and build a
        3D particle cloud: photo colors, depth from a head-shaped
        dome + luminance relief
     4. Render with a custom shader that morphs between views
        (positions + colors interpolate as stardust)

   Performance/fallback rules match the main site: pixel ratio
   capped at 2, fewer particles on mobile, paused when hidden,
   static rendering under prefers-reduced-motion.
   ============================================================ */

import * as THREE from 'three';
import { PEOPLE, DEFAULT_PERSON } from './team-config.js';

const MEDIAPIPE_VERSION = '0.10.14';
const MEDIAPIPE_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const SELFIE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 767px)').matches;
const TARGET_PARTICLES = isMobile ? 16000 : 42000;

/* ---------- DOM ---------- */
const canvas = document.getElementById('team-canvas');
const statusEl = document.getElementById('team-status');
const statusText = document.getElementById('team-status-text');
const viewsEl = document.getElementById('team-views');
const peopleEl = document.getElementById('team-people');
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.hidden = false;
  statusEl.classList.toggle('error', !!isError);
  statusText.textContent = text;
}
function hideStatus() {
  if (statusEl) statusEl.hidden = true;
}

/* ---------- Person selection (?p=key) ---------- */
const personKey = new URLSearchParams(location.search).get('p') || DEFAULT_PERSON;
const person = PEOPLE[personKey] || PEOPLE[DEFAULT_PERSON];

document.getElementById('team-name').textContent = person.name;
document.getElementById('team-role').textContent = person.role;
document.getElementById('team-focus').textContent = person.focus;
document.getElementById('team-bio').textContent = person.bio || '';
document.title = `${person.name} — Apex IT Consultant`;

// Person switcher pills (only when more than one person is configured).
const personKeys = Object.keys(PEOPLE);
if (personKeys.length > 1 && peopleEl) {
  peopleEl.hidden = false;
  for (const key of personKeys) {
    const a = document.createElement('a');
    a.className = 'team-pill' + (PEOPLE[key] === person ? ' active' : '');
    if (PEOPLE[key] === person) a.setAttribute('aria-current', 'page');
    a.href = `team.html?p=${encodeURIComponent(key)}`;
    a.textContent = PEOPLE[key].name.split(' ')[0];
    peopleEl.appendChild(a);
  }
}

function webglAvailable() {
  try {
    const test = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (test.getContext('webgl2') || test.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

if (!canvas || !webglAvailable()) {
  setStatus('WebGL is not available in this browser — the 3D portrait cannot render.', true);
} else {
  main().catch((err) => {
    console.error(err);
    setStatus('Something went wrong building the portrait: ' + err.message, true);
  });
}

/* ============================================================
   Image → masked pixels
   ============================================================ */

function loadImage(src) {
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

/* ============================================================
   Masked pixels → particle cloud
   ============================================================ */

async function buildCloud(view, viewIndex, viewTotal) {
  setStatus(`Loading photo ${viewIndex + 1}/${viewTotal}…`);
  const img = await loadImage(view.src);

  setStatus(`Removing background (${viewIndex + 1}/${viewTotal})…`);
  const work = drawScaled(img, 480);
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
  const cxN = minX + bw / 2;
  const cyN = minY + bh / 2;

  setStatus(`Assembling particles (${viewIndex + 1}/${viewTotal})…`);

  // First count opaque pixels inside the box, then thin randomly to
  // the particle budget so every photo yields a similar-density cloud.
  let opaque = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (alpha[y * w + x] > 0.35) opaque++;
    }
  }
  const keepP = Math.min(1, TARGET_PARTICLES / Math.max(1, opaque));

  const WORLD_H = 30; // cloud height in world units
  const scale = WORLD_H / bh;
  const positions = [];
  const colors = [];
  const data = imageData.data;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = alpha[y * w + x];
      if (a <= 0.35 || Math.random() > keepP) continue;
      const i = (y * w + x) * 4;
      const r = data[i] / 255;
      const gc = data[i + 1] / 255;
      const b = data[i + 2] / 255;

      // Depth: head-shaped dome over the bounding box + luminance relief.
      const dx = (x - cxN) / (bw * 0.55);
      const dy = (y - cyN) / (bh * 0.55);
      const dome = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
      const lum = 0.2126 * r + 0.7152 * gc + 0.0722 * b;
      const z = dome * 7.0 + (lum - 0.5) * 2.6 + (Math.random() - 0.5) * 0.35;

      positions.push((x - cxN) * scale, (cyN - y) * scale, z);
      colors.push(
        Math.min(1, r * 1.05),
        Math.min(1, gc * 1.05),
        Math.min(1, b * 1.05)
      );
    }
  }

  return {
    positions,
    colors,
    count: positions.length / 3,
    label: view.label,
    worldW: bw * scale, // cloud width in world units (height is WORLD_H)
  };
}

/* Pad every cloud to the same particle count (cycle its own points)
   so the morph has a 1:1 particle mapping. */
function normalizeClouds(clouds) {
  const max = Math.max(...clouds.map((c) => c.count));
  for (const c of clouds) {
    const pos = new Float32Array(max * 3);
    const col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) {
      const src = (i % c.count) * 3;
      const jitter = i < c.count ? 0 : 0.4; // pad copies get a nudge
      pos[i * 3] = c.positions[src] + (Math.random() - 0.5) * jitter;
      pos[i * 3 + 1] = c.positions[src + 1] + (Math.random() - 0.5) * jitter;
      pos[i * 3 + 2] = c.positions[src + 2] + (Math.random() - 0.5) * jitter;
      col[i * 3] = c.colors[src];
      col[i * 3 + 1] = c.colors[src + 1];
      col[i * 3 + 2] = c.colors[src + 2];
    }
    c.pos = pos;
    c.col = col;
  }
  return max;
}

/* ============================================================
   Scene
   ============================================================ */

async function main() {
  if (!person.views || person.views.length === 0) {
    setStatus('No photos configured for this person — see js/team-config.js.', true);
    return;
  }

  /* ----- Build all view clouds ----- */
  const clouds = [];
  const failures = [];
  for (let i = 0; i < person.views.length; i++) {
    try {
      clouds.push(await buildCloud(person.views[i], i, person.views.length));
    } catch (err) {
      console.warn(err.message);
      failures.push(person.views[i].src);
    }
  }
  if (clouds.length === 0) {
    setStatus(
      `No photos found. Save the portrait photos to ${failures.join(' and ')} — the page does the rest.`,
      true
    );
    return;
  }
  const COUNT = normalizeClouds(clouds);

  /* ----- Renderer / scene / camera ----- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 46);

  /* ----- Backdrop stars ----- */
  const starGeo = new THREE.BufferGeometry();
  const starCount = isMobile ? 140 : 380;
  const starArr = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starArr[i * 3] = (Math.random() * 2 - 1) * 90;
    starArr[i * 3 + 1] = (Math.random() * 2 - 1) * 55;
    starArr[i * 3 + 2] = -30 - Math.random() * 60;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starArr, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x8fb8e8,
    size: 0.16,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })));

  /* ----- Portrait particle system ----- */
  const posA = new Float32Array(COUNT * 3);
  const posB = new Float32Array(COUNT * 3);
  const colA = new Float32Array(COUNT * 3);
  const colB = new Float32Array(COUNT * 3);
  const rand = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) rand[i] = Math.random();

  posA.set(clouds[0].pos); posB.set(clouds[0].pos);
  colA.set(clouds[0].col); colB.set(clouds[0].col);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posA, 3)); // for frustum culling only
  geo.setAttribute('positionB', new THREE.BufferAttribute(posB, 3));
  geo.setAttribute('colorA', new THREE.BufferAttribute(colA, 3));
  geo.setAttribute('colorB', new THREE.BufferAttribute(colB, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

  const uniforms = {
    uMix: { value: 0 },
    uTime: { value: 0 },
    uScatter: { value: prefersReducedMotion ? 0 : 1 },
    uSize: { value: (isMobile ? 1.35 : 1.0) * Math.min(window.devicePixelRatio, 2) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 positionB;
      attribute vec3 colorA;
      attribute vec3 colorB;
      attribute float aRand;
      uniform float uMix;
      uniform float uTime;
      uniform float uScatter;
      uniform float uSize;
      varying vec3 vColor;
      varying float vFade;
      void main() {
        vec3 p = mix(position, positionB, uMix);
        // gentle per-particle breathing
        p += 0.09 * vec3(
          sin(uTime * 0.8 + aRand * 6.2831),
          cos(uTime * 0.9 + aRand * 12.0),
          sin(uTime * 0.7 + aRand * 9.0)
        );
        // scatter: fly apart along a per-particle direction
        vec3 dir = normalize(vec3(
          sin(aRand * 78.233),
          cos(aRand * 12.9898),
          sin(aRand * 37.719) + 0.2
        ));
        p += dir * uScatter * (6.0 + aRand * 30.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.8 + aRand * 0.6) * (140.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vColor = mix(colorA, colorB, uMix);
        vFade = 1.0 - uScatter * 0.55;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vFade;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.18, d) * vFade;
        gl_FragColor = vec4(vColor, a);
      }`,
  });

  const cloud = new THREE.Points(geo, material);
  cloud.frustumCulled = false;
  const group = new THREE.Group();
  group.add(cloud);
  scene.add(group);

  // Fit the camera to the widest cloud in BOTH axes, so narrow
  // (mobile) viewports zoom out instead of cropping the portrait.
  // On wide screens the portrait shifts right, clear of the panel;
  // on narrow screens it sits higher, clear of the bottom panel.
  const maxWorldW = Math.max(...clouds.map((c) => c.worldW || 20));
  function fitCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const narrow = window.innerWidth <= 960;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const zForHeight = (15 * 1.12) / t;
    const zForWidth = (maxWorldW * 0.55) / (t * aspect);
    camera.aspect = aspect;
    camera.position.z = Math.max(zForHeight, zForWidth) + (narrow ? 5 : 2);
    camera.updateProjectionMatrix();
    group.position.x = narrow ? 0 : 6;
    group.position.y = narrow ? 3 : -0.5;
  }
  fitCamera();

  /* ----- View switching ----- */
  let currentView = 0;
  let transitioning = false;
  const tweens = [];

  // Tweens with the same key replace each other, so two animations
  // never fight over the same uniform (e.g. uScatter).
  function tween(dur, fn, opts) {
    const { done, key } = opts || {};
    if (key) {
      for (let i = tweens.length - 1; i >= 0; i--) {
        if (tweens[i].key === key) tweens.splice(i, 1);
      }
    }
    tweens.push({ t: 0, dur, fn, done, key });
  }
  const easeInOut = (x) => x * x * (3 - 2 * x);

  function switchView(target) {
    if (target === currentView || transitioning || !clouds[target]) return;
    currentView = target;
    updateViewButtons();

    // Slot the on-screen state into A, the target into B, then mix.
    const mixNow = uniforms.uMix.value;
    for (let i = 0; i < COUNT * 3; i++) {
      posA[i] = posA[i] + (posB[i] - posA[i]) * mixNow;
      colA[i] = colA[i] + (colB[i] - colA[i]) * mixNow;
    }
    posB.set(clouds[target].pos);
    colB.set(clouds[target].col);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.positionB.needsUpdate = true;
    geo.attributes.colorA.needsUpdate = true;
    geo.attributes.colorB.needsUpdate = true;
    uniforms.uMix.value = 0;

    if (prefersReducedMotion) {
      uniforms.uMix.value = 1;
      invalidate();
      return;
    }
    transitioning = true;
    // Blend down whatever scatter was in flight so uScatter never pops.
    const s0 = uniforms.uScatter.value;
    tween(1.7, (k) => {
      uniforms.uMix.value = easeInOut(k);
      uniforms.uScatter.value = Math.max(Math.sin(k * Math.PI) * 0.4, s0 * (1 - k));
    }, { key: 'scatter', done: () => { transitioning = false; } });
  }

  /* ----- View buttons ----- */
  const viewButtons = [];
  if (viewsEl && clouds.length > 1) {
    clouds.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'team-view-btn';
      btn.textContent = c.label || `View ${i + 1}`;
      btn.addEventListener('click', () => {
        lastInteraction = performance.now();
        switchView(i);
      });
      viewsEl.appendChild(btn);
      viewButtons.push(btn);
    });
  }
  function updateViewButtons() {
    viewButtons.forEach((b, i) => {
      b.classList.toggle('active', i === currentView);
      b.setAttribute('aria-pressed', String(i === currentView));
    });
  }
  updateViewButtons();

  /* ----- Pointer interaction ----- */
  const rotTarget = { x: 0, y: 0 };
  let dragOffset = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartOffset = 0;
  let dragDistance = 0;
  let lastInteraction = 0;

  window.addEventListener('pointermove', (e) => {
    // Self-heal a lost pointerup (e.g. Alt-Tab mid-drag).
    if (dragging && e.pointerType === 'mouse' && e.buttons === 0) dragging = false;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    if (dragging) {
      const dx = e.clientX - dragStartX;
      dragDistance = Math.max(dragDistance, Math.hypot(dx, e.clientY - dragStartY));
      dragOffset = Math.max(-0.7, Math.min(0.7, dragStartOffset + dx * 0.004));
      lastInteraction = performance.now();
    }
    rotTarget.y = nx * 0.22 + dragOffset;
    rotTarget.x = ny * 0.14;
    invalidate();
  }, { passive: true });

  canvas.style.pointerEvents = 'auto';
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // right-click opens the context menu, not a drag
    dragging = true;
    dragDistance = 0;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartOffset = dragOffset;
    lastInteraction = performance.now();
  });
  window.addEventListener('pointercancel', () => {
    dragging = false;
  });
  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    // A click (not a drag) scatters the stardust.
    if (dragDistance < 6 && !prefersReducedMotion && !transitioning) {
      const s0 = uniforms.uScatter.value;
      tween(1.5, (k) => {
        uniforms.uScatter.value = Math.max(Math.sin(k * Math.PI) * 0.55, s0 * (1 - k));
      }, { key: 'scatter' });
    }
  });

  /* ----- Assemble on load ----- */
  hideStatus();
  if (!prefersReducedMotion) {
    tween(2.2, (k) => {
      uniforms.uScatter.value = 1 - easeInOut(k);
    }, { key: 'scatter' });
  }

  /* ----- Auto-cycle views while idle ----- */
  let nextAutoSwitch = performance.now() + 9000;

  /* ----- Render loop ----- */
  const clock = new THREE.Clock();
  let rafId = null;
  let needsRender = true;
  function invalidate() { needsRender = true; }

  function tick() {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!prefersReducedMotion) {
      uniforms.uTime.value += dt;

      const now = performance.now();
      if (
        clouds.length > 1 &&
        now > nextAutoSwitch &&
        now - lastInteraction > 12000 &&
        !transitioning
      ) {
        switchView((currentView + 1) % clouds.length);
        nextAutoSwitch = now + 9000;
      }
    }

    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) {
        tweens.splice(i, 1);
        if (tw.done) tw.done();
      }
      invalidate();
    }

    group.rotation.y += (rotTarget.y - group.rotation.y) * 0.06;
    group.rotation.x += (rotTarget.x - group.rotation.x) * 0.06;
    // Keep render-on-demand alive until the eased rotation settles.
    if (
      Math.abs(rotTarget.y - group.rotation.y) > 0.001 ||
      Math.abs(rotTarget.x - group.rotation.x) > 0.001
    ) {
      invalidate();
    }

    // Under reduced motion only render when something changed.
    if (!prefersReducedMotion || needsRender) {
      needsRender = false;
      renderer.render(scene, camera);
    }
  }
  tick();

  /* ----- Resize / visibility ----- */
  window.addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Recompute point size: the window may have moved to a display
    // with a different devicePixelRatio.
    uniforms.uSize.value = (isMobile ? 1.35 : 1.0) * Math.min(window.devicePixelRatio, 2);
    fitCamera();
    invalidate();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      clock.stop();
    } else if (rafId === null) {
      clock.start();
      tick();
    }
  });
}
