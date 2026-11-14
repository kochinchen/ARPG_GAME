"""
盾牌的底稿（設計者 2026-11-14：同劍、弓、杖，用 Blender 建）。

用法：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/shield_base.py -- art/gear/shield_base src/render/figure/gear/shieldBase.json

盾牌的輪廓有圓、鳶、塔、騎士四種、大小隨階級改，所以盾面與盾緣存的是「參數座標」：
  plate：[s（0 = 中心、1 = 輪廓）, a（繞一圈 0～1）, 面（1 = 正面、0 = 背面）]
  rim：  [a（繞一圈 0～1）, b（盾緣截面繞一圈 0～1）]
遊戲端（BlenderShield.ts）依 ArmorPieces 的輪廓把它們擺好；盾心（boss）是一般座標（盾面朝 +X，半徑 1）。
每面明暗一點點隨機（小構面），正面的錘打凹痕用明暗表現。
"""
import bpy, bmesh, json, math, os, random, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['art/gear/shield_base', 'src/render/figure/gear/shieldBase.json']
OUT_DIR, OUT_JSON = argv[0], argv[1]
random.seed(23)

RINGS, ANG = 9, 48
parts = {}

# ── 盾面：正面與背面各一張放射狀網格，外圈用一圈側牆接起來 ──
vs, fs = [], []
for side in (1, 0):
    c = len(vs)
    vs.append((0.0, 0.0, side))
    for i in range(1, RINGS + 1):
        for j in range(ANG):
            vs.append((i / RINGS, j / ANG, side))
    ring = lambda i, j: c + 1 + (i - 1) * ANG + (j % ANG)
    for j in range(ANG):
        f = (c, ring(1, j), ring(1, j + 1))
        fs.append(f if side else f[::-1])
    for i in range(1, RINGS):
        for j in range(ANG):
            f = (ring(i, j), ring(i + 1, j), ring(i + 1, j + 1), ring(i, j + 1))
            fs.append(f if side else f[::-1])
front_edge = lambda j: 1 + (RINGS - 1) * ANG + (j % ANG)
back_edge = lambda j: (1 + RINGS * ANG) + 1 + (RINGS - 1) * ANG + (j % ANG)
for j in range(ANG):
    fs.append((front_edge(j), back_edge(j), back_edge(j + 1), front_edge(j + 1)))
parts['plate'] = (vs, fs, 'mat')

# ── 盾緣：沿輪廓的管子，截面 8 邊 ──
vs, fs = [], []
TUBE = 8
for j in range(ANG * 2):
    for k in range(TUBE):
        vs.append((j / (ANG * 2), k / TUBE, 0.0))
for j in range(ANG * 2):
    for k in range(TUBE):
        a = j * TUBE + k
        b = j * TUBE + (k + 1) % TUBE
        jn = (j + 1) % (ANG * 2)
        fs.append((a, b, jn * TUBE + (k + 1) % TUBE, jn * TUBE + k))
parts['rim'] = (vs, fs, 'rim')

# ── 盾心：半顆切面球（朝 +X），外圈一圈鉚釘的台階 ──
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x < -0.15], context='VERTS')
vs = [(max(v.co.x, 0.0) * 0.6, v.co.y, v.co.z) for v in bm.verts]
fs = [tuple(v.index for v in f.verts) for f in bm.faces]
bm.free()
parts['boss'] = (vs, fs, 'boss')

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob)
tags = ['mat', 'rim', 'boss']
out = {'parts': {}, 'tags': tags}
total = 0
for name, (vs, fs, tag) in parts.items():
    me = bpy.data.meshes.new(name)
    me.from_pydata(vs, [], fs)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    jf = []
    for p in me.polygons:
        # 錘打的凹痕：盾面上一塊塊略暗 / 略亮
        dent = 0.0
        if name == 'plate':
            c = p.center
            dent = 0.1 * math.sin(c.x * 23.0 + c.y * 7.0) * math.cos(c.y * 31.0)
        shade = 0.5 + dent + random.uniform(-0.16, 0.16)
        jf.append([*p.vertices, max(0, min(255, round(shade * 255))), tags.index(tag)])
    out['parts'][name] = {'verts': [[round(c, 4) for c in v.co] for v in me.vertices], 'faces': jf}
    total += len(jf)
os.makedirs(OUT_DIR, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(OUT_DIR, 'shield_base.blend')))
with open(OUT_JSON, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('shield_base: %d faces → %s' % (total, OUT_JSON))
