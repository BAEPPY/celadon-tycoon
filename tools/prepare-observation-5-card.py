#!/usr/bin/env python3
"""Make the lighter card copy of observation 5 (the pierced incense burner) for Chromebooks.

Run from the repository root with Python 3, NumPy and Pillow.

The enlarged view keeps the unmodified conversion (assets/lesson/detail/observation-5.glb). The card copy keeps every
triangle, the index order and both source photographs, so the openwork is not simplified or redrawn. Only the storage
changes: vertex positions become 16-bit, normals 8-bit and UVs 16-bit (KHR_mesh_quantization, read natively by
three.js, no decoder), and the two 4096 px photographs are downscaled to 2048 px (JPEG 94, 4:4:4) like the other cards.
"""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LESSON = ROOT / 'assets/lesson'
CARD, DETAIL = LESSON / 'observation-5.glb', LESSON / 'detail/observation-5.glb'
PHOTO_SIZE = 2048
FLOAT, BYTE, SHORT, USHORT = 5126, 5120, 5122, 5123


def read_glb(path):
    data = path.read_bytes()
    assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 8)[0] == len(data)
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + length]), data[28 + length:]


def pack_glb(doc, chunks):
    binary = bytearray()
    for view, chunk in zip(doc['bufferViews'], chunks, strict=True):
        binary.extend(b'\0' * (-len(binary) % 4))
        view['byteOffset'], view['byteLength'] = len(binary), len(chunk)
        binary.extend(chunk)
    binary.extend(b'\0' * (-len(binary) % 4))
    doc['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
            + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
            + struct.pack('<II', len(binary), 0x004e4942) + bytes(binary))


def floats(doc, binary, index, width):
    """Float attribute `index` as rows; the source interleaves position, normal and UV in one 32-byte vertex."""
    accessor = doc['accessors'][index]
    view = doc['bufferViews'][accessor['bufferView']]
    assert accessor['componentType'] == FLOAT and 'sparse' not in accessor
    stride = view.get('byteStride', width * 4)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    rows = np.frombuffer(binary, np.uint8, (accessor['count'] - 1) * stride + width * 4, start)
    table = np.lib.stride_tricks.as_strided(rows, (accessor['count'], width * 4), (stride, 1))
    return np.ascontiguousarray(table).view('<f4').reshape(-1, width).astype(np.float64)


# Card vertex: position 3 x int16 (+2 bytes padding), normal 3 x int8 (+1), UV 2 x uint16 = 16 bytes, was 32.
VERTEX = np.dtype({'names': ['position', 'normal', 'uv'], 'formats': [('<i2', 3), ('i1', 3), ('<u2', 2)], 'offsets': [0, 8, 12], 'itemsize': 16})


