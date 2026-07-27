/* ============================================================
   Apex IT Consultant — scene.js
   Three.js background: particle network hero, scroll-driven
   camera, floating accent shapes per section.

   Performance rules:
   - pixel ratio capped at 2
   - reduced particle count on mobile
   - rendering paused when the tab is hidden
   - static gradient fallback when WebGL is unavailable
     (the body background gradient acts as fallback)
   - prefers-reduced-motion: camera + drift animation disabled
   ============================================================ */

import * as THREE from 'three';

const canvas = document.getElementById('webgl');

function webglAvailable() {
  try {
    const test = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (test.getContext('webgl2') || test.getContext('webgl'))
    );
  } catch (e) {
    return false;
  }
}

if (!canvas || !webglAvailable()) {
  // Static gradient fallback: the body background already provides it.
  if (canvas) canvas.remove();
} else {
  initScene();
}

function initScene() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 767px)').matches;

  /* ---------- Renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050810, 0.016);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    120
  );
  camera.position.set(0, 0, 30);

  /* ---------- Particle network (hero) ---------- */
  const PARTICLE_COUNT = isMobile ? 90 : 220;
  const BOUNDS = { x: 26, y: 15, z: 9 };
  const CONNECT_DIST = 4.6;
  const CONNECT_DIST_SQ = CONNECT_DIST * CONNECT_DIST;
  const MAX_SEGMENTS = PARTICLE_COUNT * 6;

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() * 2 - 1) * BOUNDS.x;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * BOUNDS.y;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * BOUNDS.z;
    velocities[i * 3 + 0] = (Math.random() * 2 - 1) * 0.014;
    velocities[i * 3 + 1] = (Math.random() * 2 - 1) * 0.014;
    velocities[i * 3 + 2] = (Math.random() * 2 - 1) * 0.008;
  }

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pointsMat = new THREE.PointsMaterial({
    color: 0x67e8f9,
    size: 0.14,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(pointsGeo, pointsMat);
  scene.add(points);

  // Preallocated line buffers; drawRange is updated every frame.
  const linePositions = new Float32Array(MAX_SEGMENTS * 2 * 3);
  const lineColors = new Float32Array(MAX_SEGMENTS * 2 * 3);
  const linesGeo = new THREE.BufferGeometry();
  linesGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  linesGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));
  const linesMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(linesGeo, linesMat);
  scene.add(lines);

  const LINE_COLOR = new THREE.Color(0x2f6fe0);

  function updateNetwork(dt, attract) {
    // Move particles + soft-bounce at bounds.
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      positions[ix] += velocities[ix] * dt;
      positions[ix + 1] += velocities[ix + 1] * dt;
      positions[ix + 2] += velocities[ix + 2] * dt;

      // Bounce only when heading outward, so a particle pushed past the
      // bounds (e.g. by cursor attraction) can't get stuck flip-flopping.
      if (Math.abs(positions[ix]) > BOUNDS.x && positions[ix] * velocities[ix] > 0) velocities[ix] *= -1;
      if (Math.abs(positions[ix + 1]) > BOUNDS.y && positions[ix + 1] * velocities[ix + 1] > 0) velocities[ix + 1] *= -1;
      if (Math.abs(positions[ix + 2]) > BOUNDS.z && positions[ix + 2] * velocities[ix + 2] > 0) velocities[ix + 2] *= -1;

      // Gentle attraction toward the cursor's world position.
      if (attract) {
        const dx = attract.x - positions[ix];
        const dy = attract.y - positions[ix + 1];
        const d2 = dx * dx + dy * dy;
        if (d2 < 64 && d2 > 0.5) {
          const f = 0.00012 * dt;
          velocities[ix] += dx * f;
          velocities[ix + 1] += dy * f;
        }
      }

      // Cap speed so attraction never accelerates particles for good.
      const vx = velocities[ix], vy = velocities[ix + 1];
      const vmax = 0.05;
      const sp = Math.sqrt(vx * vx + vy * vy);
      if (sp > vmax) {
        velocities[ix] = (vx / sp) * vmax;
        velocities[ix + 1] = (vy / sp) * vmax;
      }
    }
    pointsGeo.attributes.position.needsUpdate = true;

    // Rebuild connection segments.
    let seg = 0;
    for (let i = 0; i < PARTICLE_COUNT && seg < MAX_SEGMENTS; i++) {
      const ix = i * 3;
      for (let j = i + 1; j < PARTICLE_COUNT && seg < MAX_SEGMENTS; j++) {
        const jx = j * 3;
        const dx = positions[ix] - positions[jx];
        const dy = positions[ix + 1] - positions[jx + 1];
        const dz = positions[ix + 2] - positions[jx + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < CONNECT_DIST_SQ) {
          const alpha = 1 - Math.sqrt(d2) / CONNECT_DIST;
          const o = seg * 6;
          linePositions[o] = positions[ix];
          linePositions[o + 1] = positions[ix + 1];
          linePositions[o + 2] = positions[ix + 2];
          linePositions[o + 3] = positions[jx];
          linePositions[o + 4] = positions[jx + 1];
          linePositions[o + 5] = positions[jx + 2];
          // Additive blending: darker vertex color == more transparent line.
          lineColors[o] = LINE_COLOR.r * alpha;
          lineColors[o + 1] = LINE_COLOR.g * alpha;
          lineColors[o + 2] = LINE_COLOR.b * alpha;
          lineColors[o + 3] = LINE_COLOR.r * alpha;
          lineColors[o + 4] = LINE_COLOR.g * alpha;
          lineColors[o + 5] = LINE_COLOR.b * alpha;
          seg++;
        }
      }
    }
    linesGeo.setDrawRange(0, seg * 2);
    linesGeo.attributes.position.needsUpdate = true;
    linesGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- Ambient dust across the whole scroll range ---------- */
  const DUST_COUNT = isMobile ? 120 : 320;
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3 + 0] = (Math.random() * 2 - 1) * 34;
    dustPositions[i * 3 + 1] = 8 - Math.random() * 90; // spread down the page
    dustPositions[i * 3 + 2] = (Math.random() * 2 - 1) * 14;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0x3b82f6,
    size: 0.09,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  /* ---------- Section accent shapes ---------- */
  function makeAccent(geometry, { x, y, z, color, scale = 1 }) {
    const group = new THREE.Group();
    const wire = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const core = new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    core.scale.setScalar(0.96);
    group.add(wire, core);
    group.position.set(x, y, z);
    group.scale.setScalar(scale);
    group.userData.spin = 0.1 + Math.random() * 0.15;
    group.userData.bobOffset = Math.random() * Math.PI * 2;
    group.userData.baseY = y;
    scene.add(group);
    return group;
  }

  const accents = [
    // About
    makeAccent(new THREE.IcosahedronGeometry(3.4, 0), { x: -15, y: -16, z: -4, color: 0x22d3ee }),
    // Expertise
    makeAccent(new THREE.TorusGeometry(3.1, 0.9, 10, 44), { x: 14, y: -30, z: -6, color: 0x3b82f6 }),
    // Clients
    makeAccent(new THREE.OctahedronGeometry(2.8, 0), { x: -13, y: -46, z: -3, color: 0xe8c15a, scale: 0.9 }),
    // Why join
    makeAccent(new THREE.IcosahedronGeometry(2.6, 1), { x: 13, y: -60, z: -7, color: 0x22d3ee }),
    // Roles / contact
    makeAccent(new THREE.TorusKnotGeometry(2.2, 0.55, 72, 10), { x: -14, y: -76, z: -8, color: 0x3b82f6 }),
  ];

  /* ---------- Scroll + mouse state ---------- */
  const CAMERA_TRAVEL = 82; // world units of descent over the full page

  let scrollProgress = 0;
  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = max > 0 ? window.scrollY / max : 0;
  }
  readScroll();
  window.addEventListener('scroll', readScroll, { passive: true });

  const mouse = { x: 0, y: 0 }; // normalized -1..1
  let hasMouse = false;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    hasMouse = true;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  // Project the cursor onto the z=0 plane for particle attraction.
  const raycaster = new THREE.Raycaster();
  const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const attractPoint = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  function cursorWorldPoint() {
    if (!hasMouse) return null;
    ndc.set(mouse.x, mouse.y);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(planeZ, attractPoint) ? attractPoint : null;
  }

  /* ---------- Resize ---------- */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    readScroll();
    if (prefersReducedMotion) renderStatic();
  });

  /* ---------- Render loops ---------- */
  const clock = new THREE.Clock();
  let rafId = null;
  // Own accumulator instead of clock.elapsedTime: Clock.start() resets
  // elapsedTime to 0 on tab-resume, which would snap every time-based
  // animation (shape bob/spin, idle drift) back to its t=0 phase.
  let elapsed = 0;

  function animate() {
    rafId = requestAnimationFrame(animate);
    const dtSec = Math.min(clock.getDelta(), 0.05);
    elapsed += dtSec;
    const dt = dtSec * 60; // normalized to ~60fps steps
    const t = elapsed;

    // Camera: descend with scroll, drift with mouse parallax.
    // Exponential smoothing scaled by dt so speed is refresh-rate independent.
    const targetY = -scrollProgress * CAMERA_TRAVEL;
    const targetX = hasMouse ? mouse.x * 2.2 : Math.sin(t * 0.1) * 0.8; // idle drift
    camera.position.y += (targetY - camera.position.y) * (1 - Math.pow(0.94, dt));
    camera.position.x += (targetX - camera.position.x) * (1 - Math.pow(0.97, dt));
    camera.position.z = 30 - Math.min(scrollProgress * 4, 4);
    camera.lookAt(0, camera.position.y, 0);

    // Hero network: only pay for it while it can be seen.
    if (camera.position.y > -40) {
      updateNetwork(dt, cursorWorldPoint());
      points.rotation.y = Math.sin(t * 0.05) * 0.12;
      lines.rotation.y = points.rotation.y;
    }

    for (const g of accents) {
      g.rotation.x += 0.0016 * g.userData.spin * dt * 10;
      g.rotation.y += 0.0022 * g.userData.spin * dt * 10;
      g.position.y = g.userData.baseY + Math.sin(t * 0.5 + g.userData.bobOffset) * 0.6;
    }

    dust.rotation.y = t * 0.008;

    renderer.render(scene, camera);
  }

  // Reduced motion: a single static frame (re-rendered only on resize/scroll).
  function renderStatic() {
    updateNetwork(0, null);
    camera.position.set(0, -scrollProgress * CAMERA_TRAVEL, 30);
    camera.lookAt(0, camera.position.y, 0);
    renderer.render(scene, camera);
  }

  if (prefersReducedMotion) {
    renderStatic();
    window.addEventListener('scroll', renderStatic, { passive: true });
  } else {
    animate();
  }

  /* ---------- Pause when tab hidden ---------- */
  document.addEventListener('visibilitychange', () => {
    if (prefersReducedMotion) return;
    if (document.hidden) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      clock.stop();
    } else if (rafId === null) {
      clock.start();
      animate();
    }
  });
}
