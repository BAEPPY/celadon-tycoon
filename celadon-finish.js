// Display-only glaze response for the five observation objects. Source scans,
// photographs, vertex colours, UVs and normal maps remain the museum data.
export function applyCeladonFinish(object, THREE, finish) {
  if (!finish) return;
  const replacements = new Map();
  const convert = source => {
    if (replacements.has(source)) return replacements.get(source);
    const material = new THREE.MeshPhysicalMaterial();
    if (source.isMeshStandardMaterial) {
      // Copy all PBR bindings, including non-default photographic UV channels.
      THREE.MeshStandardMaterial.prototype.copy.call(material, source);
    } else {
      for (const key of ['name', 'map', 'alphaMap', 'aoMap', 'aoMapIntensity', 'side', 'transparent', 'opacity', 'alphaTest', 'vertexColors', 'depthWrite', 'depthTest']) {
        if (source[key] !== undefined) material[key] = source[key];
      }
      material.color.copy(source.color);
    }
    const index = replacements.size;
    const bare = finish.matteMaterials?.includes(index);
    material.metalness = 0;
    material.roughness = bare ? .68 : finish.roughness;
    material.clearcoat = bare ? .08 : finish.clearcoat;
    material.clearcoatRoughness = bare ? .4 : finish.coatRoughness;
    material.ior = 1.48;
    material.specularIntensity = finish.specularIntensity ?? .7;
    material.envMapIntensity = 1;
    material.toneMapped = true;
    material.needsUpdate = true;
    replacements.set(source, material);
    return material;
  };
  object.traverse(node => {
    if (!node.isMesh || !node.material) return;
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
  });
  // Texture ownership transfers to the new material and is released with the viewer.
  for (const source of replacements.keys()) source.dispose();
}
