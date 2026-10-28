import * as T from './vendor/mystery-box-three.js?v=20261028-5';
import { BOX_FRAME, fitBoxCamera, lidDepthScale, iconShadowNeedsUpdate } from './mystery-box-motion.js?v=20261028-5';

// One small, demand-rendered scene. No game data or puzzle content enters WebGL.
export async function createMysteryBoxScene(host) {
  host.dataset.renderer = 'initializing';
  const mobile = window.matchMedia('(max-width: 600px)').matches;
  const capture = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('boxReview');
  const graphics = globalThis.dailyUndeadEntry?.acquireGraphics();
  if (!graphics) throw new Error('WebGL 2 context unavailable');
  const renderer = new T.WebGLRenderer({ canvas: graphics.canvas, context: graphics.context,
    alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: capture });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.className = 'mb-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-4.6, 4.6, 2.3, -2.3, .1, 60);
  camera.position.set(7.8, 5.7, 14);
  camera.lookAt(0, 1.70, 0);
  const room = new T.RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, .04, .1, 100, { size: 64 });
  scene.environment = env.texture;
  scene.environmentIntensity = .65;
  room.dispose();
  pmrem.dispose();
  scene.add(new T.HemisphereLight(0xb9d8ee, 0x10101c, 1.1));
  const key = new T.DirectionalLight(0xffeddb, 3.4);
  key.position.set(-3, 7, 6);
  key.castShadow = true;
  key.shadow.autoUpdate = false;
  key.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.normalBias = .025;
  key.shadow.bias = -.0002;
  key.shadow.radius = 3;
  scene.add(key);
  const fill = new T.DirectionalLight(0x55daf8, 4.0);
  fill.position.set(-4, 2.5, 6); scene.add(fill);
  const rim = new T.DirectionalLight(0x9c78ff, 3.2);
  rim.position.set(6, 4.5, 4); scene.add(rim);

  host.dataset.renderer = 'texture';
  const loader = new T.TextureLoader();
  const [woodMap, paintMap] = await Promise.all([
    loader.loadAsync(new URL('../assets/mystery-box/aged-oak.webp?v=20261028-5', import.meta.url).href),
    loader.loadAsync(new URL('../assets/mystery-box/painted-question.png?v=20261028-5', import.meta.url).href),
  ]);
  woodMap.colorSpace = T.SRGBColorSpace;
  woodMap.wrapS = woodMap.wrapT = T.RepeatWrapping;
  woodMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const wood = new T.MeshStandardMaterial({ map: woodMap, bumpMap: woodMap, bumpScale: .035, color: 0xb6b5a6, roughness: .83, metalness: 0 });
  const woodDark = wood.clone(); woodDark.color.set(0x77766d);
  const woodLight = wood.clone(); woodLight.color.set(0xc5c0af);
  const metal = new T.MeshStandardMaterial({ color: 0x30373b, metalness: .88, roughness: .46 });
  const metalEdge = new T.MeshStandardMaterial({ color: 0x707779, metalness: .86, roughness: .43 });
  const recess = new T.MeshStandardMaterial({ color: 0x15191a, metalness: .45, roughness: .75 });
  const brass = new T.MeshStandardMaterial({ color: 0x8b795a, metalness: .8, roughness: .6 });
  const caseGroup = new T.Group(); scene.add(caseGroup);
  const geometries = new Map();
  function box(w, h, d, material, x, y, z, parent = caseGroup, bevel = .025) {
    const cacheKey = [w, h, d, bevel].join(':');
    if (!geometries.has(cacheKey)) geometries.set(cacheKey, new T.RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, w / 3, h / 3, d / 3)));
    const mesh = new T.Mesh(geometries.get(cacheKey), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }
  const screwGeometry = new T.CylinderGeometry(.036, .039, .021, 8);
  function screw(x, y, z, parent = caseGroup, face = 'front') {
    const mesh = new T.Mesh(screwGeometry, metalEdge);
    mesh.position.set(x, y, z);
    if (face === 'front') mesh.rotation.x = Math.PI / 2;
    if (face === 'side') mesh.rotation.z = Math.PI / 2;
    parent.add(mesh);
    const slot = box(.039, .007, .004, recess, x, y, z + .013, parent, .001);
    if (face !== 'front') slot.visible = false;
  }

  // Separate boards, recessed joints, a hollow body and real corner hardware.
  box(6.12, .18, 2.1, woodDark, 0, .16, 0);
  for (let row = 0; row < 3; row++) {
    const y = .43 + row * .455;
    const material = [wood, woodDark, woodLight][row];
    box(6.1, .438, .16, material, 0, y, 1.0);
    box(6.1, .438, .16, woodDark, 0, y, -1.0);
    box(.16, .438, 1.86, material, -2.98, y, 0);
    box(.16, .438, 1.86, material, 2.98, y, 0);
  }
  for (const x of [-3.02, 3.02]) {
    for (const z of [-1.02, 1.02]) box(.13, 1.5, .13, metal, x, .91, z);
    // A bolted, raised carrying handle on each end.
    for (const z of [-.47, .47]) {
      box(.10, .30, .15, metal, x * 1.026, .98, z);
      box(.24, .10, .10, metalEdge, x * 1.065, .86, z);
    }
    box(.10, .10, 1.04, metalEdge, x * 1.10, .86, 0);
  }
  for (const z of [-1.04, 1.04]) {
    box(6.25, .10, .16, metal, 0, .22, z);
    box(6.25, .10, .16, metalEdge, 0, 1.59, z);
  }
  for (const x of [-2.25, 2.25]) {
    for (const z of [-1.115, 1.115]) box(.24, 1.42, .055, metal, x, .91, z);
    for (const y of [.38, 1.42]) screw(x, y, 1.15);
    for (const z of [-.76, .76]) box(.48, .12, .42, recess, x, .06, z);
  }
  box(.28, .31, .085, metalEdge, 0, 1.37, 1.15);
  box(.08, .12, .015, recess, 0, 1.35, 1.201);
  screw(0, 1.47, 1.208);

  const lid = new T.Group(); lid.position.set(0, 1.66, -1.08); caseGroup.add(lid);
  for (let board = 0; board < 4; board++) box(6.22, .19, .55, board % 2 ? wood : woodLight, 0, .105, .29 + board * .55, lid);
  box(6.27, .25, .10, metal, 0, .10, -.015, lid);
  box(6.27, .25, .10, metal, 0, .10, 2.23, lid);
  for (const x of [-3.09, 3.09]) box(.12, .25, 2.28, metal, x, .10, 1.10, lid);
  for (const x of [-2.25, 2.25]) {
    box(.24, .055, 2.28, metal, x, .23, 1.10, lid);
    box(.24, .24, .06, metal, x, .10, 2.28, lid);
    screw(x, .12, 2.32, lid);
    screw(x, .272, .22, lid, 'top'); screw(x, .272, 2.0, lid, 'top');
    const hinge = new T.Mesh(new T.CylinderGeometry(.085, .085, .5, 12), metalEdge);
    hinge.rotation.z = Math.PI / 2; hinge.position.set(x, 1.63, -1.12); caseGroup.add(hinge);
  }
  box(.25, .30, .06, metalEdge, 0, -.035, 2.29, lid);
  box(5.88, .035, 1.87, woodDark, 0, -.005, 1.10, lid);

  // Fixed artwork shared with the poster: font timing and OS font metrics cannot move it.
  paintMap.colorSpace = T.SRGBColorSpace;
  const paint = new T.MeshStandardMaterial({ map: paintMap, transparent: true, roughness: .94, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const markGeometry = new T.PlaneGeometry(.78, .90);
  for (const x of [-1.62, 0, 1.62]) {
    const topMark = new T.Mesh(markGeometry, paint); topMark.position.set(x, .207, 1.09); topMark.rotation.x = -Math.PI / 2; lid.add(topMark);
  }

  const inner = new T.Mesh(new T.PlaneGeometry(5.86, 1.80), new T.MeshBasicMaterial({ color: 0xe6f7ff, transparent: true, opacity: .6, side: T.DoubleSide }));
  inner.rotation.x = -Math.PI / 2; inner.position.set(0, 1.30, 0); caseGroup.add(inner);
  const innerLight = new T.PointLight(0xc8eeff, 0, 9, 2); innerLight.position.set(0, 1.52, .05); caseGroup.add(innerLight);
  // A broad source along the luminous front edge can cast a faint shadow back
  // onto the open lid. One small map avoids six point-light shadow passes.
  const lidLight = new T.SpotLight(0xc8eeff, 0, 8, Math.PI / 3, .8, 2);
  lidLight.position.set(0, 1.52, .95); lidLight.target.position.set(0, 2.5, -1.3);
  lidLight.castShadow = true; lidLight.shadow.mapSize.set(mobile ? 256 : 512, mobile ? 256 : 512);
  lidLight.shadow.autoUpdate = false;
  lidLight.shadow.intensity = .45; lidLight.shadow.normalBias = .015;
  lidLight.shadow.bias = -.0002; lidLight.shadow.radius = 3;
  caseGroup.add(lidLight, lidLight.target);
  const glowMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv; uniform float strength; void main(){ float width=mix(.27,.5,vUv.y); float edge=1.-smoothstep(width*.38,width,abs(vUv.x-.5));float fade=pow(1.-vUv.y,2.5)*smoothstep(0.,.08,vUv.y);gl_FragColor=vec4(.88,.96,1.,edge*fade*strength);}',
  });
  const glow = new T.Mesh(new T.PlaneGeometry(6.5, 3.2), glowMat); glow.position.set(0, 3.03, -.12); glow.rotation.y = .4; caseGroup.add(glow);

  // The boards and hardware do not move relative to their body/lid. Batch each
  // material once so every shadow update does not redraw hundreds of parts.
  const originalGeometries = new Set();
  for (const group of [caseGroup, lid]) {
    const batches = new Map();
    for (const mesh of [...group.children]) {
      if (!mesh.isMesh || !mesh.visible || !mesh.material.isMeshStandardMaterial || mesh.material.transparent) continue;
      const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(mesh);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => {
        mesh.updateMatrix();
        const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return part.applyMatrix4(mesh.matrix);
      });
      const geometry = T.mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!geometry) continue;
      const merged = new T.Mesh(geometry, meshes[0].material);
      merged.castShadow = meshes[0].castShadow; merged.receiveShadow = meshes[0].receiveShadow;
      for (const mesh of meshes) { originalGeometries.add(mesh.geometry); group.remove(mesh); }
      group.add(merged);
    }
  }
  for (const geometry of originalGeometries) geometry.dispose();

  // A softly lit floor gives the contact and directional shadows a visible
  // surface. It shares the prop's perspective and fades to transparent at its edge.
  const floorCanvas = document.createElement('canvas'); floorCanvas.width = floorCanvas.height = 256;
  const floorCtx = floorCanvas.getContext('2d');
  const floorBase = floorCtx.createRadialGradient(128, 128, 10, 128, 128, 126);
  floorBase.addColorStop(0, 'rgba(23,33,49,.94)'); floorBase.addColorStop(.55, 'rgba(17,25,39,.7)'); floorBase.addColorStop(1, 'rgba(12,17,30,0)');
  floorCtx.fillStyle = floorBase; floorCtx.fillRect(0, 0, 256, 256);
  for (const [x, color] of [[80, 'rgba(61,170,194,.24)'], [172, 'rgba(123,82,188,.22)']]) {
    const pool = floorCtx.createRadialGradient(x, 126, 0, x, 126, 86);
    pool.addColorStop(0, color); pool.addColorStop(1, 'rgba(0,0,0,0)');
    floorCtx.fillStyle = pool; floorCtx.fillRect(0, 0, 256, 256);
  }
  const floorTexture = new T.CanvasTexture(floorCanvas); floorTexture.colorSpace = T.SRGBColorSpace;
  const floor = new T.Mesh(new T.PlaneGeometry(15, 10), new T.MeshBasicMaterial({ map: floorTexture, transparent: true, depthWrite: false, toneMapped: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.025; floor.renderOrder = -2; scene.add(floor);
  const ground = new T.Mesh(new T.PlaneGeometry(25, 25), new T.ShadowMaterial({ opacity: .3 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.01; ground.renderOrder = -1; ground.receiveShadow = true; scene.add(ground);
  // The floor receives the original directional shadow only. ShadowMaterial's
  // combined mask otherwise applies the lid spotlight even when its light is off.
  ground.material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      `float floorShadow = 1.;
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        floorShadow = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize,
          directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias,
          directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
      #endif
      gl_FragColor = vec4(color, opacity * (1. - floorShadow));`);
  };
  ground.material.customProgramCacheKey = () => 'box-floor-directional-shadow-only';
  const contactCanvas = document.createElement('canvas'); contactCanvas.width = contactCanvas.height = 128;
  const contactCtx = contactCanvas.getContext('2d');
  const contactGradient = contactCtx.createRadialGradient(64,64,4,64,64,64);
  contactGradient.addColorStop(0, 'rgba(0,0,0,.88)'); contactGradient.addColorStop(.55, 'rgba(0,0,0,.48)'); contactGradient.addColorStop(1, 'rgba(0,0,0,0)');
  contactCtx.fillStyle = contactGradient; contactCtx.fillRect(0,0,128,128);
  const contactTexture = new T.CanvasTexture(contactCanvas);
  const contact = new T.Mesh(new T.PlaneGeometry(8.3,4.4), new T.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI/2; contact.position.y = .003; scene.add(contact);
  // Invisible, alpha-masked copies restore the original lid-light shadows.
  // The real lid receives them only where the light ray hits it.
  // There is no permanent rendering loop.
  const iconShadows = new Map();
  let latestIconShadow = null;
  let lastShadowPose = null;
  // Moving icons must invalidate both of the original casting lights.
  function invalidateIconShadow() {
    key.shadow.needsUpdate = true; lidLight.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true;
  }
  let disposed = false;
  async function prepareIconShadows(icons) {
    await Promise.all(icons.map(async ({ type, source }) => {
      if (iconShadows.has(type)) return;
      const texture = await loader.loadAsync(source);
      if (disposed) { texture.dispose(); return; }
      // Upload while preparing the box, rather than on an icon's first spin frame.
      renderer.initTexture(texture);
      const material = new T.MeshBasicMaterial({ map: texture, alphaTest: .18,
        side: T.DoubleSide, colorWrite: false, depthWrite: false });
      const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), material);
      mesh.castShadow = true; mesh.visible = false; scene.add(mesh);
      iconShadows.set(type, { mesh, texture });
      if (latestIconShadow?.type === type) { positionIconShadow(latestIconShadow); draw(); }
    }));
  }
  function clearIconShadow() {
    latestIconShadow = null;
    lastShadowPose = null;
    for (const { mesh } of iconShadows.values()) mesh.visible = false;
    invalidateIconShadow();
  }
  function positionIconShadow(shadow) {
    latestIconShadow = shadow;
    const { type, pose, target, stage: rect, roll, elapsed } = shadow;
    const proxy = iconShadows.get(type);
    if (!proxy || disposed) return false;
    const nextShadowPose = { type, left: pose.left, top: pose.top, scale: pose.scale, width: target.width,
      depth: pose.depth, roll, elapsed };
    if (!iconShadowNeedsUpdate(lastShadowPose, nextShadowPose)) return false;
    lastShadowPose = nextShadowPose;
    for (const { mesh } of iconShadows.values()) mesh.visible = false;
    invalidateIconShadow();
    if (pose.depth <= .03 || !rect.width || !rect.height) return true;
    // Register the CSS icon's centre with the orthographic scene, on a plane
    // inside the aperture behind its light. The full SVG retains its alpha mask.
    const pixels = target.width * pose.scale;
    const center = new T.Vector3(
      ((pose.left + pixels / 2 - rect.left) / rect.width) * 2 - 1,
      1 - ((pose.top + pixels / 2 - rect.top) / rect.height) * 2, 0).unproject(camera);
    const direction = camera.getWorldDirection(new T.Vector3());
    center.addScaledVector(direction, (-.25 - center.z) / direction.z);
    // A small art-direction lift affects only the shadow, fading out on landing.
    center.y += .08 * pose.depth;
    const units = pixels * (camera.right - camera.left) / rect.width;
    proxy.mesh.position.copy(center);
    proxy.mesh.scale.set(units, units, 1);
    proxy.mesh.rotation.x = -roll * Math.PI / 180;
    proxy.mesh.visible = true;
    return true;
  }
  let lastProgress = 0;
  let lastShadowProgress;
  let mostOpen = 0;
  let contextLost = false;
  function setLidPose(t) {
    lid.rotation.x = -1.83 * t;
    mostOpen = t === 0 ? 0 : Math.max(mostOpen, t);
    lid.scale.z = lidDepthScale(mostOpen);
  }
  function draw(progress = lastProgress) {
    lastProgress = progress;
    if (contextLost) return;
    const t = Math.max(0, Math.min(1, progress));
    // Openness is already eased by the shared sequence, including the partial closing.
    const ease = t;
    setLidPose(ease);
    // Only the lid changes the original scene's real directional shadows.
    if (t !== lastShadowProgress) {
      key.shadow.needsUpdate = true; invalidateIconShadow(); lastShadowProgress = t;
    }
    innerLight.intensity = 17 * Math.pow(ease, .75);
    lidLight.intensity = 4.5 * Math.pow(ease, .75);
    inner.material.opacity = .65 + ease * .35;
    glowMat.uniforms.strength.value = ease * .95;
    renderer.render(scene, camera);
    if (capture) {
      const shadow = [...iconShadows].find(([, value]) => value.mesh.visible);
      host.dataset.shadowIcon = shadow?.[0] ?? '';
      host.dataset.shadowRoll = shadow ? (-shadow[1].mesh.rotation.x * 180 / Math.PI).toFixed(4) : '';
      const bounds = propBounds();
      host.dataset.propTop = bounds.top.toFixed(3);
      host.dataset.propBottom = bounds.bottom.toFixed(3);
      host.dataset.propLeft = bounds.left.toFixed(3);
      host.dataset.propRight = bounds.right.toFixed(3);
      const lidBounds = meshBounds(lid);
      host.dataset.lidHeight = (lidBounds.bottom - lidBounds.top).toFixed(3);
      host.dataset.lidScale = lid.scale.z.toFixed(6);
      host.dataset.lidOpenness = t.toFixed(6);
    }
  }
  let previousWidth = 0;
  let previousHeight = 0;
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    // Moving the stage into the puzzle can notify ResizeObserver without changing its size.
    // Resetting an unchanged WebGL backing buffer can expose a blank frame on that handover.
    if (width === previousWidth && height === previousHeight) return;
    previousWidth = width; previousHeight = height;
    const { halfWidth, halfHeight } = fitBoxCamera(width, height, window.matchMedia('(max-width: 600px)').matches);
    camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); draw();
  }
  host.dataset.renderer = 'drawing';
  host.append(canvas); resize();
  host.dataset.renderer = 'ready';
  const observer = new ResizeObserver(resize); observer.observe(host);
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); contextLost = true; host.classList.remove('is-rendered'); host.dataset.renderer = 'unavailable'; host.dispatchEvent(new Event('mystery-box-unavailable')); });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; previousWidth = previousHeight = 0; host.classList.add('is-rendered'); resize(); host.dataset.renderer = 'ready'; });
  function project(x, y, z) {
    const rect = host.getBoundingClientRect();
    const point = new T.Vector3(x, y, z).project(camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2,
      y: rect.top + (1 - point.y) * rect.height / 2 };
  }
  // Local QA measures the real geometry, excluding the intentionally fading light beam.
  function propBounds() { return meshBounds(caseGroup); }
  function meshBounds(group) {
    const { width, height } = host.getBoundingClientRect();
    const bounds = { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity };
    const point = new T.Vector3();
    group.traverse((mesh) => {
      if (!mesh.isMesh || mesh === glow) return;
      const positions = mesh.geometry.attributes.position;
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).project(camera);
        const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
        bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
      }
    });
    return bounds;
  }
  function poster() {
    const savedProgress = lastProgress, savedRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(BOX_FRAME.posterWidth, BOX_FRAME.posterHeight, false);
    camera.left = -BOX_FRAME.desktopHalfWidth; camera.right = BOX_FRAME.desktopHalfWidth;
    camera.top = BOX_FRAME.halfHeight; camera.bottom = -BOX_FRAME.halfHeight; camera.updateProjectionMatrix();
    draw(0);
    const result = canvas.toDataURL('image/webp', .96);
    renderer.setPixelRatio(savedRatio); previousWidth = previousHeight = 0; resize(); draw(savedProgress);
    return result;
  }
  function closedBounds() {
    const points = [];
    for (const x of [-3.38, 3.38]) for (const y of [0, 1.96]) for (const z of [-1.25, 1.25]) points.push(project(x, y, z));
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    return { left, top, width: Math.max(...points.map((point) => point.x)) - left,
      height: Math.max(...points.map((point) => point.y)) - top };
  }
  function aperture() {
    return { left: project(-2.89, 1.65, 1.08), right: project(2.89, 1.65, 1.08),
      center: project(0, 1.65, 0) };
  }
  function viewDirection() {
    const direction = camera.getWorldDirection(new T.Vector3());
    return { x: direction.x, y: direction.y, z: direction.z };
  }
  return { draw, resize, aperture, closedBounds, viewDirection, poster,
    prepareIconShadows, positionIconShadow, clearIconShadow, dispose() {
    disposed = true;
    observer.disconnect();
    key.shadow.dispose(); lidLight.shadow.dispose();
    scene.traverse((node) => { if (node.isMesh) { node.geometry.dispose(); for (const material of [].concat(node.material)) material.dispose(); } });
    for (const { texture } of iconShadows.values()) texture.dispose();
    woodMap.dispose(); paintMap.dispose(); floorTexture.dispose(); contactTexture.dispose(); env.dispose(); renderer.dispose(); canvas.remove();
  } };
}
