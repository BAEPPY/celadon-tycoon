#!/usr/bin/env python3
"""Build the incense GLB from the supplied original OBJ and photo archives.

Requires Python 3.10+ and Pillow. Example:
  python scripts/convert-incense-photo.py --body body.zip \
    --lid-color lid.zip --lid-geometry 'lid (2).zip' --output observation-5.glb

The source body/lid share a Y-up coordinate system. Their original alignment,
187,034 triangles, UVs and vertex normals are retained. Only a shared translation
and millimeters-to-meters conversion are applied. The source MTL filenames are
stale: explicitly bind the matching supplied JPG for each part. The extra lid
archive is essential; the first lid archive contains only its photograph atlas.

Unlit photo materials retain the recorded glaze colors and lighting without
additional tint, exposure correction or invented decoration. 8192px atlases
become 4096px JPEGs (quality 90, no chroma subsampling). Normal-map archives can
be inspected with --material pbr --body-normal FILE --lid-normal FILE, but are
not used in the final unlit classroom model. Their tangent basis is unspecified.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import zipfile

from PIL import Image


HASHES = {
    "duk002990_001_30000.obj": "18cf239f0455826ab00a4e0c4b4032fe335ce8dcab912ad30ea3ad3ab6d199cc",
    "duk002990_001_30000.mtl": "97734a36727e8aaf1b5f6f6d1eba97c23083b220ff801be92c1fe64381ba8313",
    "duk002990_001_30000.jpg": "ff0567a265d82f34c70483faf266425c0efe287f94abfe0197640a36942684fe",
    "duk002990_001_30000_nor.jpg": "f3d1db1d614241e1f668059f0502af6dddf690f71c6c6b5e1e98e3530e84778a",
    "duk002990_002_30000.obj": "22da37aa316079bf9db5de27d16ad6c17b079c08f73d388d7d4d80beda72d2bc",
    "duk002990_002_30000.mtl": "4c8e890906e96b29c3ce2e05dc41094a8391a8067ed0bbfdb2196cb9bd1b5345",
    "duk002990_002_30000.jpg": "b07d47697211af0bf6d44be3fa1edb5e39513427a95d106be82a0c0916100034",
    "duk002990_002_30000_nor.jpg": "3d2163722af2f8bded975601cd74adad910f8add27ea65bf9ba43784f70a070f",
}


def read_source(archive, filenames):
    """Read expected entries only. Never extract or execute archive contents."""
    with zipfile.ZipFile(archive) as source:
        result = {name: source.read(name) for name in filenames}
    for name, content in result.items():
        if hashlib.sha256(content).hexdigest() != HASHES[name]:
            raise ValueError(f"Unexpected source checksum: {name}")
    return result


def parse_obj(content):
    positions, normals, uvs, faces = [], [], [], []
    for line in content.decode("utf-8").splitlines():
        values = line.split()
        if not values:
            continue
        if values[0] in ("v", "vn", "vt"):
            target = {"v": positions, "vn": normals, "vt": uvs}[values[0]]
            target.append(tuple(float(value) for value in values[1:]))
        elif values[0] == "f":
            if len(values) != 4:
                raise ValueError("Expected the original triangulated source")
            faces.append([tuple(int(value) - 1 for value in corner.split("/")) for corner in values[1:]])
    return positions, normals, uvs, faces


def jpeg(content, size):
    image = Image.open(io.BytesIO(content)).convert("RGB")
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=90, subsampling=0, optimize=True)
    return output.getvalue()


def convert(sources, material_kind):
    parts = [parse_obj(sources[f"duk002990_{part}_30000.obj"]) for part in ("001", "002")]
    minimum = [min(v[axis] for part in parts for v in part[0]) for axis in range(3)]
    maximum = [max(v[axis] for part in parts for v in part[0]) for axis in range(3)]
    offset = [(minimum[0] + maximum[0]) / 2, minimum[1], (minimum[2] + maximum[2]) / 2]
    binary, views, accessors, meshes, images, textures, materials, report = bytearray(), [], [], [], [], [], [], []

    def append_view(content, **properties):
        binary.extend(b"\0" * (-len(binary) % 4))
        index = len(views)
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(content), **properties})
        binary.extend(content)
        return index

    for part_index, (positions, normals, uvs, faces) in enumerate(parts):
        part = f"{part_index + 1:03}"
        vertices, indices, unique = [], [], {}
        for face in faces:
            for corner in face:
                if corner not in unique:
                    position, uv, normal = corner
                    unique[corner] = len(vertices)
                    vertices.append((
                        *[(positions[position][axis] - offset[axis]) * 0.001 for axis in range(3)],
                        *normals[normal], uvs[uv][0], 1 - uvs[uv][1],
                    ))
                indices.append(unique[corner])
        assert len(vertices) < 65536
        assert len(faces) == (72668 if part_index == 0 else 114366)
        attribute_view = append_view(b"".join(struct.pack("<8f", *v) for v in vertices), byteStride=32, target=34962)
        index_view = append_view(struct.pack(f"<{len(indices)}H", *indices), target=34963)
        first_accessor = len(accessors)
        accessors.extend([
            {"bufferView": attribute_view, "byteOffset": 0, "componentType": 5126, "count": len(vertices), "type": "VEC3",
             "min": [min(v[a] for v in vertices) for a in range(3)], "max": [max(v[a] for v in vertices) for a in range(3)]},
            {"bufferView": attribute_view, "byteOffset": 12, "componentType": 5126, "count": len(vertices), "type": "VEC3"},
            {"bufferView": attribute_view, "byteOffset": 24, "componentType": 5126, "count": len(vertices), "type": "VEC2"},
            {"bufferView": index_view, "componentType": 5123, "count": len(indices), "type": "SCALAR"},
        ])
        image_bytes = jpeg(sources[f"duk002990_{part}_30000.jpg"], 4096)
        image_view = append_view(image_bytes)
        image_index, texture_index = len(images), len(textures)
        images.append({"bufferView": image_view, "mimeType": "image/jpeg", "name": f"Original color atlas {part_index + 1}"})
        textures.append({"sampler": 0, "source": image_index})
        material = {"name": f"Original photographed surface {part_index + 1}", "pbrMetallicRoughness": {
            "baseColorTexture": {"index": texture_index}, "metallicFactor": 0, "roughnessFactor": 0.65,
        }}
        if material_kind == "unlit":
            material["extensions"] = {"KHR_materials_unlit": {}}
        else:
            normal_view = append_view(jpeg(sources[f"duk002990_{part}_30000_nor.jpg"], 2048))
            material["normalTexture"] = {"index": len(textures)}
            textures.append({"sampler": 0, "source": len(images)})
            images.append({"bufferView": normal_view, "mimeType": "image/jpeg", "name": f"Original normal atlas {part_index + 1}"})
        materials.append(material)
        meshes.append({"name": f"Original geometry {part_index + 1}", "primitives": [{
            "attributes": {"POSITION": first_accessor, "NORMAL": first_accessor + 1, "TEXCOORD_0": first_accessor + 2},
            "indices": first_accessor + 3, "material": part_index,
        }]})
        report.append({"part": part_index + 1, "sourcePositions": len(positions), "verticesWithUVSeams": len(vertices),
                       "triangles": len(faces), "textureSize": [4096, 4096], "textureBytes": len(image_bytes)})
    doc = {
        "asset": {"version": "2.0", "generator": "Classroom OBJ conversion"},
        "scene": 0, "scenes": [{"nodes": [0, 1]}],
        "nodes": [{"mesh": i, "name": f"Observation object 5 part {i + 1}"} for i in range(2)],
        "meshes": meshes, "materials": materials, "textures": textures, "images": images,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "bufferViews": views, "accessors": accessors, "buffers": [{"byteLength": len(binary)}],
    }
    if material_kind == "unlit":
        doc["extensionsUsed"] = ["KHR_materials_unlit"]
        doc["extensionsRequired"] = ["KHR_materials_unlit"]
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary.extend(b"\0" * (-len(binary) % 4))
    result = (struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(binary))
              + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
              + struct.pack("<II", len(binary), 0x004E4942) + binary)
    print(json.dumps({"bytes": len(result), "sha256": hashlib.sha256(result).hexdigest(), "parts": report,
                      "material": material_kind, "sharedTranslationMm": offset}, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--body", type=Path, required=True)
    parser.add_argument("--lid-color", type=Path, required=True)
    parser.add_argument("--lid-geometry", type=Path, required=True)
    parser.add_argument("--body-normal", type=Path)
    parser.add_argument("--lid-normal", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--material", choices=("unlit", "pbr"), default="unlit")
    args = parser.parse_args()
    sources = read_source(args.body, [f"duk002990_001_30000.{ext}" for ext in ("obj", "mtl", "jpg")])
    sources.update(read_source(args.lid_color, ["duk002990_002_30000.jpg"]))
    sources.update(read_source(args.lid_geometry, [f"duk002990_002_30000.{ext}" for ext in ("obj", "mtl")]))
    if args.material == "pbr":
        if not args.body_normal or not args.lid_normal:
            parser.error("PBR inspection requires both normal-map archives")
        sources.update(read_source(args.body_normal, ["duk002990_001_30000_nor.jpg"]))
        sources.update(read_source(args.lid_normal, ["duk002990_002_30000_nor.jpg"]))
    args.output.write_bytes(convert(sources, args.material))
