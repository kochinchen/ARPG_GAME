"""
紅弓的 TRELLIS 模型（設計者 2026-11-15）：把 TRELLIS 生成的弓轉成遊戲用的網格，每個三角形一個顏色（貼圖在面上幾點取樣的平均）。
做法同 scripts/sword_trellis.py。

用法：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/bow_trellis.py -- src/render/figure/weapons/bowTrellis.json

輸入：art/gear/bows_unique/ai/<名稱>.glb（多視角圖在 multiview/，沒有弓弦，弓弦由遊戲畫）；還沒生成的那把就跳過，遊戲沿用程式畫的。
輸出：{ props: { <款式>: { verts, faces: [a, b, c, 顏色] } } }
座標同 monster_ai.py 的 G()：Blender（Z 朝上）→ 遊戲（Y 朝上）；弓臂沿 Y、翼膜等裝飾朝 +Z、弓弦那側是 -Z（同 StyledBows）。
長邊再切細，讓構面維持細密的小三角形（設計者偏好）。
"""
import bpy, bmesh, json, os, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['src/render/figure/weapons/bowTrellis.json']
OUT = argv[0]
DIR = 'art/gear/bows_unique/ai'
# 檔名 → StyledBows 的款式
STYLES = {'天穹裂弦': 'sky', '群星箭雨': 'stars', '血祭神弓': 'blood', '墮騎魔弓': 'fallen', '蛛后毒弓': 'queen', '魔王炎弓': 'wing'}
SPLIT = 0.02


def to_int(r, g, b):
    q = lambda x: max(0, min(255, round(x * 255)))
    return (q(r) << 16) | (q(g) << 8) | q(b)


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obj = next(o for o in bpy.data.objects if o.type == 'MESH')
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    me = obj.data
    img = next(n.image for m in me.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
    tw, th = img.size
    px = img.pixels[:]
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.active
    col = bm.faces.layers.int.new('col')
    for f in bm.faces:
        uvs = [l[uv].uv.copy() for l in f.loops]
        c = sum(uvs, Vector((0, 0))) / 3
        acc = [0.0, 0.0, 0.0]
        samples = [c] + [c.lerp(u, 0.55) for u in uvs]
        for s in samples:
            x = min(tw - 1, max(0, int(s.x * tw)))
            y = min(th - 1, max(0, int(s.y * th)))
            i = (y * tw + x) * 4
            for k in range(3):
                acc[k] += px[i + k]
        f[col] = to_int(*(min(1.0, a / len(samples) * 1.08) for a in acc))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    for _ in range(3):
        long_edges = [e for e in bm.edges if e.calc_length() > SPLIT]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.verts.index_update()
    G = lambda v: [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]
    out = {'verts': [G(v.co) for v in bm.verts], 'faces': [[*(v.index for v in f.verts), f[col]] for f in bm.faces]}
    bm.free()
    return out


props = {}
for name, style in STYLES.items():
    path = os.path.join(DIR, name + '.glb')
    if os.path.exists(path):
        props[style] = load(path)
json.dump({'props': props}, open(OUT, 'w'), separators=(',', ':'))
print('bowTrellis:', {k: len(v['faces']) for k, v in props.items()})