def build_card():
    doc, binary = read_glb(DETAIL)
    chunks = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in doc['bufferViews']]
    report = {'meshes': []}
    for node in doc['nodes']:
        assert set(node) <= {'mesh', 'name'}, 'source nodes carry no transform'
        (primitive,) = doc['meshes'][node['mesh']]['primitives']
        attributes = primitive['attributes']
        assert set(attributes) == {'POSITION', 'NORMAL', 'TEXCOORD_0'}
        position, normal, uv = (floats(doc, binary, attributes[name], width)
                                for name, width in (('POSITION', 3), ('NORMAL', 3), ('TEXCOORD_0', 2)))
        assert uv.min() >= 0 and uv.max() <= 1, 'UVs fit normalized 16-bit storage'
        # One uniform scale per part keeps the surface normals valid; a step is about 2 micrometres of the object.
        low, high = position.min(0), position.max(0)
        center, scale = (low + high) / 2, float(((high - low) / 2).max())
        stored = np.rint((position - center) / scale * 32767).clip(-32767, 32767)
        node['translation'], node['scale'] = [float(v) for v in center], [scale] * 3
        length = np.linalg.norm(normal, axis=1, keepdims=True)
        unit = np.divide(normal, length, out=np.zeros_like(normal), where=length > 0)
        view_index = doc['accessors'][attributes['POSITION']]['bufferView']
        assert all(doc['accessors'][attributes[name]]['bufferView'] == view_index for name in attributes)
        vertices = np.zeros(len(position), VERTEX)
        vertices['position'], vertices['normal'], vertices['uv'] = stored, np.rint(unit * 127), np.rint(uv * 65535)
        for name, component, extra in (
                ('POSITION', SHORT, {'min': [int(v) for v in stored.min(0)], 'max': [int(v) for v in stored.max(0)]}),
                ('NORMAL', BYTE, {}), ('TEXCOORD_0', USHORT, {})):
            accessor = doc['accessors'][attributes[name]]
            accessor.pop('min', None); accessor.pop('max', None)
            accessor.update({'componentType': component, 'normalized': True, 'byteOffset': VERTEX.fields[name.split('_')[0].lower().replace('texcoord', 'uv')][1], **extra})
        doc['bufferViews'][view_index]['byteStride'] = VERTEX.itemsize
        chunks[view_index] = vertices.tobytes()
        report['meshes'].append({'vertices': len(position), 'triangles': doc['accessors'][primitive['indices']]['count'] // 3,
                                 'positionStepMetres': scale / 32767})
    photographs = []
    for index, image in enumerate(doc['images']):
        decoded = Image.open(BytesIO(chunks[image['bufferView']]))
        source_size = decoded.size
        decoded.thumbnail((PHOTO_SIZE, PHOTO_SIZE), Image.Resampling.LANCZOS)
        output = BytesIO()
        decoded.convert('RGB').save(output, 'JPEG', quality=94, subsampling=0, optimize=True)
        chunks[image['bufferView']] = output.getvalue()
        image['mimeType'] = 'image/jpeg'
        photographs.append({'image': index, 'sourceResolution': list(source_size), 'resolution': list(decoded.size),
                            'bytes': len(output.getvalue()), 'sha256': sha256(output.getvalue()).hexdigest()})
    for key in ('extensionsUsed', 'extensionsRequired'):
        doc[key] = sorted(set(doc.get(key, [])) | {'KHR_mesh_quantization'})
    doc['asset']['generator'] = 'Classroom OBJ conversion; card copy by tools/prepare-observation-5-card.py'
    return pack_glb(doc, chunks), doc, report['meshes'], photographs


def main():
    report_path = LESSON / 'provenance.json'
    report = json.loads(report_path.read_text())
    if not DETAIL.exists():
        # First run: the existing full conversion becomes the enlarged-view file, byte for byte.
        DETAIL.parent.mkdir(parents=True, exist_ok=True)
        DETAIL.write_bytes(CARD.read_bytes())
    detail_bytes = DETAIL.read_bytes()
    original = next(r for r in report['assets'] if r['id'] == 'observation-5' and r.get('quality') != 'card')
    assert original['sha256'] == sha256(detail_bytes).hexdigest(), 'detail copy is the recorded source conversion'
    detail_record = {**original, 'file': 'detail/observation-5.glb', 'quality': 'detail', 'copiedWithoutModification': True}
    card, doc, meshes, photographs = build_card()
    CARD.write_bytes(card)
    card_record = {
        'id': 'observation-5', 'file': 'observation-5.glb', 'quality': 'card',
        'source': 'assets/lesson/detail/observation-5.glb', 'sourceSha256': sha256(detail_bytes).hexdigest(),
        'copiedWithoutModification': False, 'bytes': len(card), 'sha256': sha256(card).hexdigest(),
        'extensionsRequired': doc['extensionsRequired'], 'extensionsUsed': doc['extensionsUsed'],
        'triangles': sum(m['triangles'] for m in meshes), 'vertices': sum(m['vertices'] for m in meshes),
        'positionStepMetres': max(m['positionStepMetres'] for m in meshes), 'photographs': photographs,
        'sourceProvider': original.get('sourceProvider'), 'artifactId': original.get('artifactId'), 'sourceUrl': original.get('sourceUrl'),
        'conversion': 'tools/prepare-observation-5-card.py; every source triangle, index and UV seam retained. Positions stored as '
                      'normalized 16-bit, normals 8-bit and UVs 16-bit (KHR_mesh_quantization); the two source photographs '
                      'downscaled from 4096 to 2048 px (JPEG 94, 4:4:4). No simplification, no synthesized detail. '
                      'The enlarged view loads the unmodified conversion.',
    }
    report['assets'] = [r for r in report['assets'] if r['id'] != 'observation-5'] + [card_record, detail_record]
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('detail', len(detail_bytes), 'bytes (unchanged)')
    print('card  ', len(card), 'bytes,', card_record['triangles'], 'triangles,', [p['resolution'] for p in photographs])


if __name__ == '__main__':
    main()
