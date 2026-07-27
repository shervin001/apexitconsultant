/* ============================================================
   Apex IT Consultant — scene.js
   Three.js background: a journey through space. The hero opens
   on a particle network (enterprise systems); scrolling flies
   the camera down past a distinct planet for each section —
   rocky worlds, a ringed gas giant with moons, and finally a
   holographic wireframe planet at the contact section.

   Performance rules:
   - pixel ratio capped at 2
   - reduced particle/geometry detail on mobile
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
  scene.fog = new THREE.FogExp2(0x050810, 0.011);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    140
  );
  camera.position.set(0, 0, 30);

  /* ---------- Lighting (for the planets) ---------- */
  const sun = new THREE.DirectionalLight(0xcfe0ff, 2.6);
  sun.position.set(7, 6, 10);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xe8c15a, 0.8);
  rim.position.set(-8, -4, -6);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x2a3c61, 1.4));

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

  /* ---------- Starfield across the whole journey ---------- */
  function makeStars(count, size, color, opacity, spread) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 0] = (Math.random() * 2 - 1) * spread.x;
      arr[i * 3 + 1] = 20 - Math.random() * 130; // full scroll range
      arr[i * 3 + 2] = -spread.zMin - Math.random() * (spread.zMax - spread.zMin);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      color, size,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stars = new THREE.Points(geo, mat);
    scene.add(stars);
    return stars;
  }
  const starsFar = makeStars(isMobile ? 160 : 420, 0.12, 0xdbe6ff, 0.8, { x: 70, zMin: 22, zMax: 48 });
  const starsNear = makeStars(isMobile ? 90 : 240, 0.09, 0x3b82f6, 0.5, { x: 40, zMin: 6, zMax: 20 });

  /* ---------- Procedural planets ----------
     Low-poly displaced icosahedrons, fresnel atmosphere, optional
     rings and orbiting moons. No textures — everything procedural,
     so nothing external can fail to load. */

  // Small 3-octave value noise for terrain displacement.
  function makeNoise(seed) {
    const rand = (x, y, z) => {
      const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 91.3) * 43758.5453;
      return s - Math.floor(s);
    };
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (t) => t * t * (3 - 2 * t);
    function noise3(x, y, z) {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
      const v000 = rand(xi, yi, zi),         v100 = rand(xi + 1, yi, zi);
      const v010 = rand(xi, yi + 1, zi),     v110 = rand(xi + 1, yi + 1, zi);
      const v001 = rand(xi, yi, zi + 1),     v101 = rand(xi + 1, yi, zi + 1);
      const v011 = rand(xi, yi + 1, zi + 1), v111 = rand(xi + 1, yi + 1, zi + 1);
      return lerp(
        lerp(lerp(v000, v100, xf), lerp(v010, v110, xf), yf),
        lerp(lerp(v001, v101, xf), lerp(v011, v111, xf), yf),
        zf
      );
    }
    return (x, y, z) => {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let o = 0; o < 3; o++) {
        sum += noise3(x * freq + 31, y * freq + 17, z * freq + 57) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.1;
      }
      return sum / norm; // 0..1
    };
  }

  // Fresnel glow shell — bright at the limb, invisible face-on.
  function makeAtmosphere(radius, color, strength) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius, isMobile ? 24 : 40, isMobile ? 18 : 30),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uStrength: { value: strength },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uStrength;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.6);
            gl_FragColor = vec4(uColor, f * uStrength);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
  }

  const planets = [];

  function makePlanet(def) {
    const group = new THREE.Group();
    const r = def.radius * (isMobile ? 0.8 : 1);

    if (def.holo) {
      // Holographic "digital planet": wireframe shell + faint core.
      const geo = new THREE.IcosahedronGeometry(r, 1);
      group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: def.color,
        wireframe: true,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })));
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.97, 1), new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      group.add(core);
      group.userData.body = group; // spin the whole hologram
    } else {
      const detail = isMobile ? 2 : 3;
      const geo = new THREE.IcosahedronGeometry(r, detail);
      if (def.displace > 0) {
        const noise = makeNoise(def.seed || 1);
        const pos = geo.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).normalize();
          const n = noise(v.x * 1.7, v.y * 1.7, v.z * 1.7);
          const len = r * (1 + (n - 0.5) * 2 * def.displace);
          pos.setXYZ(i, v.x * len, v.y * len, v.z * len);
        }
        geo.computeVertexNormals();
      }
      const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: def.color,
        emissive: def.emissive || 0x000000,
        emissiveIntensity: 0.35,
        flatShading: true,
        roughness: 0.85,
        metalness: 0.12,
      }));
      if (def.oblate) body.scale.y = def.oblate;
      group.add(body);
      group.userData.body = body;
    }

    if (def.atmosphere) {
      group.add(makeAtmosphere(r * 1.16, def.atmosphere, def.atmosphereStrength || 0.7));
    }

    for (const ringDef of def.rings || []) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * ringDef.inner, r * ringDef.outer, 72),
        new THREE.MeshBasicMaterial({
          color: ringDef.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: ringDef.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ring.rotation.x = ringDef.tiltX;
      ring.rotation.y = ringDef.tiltY || 0;
      group.add(ring);
    }

    group.userData.moons = (def.moons || []).map((m) => {
      const pivot = new THREE.Group();
      pivot.rotation.x = m.tilt || 0.25;
      const moon = new THREE.Mesh(
        new THREE.IcosahedronGeometry(m.radius, 1),
        new THREE.MeshStandardMaterial({
          color: m.color || 0x8593ab,
          flatShading: true,
          roughness: 0.9,
          metalness: 0.05,
        })
      );
      moon.position.x = r * m.dist;
      pivot.add(moon);
      group.add(pivot);
      return { pivot, speed: m.speed, phase: m.phase || 0 };
    });

    group.position.set(
      def.side * (isMobile ? 6.5 : def.x),
      0, // y assigned by placePlanets()
      isMobile ? -11 : def.z
    );
    group.rotation.z = def.tilt || 0;
    group.userData.spin = def.spin;
    group.userData.section = def.section;
    group.userData.yOffset = def.yOffset || 0;
    scene.add(group);
    planets.push(group);
    return group;
  }

  // One planet per section, alternating sides. Colors stay in the
  // site palette: blues, cyans and one gold world.
  // Distant and small on purpose: it sits behind the About copy,
  // so it should read as a far-away world, not compete with text.
  makePlanet({
    section: '#about',
    side: -1, x: 19, z: -13,
    radius: 2.7, displace: 0.14, seed: 7,
    color: 0x1e6274, emissive: 0x0a2e3c,
    atmosphere: 0x67e8f9, atmosphereStrength: 0.55,
    spin: 0.25, tilt: 0.18,
    moons: [{ radius: 0.3, dist: 1.9, speed: 0.5, color: 0x9fb2cc, tilt: 0.35 }],
  });
  makePlanet({
    section: '#expertise',
    side: 1, x: 14.5, z: -7,
    radius: 3.8, displace: 0.04, seed: 12,
    color: 0x2a4d8f, emissive: 0x121f45,
    atmosphere: 0x7cb7ff, atmosphereStrength: 0.6,
    oblate: 0.93, spin: 0.45, tilt: -0.22,
    rings: [
      { inner: 1.45, outer: 2.15, color: 0xe8c15a, opacity: 0.32, tiltX: -1.15 },
      { inner: 2.2, outer: 2.38, color: 0x22d3ee, opacity: 0.22, tiltX: -1.15 },
    ],
  });
  makePlanet({
    section: '#careers',
    side: -1, x: 14, z: -5,
    radius: 3.0, displace: 0.16, seed: 23,
    color: 0x8a6a2f, emissive: 0x3d2c10,
    atmosphere: 0xe8c15a, atmosphereStrength: 0.55,
    spin: 0.3, tilt: 0.3,
    moons: [
      { radius: 0.26, dist: 1.9, speed: 0.7, color: 0xc9b07a, tilt: 0.2 },
      { radius: 0.18, dist: 2.5, speed: 0.42, color: 0x8593ab, tilt: 0.55, phase: 2.6 },
    ],
  });
  makePlanet({
    section: '#roles',
    side: 1, x: 14.5, z: -6,
    radius: 3.2, displace: 0.11, seed: 41,
    color: 0x5f8ca3, emissive: 0x1c3a4a,
    atmosphere: 0xbfeaff, atmosphereStrength: 0.7,
    spin: 0.2, tilt: -0.15,
    rings: [{ inner: 1.5, outer: 1.72, color: 0x67e8f9, opacity: 0.25, tiltX: -1.35, tiltY: 0.3 }],
  });
  // Sits low on the right, in the open space below the contact aside.
  makePlanet({
    section: '#contact',
    side: 1, x: 15, z: -6, yOffset: -6.5,
    radius: 2.9, holo: true,
    color: 0x22d3ee,
    atmosphere: 0x22d3ee, atmosphereStrength: 0.5,
    spin: 0.35, tilt: 0.2,
  });

  /* ---------- Scroll + mouse state ---------- */
  const CAMERA_TRAVEL = 82; // world units of descent over the full page

  let scrollProgress = 0;
  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = max > 0 ? window.scrollY / max : 0;
  }
  readScroll();
  window.addEventListener('scroll', readScroll, { passive: true });

  // Anchor each planet's altitude to its section, so the camera
  // "arrives" at the planet as the section scrolls into view.
  function placePlanets() {
    const winH = window.innerHeight;
    const max = document.documentElement.scrollHeight - winH;
    for (const p of planets) {
      const el = document.querySelector(p.userData.section);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const centerScroll = rect.top + window.scrollY + rect.height / 2 - winH / 2;
      const progress = Math.min(1, Math.max(0, max > 0 ? centerScroll / max : 0));
      p.position.y = -progress * CAMERA_TRAVEL + p.userData.yOffset;
    }
  }
  placePlanets();
  // Re-place once everything (fonts, layout) has settled.
  window.addEventListener('load', () => {
    placePlanets();
    if (prefersReducedMotion) renderStatic();
  });

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
    placePlanets();
    if (prefersReducedMotion) renderStatic();
  });

  /* ---------- Render loops ---------- */
  const clock = new THREE.Clock();
  let rafId = null;
  // Own accumulator instead of clock.elapsedTime: Clock.start() resets
  // elapsedTime to 0 on tab-resume, which would snap every time-based
  // animation (planet spin, moon orbits, idle drift) back to t=0 phase.
  let elapsed = 0;

  function animate() {
    rafId = requestAnimationFrame(animate);
    const dtSec = Math.min(clock.getDelta(), 0.05);
    elapsed += dtSec;
    const dt = dtSec * 60; // normalized to ~60fps steps
    const t = elapsed;

    // Camera: descend with scroll, lean toward the planet being passed,
    // drift with mouse parallax. Exponential smoothing scaled by dt so
    // speed is refresh-rate independent.
    const targetY = -scrollProgress * CAMERA_TRAVEL;

    // Find the planet nearest to the camera's target altitude and lean
    // gently toward its side of the screen — "flying to the planet".
    let lean = 0;
    let bestDist = Infinity;
    for (const p of planets) {
      const d = Math.abs(p.position.y - targetY);
      if (d < bestDist) {
        bestDist = d;
        lean = bestDist < 18 ? p.position.x * 0.1 : 0;
      }
    }

    const targetX = (hasMouse ? mouse.x * 2.2 : Math.sin(t * 0.1) * 0.8) + lean;
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

    // Planets: slow spin, orbiting moons, a barely-visible float.
    for (const p of planets) {
      p.userData.body.rotation.y += 0.0026 * p.userData.spin * dt * 10;
      for (const m of p.userData.moons || []) {
        m.pivot.rotation.y = t * m.speed + m.phase;
      }
    }

    starsFar.rotation.y = t * 0.004;
    starsNear.rotation.y = t * 0.008;

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
