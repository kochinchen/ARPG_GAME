"""
劍的底稿（設計者 2026-11-14：劍的形狀單純，不用 TRELLIS，直接用 Blender 照 art/gear/sword_base/multiview 的正面 / 側面建）。

用法：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/sword_base.py -- art/gear/sword_base src/render/figure/weapons/swordBase.json

輸出：
  <資料夾>/sword_base.blend（可編輯；每個零件一個物件）
  <json>：{ meta, parts: { 零件: { verts, faces: [a, b, c, 明暗 0～255] } } }

座標：Blender 的 Z 是劍的軸（劍尖朝 +Z），X 是刃寬，Y 是厚度；單位同遊戲 WeaponParts（握把 z -2.7～1.3、護手 z 1.8、劍身從 z 2.4 開始）。
遊戲端 TrellisSwords.ts 轉成遊戲座標（X = 厚度、Y = -Z、Z = 刃寬），再依 SwordSpec 拉長、加寬、換護手與柄頭、換色。
每個零件都切成小三角面（設計者偏好細密的小構面），明暗是每面一點點隨機變化，遊戲端依名次對到色票。
"""
import bpy, bmesh, json, math, os, random, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['art/gear/sword_base', 'src/render/figure/weapons/swordBase.json']
OUT_DIR, OUT_JSON = argv[0], argv[1]
random.seed(7)

# ── 尺寸（遊戲單位） ──
BLADE_START = 2.4      # 劍身從這裡開始（護手下緣）
BLADE_LEN = 20.0       # 劍身（不含劍尖）
TIP_LEN = 3.4          # 劍尖
HALF_W = 1.4           # 劍身半寬
THICK = 0.36           # 劍身半厚（中脊）
NARROW = 0.85          # 劍身到劍尖前收窄到的比例
GUARD_Z = 1.8          # 護手中心
GUARD_HALF = 3.0        # 護手半長（設計稿：約劍身寬的 2 倍多）
GRIP = (-2.7, 1.3)     # 握把
POMMEL_Z = -3.75       # 柄頭中心
POMMEL_R = 1.0

parts = {}  # 名稱 → (verts, quads/tris, 標籤 list)


def add(name, verts, faces, tags=None):
    parts[name] = (verts, faces, tags or [name] * len(faces))


# ── 劍身：沿 Z 一圈圈的截面（菱形斷面＋中央血槽），最後收成劍尖 ──
def blade_profile(w, t, groove):
    """截面（從 +X 刃緣逆時針）；groove = 血槽深度比例（0 = 沒有血槽，中脊是一直線）"""
    k = min(1.0, w / (HALF_W * NARROW))  # 劍尖收窄時，中間的點跟著收
    fw = (0.24 + 0.06 * groove) * k  # 血槽半寬
    top = [(w, 0.0), (w * 0.72, t * 0.42), (w * 0.45, t * 0.8), (fw + 0.1 * k, t * 0.92), (fw, t * (0.92 - 0.42 * groove)), (0.0, t * (0.92 - 0.45 * groove))]
    top += [(-x, y) for x, y in reversed(top[1:-1])] + [(-w, 0.0)]
    bottom = [(x, -y) for x, y in reversed(top[1:-1])]
    return top + bottom


RINGS = 34
TIP_RINGS = 8
verts, faces, tags = [], [], []
ring_n = None
for i in range(RINGS + TIP_RINGS + 1):
    if i <= RINGS:
        k = i / RINGS
        z = BLADE_START + BLADE_LEN * k
        w = HALF_W * (1 - (1 - NARROW) * k)
        t = THICK * (1 - 0.1 * k)
        groove = 1.0 if k < 0.72 else max(0.0, 1 - (k - 0.72) / 0.14)
    else:
        k = (i - RINGS) / TIP_RINGS
        z = BLADE_START + BLADE_LEN + TIP_LEN * k
        # 劍尖：寬度幾乎直線收成尖（微凸），厚度跟著收
        w = max(0.02, HALF_W * NARROW * (1 - k) * (1 + 0.35 * k))
        t = max(0.015, THICK * 0.9 * (1 - k) ** 0.85)
        groove = 0.0
    prof = blade_profile(w, t, groove)
    ring_n = len(prof)
    for x, y in prof:
        verts.append((x, y, z))
