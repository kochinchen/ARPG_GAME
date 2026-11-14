"""
弓與法杖的底稿（設計者 2026-11-14：同劍，不用 TRELLIS，直接用 Blender 建）。

用法：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/bow_staff_base.py -- art/gear/bow_staff_base src/render/figure/weapons

輸出：
  <資料夾>/bow_base.blend、staff_base.blend（可編輯；每個零件一個物件）
  <json 資料夾>/bowBase.json、staffBase.json：{ parts: { 零件: { verts, faces: [a, b, c, 明暗 0～255, 標籤] } }, tags }

弓臂、杖身會隨階級改變長短與彎度，所以存的是「參數座標」：
  弓臂 limb：[t（沿弓臂 0 = 握把端、1 = 弓梢）, 寬（×厚度）, 深（×厚度，+ = 弓背）]；遊戲端沿 WeaponParts.bow 同樣的折線擺放
  杖身 shaft：[t（0 = 杖尾、1 = 杖頭端）, x, z]；遊戲端沿 Y 擺放
其他零件（弓的握把 / 弓身中段 / 弓梢套，杖的杖尾、套環、圓頭、箍）是一般座標（遊戲單位，同 WeaponParts：弓沿 ±Y、弓背 +Z；杖頭在 -Y）。
每個零件都切成小三角面，明暗是每面一點點隨機，遊戲端依名次對到色票。
"""
import bpy, bmesh, json, math, os, random, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['art/gear/bow_staff_base', 'src/render/figure/weapons']
OUT_DIR, JSON_DIR = argv[0], argv[1]
random.seed(11)


