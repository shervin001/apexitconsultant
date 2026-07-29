/* ============================================================
   Apex IT Consultant — team-scene-v2.js
   The style lab (themes_v2.html): the same photos and the same
   background-removal pipeline as team.html, rendered in four
   switchable Three.js styles:

     voxels    — thousands of tiny 3D cubes that fly in and
                 ripple outward on click
     halftone  — pop-art dot mosaic, dot size from brightness
     scanlines — glowing contour lines with a scanner sweep
     hologram  — sci-fi projection: cyan tint, scanline flicker,
                 glitch pulses, floating above an emitter

   URL params:  ?p=<person>  ?m=<mode>
   Performance/fallback rules match team.html.
   ============================================================ */

import * as THREE from 'three';
import { PEOPLE, DEFAULT_PERSON } from './team-config.js';
import { loadImage, computePersonSample, makeMaskedCanvas } from './portrait-pipeline.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 767px)').matches;
const WORLD_H = 30;

const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/* ---------- DOM ---------- */
const canvas = document.getElementById('team-canvas');
const statusEl = document.getElementById('team-status');
const statusText = document.getElementById('team-status-text');
const modesEl = document.getElementById('team-modes');
const viewsEl = document.getElementById('team-views');
const viewsLabel = document.getElementById('team-views-label');
const peopleEl = document.getElementById('team-people');
const v1Link = document.getElementById('v1-link');
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

/* ---------- Person + mode selection ---------- */
const params = new URLSearchParams(location.search);
const personKey = params.get('p') || DEFAULT_PERSON;
const person = PEOPLE[personKey] || PEOPLE[DEFAULT_PERSON];

const MODE_ORDER = ['voxels', 'halftone', 'scanlines', 'hologram'];
const MODE_LABELS = { voxels: 'Voxels', halftone: 'Halftone', scanlines: 'Scanlines', hologram: 'Hologram' };
let modeKey = MODE_ORDER.includes(params.get('m')) ? params.get('m') : 'voxels';

document.getElementById('team-name').textContent = person.name;
document.getElementById('team-role').textContent = person.role;
document.getElementById('team-focus').textContent = person.focus;
document.getElementById('team-bio').textContent = person.bio || '';
document.title = `${person.name} · Lab — Apex IT Consultant`;
if (v1Link) v1Link.href = `team.html?p=${encodeURIComponent(personKey)}`;