n = ring_n
# 截面中間那段（血槽與兩側的肩）：上面 3～7、下面 13～17
CORE = {3, 4, 5, 6, 7, 13, 14, 15, 16, 17}
for i in range(RINGS + TIP_RINGS):
    for j in range(n):
        a, b = i * n + j, i * n + (j + 1) % n
        c, d = a + n, b + n
        faces.append((a, b, d, c))
        # 標籤：刃緣（兩側最外面的斜面）、血槽、平面
        jj = min(j, (j + 1) % n)
        x0, x1 = verts[a][0], verts[b][0]
        if abs(x0) > 0.5 * abs(verts[i * n][0]) and abs(x1) > 0.5 * abs(verts[i * n][0]) and min(abs(verts[a][1]), abs(verts[b][1])) < THICK * 0.5:
            tags.append('edge')
        elif abs(x0) <= 0.31 and abs(x1) <= 0.31 and i < RINGS * 0.86:
            tags.append('fuller')
        elif j in CORE and (j + 1) % n in CORE and i < RINGS + TIP_RINGS - 1:
            # 血槽以上到劍尖的中間那條（平常同劍身；裂刃時一路發光到劍尖）
            tags.append('core')
        else:
            tags.append('blade')
# 劍根封口（護手蓋住，但留著讓網格封閉）
root = len(verts)
verts.append((0.0, 0.0, BLADE_START - 0.05))
for j in range(n):
    faces.append((root, (j + 1) % n, j))
    tags.append('blade')
add('blade', verts, faces, tags)


# ── 護手：八角截面沿 X 掃過，兩端往柄頭方向（-Z）微翹並加粗；中央一塊方形護片 ──
def sweep(points, radii, sides=8, phase=math.pi / 8, tag='guard'):
    """沿折線掃出管子；radii[i] = (Y 方向半徑, 掃描平面內的半徑)"""
    vs, fs = [], []
    for i, p in enumerate(points):
        # 切線
        q0 = points[max(0, i - 1)]
        q1 = points[min(len(points) - 1, i + 1)]
        tx, tz = q1[0] - q0[0], q1[2] - q0[2]
        L = math.hypot(tx, tz) or 1
        nx, nz = -tz / L, tx / L  # 掃描平面內的法線
        ry, rn = radii[i]
        for s in range(sides):
            a = phase + 2 * math.pi * s / sides
            vs.append((p[0] + nx * rn * math.cos(a), p[1] + ry * math.sin(a), p[2] + nz * rn * math.cos(a)))
    m = len(points)
    for i in range(m - 1):
        for s in range(sides):
            a, b = i * sides + s, i * sides + (s + 1) % sides
            fs.append((a, b, b + sides, a + sides))
    # 兩端封口
    for end, rev in ((0, True), (m - 1, False)):
        c = len(vs)
        p = points[end]
        vs.append(p)
        for s in range(sides):
            a, b = end * sides + s, end * sides + (s + 1) % sides
            fs.append((c, b, a) if rev else (c, a, b))
    return vs, fs, [tag] * len(fs)


GN = 24
pts, rad = [], []
for i in range(GN + 1):
    u = -1 + 2 * i / GN
    au = abs(u)
    lift = 0.0 if au < 0.55 else -0.75 * ((au - 0.55) / 0.45) ** 2  # 兩端往柄頭翹
    thick = 0.42 + 0.16 * max(0.0, (au - 0.75) / 0.25) - 0.08 * max(0.0, (au - 0.94) / 0.06)  # 兩端加粗、末端收一點
    pts.append((u * GUARD_HALF, 0.0, GUARD_Z + lift))
    rad.append((thick * 1.1, thick))
add('guard', *sweep(pts, rad))


def box(cx, cy, cz, hx, hy, hz, tag, bevel=0.18):
    """斜角方塊（八角柱的感覺）：上下兩層，每層 8 點"""
    vs, fs = [], []
    for z in (cz - hz, cz - hz + bevel, cz + hz - bevel, cz + hz):
        inset = bevel if z in (cz - hz, cz + hz) else 0.0
        for x, y in ((hx - bevel, hy), (hx, hy - bevel), (hx, -hy + bevel), (hx - bevel, -hy), (-hx + bevel, -hy), (-hx, -hy + bevel), (-hx, hy - bevel), (-hx + bevel, hy)):
            sx = x - math.copysign(inset, x) * 0.5
            sy = y - math.copysign(inset, y) * 0.5
            vs.append((cx + sx, cy + sy, z))
    for i in range(3):
        for s in range(8):
            a, b = i * 8 + s, i * 8 + (s + 1) % 8
            fs.append((a, b, b + 8, a + 8))
    fs.append(tuple(reversed(range(8))))
    fs.append(tuple(range(24, 32)))
    return vs, fs, [tag] * len(fs)


add('guard_block', *box(0, 0, GUARD_Z, 0.95, 0.62, 0.62, 'guard'))


