/** Animate only a GLTF mesh explicitly identified by its source mesh index. */
export function createArtifactOpening(gltf, config, {
  THREE, onChange = () => {}, initialOpen = false,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
  now = () => performance.now(),
  reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
} = {}) {
  if (!Number.isInteger(config?.lidMesh) || !gltf?.parser?.associations || !THREE) return null;
  const selected = new Set();
  gltf.scene.traverse(node => {
    if (gltf.parser.associations.get(node)?.meshes === config.lidMesh) selected.add(node);
  });
  // Multi-primitive meshes may have an associated group and associated children.
  const lids = [...selected].filter(node => {
    for (let parent = node.parent; parent; parent = parent.parent) if (selected.has(parent)) return false;
    return true;
  });
  if (!lids.length) return null;
  gltf.scene.updateWorldMatrix(true, true);
  const closedBounds = new THREE.Box3().setFromObject(gltf.scene);
  const height = closedBounds.getSize(new THREE.Vector3()).y;
  if (!Number.isFinite(height) || height <= 0) return null;
  const lift = new THREE.Vector3(height * 0.25, height * 0.55, 0);
  const poses = lids.map(node => {
    const position = node.position.clone(), world = node.getWorldPosition(new THREE.Vector3());
    const raised = world.add(lift);
    if (node.parent) node.parent.worldToLocal(raised);
    return {node, position, offset: raised.sub(position)};
  });
  let progress = initialOpen ? 1 : 0, target = progress, frame = 0, disposed = false;
  const apply = () => {
    for (const {node, position, offset} of poses) node.position.copy(position).addScaledVector(offset, progress);
    gltf.scene.updateWorldMatrix(true, true);
  };
  const notify = () => onChange({open: target === 1, progress,
    state: progress === target ? (target ? 'open' : 'closed') : (target ? 'opening' : 'closing')});
  const controller = {
    get open() {return target === 1;},
    get progress() {return progress;},
    getBounds() {
      // Reserve the complete swept height while keeping the body fixed.
      const bounds = closedBounds.clone();
      bounds.max.addScaledVector(lift, progress);
      return bounds;
    },
    setOpen(open, {animate = true} = {}) {
      if (disposed) return;
      target = open ? 1 : 0;
      cancelFrame(frame); frame = 0;
      if (!animate || reducedMotion() || progress === target) {
        progress = target; apply(); notify(); return;
      }
      const from = progress, started = now(), duration = 450 * Math.abs(target - from);
      notify();
      const tick = timestamp => {
        if (disposed) return;
        frame = 0;
        const time = Math.min(1, Math.max(0, (timestamp - started) / duration));
        const eased = time * time * (3 - 2 * time);
        progress = time === 1 ? target : from + (target - from) * eased;
        apply(); notify();
        if (time < 1) frame = requestFrame(tick);
      };
      frame = requestFrame(tick);
    },
    dispose() {disposed = true; cancelFrame(frame); frame = 0;},
  };
  apply();
  return controller;
}
