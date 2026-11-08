"""Rebuild the incense observation model from the supplied museum STL archive.

Historical geometry-only fallback. Current textured assets are reproduced with
scripts/convert-incense-photo.py and the supplied original OBJ/photo archives.

Run with Blender 4.3+: blender -b --python scripts/convert-observation-5.py -- \
  /path/to/프린트_STL.zip --output /path/to/output.glb

The uploaded STL supplies measured shape only. It contains no photographic
texture or useful surface color. The exported uniform celadon glaze is a
reference appearance, not an original surface reconstruction. No motifs or
painted decoration are generated. Body and lid retain their source alignment.
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import zipfile

import bpy
from mathutils import Vector


PARTS = [
    ("duk002990-001-30000_step3.stl", "00c91d532ddfc07600839898b088d2cc6316128448f7a5fa5fddd2f64ab310cd", 65000),
    ("duk002990-002-30000_step3.stl", "4070543c5407b00bd6fed0dcf26ebc66a229728cd3e64a835717398bda5ce2a6", 75000),
]


def convert(archive_path, output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    material = bpy.data.materials.new("Reference celadon glaze")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.188, 0.296, 0.224, 1)
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = 0.32
    shader.inputs["IOR"].default_value = 1.5
    shader.inputs["Coat Weight"].default_value = 0.35
    shader.inputs["Coat Roughness"].default_value = 0.16
    material.diffuse_color = shader.inputs["Base Color"].default_value
    report = []
    with tempfile.TemporaryDirectory(prefix="incense-conversion-") as directory, zipfile.ZipFile(archive_path) as archive:
        for index, (name, expected_hash, target_triangles) in enumerate(PARTS):
            content = archive.read("프린트_STL/" + name)
            if hashlib.sha256(content).hexdigest() != expected_hash:
                raise ValueError("Unexpected source checksum: " + name)
            source = Path(directory) / name
            source.write_bytes(content)
            bpy.ops.wm.stl_import(filepath=str(source), forward_axis="Y", up_axis="Z")
            obj = bpy.context.object
            obj.name = f"Observation object 5 part {index + 1}"
            obj.data.name = f"Scan geometry part {index + 1}"
            initial = len(obj.data.polygons)
            reduction = obj.modifiers.new("Classroom geometry budget", "DECIMATE")
            reduction.ratio = min(1, target_triangles / initial)
            reduction.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=reduction.name)
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
            obj.data.materials.clear()
            obj.data.materials.append(material)
            report.append({"source": name, "sourceTriangles": initial, "outputTriangles": len(obj.data.polygons),
                           "outputVertices": len(obj.data.vertices), "sourceSha256": expected_hash})

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    lower = Vector([min(p[axis] for p in points) for axis in range(3)])
    upper = Vector([max(p[axis] for p in points) for axis in range(3)])
    center = Vector(((lower.x + upper.x) / 2, (lower.y + upper.y) / 2, lower.z))
    for obj in meshes:
        # Preserve source assembly; change only common translation and units.
        for vertex in obj.data.vertices:
            vertex.co = (vertex.co - center) * 0.001
    bpy.ops.export_scene.gltf(filepath=str(output_path), export_format="GLB", export_yup=True,
                              export_extras=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_materials="EXPORT", export_normals=True)
    content = output_path.read_bytes()
    print(json.dumps({"output": str(output_path), "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                      "sourceUpAxis": "Z", "outputUpAxis": "Y", "sourceUnits": "mm", "outputUnits": "m",
                      "material": "Uniform reference celadon glaze; no photographic texture", "parts": report}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    convert(arguments.archive, arguments.output)