# ── 握把：皮革纏繞（螺旋的凸起），兩端金屬箍 ──
def lathe(z0, z1, rings, sides, radius, tag, wrap=False):
    vs, fs, ts = [], [], []
    for i in range(rings + 1):
        k = i / rings
        z = z0 + (z1 - z0) * k
        for s in range(sides):
            a = 2 * math.pi * s / sides
            r = radius(k)
            if wrap:
                # 螺旋皮條：沿 z 每 0.9 繞一圈，皮條凸起
                ph = (a / (2 * math.pi) + (z - z0) / 0.9) % 1
                r += 0.07 if ph < 0.45 else -0.02
            vs.append((r * math.cos(a), r * math.sin(a), z))
    for i in range(rings):
        for s in range(sides):
            a, b = i * sides + s, i * sides + (s + 1) % sides
            fs.append((a, b, b + sides, a + sides))
            if wrap:
                ph = ((2 * math.pi * s / sides) / (2 * math.pi) + (z0 + (z1 - z0) * i / rings - z0) / 0.9) % 1
                ts.append('wrap' if ph < 0.45 else 'grip')
            else:
                ts.append(tag)
    for end, rev in ((0, True), (rings, False)):
        c = len(vs)
        vs.append((0, 0, z0 + (z1 - z0) * end / rings))
        for s in range(sides):
            a, b = end * sides + s, end * sides + (s + 1) % sides
            fs.append((c, b, a) if rev else (c, a, b))
            ts.append('grip' if wrap else tag)
    return vs, fs, ts


add('grip', *lathe(GRIP[0], GRIP[1], 28, 12, lambda k: 0.6 + 0.04 * math.sin(math.pi * k), 'grip', wrap=True))
add('collar_top', *lathe(GRIP[1] - 0.05, GUARD_Z - 0.55, 2, 10, lambda k: 0.74, 'collar'))
add('collar_pommel', *lathe(-3.0, GRIP[0] + 0.05, 2, 10, lambda k: 0.78 - 0.08 * k, 'collar'))

# ── 柄頭：切面球（icosphere 細分 2 次） ──
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=2, radius=POMMEL_R)
pv = [(v.co.x, v.co.y, v.co.z * 1.05 + POMMEL_Z) for v in bm.verts]
pf = [tuple(v.index for v in f.verts) for f in bm.faces]
bm.free()
add('pommel', pv, pf, ['pommel'] * len(pf))


# ── 建成 Blender 物件、三角化、輸出 ──
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob)
mats = {}
PALETTE = {'blade': (0.62, 0.64, 0.67), 'edge': (0.85, 0.87, 0.9), 'fuller': (0.42, 0.44, 0.47), 'guard': (0.33, 0.34, 0.36), 'collar': (0.3, 0.31, 0.33), 'pommel': (0.36, 0.37, 0.39), 'grip': (0.3, 0.13, 0.09), 'wrap': (0.4, 0.17, 0.11), 'core': (0.6, 0.62, 0.65)}
for tag, rgb in PALETTE.items():
    m = bpy.data.materials.new(tag)
    m.diffuse_color = (*rgb, 1)
    mats[tag] = m
TAGS = list(PALETTE)

out = {'meta': {'bladeStart': BLADE_START, 'bladeLength': BLADE_LEN, 'tipLength': TIP_LEN, 'halfWidth': HALF_W, 'thickness': THICK, 'narrow': NARROW, 'guardZ': GUARD_Z, 'guardHalf': GUARD_HALF, 'pommelZ': POMMEL_Z, 'pommelR': POMMEL_R}, 'parts': {}}
total = 0
for name, (vs, fs, ts) in parts.items():
    me = bpy.data.meshes.new(name)
    me.from_pydata(vs, [], fs)
    me.update()
    for tag in TAGS:
        me.materials.append(mats[tag])
    for poly, tag in zip(me.polygons, ts):
        poly.material_index = TAGS.index(tag)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.calc_loop_triangles()
    jv = [[round(c, 4) for c in v.co] for v in me.vertices]
    jf = []
    for p in me.polygons:
        tag = TAGS[p.material_index]
        # 明暗：每面一點點隨機（小構面），朝 +Y / +X 的面略亮
        shade = 0.5 + 0.18 * (p.normal.y * 0.6 + p.normal.x * 0.4) + random.uniform(-0.17, 0.17)
        jf.append([*p.vertices, max(0, min(255, round(shade * 255))), TAGS.index(tag)])
    out['parts'][name] = {'verts': jv, 'faces': jf}
    total += len(jf)
out['tags'] = TAGS

os.makedirs(OUT_DIR, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(OUT_DIR, 'sword_base.blend')))
with open(OUT_JSON, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('sword_base: %d faces → %s' % (total, OUT_JSON))
