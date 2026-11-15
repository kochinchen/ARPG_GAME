"""
劍的 TRELLIS 底稿（設計者 2026-11-15）：把 TRELLIS 生成的劍轉成遊戲用的網格，每個三角形一個顏色（貼圖在面上幾點取樣的平均）。

用法：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/sword_trellis.py -- src/render/figure/weapons/swordTrellis.json

輸入：
  art/gear/sword_base/ai/sample.glb          一般的單手長劍（各階級與橘 / 紅劍的劍身底稿）
  art/monsters/abyss_sovereign/ai/sword.glb  深淵統御者的巨劍（深淵魔劍直接用這把，不另外生成）

輸出：{ props: { sword, abyss }: { verts, faces: [a, b, c, 顏色] } }
座標同 monster_ai.py 的 G()：Blender（Z 朝上）→ 遊戲（Y 朝上）；兩把都是柄頭朝上（+Y）、劍尖朝下，刃寬是 X、厚度是 Z。
長邊再切細，讓構面維持細密的小三角形（設計者偏好）。
"""
import bpy, bmesh, json, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['src/render/figure/weapons/swordTrellis.json']
OUT = argv[0]
SOURCES = {
    'sword': ('art/gear/sword_base/ai/sample.glb', 0.022),
    'abyss': ('art/monsters/abyss_sovereign/ai/sword.glb', 0.03),
}


def to_int(r, g, b):
    q = lambda x: max(0, min(255, round(x * 255)))
    return (q(r) << 16) | (q(g) << 8) | q(b)


def load(path, split):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    obj = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
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
    # 先記下每個原始面的顏色，切細後子面沿用（不重新取樣，避免細面取到接縫）
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
        long_edges = [e for e in bm.edges if e.calc_length() > split]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.verts.index_update()
    G = lambda v: [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]
    out = {'verts': [G(v.co) for v in bm.verts], 'faces': [[*(v.index for v in f.verts), f[col]] for f in bm.faces]}
    bm.free()
    return out


bpy.ops.wm.read_factory_settings(use_empty=True)
props = {name: load(path, split) for name, (path, split) in SOURCES.items()}
json.dump({'props': props}, open(OUT, 'w'), separators=(',', ':'))
print('swordTrellis:', {k: len(v['faces']) for k, v in props.items()})
