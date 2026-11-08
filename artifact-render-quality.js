// Spend extra pixels on the one enlarged artifact, not on every classroom card.
// The pixel budget also bounds memory on high-DPI phones and Chromebooks.
export function resizeArtifactRenderer(renderer, width, height, {expanded = false} = {}) {
  width = Math.max(1, width);
  height = Math.max(1, height);
  const preferred = Math.min(Math.max(globalThis.devicePixelRatio || 1, 1.5), expanded ? 2 : 1.75);
  const pixelBudget = expanded ? 3_000_000 : 1_000_000;
  const ratio = Math.min(preferred, Math.sqrt(pixelBudget / (width * height)));
  // Change CSS size and density together: setPixelRatio() first would briefly
  // allocate the old (possibly much larger) viewport at the new density.
  renderer.setDrawingBufferSize(width, height, ratio);
  return ratio;
}

export function applyArtifactTextureQuality(object, renderer) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures = new Set();
  object.traverse(node => {
    for (const material of [].concat(node.material || [])) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) {
    // Do not resample normal/roughness maps, recolor photographs, or invent detail.
    // These Three.js filter constants keep this helper independent of the lazy 3D bundle.
    texture.anisotropy = anisotropy;
    if (!texture.isCompressedTexture && !texture.isDataTexture) {
      texture.generateMipmaps = true;
      texture.magFilter = 1006; // LinearFilter
      texture.minFilter = 1008; // LinearMipmapLinearFilter
    }
    texture.needsUpdate = true;
  }
}

export function createArtifactShadow(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(46, 65, 59, .26)');
  gradient.addColorStop(.4, 'rgba(46, 65, 59, .14)');
  gradient.addColorStop(1, 'rgba(46, 65, 59, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -.015;
  return shadow;
}
