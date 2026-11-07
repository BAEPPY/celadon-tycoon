import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {getModelArtifact} from './models-manifest.js';

const viewers = new WeakMap();
const create = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
};

function releaseModel(object) {
  if (!object) return;
  const textures = new Set(), materials = new Set(), geometries = new Set(), images = new Set();
  object.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [].concat(node.material || [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) {
    const image = texture.source?.data;
    if (image && typeof image.close === 'function') images.add(image);
    texture.dispose();
  }
  for (const image of images) image.close();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

/** Call before hiding a dialog. An in-flight model fetch is also canceled. */
export function disposeArtifact(container) {
  viewers.get(container)?.dispose();
}

/**
 * Render one real GLB from the museum collection. This never changes a student's
 * crafted work; it is a reference viewer. A second call on the same container
 * disposes the previous view, including requests still loading.
 *
 * const viewer = await openArtifact(container, 'pitcher');
 * viewer.dispose(); // on dialog close
 */
export async function openArtifact(container, shape) {
  if (!(container instanceof HTMLElement)) throw new TypeError('A viewer container is required.');
  disposeArtifact(container);
  const artifact = getModelArtifact(shape);
  if (!artifact) throw new Error('관찰할 청자를 찾지 못했어요.');

  let disposed = false, renderer, controls, object, scene, camera, observer, environment;
  let frame = 0, modelRoot, floor, homePosition, homeTarget, initialRadius = 4;
  const abort = new AbortController();
  const controller = {
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls?.dispose();
      releaseModel(object);
      releaseModel(floor);
      environment?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      if (viewers.get(container) === controller) {
        viewers.delete(container);
        container.replaceChildren();
        container.dataset.status = 'disposed';
      }
    },
    reset() {
      if (disposed || !controls || !homePosition) return;
      camera.position.copy(homePosition);
      controls.target.copy(homeTarget);
      controls.update();
    },
    rotate(delta = Math.PI / 6) {
      if (disposed || !camera || !controls) return;
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), delta);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    zoom(factor = 0.85) {
      if (disposed || !camera || !controls) return;
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
    },
  };
  viewers.set(container, controller);
  container.replaceChildren();
  container.dataset.status = 'loading';
  container.dataset.shape = shape;
  container.style.position = 'relative';

  const viewport = create('div', 'artifact-viewport');
  Object.assign(viewport.style, {
    position: 'relative', width: '100%', height: 'min(48vh, 430px)', minHeight: '260px',
    borderRadius: '15px', overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 35%, #fffbe9, #dce9ca)',
    border: '2px solid #668967',
  });
  const status = create('p', 'artifact-loading', '박물관의 3D 청자를 가져오고 있어요…');
  status.setAttribute('role', 'status');
  Object.assign(status.style, {position:'absolute', inset:'40% 18px auto', textAlign:'center', color:'#31593f', zIndex:'1'});
  viewport.append(status);
  container.append(viewport);

  const toolbar = create('div', 'artifact-controls');
  Object.assign(toolbar.style, {display:'flex', gap:'7px', justifyContent:'center', flexWrap:'wrap', padding:'12px 0'});
  const buttons = [
    ['↶ 왼쪽', () => controller.rotate(-Math.PI / 6)],
    ['오른쪽 ↷', () => controller.rotate(Math.PI / 6)],
    ['확대 +', () => controller.zoom(0.83)],
    ['축소 −', () => controller.zoom(1.2)],
    ['처음 시점', () => controller.reset()],
  ];
  for (const [label, fn] of buttons) {
    const button = create('button', 'artifact-control', label);
    button.type = 'button';
    button.disabled = true;
    Object.assign(button.style, {font:'inherit', fontSize:'12px', padding:'9px 12px', border:'2px solid #5c784f', borderRadius:'9px', background:'#fff5cc', color:'#2e4d32', cursor:'pointer'});
    button.addEventListener('click', fn);
    toolbar.append(button);
  }
  container.append(toolbar);
  const hint = create('p', 'artifact-hint', '손가락이나 마우스로 돌리고, 두 손가락이나 휠로 확대해 보세요.');
  Object.assign(hint.style, {margin:'0 0 9px', fontSize:'12px', textAlign:'center', color:'#53644b'});
  container.append(hint);
  const clue = create('p', 'artifact-clue', artifact.clue);
  Object.assign(clue.style, {margin:'6px 0', fontSize:'14px', fontWeight:'700', color:'#284b33'});
  container.append(clue);
  const note = create('p', 'artifact-source-note', artifact.note + ' 형태 관찰용 경량 자료이며 세부 측정에는 사용하지 않습니다.');
  Object.assign(note.style, {margin:'7px 0', fontSize:'11px', lineHeight:'1.65', color:'#66715f'});
  container.append(note);
  const credit = create('p', 'artifact-credit', artifact.source + ' · ');
  Object.assign(credit.style, {margin:'6px 0', fontSize:'11px', lineHeight:'1.65', color:'#66715f'});
  const link = create('a', '', '자료 출처');
  link.href = artifact.sourceUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  credit.append(link);
  container.append(credit);

  try {
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('aria-label', `${artifact.name} 3D 관찰 화면`);
    renderer.domElement.setAttribute('role', 'img');
    viewport.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.94;
    controls.minPolarAngle = Math.PI * 0.04;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.65;
    scene.add(new THREE.HemisphereLight(0xf1f4f5, 0x858979, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xd4e0db, 0.35);
    fill.position.set(-4, 2, 0); scene.add(fill);
    floor = new THREE.Mesh(new THREE.CircleGeometry(1.65, 64), new THREE.MeshBasicMaterial({color:0xb7c9a2, transparent:true, opacity:0.38, side:THREE.DoubleSide}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);

    observer = new ResizeObserver(() => {
      if (disposed) return;
      const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    observer.observe(viewport);

    const response = await fetch(artifact.src, {signal:abort.signal});
    if (!response.ok) throw new Error('3D 자료를 가져오지 못했어요.');
    const data = await response.arrayBuffer();
    if (disposed) return controller;
    const gltf = await new GLTFLoader().parseAsync(data, '');
    object = gltf.scene;
    if (disposed) {releaseModel(object); object = null; return controller;}
    let meshCount = 0;
    object.traverse(node => {
      if (!node.isMesh) return;
      meshCount++;
      for (const material of [].concat(node.material || [])) {
        if (artifact.referenceTint && material.color) material.color.set(0x79a78e);
        if (material.isMeshBasicMaterial && material.map) material.toneMapped = false;
      }
    });
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    if (!meshCount || !size.toArray().every(Number.isFinite) || Math.max(size.x,size.y,size.z) <= 0) throw new Error('유물의 형상을 확인하지 못했어요.');
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    modelRoot = new THREE.Group();
    modelRoot.add(object);
    const scale = 2.55 / Math.max(size.x,size.y,size.z);
    modelRoot.scale.setScalar(scale);
    const height = size.y * scale;
    modelRoot.position.y = height / 2;
    scene.add(modelRoot);
    const target = new THREE.Vector3(0,height/2,0);
    const viewportWidth = Math.max(1, viewport.clientWidth);
    const viewportHeight = Math.max(1, viewport.clientHeight);
    const aspect = viewportWidth / viewportHeight;
    initialRadius = Math.max(4.9, 1.6 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect));
    const angle = shape === 'pillow' ? 0.28 : 0.45;
    camera.position.set(initialRadius * Math.sin(angle), target.y + 1.1, initialRadius * Math.cos(angle));
    controls.target.copy(target);
    controls.minDistance = 1.5;
    controls.maxDistance = 9;
    controls.update();
    homePosition = camera.position.clone(); homeTarget = controls.target.clone();
    renderer.setSize(viewportWidth, viewportHeight, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    status.remove();
    toolbar.querySelectorAll('button').forEach(b => {b.disabled = false;});
    container.dataset.status = 'ready';
    container.dataset.meshes = String(meshCount);
    const render = () => {
      if (disposed) return;
      if (!container.isConnected) {controller.dispose(); return;}
      if (!document.hidden) {controls.update(); renderer.render(scene,camera);}
      frame = requestAnimationFrame(render);
    };
    render();
    return controller;
  } catch (error) {
    if (disposed || error.name === 'AbortError') return controller;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    controls?.dispose();
    releaseModel(object); object = null;
    releaseModel(floor); floor = null;
    environment?.dispose(); environment = null;
    renderer?.dispose(); renderer?.forceContextLoss(); renderer = null;
    viewport.querySelector('canvas')?.remove();
    container.dataset.status = 'error';
    status.textContent = '3D 화면을 열지 못했어요. 잠시 후 다시 열거나 자료 출처에서 유물을 확인해 주세요.';
    return controller;
  }
}
