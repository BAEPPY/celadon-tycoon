#!/usr/bin/env python3
"""Prepare classroom LODs from the checked-in, original-detail museum models.

Run from the repository root with Python 3 and Pillow. No surfaces, colors or
patterns are invented. The card retains its lightweight mesh and receives the
matching higher-resolution source atlas; the enlarged view retains the detailed
source mesh. Only the large photographic PNG is converted to JPEG 94, 4:4:4.
Normal and metallic/roughness maps remain lossless at their original resolution.
"""
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json
import struct
import argparse
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LESSON = ROOT / 'assets/lesson'
MUSEUM_COMMIT = '1af26e11f21928b7935a5432de3d178997558c7e'


def source_label(path):
    if path.is_relative_to(ROOT):
        return path.relative_to(ROOT).as_posix()
    subpath = ('map/' if path.parent.name == 'map' else '') + path.name
    return f'https://github.com/BAEPPY/minichungjamuseum/blob/{MUSEUM_COMMIT}/public/models/{subpath}'


def read_glb(path):
    data = path.read_bytes()
    assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 8)[0] == len(data)
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    binary = data[28 + length:]
    return doc, binary


def views(doc, binary):
    return [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
            for v in doc['bufferViews']]


def pack_glb(doc, chunks):
    doc = deepcopy(doc)
    binary = bytearray()
    for view, chunk in zip(doc['bufferViews'], chunks, strict=True):
        binary.extend(b'\0' * (-len(binary) % 4))
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(chunk)
        binary.extend(chunk)
    binary.extend(b'\0' * (-len(binary) % 4))
    doc['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
            + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
            + struct.pack('<II', len(binary), 0x004e4942) + binary)


def photo_indices(doc):
    return {doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
            for m in doc['materials'] if 'baseColorTexture' in m.get('pbrMetallicRoughness', {})}


def export(source, destination, atlas_source=None, max_photo_size=None, compress_png=False):
    doc, binary = read_glb(source)
    chunks = views(doc, binary)
    detail_doc, detail_binary = read_glb(atlas_source or source)
    detail_chunks = views(detail_doc, detail_binary)
    photos = photo_indices(doc)
    assert photo_indices(detail_doc) == photos
    # The matching image index alone is insufficient: verify each source UV set.
    for material, detail_material in zip(doc['materials'], detail_doc['materials'], strict=True):
        assert material.get('pbrMetallicRoughness', {}).get('baseColorTexture') == detail_material.get('pbrMetallicRoughness', {}).get('baseColorTexture')
    image_report = []
    for index, image in enumerate(doc.get('images', [])):
        if index not in photos:
            continue
        detail_image = detail_doc['images'][index]
        raw = detail_chunks[detail_image['bufferView']]
        decoded = Image.open(BytesIO(raw))
        original_size = decoded.size
        resized = max_photo_size is not None and max(decoded.size) > max_photo_size
        if resized:
            decoded.thumbnail((max_photo_size, max_photo_size), Image.Resampling.LANCZOS)
        if resized or (compress_png and detail_image['mimeType'] == 'image/png'):
            output = BytesIO()
            decoded.convert('RGB').save(output, 'JPEG', quality=94, subsampling=0, optimize=True)
            raw = output.getvalue()
            image['mimeType'] = 'image/jpeg'
        else:
            image['mimeType'] = detail_image['mimeType']
        chunks[image['bufferView']] = raw
        image_report.append({'image': index, 'sourceResolution': original_size, 'resolution': decoded.size,
                             'bytes': len(raw), 'sha256': sha256(raw).hexdigest()})
    output = pack_glb(doc, chunks)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(output)
    triangles = sum(doc['accessors'][p['indices']]['count'] // 3
                    for mesh in doc['meshes'] for p in mesh['primitives'])
    return {'id': destination.stem, 'file': destination.relative_to(LESSON).as_posix(),
            'quality': 'detail' if destination.parent.name == 'detail' else 'card',
            'source': source_label(source),
            'sourceSha256': sha256(source.read_bytes()).hexdigest(),
            'atlasSource': source_label(atlas_source or source),
            'atlasSourceSha256': sha256((atlas_source or source).read_bytes()).hexdigest(),
            'copiedWithoutModification': False, 'bytes': len(output), 'sha256': sha256(output).hexdigest(),
            'triangles': triangles, 'photographs': image_report,
            'conversion': 'tools/prepare-lesson-detail.py; source mesh, UVs, vertex colors, normal and roughness maps retained. Source photographic atlases only; no synthesized detail.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--museum-sources', type=Path, help='Pinned museum public/models downloads, including map/ originals')
    args = parser.parse_args()
    records = []
    for name, id, size in [('celadon-pillow-reconstruction.glb', 'observation-1', 2048),
                           ('celadon-ewer.glb', 'observation-4', 2048),
                           ('celadon-maebyeong-v2.glb', 'beauty', 2048)]:
        source = ROOT / 'assets/models' / name
        detail = source.parent / 'detail' / name
        records.append(export(source, LESSON / f'{id}.glb', detail, max_photo_size=size))
        records.append(export(detail, LESSON / 'detail' / f'{id}.glb', compress_png=True))
    if args.museum_sources:
        for name, id in [('japan-peony-reconstruction.glb', 'comparison-1'),
                         ('yuan-celadon-vase.glb', 'comparison-2')]:
            detail = args.museum_sources.resolve() / name
            source = detail.parent / 'map' / name
            records.append(export(source, LESSON / f'{id}.glb', detail, max_photo_size=2048))
            records.append(export(detail, LESSON / 'detail' / f'{id}.glb'))
    report_path = LESSON / 'provenance.json'
    report = json.loads(report_path.read_text())
    report['method'] = 'Per-file provenance: original or converted museum models, with matching original photographic atlases and optional detailed-source meshes. See each asset record; no synthesized detail.'
    replaced = {r['file'] for r in records}
    report['assets'] = [r for r in report['assets'] if r['file'] not in replaced] + records
    report['qualityUpdate'] = 'Original high-resolution photographic atlases for cards, with detailed source geometry loaded only in enlarged views. Existing incense/photo colors are unchanged.'
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    for record in records:
        print(record['file'], record['bytes'], 'bytes,', record['triangles'], 'triangles,',
              [p['resolution'] for p in record['photographs']])


if __name__ == '__main__':
    main()
