#!/usr/bin/env python3
"""Convert the supplied museum OBJ archive to the neutral classroom GLB.

Usage: python scripts/convert-comparison-3.py /path/to/디지털콘텐츠_OBJ.zip
Requires Python 3.10+ and Pillow. Original archives are read, never modified.

The archive is the National Museum of Korea's duk000020_000_30000 download.
Its MTL references unavailable texture names. This converter explicitly binds
the supplied color JPEG to the original UVs instead. The photographic texture
already records lighting, so an unlit material preserves its recorded colors,
as for the other scanned/photo-derived comparison objects. The supplied normal
map is deliberately unused in that material. --material pbr is available for
inspection with the supplied normal map; it is not the classroom export.

Geometry is neither reconstructed nor simplified. The original 18,766 triangles,
UV seams, and vertex normals are retained. Y stays up, millimeters become meters,
and only translation centers the footprint and places the lowest point at Y=0.
The 8192px photographic atlas is reduced to 4096px for classroom devices.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import zipfile

from PIL import Image


SOURCE_HASHES = {
    "duk000020_000_30000.obj": "a8456b76bd3739520a58b016147cade840a2a151e1a7343eab1f7110c52f8682",
    "duk000020_000_30000.mtl": "64daaa154c0a2e90613a6dc8ce19a8fa1057b259378e3d6e1f2fc6121d6168fa",
    "duk000020_000_30000.jpg": "2d575df610d72714820c1571dac9090fc33a383dd20b0e8a6512fafb623e6c9d",
    "duk000020_000_30000_nor.jpg": "b2bf019498579d8c1611a9e96e9b96c72aefb6c67ae97b64f8e55d87e01a346e",
}


def source_files(path):
    """Read only the expected filenames; do not extract or execute archive data."""
    with zipfile.ZipFile(path) as outer:
        nested = "디지털콘텐츠_OBJ/duk000020_000_30000.zip"
        if nested in outer.namelist():
            archive = zipfile.ZipFile(io.BytesIO(outer.read(nested)))
        else:
            archive = outer
        try:
            files = {name: archive.read(name) for name in SOURCE_HASHES}
        finally:
            if archive is not outer:
                archive.close()
    for name, content in files.items():
        if hashlib.sha256(content).hexdigest() != SOURCE_HASHES[name]:
            raise ValueError(f"Unexpected source checksum: {name}")
    return files


def texture_jpeg(content, size, quality):
    image = Image.open(io.BytesIO(content)).convert("RGB")
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=quality, subsampling=0, optimize=True)
    return output.getvalue()


def convert(files, material):
    positions, normals, uvs, faces = [], [], [], []
    for line in files["duk000020_000_30000.obj"].decode("utf-8").splitlines():
        values = line.split()
        if not values:
            continue
        if values[0] in ("v", "vn", "vt"):
            target = {"v": positions, "vn": normals, "vt": uvs}[values[0]]
            target.append(tuple(float(value) for value in values[1:]))
        elif values[0] == "f":
            if len(values) != 4:
                raise ValueError("Source faces must be triangles")
            faces.append([tuple(int(i) - 1 for i in value.split("/")) for value in values[1:]])
    assert len(positions) == 9385 and len(faces) == 18766
    minimum = [min(v[axis] for v in positions) for axis in range(3)]
    maximum = [max(v[axis] for v in positions) for axis in range(3)]
    offset = [(minimum[0] + maximum[0]) / 2, minimum[1], (minimum[2] + maximum[2]) / 2]
    vertices, indices, unique = [], [], {}
    for face in faces:
        for vertex in face:
            if vertex not in unique:
                position, uv, normal = vertex
                unique[vertex] = len(vertices)
                # OBJ V=0 is bottom; glTF V=0 is top. JPEG rows are unchanged.
                vertices.append((
                    *[(positions[position][axis] - offset[axis]) * 0.001 for axis in range(3)],
                    *normals[normal], uvs[uv][0], 1 - uvs[uv][1],
                ))
            indices.append(unique[vertex])
    assert len(vertices) < 65536
    binary = bytearray()
    views = []

    def append_view(content, **kwargs):
        binary.extend(b"\0" * (-len(binary) % 4))
        index = len(views)
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(content), **kwargs})
        binary.extend(content)
        return index

    attribute_view = append_view(b"".join(struct.pack("<8f", *v) for v in vertices), byteStride=32, target=34962)
    index_view = append_view(struct.pack(f"<{len(indices)}H", *indices), target=34963)
    image_view = append_view(texture_jpeg(files["duk000020_000_30000.jpg"], 4096, 92))
    images = [{"bufferView": image_view, "mimeType": "image/jpeg", "name": "Original color texture"}]
    textures = [{"sampler": 0, "source": 0}]
    surface = {
        "name": "Original photographed surface",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.65,
        },
    }
    if material == "unlit":
        surface["extensions"] = {"KHR_materials_unlit": {}}
    else:
        normal_view = append_view(texture_jpeg(files["duk000020_000_30000_nor.jpg"], 2048, 92))
        images.append({"bufferView": normal_view, "mimeType": "image/jpeg", "name": "Original normal texture"})
        textures.append({"sampler": 0, "source": 1})
        surface["normalTexture"] = {"index": 1}
    doc = {
        "asset": {"version": "2.0", "generator": "Classroom OBJ conversion"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Observation object 3"}],
        "meshes": [{"name": "Original geometry", "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0,
        }]}],
        "materials": [surface], "textures": textures, "images": images,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": attribute_view, "byteOffset": 0, "componentType": 5126, "count": len(vertices), "type": "VEC3",
             "min": [min(v[a] for v in vertices) for a in range(3)], "max": [max(v[a] for v in vertices) for a in range(3)]},
            {"bufferView": attribute_view, "byteOffset": 12, "componentType": 5126, "count": len(vertices), "type": "VEC3"},
            {"bufferView": attribute_view, "byteOffset": 24, "componentType": 5126, "count": len(vertices), "type": "VEC2"},
            {"bufferView": index_view, "componentType": 5123, "count": len(indices), "type": "SCALAR"},
        ],
        "buffers": [{"byteLength": len(binary)}],
    }
    if material == "unlit":
        doc["extensionsUsed"] = ["KHR_materials_unlit"]
        doc["extensionsRequired"] = ["KHR_materials_unlit"]
    encoded = json.dumps(doc, ensure_ascii=True, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary.extend(b"\0" * (-len(binary) % 4))
    result = (struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(binary))
              + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
              + struct.pack("<II", len(binary), 0x004E4942) + binary)
    print(json.dumps({"bytes": len(result), "triangles": len(faces), "verticesWithUVSeams": len(vertices),
                      "boundsMeters": {"min": doc["accessors"][0]["min"], "max": doc["accessors"][0]["max"]},
                      "material": material, "sha256": hashlib.sha256(result).hexdigest()}, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "assets/lesson/comparison-3.glb")
    parser.add_argument("--material", choices=("unlit", "pbr"), default="unlit")
    arguments = parser.parse_args()
    arguments.output.write_bytes(convert(source_files(arguments.archive), arguments.material))
