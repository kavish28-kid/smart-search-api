import * as THREE from "/vendor/three/build/three.module.js";
import { EffectComposer } from "/vendor/three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "/vendor/three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "/vendor/three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "/vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "/vendor/three/examples/jsm/postprocessing/AfterimagePass.js";

const canvas = document.querySelector("#searchScene");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCompact = () => window.innerWidth < 820;
const highQuality = !isCompact() && window.devicePixelRatio <= 2;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: highQuality,
  alpha: false,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, highQuality ? 1.75 : 1.25));
renderer.setClearColor(0x050505, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050008, 0.028);

const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 140);
camera.position.set(0, 4.35, 14);
camera.lookAt(0, -0.3, -8);

const world = new THREE.Group();
scene.add(world);

const uniforms = {
  uTime: { value: 0 },
  uPulse: { value: 0 },
  uMouse: { value: new THREE.Vector2(0, 0) },
  uResolution: { value: new THREE.Vector2(1, 1) },
};

const glslNoise = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amp * noise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return value;
}
`;

const backgroundMaterial = new THREE.ShaderMaterial({
  depthWrite: false,
  depthTest: false,
  uniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform float uTime;
    uniform float uPulse;
    uniform vec2 uMouse;
    varying vec2 vUv;
    ${glslNoise}

    void main() {
      vec2 uv = vUv;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= 1.35;

      float field = fbm(p * 2.3 + vec2(uTime * 0.035, -uTime * 0.025));
      float nebula = smoothstep(0.34, 0.95, field);
      float halo = 1.0 - smoothstep(0.0, 0.82, length(p - vec2(0.42 + uMouse.x * 0.08, 0.03 - uMouse.y * 0.05)));
      float scan = pow(abs(sin((uv.y + uTime * 0.035) * 72.0)), 18.0) * 0.045;
      float volume = 0.0;
      vec2 ray = p - vec2(0.42 + uMouse.x * 0.08, 0.03 - uMouse.y * 0.05);
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        vec2 rp = ray * (1.0 + fi * 0.18);
        float shell = abs(length(rp) - (0.18 + fi * 0.055 + sin(uTime * 0.8 + fi) * 0.012));
        volume += 0.012 / (shell + 0.025);
      }

      vec3 deep = vec3(0.005, 0.005, 0.007);
      vec3 indigo = vec3(0.045, 0.015, 0.11);
      vec3 violet = vec3(0.35, 0.0, 0.68);
      vec3 cyan = vec3(0.0, 0.96, 1.0);
      vec3 magenta = vec3(1.0, 0.0, 0.78);

      vec3 color = mix(deep, indigo, uv.y);
      color += violet * nebula * 0.14;
      color += cyan * halo * (0.045 + uPulse * 0.08);
      color += magenta * pow(nebula, 3.0) * 0.14;
      color += mix(magenta, cyan, 0.35 + sin(uTime) * 0.25) * volume * (0.03 + uPulse * 0.045);
      color += scan * 0.35;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const backgroundScene = new THREE.Scene();
const backgroundCamera = new THREE.Camera();
backgroundScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backgroundMaterial));

const particleCount = highQuality ? 9000 : 4200;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const particleSeeds = new Float32Array(particleCount);
const particleColors = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount; i += 1) {
  const layer = Math.random();
  const angle = Math.random() * Math.PI * 2;
  const radius = 2.8 + Math.pow(Math.random(), 0.58) * 13;
  const sideBias = Math.random() > 0.38 ? 1 : -1;

  particlePositions[i * 3] = Math.cos(angle) * radius + sideBias * (2.2 + layer * 3.2);
  particlePositions[i * 3 + 1] = -2.4 + Math.random() * 8.6;
  particlePositions[i * 3 + 2] = -34 + Math.random() * 38;
  particleSeeds[i] = Math.random() * 1000;

  const colorMix = Math.random();
  particleColors[i * 3] = 0.42 + colorMix * 0.48;
  particleColors[i * 3 + 1] = 0.0 + colorMix * 0.08;
  particleColors[i * 3 + 2] = 0.72 + colorMix * 0.24;
}

particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute("aSeed", new THREE.BufferAttribute(particleSeeds, 1));
particleGeometry.setAttribute("aColor", new THREE.BufferAttribute(particleColors, 3));

const particleMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms,
  vertexShader: `
    precision highp float;
    uniform float uTime;
    uniform float uPulse;
    uniform vec2 uMouse;
    attribute float aSeed;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlpha;
    ${glslNoise}

    void main() {
      vec3 pos = position;
      float t = uTime * (0.18 + fract(aSeed) * 0.42);
      float n = fbm(pos.xz * 0.12 + vec2(t, aSeed));

      vec2 mousePull = uMouse * (0.55 + uPulse * 0.85);
      pos.x += sin(t + aSeed) * (0.55 + n) + mousePull.x;
      pos.y += cos(t * 1.3 + aSeed) * 0.34 + mousePull.y * 0.35;
      pos.z += mod(uTime * (1.4 + uPulse * 6.0) + aSeed, 14.0) - 7.0;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float depthFade = smoothstep(-48.0, -4.0, mvPosition.z);
      gl_PointSize = (0.46 + n * 0.92 + uPulse * 0.72) * (220.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;

      vColor = mix(aColor, vec3(0.0, 0.96, 1.0), uPulse * 0.34);
      vAlpha = depthFade * (0.45 + n * 0.65);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float d = dot(p, p);
      float core = smoothstep(1.0, 0.0, d);
      float glow = smoothstep(1.0, 0.12, d) * 0.38;
      gl_FragColor = vec4(vColor * (core + glow), (core + glow) * vAlpha * 0.34);
    }
  `,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
world.add(particles);

const waveGeometry = new THREE.PlaneGeometry(34, 22, highQuality ? 180 : 100, highQuality ? 120 : 70);
const waveMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  uniforms,
  vertexShader: `
    precision highp float;
    uniform float uTime;
    uniform float uPulse;
    uniform vec2 uMouse;
    varying vec2 vUv;
    varying float vWave;
    ${glslNoise}

    void main() {
      vUv = uv;
      vec3 pos = position;
      float n = fbm(pos.xz * 0.18 + vec2(uTime * 0.08, -uTime * 0.045));
      float ripple = sin(length(pos.xz - vec2(uMouse.x * 7.0, uMouse.y * -4.0)) * 2.2 - uTime * 3.0);
      pos.z += (n - 0.5) * 1.6 + ripple * (0.12 + uPulse * 0.34);
      vWave = n + ripple * 0.12;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform float uTime;
    uniform float uPulse;
    varying vec2 vUv;
    varying float vWave;

    float line(float value, float thickness) {
      return 1.0 - smoothstep(0.0, thickness, abs(fract(value) - 0.5));
    }

    void main() {
      float grid = max(line(vUv.x * 34.0 + uTime * 0.24, 0.035), line(vUv.y * 22.0 - uTime * 0.18, 0.035));
      float horizon = smoothstep(0.08, 0.92, vUv.y);
      vec3 cyan = vec3(0.0, 0.96, 1.0);
      vec3 violet = vec3(0.35, 0.0, 0.95);
      vec3 magenta = vec3(1.0, 0.0, 0.78);
      vec3 color = mix(violet, cyan, vUv.y) + magenta * uPulse * 0.22;
      float alpha = grid * horizon * (0.08 + vWave * 0.22 + uPulse * 0.18);
      gl_FragColor = vec4(color, alpha);
    }
  `,
});

const wave = new THREE.Mesh(waveGeometry, waveMaterial);
wave.rotation.x = -Math.PI / 2.18;
wave.position.set(4.5, -2.62, -11);
world.add(wave);

const portal = new THREE.Group();
portal.position.set(5.7, 0.62, -7.6);
world.add(portal);

const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0xff00c8,
  transparent: true,
  opacity: 0.78,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});

for (let i = 0; i < 6; i += 1) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.35 + i * 0.32, 0.012 + i * 0.002, 12, 160),
    ringMaterial.clone()
  );
  ring.rotation.x = Math.PI / 2.35;
  ring.rotation.y = i * 0.22;
  ring.material.opacity = 0.78 - i * 0.08;
  portal.add(ring);
}

const objectMaterials = [
  new THREE.MeshStandardMaterial({
    color: 0xff00c8,
    emissive: 0x430032,
    metalness: 0.4,
    roughness: 0.24,
    wireframe: true,
  }),
  new THREE.MeshStandardMaterial({
    color: 0x7f00ff,
    emissive: 0x210047,
    metalness: 0.28,
    roughness: 0.32,
    wireframe: true,
  }),
];

const floaters = [];
for (let i = 0; i < 8; i += 1) {
  const geometry = i % 2 === 0 ? new THREE.IcosahedronGeometry(0.42 + Math.random() * 0.35, 1) : new THREE.SphereGeometry(0.25 + Math.random() * 0.22, 18, 12);
  const mesh = new THREE.Mesh(geometry, objectMaterials[i % objectMaterials.length]);
  mesh.position.set(1.5 + Math.random() * 10, -0.7 + Math.random() * 5.7, -23 + Math.random() * 24);
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  floaters.push({ mesh, spin: 0.24 + Math.random() * 0.5, baseY: mesh.position.y });
  world.add(mesh);
}

const finalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: uniforms.uTime,
    uPulse: uniforms.uPulse,
    uResolution: uniforms.uResolution,
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uPulse;
    uniform vec2 uResolution;
    varying vec2 vUv;
    ${glslNoise}

    void main() {
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      float dist = length(center);
      vec2 aberration = center * (0.0025 + uPulse * 0.002);
      vec2 flow = normalize(center + vec2(0.0001)) * (0.004 + uPulse * 0.01);

      vec3 color;
      color.r = texture2D(tDiffuse, uv + aberration).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - aberration).b;
      vec3 trailA = texture2D(tDiffuse, uv - flow).rgb;
      vec3 trailB = texture2D(tDiffuse, uv - flow * 2.2).rgb;
      color += (trailA * 0.08 + trailB * 0.04) * (0.35 + uPulse);

      float vignette = smoothstep(0.88, 0.28, dist);
      float grain = (hash(uv * uResolution + uTime) - 0.5) * 0.045;
      float scan = sin((uv.y + uTime * 0.015) * uResolution.y * 0.9) * 0.012;
      color = color * (0.36 + vignette * 0.34) + grain * 0.72 + scan * 0.5;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

scene.add(new THREE.AmbientLight(0x7f00ff, 0.48));
const cyanLight = new THREE.PointLight(0x00f5ff, 44, 34);
cyanLight.position.set(6.8, 4.2, 4);
scene.add(cyanLight);
const magentaLight = new THREE.PointLight(0xff00c8, 62, 24);
magentaLight.position.set(-4.4, 2.4, 5);
scene.add(magentaLight);

const composer = new EffectComposer(renderer);
const backgroundPass = {
  enabled: true,
  needsSwap: false,
  setSize() {},
  render() {
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(backgroundScene, backgroundCamera);
    renderer.autoClear = false;
  },
};
composer.addPass(backgroundPass);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), highQuality ? 0.18 : 0.12, 0.26, 0.42);
composer.addPass(bloomPass);
const afterimagePass = new AfterimagePass(0.86);
composer.addPass(afterimagePass);
composer.addPass(new ShaderPass(finalShader));

let pulse = 0;
let targetPulse = 0;
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;

window.addEventListener("search-start", () => {
  targetPulse = 1;
});

window.addEventListener("ai-activity", () => {
  targetPulse = Math.max(targetPulse, 0.52);
});

window.addEventListener("pointermove", (event) => {
  targetMouseX = (event.clientX / window.innerWidth - 0.5) * 2;
  targetMouseY = (event.clientY / window.innerHeight - 0.5) * 2;
  document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
  document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
});

const resize = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  uniforms.uResolution.value.set(width, height);
  camera.aspect = width / height;

  if (isCompact()) {
    camera.position.set(1.4, 4.7, 15.5);
    portal.position.set(3.8, 0.38, -8.2);
    wave.position.x = 2.7;
  } else {
    camera.position.set(0, 4.35, 14);
    portal.position.set(5.7, 0.62, -7.6);
    wave.position.x = 4.5;
  }

  camera.lookAt(0, -0.3, -8);
  camera.updateProjectionMatrix();
};

window.addEventListener("resize", resize);
resize();

let lastTime = performance.now() * 0.001;
let elapsed = 0;

const renderFrame = (time = 0) => {
  const now = time * 0.001;
  const delta = Math.min(now - lastTime, 0.04);
  lastTime = now;
  elapsed += prefersReducedMotion ? delta * 0.25 : delta;

  targetPulse = Math.max(0, targetPulse - delta * 1.8);
  pulse += (targetPulse - pulse) * 0.08;
  mouseX += (targetMouseX - mouseX) * 0.055;
  mouseY += (targetMouseY - mouseY) * 0.055;

  uniforms.uTime.value = elapsed;
  uniforms.uPulse.value = pulse;
  uniforms.uMouse.value.set(mouseX, mouseY);

  camera.position.x += (mouseX * 0.62 - camera.position.x) * 0.018;
  camera.position.y += ((isCompact() ? 4.7 : 4.35) - mouseY * 0.28 - camera.position.y) * 0.018;
  camera.lookAt(mouseX * 0.5, -0.3 - mouseY * 0.2, -8);

  world.rotation.y = Math.sin(elapsed * 0.16) * 0.035 + mouseX * 0.025;
  portal.rotation.z += delta * (0.44 + pulse * 2.4);
  portal.rotation.y = Math.sin(elapsed * 0.45) * 0.2 + mouseX * 0.12;
  portal.scale.setScalar(1 + pulse * 0.16);

  for (let i = 0; i < portal.children.length; i += 1) {
    const ring = portal.children[i];
    ring.rotation.z -= delta * (0.24 + i * 0.08);
    ring.material.opacity = 0.46 + Math.sin(elapsed * 2.0 + i) * 0.12 + pulse * 0.22;
  }

  for (const floater of floaters) {
    floater.mesh.rotation.x += delta * floater.spin;
    floater.mesh.rotation.y += delta * floater.spin * 0.72;
    floater.mesh.position.y = floater.baseY + Math.sin(elapsed * 0.9 + floater.baseY) * 0.25;
    floater.mesh.position.z += delta * (0.45 + pulse * 2.2);
    if (floater.mesh.position.z > 5) floater.mesh.position.z = -24;
  }

  bloomPass.strength = (highQuality ? 0.18 : 0.12) + pulse * 0.18;
  bloomPass.radius = 0.24 + pulse * 0.06;
  afterimagePass.uniforms.damp.value = 0.84 - pulse * 0.08;

  composer.render();
  requestAnimationFrame(renderFrame);
};

renderFrame();
