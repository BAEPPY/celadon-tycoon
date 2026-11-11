// Observation-only 3D viewer. The public artifact contains neutral labels,
// never the country, object name, date, use, or the teacher's answer key.
import {createArtifactOpening} from './artifact-opening.js';
import {applyArtifactTextureQuality, resizeArtifactRenderer, createArtifactShadow} from './artifact-render-quality.js';
import {applyCeladonFinish} from './celadon-finish.js';
const mounted = new WeakMap();
let libraries;
let viewerNumber = 0;
let closeExpandedViewer;

function installDialogStyles() {
  if (document.querySelector('style[data-lesson-viewer-dialog]')) return;
  const style = document.createElement('style');
  style.dataset.lessonViewerDialog = '';
  style.textContent = `
    .lesson-viewer__dialog::backdrop { background: rgb(25 44 49 / 65%); }
    .lesson-viewer__expand:focus-visible, .lesson-viewer__dialog-close:focus-visible {
      outline: 3px solid #269d97; outline-offset: 3px;
    }
    .lesson-viewer__dialog:not([open]) { display: none !important; }
  `;
  document.head.append(style);
}

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

function loadLibraries() {
  return libraries ||= Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/environments/RoomEnvironment.js'),
  ]).catch(error => { libraries = null; throw error; });
}

