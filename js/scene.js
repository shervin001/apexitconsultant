/* ============================================================
   Apex IT Consultant — scene.js
   Three.js background: a journey through space. The hero opens
   on a particle network (enterprise systems); scrolling flies
   the camera down past a distinct planet for each section while
   rockets, shooting stars and asteroids pass by. At the end of
   the page the camera dives into a huge destination planet —
   atmosphere flash — and lands on a low-poly alien landscape.

   Performance rules:
   - pixel ratio capped at 2
   - reduced particle/geometry detail on mobile
   - rendering paused when the tab is hidden
   - static gradient fallback when WebGL is unavailable
     (the body background gradient acts as fallback)
   - prefers-reduced-motion: no camera/ambient animation, no
     flash; scenes render as static frames per scroll position
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

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const smoothstep = (a, b, v) => {
    const t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const easeInCubic = (t) => t * t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

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
    160
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

  /* ---------- Soft glow texture (nebulas, star heads, horizon) ---------- */
  function makeGlowTexture(inner, mid) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.4, mid);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function makeSprite(texture, color, opacity, fogged) {
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: fogged,
    }));
  }

  const glowTex = makeGlowTexture('rgba(255,255,255,0.85)', 'rgba(160,220,255,0.25)');

  /* ---------- Nebula clouds for depth ---------- */
  const NEBULAS = [
    { x: -36, y: -14, z: -38, s: 80, color: 0x2451b8, o: 0.20 },
    { x: 32, y: -40, z: -42, s: 66, color: 0x14727e, o: 0.18 },
    { x: -28, y: -66, z: -40, s: 72, color: 0x8a6a2f, o: 0.12 },
    { x: 26, y: -88, z: -46, s: 88, color: 0x2451b8, o: 0.18 },
  ];
  for (const n of NEBULAS.slice(0, isMobile ? 3 : 4)) {
    const sp = makeSprite(glowTex, n.color, n.o, false);
    sp.position.set(n.x, n.y, n.z);
    sp.scale.set(n.s, n.s * 0.7, 1);
    scene.add(sp);
  }

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
      arr[i * 3 + 1] = 20 - Math.random() * 140; // full scroll range
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
      const detail = def.detail || (isMobile ? 2 : 3);
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
      isMobile && !def.big ? -11 : def.z
    );
    group.rotation.z = def.tilt || 0;
    group.userData.spin = def.spin;
    group.userData.section = def.section;
    group.userData.yOffset = def.yOffset || 0;
    group.userData.bigRadius = r;
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

  // The destination: a huge world centered under the landing section.
  // The camera dives into it at the end of the journey.
  const bigPlanet = makePlanet({
    section: '#landing',
    side: 0, x: 0, z: -26, big: true,
    radius: 15, displace: 0.05, seed: 77, detail: isMobile ? 3 : 4,
    color: 0x18535e, emissive: 0x07272e,
    atmosphere: 0x67e8f9, atmosphereStrength: 0.9,
    spin: 0.1, tilt: 0.12,
  });

  /* ============================================================
     Ambient traffic: rockets, shooting stars, asteroids.
     All spawn near the camera's current altitude and despawn
     off-screen. None of this exists under reduced motion.
     ============================================================ */
  const EXTENT_X = 38;

  /* ---------- Rockets with exhaust trails ---------- */
  const TRAIL_N = 80;

  function buildRocket() {
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xdde6f2, roughness: 0.35, metalness: 0.55 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xe8c15a, roughness: 0.4, metalness: 0.6 });

    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.5, 10), hullMat);
    g.add(hull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 10), accentMat);
    nose.position.y = 1.02;
    g.add(nose);
    const porthole = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
    );
    porthole.position.set(0, 0.35, 0.24);
    g.add(porthole);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.34), accentMat);
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.sin(a) * 0.26, -0.62, Math.cos(a) * 0.26);
      fin.rotation.y = a;
      g.add(fin);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.9, 8),
      new THREE.MeshBasicMaterial({
        color: 0x9feaff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    flame.rotation.x = Math.PI;
    flame.position.y = -1.2;
    g.add(flame);

    // World-space exhaust trail (ring buffer of fading points).
    const tPos = new Float32Array(TRAIL_N * 3);
    const tCol = new Float32Array(TRAIL_N * 3);
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
    tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3).setUsage(THREE.DynamicDrawUsage));
    const trail = new THREE.Points(tGeo, new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    scene.add(trail);

    g.visible = false;
    scene.add(g);
    return {
      group: g, flame, trail, tPos, tCol, tGeo,
      head: 0, alive: false,
      vel: new THREE.Vector3(), scale: 1,
    };
  }

  const rockets = Array.from({ length: isMobile ? 1 : 2 }, buildRocket);
  const tmpV = new THREE.Vector3();
  const UP_Y = new THREE.Vector3(0, 1, 0);

  function launchRocket(r, camY) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = 8 + Math.random() * 5;
    r.vel.set(dir * speed, (Math.random() - 0.5) * 3, 0);
    r.group.position.set(
      -dir * EXTENT_X,
      camY + (Math.random() - 0.5) * 16,
      -3 - Math.random() * 11
    );
    r.scale = 0.8 + Math.random() * 0.7;
    r.group.scale.setScalar(r.scale);
    r.group.quaternion.setFromUnitVectors(UP_Y, tmpV.copy(r.vel).normalize());
    r.tCol.fill(0);
    r.alive = true;
    r.group.visible = true;
  }

  function updateRocket(r, dtSec, dt, t, camY) {
    if (r.alive) {
      r.group.position.addScaledVector(r.vel, dtSec);
      r.group.rotateY(0.03 * dt); // slow roll around its axis
      r.flame.scale.set(1, 0.8 + Math.sin(t * 31 + r.scale * 40) * 0.25, 1);

      // Emit a trail point at the engine.
      tmpV.set(0, -1.5, 0).applyQuaternion(r.group.quaternion).multiplyScalar(r.scale).add(r.group.position);
      const h = r.head * 3;
      r.tPos[h] = tmpV.x; r.tPos[h + 1] = tmpV.y; r.tPos[h + 2] = tmpV.z;
      r.tCol[h] = 0.62; r.tCol[h + 1] = 0.88; r.tCol[h + 2] = 1.0;
      r.head = (r.head + 1) % TRAIL_N;

      if (Math.abs(r.group.position.x) > EXTENT_X + 4 || Math.abs(r.group.position.y - camY) > 34) {
        r.alive = false;
        r.group.visible = false;
      }
    }
    // Fade the whole trail (also after despawn, so it dissolves).
    const fade = Math.pow(0.955, dt);
    for (let i = 0; i < r.tCol.length; i++) r.tCol[i] *= fade;
    r.tGeo.attributes.position.needsUpdate = true;
    r.tGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- Shooting stars with trails ---------- */
  const SHOOT_SEGS = 14;

  function buildShootingStar() {
    const geo = new THREE.BufferGeometry();
    const pts = new Float32Array(SHOOT_SEGS * 3);
    const cols = new Float32Array(SHOOT_SEGS * 3);
    const len = 7 + Math.random() * 4;
    for (let i = 0; i < SHOOT_SEGS; i++) {
      const f = i / (SHOOT_SEGS - 1);
      pts[i * 3] = -f * len; // trail extends behind the head along -x
      const b = Math.pow(1 - f, 2);
      cols[i * 3] = 0.95 * b; cols[i * 3 + 1] = 0.98 * b; cols[i * 3 + 2] = 1.0 * b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    const head = makeSprite(glowTex, 0xeaf8ff, 1, false);
    head.scale.set(1.4, 1.4, 1);
    line.add(head);
    line.visible = false;
    scene.add(line);
    return { line, alive: false, vel: new THREE.Vector3(), traveled: 0, range: 0 };
  }

  const shootingStars = Array.from({ length: isMobile ? 2 : 3 }, buildShootingStar);
  const X_AXIS = new THREE.Vector3(1, 0, 0);

  function launchShootingStar(s, camY) {
    const dir = tmpV.set(
      (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.5),
      -(0.45 + Math.random() * 0.6),
      0
    ).normalize();
    s.vel.copy(dir).multiplyScalar(26 + Math.random() * 16);
    s.line.position.set(
      (Math.random() * 2 - 1) * 34,
      camY + 6 + Math.random() * 14,
      -22 - Math.random() * 16
    );
    s.line.quaternion.setFromUnitVectors(X_AXIS, dir);
    s.traveled = 0;
    s.range = 30 + Math.random() * 14;
    s.alive = true;
    s.line.visible = true;
  }

  function updateShootingStar(s, dtSec) {
    if (!s.alive) return;
    const step = s.vel.length() * dtSec;
    s.traveled += step;
    s.line.position.addScaledVector(s.vel, dtSec);
    const f = s.traveled / s.range;
    // Quick fade-in, long fade-out.
    s.line.material.opacity = f < 0.12 ? f / 0.12 : Math.max(0, 1 - (f - 0.12) / 0.88);
    s.line.children[0].material.opacity = s.line.material.opacity;
    if (f >= 1) {
      s.alive = false;
      s.line.visible = false;
    }
  }

  /* ---------- Drifting asteroids ---------- */
  function buildAsteroid() {
    const r = 0.35 + Math.random() * 0.5;
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const noise = makeNoise(Math.floor(Math.random() * 100));
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const n = noise(v.x * 2.2, v.y * 2.2, v.z * 2.2);
      const len = r * (1 + (n - 0.5) * 0.75);
      pos.setXYZ(i, v.x * len, v.y * len, v.z * len);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x5a6a80,
      flatShading: true,
      roughness: 1,
      metalness: 0.05,
    }));
    mesh.visible = false;
    scene.add(mesh);
    return {
      mesh, alive: false,
      vel: new THREE.Vector3(),
      tumble: { x: (Math.random() - 0.5) * 0.02, y: (Math.random() - 0.5) * 0.02 },
    };
  }

  const asteroids = Array.from({ length: isMobile ? 1 : 3 }, buildAsteroid);

  function launchAsteroid(a, camY) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    a.vel.set(dir * (0.7 + Math.random() * 0.9), (Math.random() - 0.5) * 0.5, 0);
    a.mesh.position.set(
      -dir * EXTENT_X,
      camY + (Math.random() - 0.5) * 20,
      -6 - Math.random() * 12
    );
    a.alive = true;
    a.mesh.visible = true;
  }

  function updateAsteroid(a, dtSec, dt, camY) {
    if (!a.alive) return;
    a.mesh.position.addScaledVector(a.vel, dtSec);
    a.mesh.rotation.x += a.tumble.x * dt;
    a.mesh.rotation.y += a.tumble.y * dt;
    if (Math.abs(a.mesh.position.x) > EXTENT_X + 4 || Math.abs(a.mesh.position.y - camY) > 36) {
      a.alive = false;
      a.mesh.visible = false;
    }
  }

  /* ---------- Stardust cursor trail ----------
     Soft glowing particles emitted along the cursor's path (emission
     scales with movement, so a resting cursor stays clean). Lives in
     whichever scene is active, projected 24 units in front of the
     camera so it works in space and on the landscape alike. */
  const CT_N = isMobile ? 90 : 200;
  const ctPos = new Float32Array(CT_N * 3);
  const ctVel = new Float32Array(CT_N * 3);
  const ctBase = new Float32Array(CT_N * 3);
  const ctCol = new Float32Array(CT_N * 3);
  const ctLife = new Float32Array(CT_N);
  const ctMaxLife = new Float32Array(CT_N);
  let ctHead = 0;
  let trailBudget = 0; // pixels of cursor movement not yet "spent" on particles

  const ctGeo = new THREE.BufferGeometry();
  ctGeo.setAttribute('position', new THREE.BufferAttribute(ctPos, 3).setUsage(THREE.DynamicDrawUsage));
  ctGeo.setAttribute('color', new THREE.BufferAttribute(ctCol, 3).setUsage(THREE.DynamicDrawUsage));
  const cursorTrail = new THREE.Points(ctGeo, new THREE.PointsMaterial({
    size: 0.5,
    map: glowTex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  cursorTrail.frustumCulled = false;
  scene.add(cursorTrail);
  let trailInSpace = true;

  const trailPoint = new THREE.Vector3();
  const prevTrailPoint = new THREE.Vector3();
  let hasPrevTrailPoint = false;

  function emitTrailParticle(x, y, z) {
    const i = ctHead;
    ctHead = (ctHead + 1) % CT_N;
    const i3 = i * 3;
    ctPos[i3] = x + (Math.random() - 0.5) * 0.5;
    ctPos[i3 + 1] = y + (Math.random() - 0.5) * 0.5;
    ctPos[i3 + 2] = z + (Math.random() - 0.5) * 0.3;
    ctVel[i3] = (Math.random() - 0.5) * 1.1;
    ctVel[i3 + 1] = (Math.random() - 0.5) * 1.1 - 0.35; // slight downward drift
    ctVel[i3 + 2] = (Math.random() - 0.5) * 0.5;
    const glint = 0.6 + Math.random() * 0.4;
    if (Math.random() < 0.12) {
      // occasional gold sparkle
      ctBase[i3] = 1.0 * glint; ctBase[i3 + 1] = 0.78 * glint; ctBase[i3 + 2] = 0.4 * glint;
    } else {
      ctBase[i3] = 0.5 * glint; ctBase[i3 + 1] = 0.88 * glint; ctBase[i3 + 2] = 1.0 * glint;
    }
    ctLife[i] = ctMaxLife[i] = 0.5 + Math.random() * 0.7;
  }

  function updateCursorTrail(dtSec, spaceActive) {
    // Keep the trail in the scene currently being rendered.
    if (spaceActive !== trailInSpace) {
      (spaceActive ? scene : landscape.scene).add(cursorTrail);
      trailInSpace = spaceActive;
      hasPrevTrailPoint = false; // no streak across the scene switch
    }

    if (hasMouse) {
      ndc.set(mouse.x, mouse.y);
      raycaster.setFromCamera(ndc, camera);
      trailPoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 24);
      if (!hasPrevTrailPoint) {
        prevTrailPoint.copy(trailPoint);
        hasPrevTrailPoint = true;
      }
      const PX_PER_PARTICLE = 7;
      const count = Math.min(8, Math.floor(trailBudget / PX_PER_PARTICLE));
      if (count > 0) {
        trailBudget -= count * PX_PER_PARTICLE;
        for (let k = 1; k <= count; k++) {
          tmpV.lerpVectors(prevTrailPoint, trailPoint, k / count);
          emitTrailParticle(tmpV.x, tmpV.y, tmpV.z);
        }
      }
      prevTrailPoint.copy(trailPoint);
      trailBudget *= 0.9; // unspent budget decays; stops don't burst later
    }

    // Age, drift and fade every live particle.
    for (let i = 0; i < CT_N; i++) {
      const i3 = i * 3;
      if (ctLife[i] > 0) {
        ctLife[i] -= dtSec;
        ctPos[i3] += ctVel[i3] * dtSec;
        ctPos[i3 + 1] += ctVel[i3 + 1] * dtSec;
        ctPos[i3 + 2] += ctVel[i3 + 2] * dtSec;
        const f = Math.max(0, ctLife[i] / ctMaxLife[i]);
        const b = f * f;
        ctCol[i3] = ctBase[i3] * b;
        ctCol[i3 + 1] = ctBase[i3 + 1] * b;
        ctCol[i3 + 2] = ctBase[i3 + 2] * b;
      } else {
        ctCol[i3] = ctCol[i3 + 1] = ctCol[i3 + 2] = 0;
      }
    }
    ctGeo.attributes.position.needsUpdate = true;
    ctGeo.attributes.color.needsUpdate = true;
  }

  // Spawn scheduling (elapsed-time based, so pauses don't burst-spawn).
  let nextRocketAt = 2.5;
  let nextShootAt = 1.5;
  let nextAsteroidAt = 6;

  function updateAmbient(dtSec, dt, t, camY, spaceActive) {
    if (spaceActive) {
      if (t >= nextRocketAt) {
        const free = rockets.find((r) => !r.alive);
        if (free) launchRocket(free, camY);
        nextRocketAt = t + 7 + Math.random() * 9;
      }
      if (t >= nextShootAt) {
        const free = shootingStars.find((s) => !s.alive);
        if (free) launchShootingStar(free, camY);
        nextShootAt = t + 2.5 + Math.random() * 4.5;
      }
      if (t >= nextAsteroidAt) {
        const free = asteroids.find((a) => !a.alive);
        if (free) launchAsteroid(free, camY);
        nextAsteroidAt = t + 9 + Math.random() * 9;
      }
    }
    for (const r of rockets) updateRocket(r, dtSec, dt, t, camY);
    for (const s of shootingStars) updateShootingStar(s, dtSec);
    for (const a of asteroids) updateAsteroid(a, dtSec, dt, camY);
  }

  /* ============================================================
     The landscape: inside the destination planet. Revealed by the
     atmosphere-entry flash at the end of the landing dive.
     ============================================================ */
  const landscape = buildLandscape();

  function buildLandscape() {
    const ls = new THREE.Scene();
    ls.fog = new THREE.Fog(0x081820, 26, 135);

    const lsSun = new THREE.DirectionalLight(0xffd9a0, 2.2);
    lsSun.position.set(-40, 18, -60);
    ls.add(lsSun);
    ls.add(new THREE.AmbientLight(0x27455c, 1.5));
    ls.add(new THREE.HemisphereLight(0x67e8f9, 0x0b2a33, 0.5));

    // Terrain: noise-displaced plane, flat-shaded. A gentler valley
    // near the origin (where the camera settles), mountains far out.
    const tNoise = makeNoise(99);
    function terrainHeight(x, z) {
      const d = Math.sqrt(x * x + z * z);
      let h = tNoise(x * 0.02 + 5, 0, z * 0.02 + 5) * 14 + tNoise(x * 0.06, 0, z * 0.06) * 4;
      h *= Math.min(1, Math.max(0.15, (d - 8) / 70));
      h += Math.max(0, d - 70) * 0.25 * (0.6 + tNoise(x * 0.01, 3, z * 0.01));
      return h - 2;
    }

    const seg = isMobile ? 64 : 110;
    const tGeo = new THREE.PlaneGeometry(280, 280, seg, seg);
    tGeo.rotateX(-Math.PI / 2);
    const tPos = tGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      tPos.setY(i, terrainHeight(tPos.getX(i), tPos.getZ(i)));
    }
    tGeo.computeVertexNormals();
    ls.add(new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({
      color: 0x16424f,
      emissive: 0x04141c,
      emissiveIntensity: 0.5,
      flatShading: true,
      roughness: 0.95,
      metalness: 0.05,
    })));

    // Glowing crystals scattered across the valley.
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x0f3a44,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.65,
      flatShading: true,
      roughness: 0.4,
      metalness: 0.2,
    });
    const crystalCount = isMobile ? 18 : 40;
    for (let i = 0; i < crystalCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 10 + Math.random() * 85;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 20;
      const h = 0.8 + Math.random() * 3.2;
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.18 + Math.random() * 0.5, h, 5), crystalMat);
      crystal.position.set(x, terrainHeight(x, z) + h / 2 - 0.25, z);
      crystal.rotation.y = Math.random() * Math.PI;
      crystal.rotation.z = (Math.random() - 0.5) * 0.24;
      ls.add(crystal);
    }

    // A landing beacon near the camera's resting point.
    const beacon = new THREE.Group();
    const bx = 5, bz = 4;
    const by = terrainHeight(bx, bz);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xdde6f2, roughness: 0.4, metalness: 0.6 })
    );
    pole.position.y = 1.3;
    beacon.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x9feaff })
    );
    bulb.position.y = 2.75;
    beacon.add(bulb);
    const bulbGlow = makeSprite(glowTex, 0x67e8f9, 0.9, false);
    bulbGlow.scale.set(2.4, 2.4, 1);
    bulbGlow.position.y = 2.75;
    beacon.add(bulbGlow);
    const beaconLight = new THREE.PointLight(0x22d3ee, 14, 34, 1.6);
    beaconLight.position.y = 2.9;
    beacon.add(beaconLight);
    beacon.position.set(bx, by, bz);
    ls.add(beacon);

    // Sky: stars, a huge ringed sibling planet, a moon, horizon glow.
    const skyStarGeo = new THREE.BufferGeometry();
    const skyStarCount = isMobile ? 140 : 320;
    const skyArr = new Float32Array(skyStarCount * 3);
    for (let i = 0; i < skyStarCount; i++) {
      skyArr[i * 3] = (Math.random() * 2 - 1) * 130;
      skyArr[i * 3 + 1] = 6 + Math.random() * 85;
      skyArr[i * 3 + 2] = -30 - Math.random() * 105;
    }
    skyStarGeo.setAttribute('position', new THREE.BufferAttribute(skyArr, 3));
    ls.add(new THREE.Points(skyStarGeo, new THREE.PointsMaterial({
      color: 0xdbe6ff,
      size: 0.5,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })));

    const skyPlanet = new THREE.Group();
    const spBody = new THREE.Mesh(
      new THREE.SphereGeometry(13, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0x2a4d8f, emissive: 0x121f45, emissiveIntensity: 0.5,
        roughness: 0.9, metalness: 0.05, fog: false,
      })
    );
    skyPlanet.add(spBody);
    const spRing = new THREE.Mesh(
      new THREE.RingGeometry(18, 27, 64),
      new THREE.MeshBasicMaterial({
        color: 0xe8c15a, side: THREE.DoubleSide, transparent: true,
        opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    spRing.rotation.x = -1.25;
    skyPlanet.add(spRing);
    skyPlanet.position.set(-52, 26, -108);
    skyPlanet.rotation.z = 0.15;
    ls.add(skyPlanet);

    const skyMoon = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 20, 16),
      new THREE.MeshStandardMaterial({
        color: 0x9fb2cc, emissive: 0x2a3448, emissiveIntensity: 0.5,
        roughness: 0.95, metalness: 0, fog: false,
      })
    );
    skyMoon.position.set(48, 34, -95);
    ls.add(skyMoon);

    const horizon = makeSprite(glowTex, 0x1d97b8, 0.5, false);
    horizon.scale.set(280, 70, 1);
    horizon.position.set(0, 2, -120);
    ls.add(horizon);

    return { scene: ls, beaconLight, bulbGlow };
  }

  /* ---------- Landing sequence state ---------- */
  const DIVE_END = 0.7; // fraction of the landing scroll where the flash peaks
  const landingEl = document.getElementById('landing');
  const landingCopy = document.getElementById('landing-copy');
  const flashEl = document.getElementById('landing-flash');

  function landingProgress() {
    if (!landingEl) return 0;
    const r = landingEl.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    if (total <= 0) return r.top < 0 ? 1 : 0;
    return clamp01(-r.top / total);
  }

  function applyLandingUI(L) {
    if (landingCopy) landingCopy.classList.toggle('landed', L > 0.8);
    if (flashEl && !prefersReducedMotion) {
      let flash = 0;
      if (L > 0.58 && L < DIVE_END) flash = smoothstep(0.58, DIVE_END, L);
      else if (L >= DIVE_END) flash = 1 - smoothstep(DIVE_END, 0.84, L);
      flashEl.style.opacity = (flash * flash).toFixed(3);
    }
  }

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
      const progress = clamp01(max > 0 ? centerScroll / max : 0);
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
  let lastClientX = null;
  let lastClientY = null;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    hasMouse = true;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    // Feed the cursor-trail emitter with pixels travelled (capped so a
    // fast swipe can't bank a long burst of particles).
    if (lastClientX !== null) {
      trailBudget = Math.min(56, trailBudget + Math.hypot(e.clientX - lastClientX, e.clientY - lastClientY));
    }
    lastClientX = e.clientX;
    lastClientY = e.clientY;
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

    const L = landingProgress();
    applyLandingUI(L);

    if (L < DIVE_END) {
      /* ----- Space: normal journey + dive approach ----- */
      const dive = L <= 0 ? 0 : easeInCubic(clamp01(L / DIVE_END));

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
      lean *= 1 - dive;

      let desX = (hasMouse ? mouse.x * 2.2 : Math.sin(t * 0.1) * 0.8) * (1 - dive) + lean;
      let desY = targetY;
      let desZ = 30 - Math.min(scrollProgress * 4, 4);

      // Dive: accelerate toward the big planet's surface.
      if (dive > 0) {
        const bp = bigPlanet.position;
        const R = bigPlanet.userData.bigRadius;
        desX = lerp(desX, bp.x, dive);
        desY = lerp(desY, bp.y + 2.5, dive);
        desZ = lerp(desZ, bp.z + R + 2.6, dive);
      }

      // Exponential smoothing scaled by dt: refresh-rate independent.
      const ky = 1 - Math.pow(0.94, dt);
      const kx = 1 - Math.pow(0.97, dt);
      camera.position.x += (desX - camera.position.x) * kx;
      camera.position.y += (desY - camera.position.y) * ky;
      camera.position.z += (desZ - camera.position.z) * ky;
      camera.lookAt(
        lerp(0, bigPlanet.position.x, dive),
        lerp(camera.position.y, bigPlanet.position.y, dive),
        lerp(0, bigPlanet.position.z, dive)
      );

      // Hero network: only pay for it while it can be seen.
      if (camera.position.y > -40) {
        updateNetwork(dt, cursorWorldPoint());
        points.rotation.y = Math.sin(t * 0.05) * 0.12;
        lines.rotation.y = points.rotation.y;
      }

      // Planets: slow spin and orbiting moons.
      for (const p of planets) {
        p.userData.body.rotation.y += 0.0026 * p.userData.spin * dt * 10;
        for (const m of p.userData.moons || []) {
          m.pivot.rotation.y = t * m.speed + m.phase;
        }
      }

      starsFar.rotation.y = t * 0.004;
      starsNear.rotation.y = t * 0.008;

      updateAmbient(dtSec, dt, t, camera.position.y, L < 0.4);
      updateCursorTrail(dtSec, true);

      renderer.render(scene, camera);
    } else {
      /* ----- Landscape: after the atmosphere flash ----- */
      const P = easeOutCubic(clamp01((L - DIVE_END) / (1 - DIVE_END)));

      const px = hasMouse ? mouse.x * 1.3 * P : Math.sin(t * 0.12) * 0.5;
      camera.position.set(
        px,
        lerp(30, 9, P) + Math.sin(t * 0.5) * 0.25 * P,
        lerp(46, 20, P)
      );
      camera.lookAt(0, 7, -70);

      landscape.beaconLight.intensity = 12 + Math.sin(t * 2.6) * 5;
      landscape.bulbGlow.material.opacity = 0.7 + Math.sin(t * 2.6) * 0.25;

      updateCursorTrail(dtSec, false);

      renderer.render(landscape.scene, camera);
    }
  }

  // Reduced motion: a single static frame (re-rendered only on resize/scroll).
  function renderStatic() {
    const L = landingProgress();
    if (landingCopy) landingCopy.classList.toggle('landed', L > DIVE_END);
    if (L >= DIVE_END) {
      camera.position.set(0, 9, 20);
      camera.lookAt(0, 7, -70);
      renderer.render(landscape.scene, camera);
    } else {
      updateNetwork(0, null);
      camera.position.set(0, -scrollProgress * CAMERA_TRAVEL, 30);
      camera.lookAt(0, camera.position.y, 0);
      renderer.render(scene, camera);
    }
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