def ring_mesh(rings, profile_of, closed_ends=True):
    """rings：每一圈的參數 t；profile_of(t) 回傳這一圈的點 [(a, b, c)]（同樣點數）"""
    vs, fs = [], []
    n = None
    for t in rings:
        prof = profile_of(t)
        n = len(prof)
        vs += prof
    m = len(rings)
    for i in range(m - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            fs.append((a, b, b + n, a + n))
    if closed_ends:
        for end, rev in ((0, True), (m - 1, False)):
            c = len(vs)
            pts = vs[end * n:(end + 1) * n]
            vs.append(tuple(sum(p[k] for p in pts) / n for k in range(3)))
            for j in range(n):
                a, b = end * n + j, end * n + (j + 1) % n
                fs.append((c, b, a) if rev else (c, a, b))
    return vs, fs


def lathe(z0, z1, rings, sides, radius, axis='y', wrap=None, phase=0.0):
    """沿 axis 的旋轉體；radius(k, a) 回傳半徑；wrap = 螺旋皮條的圈距"""
    def prof(k):
        y = z0 + (z1 - z0) * k
        pts = []
        for s in range(sides):
            a = phase + 2 * math.pi * s / sides
            r = radius(k, a)
            if wrap:
                ph = (a / (2 * math.pi) + (y - z0) / wrap) % 1
                r += 0.06 if ph < 0.45 else -0.02
            pts.append((r * math.cos(a), y, r * math.sin(a)))
        return pts
    return ring_mesh([i / rings for i in range(rings + 1)], prof)


def icosphere(r, center, scale=(1, 1, 1), sub=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    vs = [(center[0] + v.co.x * scale[0], center[1] + v.co.y * scale[1], center[2] + v.co.z * scale[2]) for v in bm.verts]
    fs = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return vs, fs


def export(name, parts, out_json, param_parts=()):
    """parts：名稱 → (verts, faces, tag)；param_parts 的 verts 是參數座標（只輸出，不放進 .blend 的形狀）"""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    tags = sorted({p[2] for p in parts.values()})
    out = {'parts': {}, 'tags': tags}
    total = 0
    for pname, (vs, fs, tag) in parts.items():
        me = bpy.data.meshes.new(pname)
        me.from_pydata(vs, [], fs)
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        if pname not in param_parts:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY')
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(pname, me)
        bpy.context.scene.collection.objects.link(ob)
        jf = []
        for p in me.polygons:
            shade = 0.5 + 0.15 * (p.normal.z * 0.6 + p.normal.x * 0.4) + random.uniform(-0.17, 0.17)
            jf.append([*p.vertices, max(0, min(255, round(shade * 255))), tags.index(tag)])
        out['parts'][pname] = {'verts': [[round(c, 4) for c in v.co] for v in me.vertices], 'faces': jf}
        total += len(jf)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(OUT_DIR, name + '_base.blend')))
    with open(out_json, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('%s_base: %d faces → %s' % (name, total, out_json))


os.makedirs(OUT_DIR, exist_ok=True)

# ═══════════════ 弓 ═══════════════
# 弓臂截面（寬 X、深 Z，單位 = 厚度）：扁的六邊形，弓背中間有一道稜線；寬度從握把端 1 收到弓梢 0.45
LIMB_RINGS = 30


def limb_profile(t):
    w = 0.95 * (1 - 0.55 * t)
    d = 0.5 * (1 - 0.35 * t)
    # 握把端與弓梢前一點，弓臂背面加一點厚（像疊層的弓）
    bulge = 0.12 * math.exp(-((t - 0.06) / 0.08) ** 2) + 0.08 * math.exp(-((t - 0.88) / 0.05) ** 2)
    pts = [(w, 0, 0), (w * 0.62, 0, d * 0.75 + bulge), (0, 0, d + bulge * 1.4), (-w * 0.62, 0, d * 0.75 + bulge), (-w, 0, 0), (-w * 0.6, 0, -d * 0.7), (0, 0, -d * 0.8), (w * 0.6, 0, -d * 0.7)]
    # 參數座標：[t, 寬, 深]
    return [(t, x, z) for x, _, z in pts]


bow_parts = {}
vs, fs = ring_mesh([i / LIMB_RINGS for i in range(LIMB_RINGS + 1)], limb_profile)
bow_parts['limb'] = (vs, fs, 'limb')
# 弓身中段（握把上下的加厚部分）：y ±3.4，往弓背凸，前面有箭台
riser = lathe(-3.4, 3.4, 12, 8, lambda k, a: (0.78 - 0.3 * abs(k - 0.5) * 2) * (1.0 + 0.2 * max(0.0, math.sin(a))), phase=math.pi / 8)
bow_parts['riser'] = (riser[0], riser[1], 'limb')
# 握把：皮革螺旋纏繞
grip = lathe(-1.8, 1.8, 16, 10, lambda k, a: 0.84 + 0.05 * math.sin(math.pi * k), wrap=0.8)
bow_parts['grip'] = (grip[0], grip[1], 'grip')
# 箭台：握把上方往前（-Z，弓弦那側）突出的小塊
shelf = lathe(1.8, 2.5, 2, 6, lambda k, a: 0.55 - 0.15 * k, phase=math.pi / 6)
bow_parts['shelf'] = ([(x, y, z - 0.75) for x, y, z in shelf[0]], shelf[1], 'trim')
# 弓梢套（掛弦的地方）：短的切面錐，局部座標（沿 +Y 是往弓梢外）
nock = lathe(-0.6, 1.1, 4, 8, lambda k, a: 0.62 * (1 - 0.75 * k) + 0.12 * math.sin(math.pi * k), phase=math.pi / 8)
bow_parts['nock'] = (nock[0], nock[1], 'trim')
export('bow', bow_parts, os.path.join(JSON_DIR, 'bowBase.json'), param_parts=('limb',))

# ═══════════════ 法杖 ═══════════════
SHAFT_RINGS = 40


def shaft_profile(t):
    # 木頭杖身：杖尾細、杖頭粗，兩個木節，截面八角並沿杖身慢慢扭轉（構面像木紋）
    r = 0.5 + 0.12 * t + 0.09 * math.exp(-((t - 0.33) / 0.025) ** 2) + 0.08 * math.exp(-((t - 0.68) / 0.025) ** 2)
    twist = t * 1.6
    pts = []
    for s in range(8):
        a = twist + 2 * math.pi * s / 8
        rr = r * (1 + 0.05 * math.sin(3 * a + t * 20))
        pts.append((t, rr * math.cos(a), rr * math.sin(a)))
    return pts


staff_parts = {}
vs, fs = ring_mesh([i / SHAFT_RINGS for i in range(SHAFT_RINGS + 1)], shaft_profile)
staff_parts['shaft'] = (vs, fs, 'shaft')
# 杖尾：金屬尖頭（局部：y = 0 是杖尾端，往 +Y 收尖）
butt = lathe(-0.6, 1.5, 5, 8, lambda k, a: 0.62 * (1 - 0.85 * k ** 1.4), phase=math.pi / 8)
staff_parts['butt'] = (butt[0], butt[1], 'metal')
# 杖頭的套環（局部：y = 0 是杖身頂端，往 -Y 是杖頭）
collar = lathe(0.8, -0.7, 4, 10, lambda k, a: 0.78 + 0.32 * k + (0.08 if 0.3 < k < 0.7 else 0), phase=math.pi / 10)
staff_parts['collar'] = (collar[0], collar[1], 'metal')
# 圓頭（knob）：切面的蛋形木頭（局部：中心在 y = -0.6）
knob = icosphere(1.3, (0, -0.6, 0), (1, 1.2, 1))
staff_parts['knob'] = (knob[0], knob[1], 'shaft')
# 箍（bands）：一圈金屬（局部：中心在 y = 0）
band = lathe(0.3, -0.3, 2, 10, lambda k, a: 0.74 + 0.06 * math.sin(math.pi * k), phase=math.pi / 10)
staff_parts['band'] = (band[0], band[1], 'metal')
export('staff', staff_parts, os.path.join(JSON_DIR, 'staffBase.json'), param_parts=('shaft',))