function releaseObject(object) {
  if (!object) return;
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
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

/**
 * Returns immediately, so a phase change can cancel even an unfinished load.
 * `ready` resolves after loading or a handled error. dispose() is idempotent.
 * getExpandedInfo may return information already revealed by the server. Without
 * it the enlarged view only offers neutral observation prompts.
 */
export function mountLessonViewer(container, artifact, {expand = true, getExpandedInfo, openingState = {open: false}, detail = false} = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('A viewer container is required.');
  if (!artifact || typeof artifact.src !== 'string') throw new TypeError('An artifact source is required.');
  mounted.get(container)?.dispose();

  const label = (artifact.namedObservation === true || /^청자\s*\d+$/.test(artifact.label || '')) ? artifact.label : `청자 ${String(artifact.id || '').replace(/[^0-9]/g, '') || ''}`.trim();
  const id = `lesson-viewer-${++viewerNumber}`;
  let disposed = false, attempt = 0, frame = 0, abort;
  let THREE, renderer, scene, camera, controls, object, floor, environment;
  let radius = 1.5, modelHeight = 2.6, homePosition, homeTarget, fitDistance = 0;
  let lastWidth = 0, lastHeight = 0;
  let expanded, opening, openingButton;
  container.replaceChildren();
  container.classList.add('lesson-viewer');
  container.dataset.viewerStatus = 'loading';

  const viewport = element('div', 'lesson-viewer__viewport');
  Object.assign(viewport.style, {
    position: 'relative', width: '100%', height: 'var(--lesson-viewer-height, clamp(220px, 32vh, 360px))',
    minHeight: '180px', overflow: 'hidden', borderRadius: '18px',
    background: 'radial-gradient(ellipse at 50% 30%, #ffffff 0%, #f5f8f8 62%, #eef4f3 100%)',
    border: '1px solid #d8e2e1',
  });
  const status = element('div', 'lesson-viewer__status');
  Object.assign(status.style, {position: 'absolute', inset: '0', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: '12px', padding: '22px', textAlign: 'center', color: '#426756', zIndex: '1'});
  const statusText = element('p', 'lesson-viewer__status-text', '3D 도자기를 가져오고 있어요…');
  statusText.setAttribute('role', 'status');
  Object.assign(statusText.style, {margin: '0', fontSize: '15px', lineHeight: '1.6'});
  status.append(statusText);
  viewport.append(status);
  container.append(viewport);

  const expandButton = expand ? element('button', 'lesson-viewer__expand', '⛶ 크게 보기') : null;
  if (expandButton) {
    expandButton.type = 'button';
    expandButton.setAttribute('aria-label', `${label} 크게 보기`);
    expandButton.setAttribute('aria-haspopup', 'dialog');
    expandButton.setAttribute('aria-expanded', 'false');
    Object.assign(expandButton.style, {
      position: 'absolute', top: '10px', right: '10px', zIndex: '2',
      font: 'inherit', fontSize: '14px', fontWeight: '700', lineHeight: '1.3',
      minHeight: '38px', padding: '8px 11px', border: '1px solid #b9d6d3',
      borderRadius: '8px', background: '#ffffff', color: '#176e6b',
      boxShadow: '0 2px 8px rgb(24 67 65 / 9%)', cursor: 'pointer',
    });
    expandButton.addEventListener('click', openExpanded);
    viewport.append(expandButton);
  }

  function closeExpanded(restoreFocus = true) {
    if (!expanded) return;
    const current = expanded;
    expanded = null;
    if (closeExpandedViewer === closeExpanded) closeExpandedViewer = null;
    current.viewer?.dispose();
    if (!disposed) controller.setLidOpen(openingState.open, {animate: false});
    if (current.dialog.open) current.dialog.close();
    current.dialog.remove();
    expandButton?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !disposed && expandButton?.isConnected) expandButton.focus({preventScroll: true});
  }

  function refreshExpandedInfo() {
    if (!expanded || disposed) return;
    const supplied = typeof getExpandedInfo === 'function' ? getExpandedInfo() : null;
    const info = Object.fromEntries(['name', 'countryLabel', 'date', 'use', 'note', 'source', 'sourceUrl', 'license', 'licenseUrl']
      .map(key => [key, typeof supplied?.[key] === 'string' ? supplied[key].trim() : '']));
    const signature = JSON.stringify(info);
    if (expanded.infoSignature === signature) return;
    expanded.infoSignature = signature;
    const content = document.createDocumentFragment();
    const heading = element('h3', 'lesson-viewer__info-title', info.name || '관찰해 보세요');
    heading.id = `${id}-expanded-info-title`;
    expanded.info.dataset.infoState = info.name ? 'revealed' : 'observation';
    if (info.name) {
      const metadata = [...new Set([info.countryLabel, info.date].filter(Boolean))];
      if (metadata.length) content.append(element('p', 'lesson-viewer__info-meta', metadata.join(' · ')));
      content.append(heading);
      if (info.use) {
        const use = element('p', 'lesson-viewer__info-use');
        use.append(element('strong', '', '쓰임'), document.createTextNode(info.use));
        content.append(use);
      }
      if (info.note) content.append(element('p', 'lesson-viewer__info-note', info.note));
      const source = element('div', 'lesson-viewer__info-source');
      if (info.source) source.append(element('p', '', info.source));
      const addLink = (value, text) => {
        if (!value) return;
        let url;
        try {url = new URL(value);} catch {return;}
        if (!['https:', 'http:'].includes(url.protocol)) return;
        const link = element('a', '', text);
        link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        source.append(link);
      };
      addLink(info.sourceUrl, '자료 출처 보기 ↗');
      addLink(info.licenseUrl, info.license || '자료 이용 조건 보기 ↗');
      if (source.childNodes.length) content.append(source);
    } else {
      content.append(heading, element('p', 'lesson-viewer__info-note', '도자기를 천천히 돌려 보며 눈에 보이는 특징을 찾아보세요.'));
      const prompts = element('ul', 'lesson-viewer__info-prompts');
      for (const prompt of ['어떤 색과 무늬가 보이나요?', '위·옆·아래에서 본 모양은 어떻게 다른가요?', '눈에 띄는 부분을 확대해서 살펴보세요.']) prompts.append(element('li', '', prompt));
      content.append(prompts);
    }
    expanded.info.replaceChildren(content);
  }

  function openExpanded() {
    if (disposed || expanded || !expandButton) return;
    controller.setLidOpen(openingState.open, {animate: false});
    closeExpandedViewer?.(false);
    installDialogStyles();
    const dialog = element('dialog', 'lesson-viewer__dialog');
    dialog.setAttribute('aria-labelledby', `${id}-expanded-title`);
    Object.assign(dialog.style, {
      width: '94vw', height: '92dvh', maxWidth: 'none', maxHeight: 'none',
      margin: 'auto', padding: '16px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden',
      border: '1px solid #d6e1e1', borderRadius: '18px', background: '#ffffff',
      color: '#294e51', boxShadow: '0 18px 70px rgb(18 43 48 / 25%)', fontFamily: 'inherit',
    });
    const header = element('div', 'lesson-viewer__dialog-header');
    Object.assign(header.style, {display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flex: '0 0 auto'});
    const title = element('h2', 'lesson-viewer__dialog-title', `${label} 크게 보기`);
    title.id = `${id}-expanded-title`;
    Object.assign(title.style, {margin: '0', fontSize: '20px', lineHeight: '1.4', fontWeight: '700'});
    const close = element('button', 'lesson-viewer__dialog-close', '닫기 ×');
    close.type = 'button'; close.autofocus = true;
    close.setAttribute('aria-label', '크게 보기 닫기');
    Object.assign(close.style, {font: 'inherit', fontSize: '16px', fontWeight: '700', minHeight: '42px', padding: '9px 16px', border: '1px solid #c9d9da', borderRadius: '8px', background: '#f5f9f9', color: '#285f61', cursor: 'pointer', flexShrink: '0'});
    close.addEventListener('click', () => closeExpanded());
    header.append(title, close);
    const body = element('div', 'lesson-viewer__dialog-body');
    const host = element('div', 'lesson-viewer__expanded-host');
    const info = element('aside', 'lesson-viewer__info');
    info.setAttribute('aria-labelledby', `${id}-expanded-info-title`);
    info.setAttribute('aria-live', 'polite');
    body.append(host, info);
    dialog.append(header, body);
    dialog.addEventListener('cancel', event => {event.preventDefault(); closeExpanded();});
    dialog.addEventListener('close', () => {if (expanded?.dialog === dialog) closeExpanded();});
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeExpanded();
    });
    (document.fullscreenElement || document.body).append(dialog);
    expanded = {dialog, viewer: null, info, infoSignature: null};
    refreshExpandedInfo();
    closeExpandedViewer = closeExpanded;
    expandButton.setAttribute('aria-expanded', 'true');
    dialog.showModal();
    expanded.viewer = mountLessonViewer(host, artifact, {expand: false, openingState, detail: true});
    Object.assign(host.querySelector('.lesson-viewer__viewport').style, {flex: '1 1 0', height: 'auto', minHeight: '120px'});
    expanded.viewer.resize();
  }

  const toolbar = element('div', 'lesson-viewer__controls');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', `${label} 관찰 도구`);
  Object.assign(toolbar.style, {display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '5px', padding: '9px 0 6px'});
  const hint = element('p', 'lesson-viewer__hint', matchMedia('(pointer: coarse)').matches ? '손가락으로 돌려 보기 · ＋·−로 확대' : '끌어서 돌려 보기 · 휠로 확대');
  hint.id = `${id}-hint`;
  Object.assign(hint.style, {margin: '0', color: '#617465', fontSize: '14px', lineHeight: '1.5', textAlign: 'center'});
  container.append(toolbar, hint);

  const invalidate = () => {
    if (disposed || frame || !renderer || !scene || !camera) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!disposed && renderer && container.isConnected && !document.hidden) {
        controls?.update();
        renderer.render(scene, camera);
      }
    });
  };
  const cleanResources = () => {
    abort?.abort();
    opening?.dispose(); opening = null;
    cancelAnimationFrame(frame); frame = 0;
    controls?.removeEventListener('change', invalidate);
    controls?.dispose(); controls = null;
    releaseObject(object); object = null;
    releaseObject(floor); floor = null;
    environment?.dispose(); environment = null;
    if (renderer) {
      renderer.domElement.removeEventListener('keydown', onKeydown);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove(); renderer = null;
    }
    scene = null; camera = null; homePosition = null; homeTarget = null;
    fitDistance = 0; lastWidth = 0; lastHeight = 0;
  };
  function setError(message = '3D 화면을 열지 못했어요. 다시 불러와 주세요.') {
    if (disposed) return;
    cleanResources();
    container.dataset.viewerStatus = 'error';
    toolbar.querySelectorAll('button').forEach(button => {button.disabled = true;});
    status.hidden = false; status.style.display = 'grid';
    statusText.textContent = message;
    if (!status.querySelector('button')) {
      const retry = element('button', 'lesson-viewer__retry', '다시 불러오기');
      retry.type = 'button';
      Object.assign(retry.style, {font: 'inherit', fontSize: '15px', padding: '10px 18px', border: '1px solid #547d68', borderRadius: '12px', background: '#e4eee0', color: '#315540', cursor: 'pointer'});
      retry.addEventListener('click', () => {controller.ready = start();});
      status.append(retry);
    }
  }
  function onContextLost(event) {
    event.preventDefault();
    setError('3D 화면이 잠시 멈췄어요. 다시 불러와 주세요.');
  }
  function onKeydown(event) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const keys = {
      ArrowLeft: () => controller.rotate(-Math.PI / 12), ArrowRight: () => controller.rotate(Math.PI / 12),
      ArrowUp: () => controller.zoom(0.9), ArrowDown: () => controller.zoom(1.1),
      '+': () => controller.zoom(0.85), '=': () => controller.zoom(0.85), '-': () => controller.zoom(1.15),
      Home: () => controller.reset(),
    };
    if (keys[event.key]) {event.preventDefault(); keys[event.key]();}
  }
  function updateHome(aspect) {
    if (!camera || !THREE || !controls || !object) return;
    const vertical = THREE.MathUtils.degToRad(camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const previousFit = fitDistance, previousTarget = homeTarget;
    const bounds = opening?.getBounds(), frameRadius = bounds ? bounds.getSize(new THREE.Vector3()).length() / 2 : radius;
    fitDistance = frameRadius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.12;
    const target = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, modelHeight / 2, 0);
    const homeOffset = new THREE.Vector3(Math.sin(0.43), 0.22, Math.cos(0.43)).normalize().multiplyScalar(fitDistance);
    homeTarget = target.clone(); homePosition = target.clone().add(homeOffset);
    controls.minDistance = radius * 0.85;
    controls.maxDistance = Math.max(fitDistance * 3, 12);
    if (!previousFit) {
      controls.target.copy(target); camera.position.copy(homePosition);
    } else {
      const offset = camera.position.clone().sub(controls.target);
      offset.multiplyScalar(fitDistance / previousFit);
      if (opening && previousTarget) controls.target.add(target.clone().sub(previousTarget));
      camera.position.copy(controls.target).add(offset);
    }
    controls.update();
  }
  const controller = {
    ready: null,
    refreshExpandedInfo,
    setLidOpen(open, options) {if (!disposed && opening) opening.setOpen(open, options);},
    dispose() {
      if (disposed) return;
      disposed = true; attempt++;
      closeExpanded(false);
      expandButton?.removeEventListener('click', openExpanded);
      observer.disconnect();
      document.removeEventListener('visibilitychange', invalidate);
      cleanResources();
      if (mounted.get(container) === controller) {
        mounted.delete(container);
        container.replaceChildren(); container.dataset.viewerStatus = 'disposed';
      }
    },
    resize() {
      if (disposed || !renderer || !camera) return;
      const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width; lastHeight = height;
      resizeArtifactRenderer(renderer, width, height, {expanded: detail});
      camera.aspect = width / height; camera.updateProjectionMatrix();
      updateHome(camera.aspect); invalidate();
    },
    reset() {
      if (disposed || !controls || !homePosition) return;
      camera.position.copy(homePosition); controls.target.copy(homeTarget); controls.update(); invalidate();
    },
    rotate(delta = Math.PI / 6) {
      if (disposed || !controls || !object) return;
      const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), delta);
      camera.position.copy(controls.target).add(offset); controls.update(); invalidate();
    },
    zoom(factor = 0.85) {
      if (disposed || !controls || !object) return;
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset); controls.update(); invalidate();
    },
  };
  const buttons = [
    ['↶', '왼쪽으로 돌리기', () => controller.rotate(-Math.PI / 6)],
    ['↷', '오른쪽으로 돌리기', () => controller.rotate(Math.PI / 6)],
    ['＋', '확대하기', () => controller.zoom(0.85)],
    ['−', '축소하기', () => controller.zoom(1.18)],
    ['처음 시점', '처음 시점으로 되돌리기', () => controller.reset()],
  ];
  if (artifact.opening) buttons.push(['뚜껑 열기', '뚜껑 열기', () => controller.setLidOpen(!opening?.open)]);
  for (const [text, description, action] of buttons) {
    const button = element('button', 'lesson-viewer__control', text);
    button.type = 'button'; button.disabled = true;
    button.setAttribute('aria-label', description); button.title = description;
    if (description === '뚜껑 열기') {openingButton = button; button.classList.add('lesson-viewer__opening'); button.setAttribute('aria-pressed', 'false');}
    Object.assign(button.style, {font: 'inherit', fontSize: '14px', lineHeight: '1.2', minHeight: '34px', minWidth: '36px', padding: '7px 10px', border: '1px solid #b4c8b7', borderRadius: '9px', background: '#fffdf5', color: '#315540', cursor: 'pointer'});
    button.addEventListener('click', action); toolbar.append(button);
  }
  const observer = new ResizeObserver(() => controller.resize());
  observer.observe(viewport);
  document.addEventListener('visibilitychange', invalidate);
  mounted.set(container, controller);

  async function start() {
    if (disposed) return controller;
    cleanResources();
    const thisAttempt = ++attempt;
    abort = new AbortController();
    const signal = abort.signal;
    container.dataset.viewerStatus = 'loading';
    status.hidden = false; status.style.display = 'grid';
    statusText.textContent = '3D 도자기를 가져오고 있어요…';
    status.querySelector('button')?.remove();
    toolbar.querySelectorAll('button').forEach(button => {button.disabled = true;});
    try {
      const [three, {GLTFLoader}, {OrbitControls}, {RoomEnvironment}] = await loadLibraries();
      if (disposed || thisAttempt !== attempt) return controller;
      THREE = three;
      renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = artifact.ceramicFinish ? THREE.ACESFilmicToneMapping : artifact.preservePhotoColors ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = artifact.ceramicFinish ? .88 : 1;
      renderer.setClearColor(0xffffff, 0);
      const canvas = renderer.domElement;
      canvas.className = 'lesson-viewer__canvas'; canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${label} 3D 관찰 화면`);
      canvas.setAttribute('aria-describedby', hint.id);
      Object.assign(canvas.style, {display: 'block', width: '100%', height: '100%', touchAction: 'none'});
      canvas.addEventListener('keydown', onKeydown); canvas.addEventListener('webglcontextlost', onContextLost);
      viewport.prepend(canvas);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(36, 1, 0.01, 150);
      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      controls.dampingFactor = .12; controls.enablePan = true;
      controls.screenSpacePanning = true; controls.panSpeed = 0.55; controls.rotateSpeed = 0.7;
      controls.minPolarAngle = 0.04; controls.maxPolarAngle = Math.PI * 0.94;
      controls.addEventListener('change', invalidate);
      const generator = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
      try {environment = generator.fromScene(room, 0.04);} finally {room.dispose(); generator.dispose();}
      scene.environment = environment.texture; scene.environmentIntensity = artifact.ceramicFinish ? .55 : .65;
      scene.add(new THREE.HemisphereLight(0xf8fff6, 0xa49b88, artifact.ceramicFinish ? .55 : 1));
      const key = new THREE.DirectionalLight(0xfffbef, artifact.ceramicFinish ? 1.8 : 2.1); key.position.set(4, 6, 5); scene.add(key);
      const fill = new THREE.DirectionalLight(0xdceee8, artifact.ceramicFinish ? .4 : .6); fill.position.set(-4, 2, -1); scene.add(fill);
      floor = createArtifactShadow(THREE); scene.add(floor);
      controller.resize();

      // Fetch the detailed mesh only when one artifact is enlarged. If the larger
      // resource fails, retain a usable observation with the ordinary model.
      const sources = [...new Set([detail && artifact.detailedSrc, artifact.src].filter(Boolean))];
      let gltf, loadedSource;
      for (const source of sources) {
        try {
          const response = await fetch(source, {signal});
          if (!response.ok) throw new Error('model-load-failed');
          const data = await response.arrayBuffer();
          if (disposed || thisAttempt !== attempt) return controller;
          gltf = await new GLTFLoader().parseAsync(data, new URL('.', new URL(source, location.href)).href);
          loadedSource = source;
          break;
        } catch (error) {
          if (signal.aborted || source === sources.at(-1)) throw error;
        }
      }
      if (disposed || thisAttempt !== attempt) {releaseObject(gltf.scene); return controller;}
      object = gltf.scene;
      applyCeladonFinish(object, THREE, artifact.ceramicFinish);
      applyArtifactTextureQuality(object, renderer);
      container.dataset.modelQuality = loadedSource === artifact.detailedSrc ? 'detail' : 'standard';
      let count = 0;
      object.traverse(node => {
        if (!node.isMesh) return;
        count++;
        for (const material of [].concat(node.material || [])) {
          if (artifact.referenceTint && material.color) material.color.set(0x79a78e);
          if (!artifact.ceramicFinish && (artifact.preservePhotoColors || (material.isMeshBasicMaterial && material.map))) material.toneMapped = false;
        }
      });
      const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3());
      if (!count || !size.toArray().every(Number.isFinite) || Math.max(size.x, size.y, size.z) <= 0) throw new Error('model-shape-invalid');
      const center = box.getCenter(new THREE.Vector3()), scale = 2.65 / Math.max(size.x, size.y, size.z);
      object.position.sub(center);
      const group = new THREE.Group(); group.add(object); group.scale.setScalar(scale);
      modelHeight = size.y * scale; group.position.y = modelHeight / 2;
      radius = size.length() * scale / 2;
      scene.add(group);
      opening = createArtifactOpening(gltf, artifact.opening, {THREE, initialOpen: openingState.open, onChange: state => {
        openingState.open = state.open;
        container.dataset.opening = state.state;
        if (openingButton) {
          const label = state.open ? '뚜껑 닫기' : '뚜껑 열기';
          openingButton.textContent = label; openingButton.setAttribute('aria-label', label); openingButton.title = label;
          openingButton.setAttribute('aria-pressed', String(state.open));
        }
        updateHome(camera.aspect); invalidate();
      }});
      if (opening) opening.setOpen(openingState.open, {animate: false});
      else {openingButton?.remove(); openingButton = null; delete container.dataset.opening;}
      updateHome(camera.aspect);
      status.hidden = true; status.style.display = 'none';
      toolbar.querySelectorAll('button').forEach(button => {button.disabled = false;});
      container.dataset.viewerStatus = 'ready';
      invalidate();
      return controller;
    } catch (error) {
      if (!disposed && thisAttempt === attempt && error.name !== 'AbortError') setError();
      return controller;
    }
  }
  controller.ready = start();
  return controller;
}