const personKeys = Object.keys(PEOPLE);
if (personKeys.length > 1 && peopleEl) {
  peopleEl.hidden = false;
  for (const key of personKeys) {
    const a = document.createElement('a');
    a.className = 'team-pill' + (PEOPLE[key] === person ? ' active' : '');
    if (PEOPLE[key] === person) a.setAttribute('aria-current', 'page');
    a.href = `themes_v2.html?p=${encodeURIComponent(key)}`;
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
   Sampling helpers
   ============================================================ */

/* Regular grid over the person's bounding box. Each cell carries
   photo color, luminance, a head-shaped dome factor, and its world
   position. */
function gridCells(sample, targetCols) {
  const { w, alpha, imageData, bbox } = sample;
  const step = Math.max(1, Math.round(bbox.bw / targetCols));
  const scale = WORLD_H / bbox.bh;
  const data = imageData.data;
  const rows = [];
  for (let y = bbox.minY; y <= bbox.maxY; y += step) {
    const row = [];
    for (let x = bbox.minX; x <= bbox.maxX; x += step) {
      const a = alpha[y * w + x];
      const i = (y * w + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const dx = (x - bbox.cx) / (bbox.bw * 0.55);
      const dy = (y - bbox.cy) / (bbox.bh * 0.55);
      row.push({
        a, r, g, b,
        lum: 0.2126 * r + 0.7152 * g + 0.0722 * b,
        dome: Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)),
        wx: (x - bbox.cx) * scale,
        wy: (bbox.cy - y) * scale,
      });
    }
    rows.push(row);
  }
  return { rows, cellSize: step * scale };
}

/* ============================================================
   Main
   ============================================================ */

async function main() {
  if (!person.views || person.views.length === 0) {
    setStatus('No photos configured for this person — see js/team-config.js.', true);
    return;
  }

  /* ----- Build one sample per view ----- */
  const samples = [];
  const failures = [];
  for (let i = 0; i < person.views.length; i++) {
    const view = person.views[i];
    try {
      setStatus(`Loading photo ${i + 1}/${person.views.length}…`);
      const img = await loadImage(view.src);
      setStatus(`Removing background (${i + 1}/${person.views.length})…`);
      const sample = await computePersonSample(img);
      samples.push({
        sample,
        label: view.label,
        worldW: WORLD_H * (sample.bbox.bw / sample.bbox.bh),
      });
    } catch (err) {
      console.warn(err.message);
      failures.push(view.src);
    }
  }
  if (samples.length === 0) {
    setStatus(
      `No photos found. Save the portrait photos to ${failures.join(' and ')} — the page does the rest.`,
      true
    );
    return;
  }

  /* ----- Renderer / scene / camera ----- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050810, 0.005);
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 46);

  const sun = new THREE.DirectionalLight(0xcfe0ff, 2.4);
  sun.position.set(7, 6, 10);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x2a3c61, 1.4));

  /* ----- Backdrop (lighter than team.html): stars, nebulas, one planet ----- */
  const bgGroup = new THREE.Group();
  scene.add(bgGroup);
  const BGX = isMobile ? 0.42 : 1;

  const starGeo = new THREE.BufferGeometry();
  const starCount = isMobile ? 140 : 380;
  const starArr = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starArr[i * 3] = (Math.random() * 2 - 1) * 90;
    starArr[i * 3 + 1] = (Math.random() * 2 - 1) * 55;
    starArr[i * 3 + 2] = -30 - Math.random() * 60;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starArr, 3));
  bgGroup.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x8fb8e8,
    size: 0.16,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })));

  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.4, 'rgba(160,220,255,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  for (const n of [
    { x: -48, y: 22, z: -80, s: 80, color: 0x2451b8, o: 0.15 },
    { x: 46, y: -20, z: -85, s: 66, color: 0x14727e, o: 0.13 },
  ]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: n.color, transparent: true, opacity: n.o,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sp.position.set(n.x * BGX, n.y, n.z);
    sp.scale.set(n.s, n.s * 0.7, 1);
    bgGroup.add(sp);
  }

  const bgPlanet = new THREE.Group();
  const bgBody = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5.5, 3),
    new THREE.MeshStandardMaterial({
      color: 0x2a4d8f, emissive: 0x121f45, emissiveIntensity: 0.35,
      flatShading: true, roughness: 0.85, metalness: 0.12,
    })
  );
  bgBody.scale.y = 0.93;
  bgPlanet.add(bgBody);
  const bgRing = new THREE.Mesh(
    new THREE.RingGeometry(8, 11.5, 64),
    new THREE.MeshBasicMaterial({
      color: 0xe8c15a, side: THREE.DoubleSide, transparent: true,
      opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  bgRing.rotation.x = -1.15;
  bgPlanet.add(bgRing);
  bgPlanet.position.set(-36 * BGX, 17, -62);
  bgPlanet.rotation.z = -0.2;
  bgGroup.add(bgPlanet);

  /* ----- Portrait group (drag target) ----- */
  const group = new THREE.Group();
  scene.add(group);

  // Render-on-demand flag (used under prefers-reduced-motion).
  // Declared before setPortrait() runs so early calls are safe.
  let needsRender = true;
  function invalidate() { needsRender = true; }

  /* ============================================================
     The four styles. Each build returns:
       { object, update(dt) -> stillAnimating, pulse(), dispose() }
     ============================================================ */

  function buildInstanced(entries, geometry, material) {
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    entries.forEach((e, i) => {
      dummy.position.set(e.x, e.y, e.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(e.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setRGB(e.r, e.g, e.b));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  /* Fly-in intro + click ripple, shared by voxels and halftone.
     Matrices are only rewritten while an animation is running. */
  function instancedAnimator(mesh, entries) {
    const dummy = new THREE.Object3D();
    let introT = prefersReducedMotion ? 1 : 0;
    let pulseT = 1;
    const starts = entries.map(() => {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const R = 32 + Math.random() * 12;
      return {
        x: R * Math.sin(ph) * Math.cos(th),
        y: R * Math.sin(ph) * Math.sin(th) * 0.6,
        z: R * Math.cos(ph) * 0.5,
      };
    });
    function apply() {
      const kIn = easeOutCubic(Math.min(1, introT));
      const pk = Math.min(1, pulseT);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        let z = lerp(starts[i].z, e.z, kIn);
        if (pk < 1) {
          const d = Math.hypot(e.x, e.y);
          z += Math.sin(d * 0.45 - pk * 7) * 1.6 * (1 - pk);
        }
        dummy.position.set(
          lerp(starts[i].x, e.x, kIn),
          lerp(starts[i].y, e.y, kIn),
          z
        );
        const spin = (1 - kIn) * 2.5 + (pk < 1 ? (1 - pk) * 0.5 : 0);
        dummy.rotation.set(spin, spin * 0.8, 0);
        dummy.scale.setScalar(e.s * (0.15 + 0.85 * kIn));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (!prefersReducedMotion) apply();
    return {
      update(dt) {
        let active = false;
        if (introT < 1) { introT += dt / 1.5; active = true; }
        if (pulseT < 1) { pulseT += dt / 1.3; active = true; }
        if (active) apply();
        return active;
      },
      pulse() {
        if (introT >= 1 && pulseT >= 1) pulseT = 0;
      },
    };
  }

  function buildVoxels(info) {
    const grid = gridCells(info.sample, isMobile ? 60 : 100);
    const entries = [];
    for (const row of grid.rows) {
      for (const c of row) {
        if (c.a <= 0.4) continue;
        entries.push({
          x: c.wx, y: c.wy,
          z: c.dome * 4.5 + (c.lum - 0.5) * 2.2,
          s: grid.cellSize * 0.92,
          r: Math.min(1, c.r * 1.08),
          g: Math.min(1, c.g * 1.08),
          b: Math.min(1, c.b * 1.08),
        });
      }
    }
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 });
    const mesh = buildInstanced(entries, geometry, material);
    const anim = instancedAnimator(mesh, entries);
    const object = new THREE.Group();
    object.add(mesh);
    return {
      object,
      update: anim.update,
      pulse: anim.pulse,
      dispose() { geometry.dispose(); material.dispose(); mesh.dispose(); },
    };
  }

  function buildHalftone(info) {
    const grid = gridCells(info.sample, isMobile ? 52 : 82);
    const entries = [];
    for (const row of grid.rows) {
      for (const c of row) {
        if (c.a <= 0.4) continue;
        entries.push({
          x: c.wx, y: c.wy,
          z: c.dome * 3.5,
          s: grid.cellSize * (0.22 + c.lum * 0.95),
          r: Math.min(1, c.r * 1.2),
          g: Math.min(1, c.g * 1.2),
          b: Math.min(1, c.b * 1.2),
        });
      }
    }
    const geometry = new THREE.SphereGeometry(0.5, 10, 8);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
    const mesh = buildInstanced(entries, geometry, material);
    const anim = instancedAnimator(mesh, entries);
    const object = new THREE.Group();
    object.add(mesh);
    return {
      object,
      update: anim.update,
      pulse: anim.pulse,
      dispose() { geometry.dispose(); material.dispose(); mesh.dispose(); },
    };
  }

  function buildScanlines(info) {
    const grid = gridCells(info.sample, isMobile ? 90 : 150);
    const object = new THREE.Group();
    const disposables = [];
    const cyan = new THREE.Color(0x22d3ee);
    const white = new THREE.Color(0xeafcff);
    const tmp = new THREE.Color();

    for (let ri = 0; ri < grid.rows.length; ri += 2) {
      const row = grid.rows[ri];
      if (row.length < 2) continue;
      const pos = new Float32Array(row.length * 3);
      const col = new Float32Array(row.length * 3);
      row.forEach((c, i) => {
        pos[i * 3] = c.wx;
        pos[i * 3 + 1] = c.wy;
        pos[i * 3 + 2] = c.a > 0.4 ? c.dome * 5 + c.lum * 3 : 0;
        if (c.a > 0.4) {
          tmp.copy(cyan).lerp(white, c.lum);
          const br = 0.25 + c.lum * 0.95;
          col[i * 3] = tmp.r * br;
          col[i * 3 + 1] = tmp.g * br;
          col[i * 3 + 2] = tmp.b * br;
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      object.add(new THREE.Line(geo, mat));
      disposables.push(geo, mat);
    }

    // Scanner sweep bar.
    const barGeo = new THREE.PlaneGeometry(info.worldW * 1.2, 0.35);
    const barMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.z = 6.8;
    bar.visible = !prefersReducedMotion;
    object.add(bar);
    disposables.push(barGeo, barMat);

    let t = 0;
    let pulse = 0;
    let introT = prefersReducedMotion ? 1 : 0;
    if (!prefersReducedMotion) object.scale.y = 0.02;

    return {
      object,
      update(dt) {
        t += dt;
        if (introT < 1) {
          introT += dt / 1.1;
          object.scale.y = Math.max(0.02, easeOutCubic(Math.min(1, introT)));
        }
        const cycle = (t % 7) / 7;
        bar.position.y = WORLD_H / 2 + 1 - cycle * (WORLD_H + 2);
        if (pulse > 0) pulse = Math.max(0, pulse - dt / 0.8);
        barMat.opacity = 0.22 + pulse * 0.5;
        return !prefersReducedMotion;
      },
      pulse() { pulse = 1; },
      dispose() { for (const d of disposables) d.dispose(); },
    };
  }

  function buildHologram(info) {
    const maskedCanvas = makeMaskedCanvas(info.sample);
    const tex = new THREE.CanvasTexture(maskedCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const aspect = maskedCanvas.width / maskedCanvas.height;
    const H = WORLD_H;
    const W = H * aspect;

    const uniforms = {
      uMap: { value: tex },
      uTime: { value: 0 },
      uGlitch: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uTime;
        uniform float uGlitch;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv;
          // occasional horizontal displacement bands
          float band = step(0.92, fract(uv.y * 6.0 + uTime * 0.35));
          uv.x += band * uGlitch * 0.035 * sin(uTime * 60.0);
          vec4 tex = texture2D(uMap, uv);
          float lum = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 tint = vec3(0.42, 0.85, 1.0);
          vec3 col = mix(tex.rgb, tint * (0.35 + lum * 1.15), 0.72);
          float scan = 0.8 + 0.2 * sin(uv.y * 400.0 + uTime * 8.0);
          float flick = 0.93 + 0.07 * sin(uTime * 21.0) * sin(uTime * 6.1);
          gl_FragColor = vec4(col * 1.35 * scan * flick, tex.a * (0.88 + uGlitch * 0.12));
        }`,
    });
    const planeGeo = new THREE.PlaneGeometry(W, H);
    const plane = new THREE.Mesh(planeGeo, mat);
    const object = new THREE.Group();
    object.add(plane);

    // Emitter: light cone up to the portrait + a metallic base puck.
    // Emitter dimensions fit inside fitCamera's 1.18 height budget:
    // the puck bottoms out at local y ≈ -18.95, visible bottom ≈ -19.4.
    const coneGeo = new THREE.CylinderGeometry(W * 0.42, 0.9, 4.5, 40, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = -H / 2 - 1.2;
    object.add(cone);

    const puckGeo = new THREE.CylinderGeometry(1.5, 1.9, 0.5, 28);
    const puckMat = new THREE.MeshStandardMaterial({
      color: 0x0d1626,
      roughness: 0.35,
      metalness: 0.75,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.3,
    });
    const puck = new THREE.Mesh(puckGeo, puckMat);
    puck.position.y = -H / 2 - 3.7;
    object.add(puck);

    let t = 0;
    let glitch = 0;
    let nextGlitchAt = 2.5;

    return {
      object,
      update(dt) {
        t += dt;
        uniforms.uTime.value = t;
        plane.position.y = Math.sin(t * 0.9) * 0.35;
        if (t >= nextGlitchAt) {
          glitch = 0.5 + Math.random() * 0.4;
          nextGlitchAt = t + 3 + Math.random() * 5;
        }
        glitch = Math.max(0, glitch - dt * 1.6);
        uniforms.uGlitch.value = glitch;
        return !prefersReducedMotion;
      },
      pulse() { glitch = 1.1; },
      dispose() { tex.dispose(); mat.dispose(); planeGeo.dispose(); coneGeo.dispose(); coneMat.dispose(); puckGeo.dispose(); puckMat.dispose(); },
    };
  }

  const MODES = {
    voxels: buildVoxels,
    halftone: buildHalftone,
    scanlines: buildScanlines,
    hologram: buildHologram,
  };

  /* ----- Active portrait management ----- */
  let viewIndex = 0;
  let active = null;

  function setPortrait() {
    if (active) {
      group.remove(active.object);
      active.dispose();
      active = null;
    }
    active = MODES[modeKey](samples[viewIndex]);
    group.add(active.object);
    const url = new URL(location.href);
    url.searchParams.set('p', personKey);
    url.searchParams.set('m', modeKey);
    history.replaceState(null, '', url);
    // Keep the person-switcher links carrying the current style.
    if (peopleEl) {
      peopleEl.querySelectorAll('a').forEach((a) => {
        const href = new URL(a.getAttribute('href'), location.href);
        href.searchParams.set('m', modeKey);
        a.setAttribute('href', href.pathname.split('/').pop() + href.search);
      });
    }
    invalidate();
  }

  /* ----- Buttons ----- */
  const modeButtons = [];
  for (const key of MODE_ORDER) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'team-view-btn';
    btn.textContent = MODE_LABELS[key];
    btn.addEventListener('click', () => {
      if (key === modeKey) return;
      modeKey = key;
      updateModeButtons();
      setPortrait();
    });
    modesEl.appendChild(btn);
    modeButtons.push({ key, btn });
  }
  function updateModeButtons() {
    for (const { key, btn } of modeButtons) {
      btn.classList.toggle('active', key === modeKey);
      btn.setAttribute('aria-pressed', String(key === modeKey));
    }
  }
  updateModeButtons();

  const viewButtons = [];
  if (samples.length > 1) {
    samples.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'team-view-btn';
      btn.textContent = s.label || `View ${i + 1}`;
      btn.addEventListener('click', () => {
        if (i === viewIndex) return;
        viewIndex = i;
        updateViewButtons();
        setPortrait();
      });
      viewsEl.appendChild(btn);
      viewButtons.push(btn);
    });
  } else {
    if (viewsEl) viewsEl.hidden = true;
    if (viewsLabel) viewsLabel.hidden = true;
  }
  function updateViewButtons() {
    viewButtons.forEach((b, i) => {
      b.classList.toggle('active', i === viewIndex);
      b.setAttribute('aria-pressed', String(i === viewIndex));
    });
  }
  updateViewButtons();

  /* ----- Camera fitting (both axes, like team.html) ----- */
  const maxWorldW = Math.max(...samples.map((s) => s.worldW));
  function fitCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const narrow = window.innerWidth <= 960;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const zForHeight = (WORLD_H / 2 * 1.18) / t; // extra room for the emitter
    const zForWidth = (maxWorldW * 0.55) / (t * aspect);
    camera.aspect = aspect;
    camera.position.z = Math.max(zForHeight, zForWidth) + (narrow ? 5 : 2);
    camera.updateProjectionMatrix();
    group.position.x = narrow ? 0 : 6;
    group.position.y = narrow ? 3 : 1;
  }
  fitCamera();

  /* ----- Pointer interaction (same feel as team.html) ----- */
  const rotTarget = { x: 0, y: 0 };
  let dragOffset = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartOffset = 0;
  let dragDistance = 0;

  window.addEventListener('pointermove', (e) => {
    if (dragging && e.pointerType === 'mouse' && e.buttons === 0) dragging = false;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    if (dragging) {
      const dx = e.clientX - dragStartX;
      dragDistance = Math.max(dragDistance, Math.hypot(dx, e.clientY - dragStartY));
      dragOffset = Math.max(-0.7, Math.min(0.7, dragStartOffset + dx * 0.004));
    }
    rotTarget.y = nx * 0.22 + dragOffset;
    rotTarget.x = ny * 0.14;
    invalidate();
  }, { passive: true });

  canvas.style.pointerEvents = 'auto';
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragDistance = 0;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartOffset = dragOffset;
  });
  window.addEventListener('pointercancel', () => {
    dragging = false;
  });
  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (dragDistance < 6 && !prefersReducedMotion && active) {
      active.pulse();
    }
  });

  /* ----- Go ----- */
  hideStatus();
  setPortrait();

  /* ----- Render loop ----- */
  const clock = new THREE.Clock();
  let rafId = null;

  function tick() {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!prefersReducedMotion && active) {
      if (active.update(dt)) invalidate();
      bgBody.rotation.y += 0.05 * dt;
    }

    group.rotation.y += (rotTarget.y - group.rotation.y) * 0.06;
    group.rotation.x += (rotTarget.x - group.rotation.x) * 0.06;
    bgGroup.rotation.y = group.rotation.y * 0.25;
    bgGroup.rotation.x = group.rotation.x * 0.25;
    if (
      Math.abs(rotTarget.y - group.rotation.y) > 0.001 ||
      Math.abs(rotTarget.x - group.rotation.x) > 0.001
    ) {
      invalidate();
    }

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
