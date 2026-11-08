"""Crop/register whole image-generated layers; no drawing or body-part edits."""
from pathlib import Path
from shutil import copyfile
import hashlib
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
GENERATED = Path('/workspace/generated_images')
SOURCES = [
    'exec-57972082-0830-4327-b942-82aca7c20982.png',
    'exec-1371e031-df12-42a8-8dee-61a0b153f3df.png',
    'exec-95165cef-5591-4085-9b57-0241db344c42.png',
    'exec-f9469fdf-8742-4a8f-b115-54e6f6106e98.png',
]
KILN_SOURCE = 'exec-03d95d6a-2544-4ca4-b2db-84f666787dba.png'
# Order by the blade's vertical travel: one downstroke, then one return.
ORDER = [(1,1),(1,2),(2,1),(1,3),(2,2),(1,4),(2,3),(2,4),(2,5),(1,5),
         (3,1),(4,1),(3,2),(3,3),(3,4),(4,2),(4,3),(3,5),(4,4),(4,5)]
source_dir = ROOT / 'source-20'
source_dir.mkdir(exist_ok=True)
frames = {}
metadata = []
for phase, source in enumerate(SOURCES, 1):
    source_path = source_dir / f'child-phase-{phase}.png'
    if (GENERATED / source).exists():
        copyfile(GENERATED / source, source_path)
    sheet = Image.open(source_path).convert('RGBA')
    array = np.asarray(sheet)
    width, height = sheet.size
    empty = ~(array[:,:,3] > 128).any(axis=0)
    cuts = [0]
    for index in range(1, 5):
        expected = round(width * index / 5)
        left, right = max(0, expected - 100), min(width, expected + 100)
        candidates = np.where(empty[left:right])[0] + left
        groups = np.split(candidates, np.where(np.diff(candidates) > 1)[0] + 1)
        gap = max(groups, key=len)
        assert len(gap) > 5, 'Expected transparent gutter between generated poses'
        cuts.append(int((gap[0] + gap[-1]) // 2))
    cuts.append(width)
    for pose in range(5):
        cell = sheet.crop((cuts[pose], 0, cuts[pose+1], height))
        mask = np.asarray(cell)[:,:,3] > 128
        top, bottom = int(np.where(mask)[0].min()), int(np.where(mask)[0].max()) + 1
        columns = np.where(mask[top+2:top+10].any(axis=0))[0]
        center = float((columns[0] + columns[-1]) / 2)
        scale = 351 / (bottom - top)
        resized = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.LANCZOS)
        x, y = round(410 - center * scale), round(16 - top * scale)
        frame = Image.new('RGBA', (512,384))
        frame.paste(resized, (x,y))
        frames[(phase, pose+1)] = frame
        metadata.append({'phase':phase,'pose':pose+1,'source':source,'crop':[cuts[pose],0,cuts[pose+1],height],
                         'topknot_center_x':center,'solid_y_range':[top,bottom],'scale':scale,'translation':[x,y]})

def save_layer(image, basename):
    image.save(ROOT / f'{basename}.png')
    image.save(ROOT / f'{basename}.webp',quality=94,method=6)

for index, key in enumerate(ORDER, 1):
    save_layer(frames[key], f'fanning-{index:02d}')
assert len({hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames.values()}) == 20

kiln_path = source_dir / 'kiln-static-original.png'
if (GENERATED / KILN_SOURCE).exists():
    copyfile(GENERATED / KILN_SOURCE, kiln_path)
kiln = Image.open(kiln_path).convert('RGBA')
mask = np.asarray(kiln)[:,:,3] > 128
ys, xs = np.where(mask)
left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1
scale = 320 / (bottom - top)
resized = kiln.resize((round(kiln.width*scale),round(kiln.height*scale)),Image.Resampling.LANCZOS)
static = Image.new('RGBA',(512,384))
translation = (round(10-left*scale),round(36-top*scale))
static.paste(resized,translation)
save_layer(static,'kiln-static')

with (ROOT/'registration.json').open('w') as file:
    json.dump({'size':[512,384],'order':ORDER,'frames':metadata,
               'kiln':{'source':KILN_SOURCE,'solid_bbox':[left,top,right,bottom],'scale':scale,'translation':translation}},file,indent=2)
print('Saved 20 unique generated child layers and one static kiln, all 512 x 384.')
