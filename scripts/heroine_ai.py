"""
AI 生成的女主角模型（例如微軟 TRELLIS 用設計圖四視圖生成的 .glb）→ 接上遊戲用的骨架，存成 .blend 與 .glb。

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/heroine_ai.py -- \
      art/heroine/ai/trellis-1.glb art/heroine

輸出 art/heroine/heroine-ai.blend（可編輯）與 heroine-ai.glb（heroine-3d.html 的「AI 版」）。
步驟：
1. 合併重疊頂點（glTF 會在 UV 接縫把頂點拆開），刪掉離開身體的小碎片（生成時誤抓到的旁邊人物）。
2. 依 T 字姿勢的手臂高度縮放到遊戲尺寸，腳底放在地面、骨盆放在原點，正面朝遊戲的 +Z。
3. 從 heroine.blend 借來同一副骨架（54 根骨頭，名稱與程式版相同），擺成 T 字姿勢後自動綁權重，
   再擺回手放下的靜止姿勢：網頁的待機 / 走路 / T 字動作可以直接帶動。
4. 平面著色（Flat Shading），保留 AI 生成的貼圖顏色。
5. 從 heroine.blend 借來劍與盾牌（掛在 sword / shield 骨頭）。
6. 臉：AI 的眼睛是一團模糊的暗色，貼上清楚的眼睛、眉毛、嘴唇（位置從正面特寫量出來）。
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
src, out_dir = args[0], args[1]
ctx = bpy.context

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ai = [o for o in ctx.scene.objects if o.type == "MESH"][0]
ai.name = "HeroineAI"
ai.data.name = "HeroineAI"
for o in list(ctx.scene.objects):
    if o is not ai and o.type != "MESH":
        if o is ai.parent:
            ai.parent = None
        bpy.data.objects.remove(o)
ai.data.transform(ai.matrix_world)
ai.matrix_world = Matrix.Identity(4)


def components(bm):
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        out.append(comp)
    return out


# ── 1. 合併頂點、刪碎片 ──
bm = bmesh.new()
bm.from_mesh(ai.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.verts.ensure_lookup_table()
bm.verts.index_update()
zs = sorted(v.co.z for v in bm.verts)
zmin = zs[0]
# T 字的手臂高度：兩側最外面（|x| 大）的頂點高度中位數
arm = sorted(v.co.z for v in bm.verts if abs(v.co.x) > 0.28 and v.co.z > zmin + 0.5 * (zs[-1] - zmin))
arm_z = arm[len(arm) // 2]
# 手臂外側、手掌高度以下垂著的碎片（背面那張裁切圖邊緣誤抓到的旁邊人物的手）：T 字時那裡只該有手
junk = [v for v in bm.verts if abs(v.co.x) > 0.36 and v.co.z < arm_z - 0.06]
removed = len(junk)
bmesh.ops.delete(bm, geom=junk, context="VERTS")
for comp in components(bm):
    if len(comp) < 30:
        xs = [v.co.x for v in comp]
        if min(xs) > 0.3 or max(xs) < -0.3:
            bmesh.ops.delete(bm, geom=comp, context="VERTS")
            removed += len(comp)
bm.to_mesh(ai.data)
bm.free()

# ── 2. 縮放與對齊 ──
SHOULDER_Y = 1.41  # 遊戲裡 T 字時手臂中心線的高度（已含粗跟靴抬高）
scale = SHOULDER_Y / (arm_z - zmin)
co = [v.co.copy() for v in ai.data.vertices]
hip_band = [c for c in co if zmin + 0.5 * (arm_z - zmin) < c.z < zmin + 0.62 * (arm_z - zmin)]
cx = sum(c.x for c in hip_band) / len(hip_band)
cy = sum(c.y for c in hip_band) / len(hip_band)
ai.data.transform(Matrix.Diagonal((scale, scale, scale, 1)) @ Matrix.Translation((-cx, -cy, -zmin)))
for p in ai.data.polygons:
    p.use_smooth = False

# ── 3. 骨架：借用 heroine.blend 的 HeroineRig ──
with bpy.data.libraries.load(os.path.join(out_dir, "heroine.blend"), link=False) as (src_data, dst):
    dst.objects = ["HeroineRig"]
rig = dst.objects[0]
ctx.scene.collection.objects.link(rig)
for b in rig.data.bones:
    b.use_deform = b.name != "sword"


def activate(obj, mode="OBJECT"):
    if ctx.object and ctx.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    ctx.view_layer.objects.active = obj
    if mode != "OBJECT":
        bpy.ops.object.mode_set(mode=mode)


def rotate_world(name, rot):
    b = rig.pose.bones[name]
    h = b.head.copy()
    b.matrix = Matrix.Translation(h) @ rot.to_4x4() @ Matrix.Translation(-h) @ b.matrix
    ctx.view_layer.update()


# T 字的角度：依原本（手放下）的骨架算一次，擺回去時用同一組角度反轉
_h = {b.name: b.head_local.copy() for b in rig.data.bones}
T_ANG = {}
for s, k in (("L", 1), ("R", -1)):
    sh, el, wr = _h[f"shoulder{s}"], _h[f"elbow{s}"], _h[f"wrist{s}"]
    upper = math.atan2(abs(el.x - sh.x), sh.z - el.z)
    fore = math.atan2(abs(wr.x - el.x), el.z - wr.z)
    T_ANG.update({f"shoulder{s}": k * (math.pi / 2 - upper), f"elbow{s}": k * (upper - fore), f"hip{s}": k * 0.13, f"ankle{s}": -k * 0.13})


def t_pose(sign):
    """sign = 1 擺成 T 字；-1 擺回原本的姿勢（與網頁「T 字」動作相同的角度）"""
    fwd = Vector((0, -1, 0))  # 遊戲 +Z（正面）在 Blender 是 -Y
    order = ["shoulderL", "shoulderR", "elbowL", "elbowR", "hipL", "hipR", "ankleL", "ankleR"]
    if sign < 0:
        order.reverse()
    for name in order:
        rotate_world(name, Matrix.Rotation(T_ANG[name] * sign, 3, fwd))


def bake_pose_into_rest(mesh_objs):
    for m in mesh_objs:
        activate(m)
        for mod in [x for x in m.modifiers if x.type == "ARMATURE"]:
            bpy.ops.object.modifier_apply(modifier=mod.name)
    activate(rig, "POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")


activate(rig, "POSE")
t_pose(1)
bake_pose_into_rest([])  # 骨架的靜止姿勢暫時變成 T 字，跟 AI 模型一致

# 自動權重（Bone Heat）
activate(ai)
rig.select_set(True)
ctx.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

# 擺回手放下的姿勢，再把它設成靜止姿勢（跟程式版的骨架一樣）
activate(rig, "POSE")
t_pose(-1)
bake_pose_into_rest([ai])
activate(ai)
mod = ai.modifiers.new("Armature", "ARMATURE")
mod.object = rig
ai.parent = rig

# 沒有任何權重的頂點數（Bone Heat 失敗時會很多）
unweighted = sum(1 for v in ai.data.vertices if not any(g.weight > 1e-3 for g in v.groups))

# ── 5. 劍與盾牌：從 heroine.blend 借來（同一副骨架，掛在 sword / shield 骨頭上） ──
with bpy.data.libraries.load(os.path.join(out_dir, "heroine.blend"), link=False) as (src_data, dst):
    dst.objects = [n for n in ("HeroineSword", "HeroineShield") if n in src_data.objects]
for o in dst.objects:
    ctx.scene.collection.objects.link(o)
    o.parent = rig
    for m in o.modifiers:
        if m.type == "ARMATURE":
            m.object = rig
    for p in o.data.polygons:
        p.use_smooth = False

# ── 6. 臉：AI 生成的眼睛只是一團模糊的暗色，貼上清楚的眼睛、眉毛、嘴唇（跟程式版同樣的畫法） ──
# 位置是從正面特寫量出來的（臉的中線 x = 0）
EYE = {"x": 0.042, "z": 1.665, "scale": 1.0}
MOUTH_Z = 1.588
deps = ctx.evaluated_depsgraph_get()


def hit(x, z):
    ok, loc, nrm, idx = ai.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)), depsgraph=deps)
    if not ok:
        raise SystemExit(f"臉上找不到 ({x}, {z})")
    return loc, nrm


def skin_at(x, z):
    """臉上某一點的貼圖顏色（線性色彩），用來調膚色補丁，讓它跟周圍融在一起"""
    ok, loc, nrm, idx = ai.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)), depsgraph=deps)
    poly = ai.data.polygons[idx]
    uv_layer = ai.data.uv_layers.active.data
    u = sum(uv_layer[li].uv.x for li in poly.loop_indices) / poly.loop_total
    v = sum(uv_layer[li].uv.y for li in poly.loop_indices) / poly.loop_total
    img = next(n.image for n in ai.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    w, h = img.size
    px = img.pixels
    i = (min(h - 1, int(v * h)) * w + min(w - 1, int(u * w))) * 4
    srgb = px[i:i + 3]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb) + (1.0,)

def mat(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


face_bm = bmesh.new()
face_mats = []


def flat(mat_name, pts, c, tan, up, n, out):
    if mat_name not in face_mats:
        face_mats.append(mat_name)
    vs = [face_bm.verts.new(c + tan * u + up * v + n * out) for u, v in pts]
    f = face_bm.faces.new(vs)
    f.material_index = face_mats.index(mat_name)
    f.normal_update()
    if f.normal.dot(n) < 0:  # 網頁只畫正面，法線一定要朝外
        f.normal_flip()


# 眼窩重新上色：AI 生成的眼睛是一團模糊的暗色。把眼睛周圍的每一個面直接在貼圖上塗成單一膚色
# （取外圍一圈面的平均色），跟低多邊形的塊面風格一致，再在上面貼清楚的眼睛
img = next(n.image for n in ai.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
W, H = img.size
PX = list(img.pixels)
uvd = ai.data.uv_layers.active.data


def face_uvs(poly):
    return [(uvd[li].uv.x * W, uvd[li].uv.y * H) for li in poly.loop_indices]


def face_color(poly):
    acc = [0.0, 0.0, 0.0]
    pts = face_uvs(poly)
    cu, cv = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    i = (min(H - 1, int(cv)) * W + min(W - 1, int(cu))) * 4
    return PX[i:i + 3]


def fill(poly, rgb):
    pts = face_uvs(poly)
    for t in range(1, len(pts) - 1):
        (x0, y0), (x1, y1), (x2, y2) = pts[0], pts[t], pts[t + 1]
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9:
            continue
        for y in range(max(0, int(min(y0, y1, y2)) - 1), min(H, int(max(y0, y1, y2)) + 2)):
            for x in range(max(0, int(min(x0, x1, x2)) - 1), min(W, int(max(x0, x1, x2)) + 2)):
                px, py = x + 0.5, y + 0.5
                a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den
                b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den
                if a >= -0.02 and b >= -0.02 and a + b <= 1.02:
                    i = (y * W + x) * 4
                    PX[i:i + 3] = rgb


repainted = 0
for s in (1, -1):
    ex, ez = EYE["x"] * s, EYE["z"]
    inner, ring = [], []
    for poly in ai.data.polygons:
        c = poly.center
        if poly.normal.y > -0.3:
            continue
        d = ((c.x - ex) / 0.03) ** 2 + ((c.z - ez) / 0.017) ** 2
        if d < 1:
            inner.append(poly)
        elif d < 2.6 and c.z < ez:  # 眼睛下方的臉頰當膚色樣本
            ring.append(poly)
    # 只取像皮膚的顏色（偏紅、夠亮），排除垂在臉旁的頭髮；再取較亮的一半
    cols = [c for c in (face_color(p) for p in ring) if c[0] > 0.45 and c[0] > c[1] > c[2]]
    cols.sort(key=lambda c: -sum(c))
    cols = cols[: max(1, len(cols) // 2)] or [[0.85, 0.66, 0.55]]
    rgb = [sum(c[i] for c in cols) / len(cols) for i in range(3)]
    print("skin sample", s, [round(x, 3) for x in rgb], len(cols))
    for poly in inner:
        fill(poly, rgb)
    repainted += len(inner)
img.pixels[:] = PX
img.update()
img.pack()

for s in (1, -1):
    c, n = hit(EYE["x"] * s, EYE["z"])
    n = Vector((n.x, n.y, 0)).normalized().lerp(Vector((0, -1, 0)), 0.5).normalized()
    up = Vector((0, 0, 1))
    tan = up.cross(n).normalized()
    if tan.x * s < 0:
        tan = -tan  # tan 指向太陽穴
    k = EYE["scale"]
    # 杏眼：細長、上眼皮重、虹膜佔大部分，眼白只露出兩側一點（參考頭部特寫）
    sc = lambda pts: [(u * k, v * k * 0.62) for u, v in pts]
    sb = lambda pts: [(u * k, v * k) for u, v in pts]
    hexa = lambda cu, cv, r: [(cu + math.cos(i / 6 * math.tau) * r, cv + math.sin(i / 6 * math.tau) * r * 0.62) for i in range(6)]
    flat("aiEyeSocket", sc([(-0.021, 0.0), (-0.013, 0.011), (0.009, 0.0135), (0.025, 0.007), (0.016, -0.007), (-0.012, -0.008)]), c, tan, up, n, 0.003)
    flat("eyeWhite", sc([(-0.0165, -0.001), (-0.008, 0.0058), (0.006, 0.0068), (0.0175, 0.003), (0.008, -0.0045), (-0.008, -0.0048)]), c, tan, up, n, 0.0036)
    flat("iris", [(u * k, v * k) for u, v in hexa(0.0005, 0.0006, 0.0062)], c, tan, up, n, 0.0042)
    flat("eye", [(u * k, v * k) for u, v in hexa(0.0005, 0.0006, 0.0028)], c, tan, up, n, 0.0047)
    flat("eye", sc([(-0.0172, -0.0008), (-0.008, 0.0062), (0.007, 0.0072), (0.0185, 0.0035), (0.0195, 0.0068), (0.007, 0.0108), (-0.008, 0.0098), (-0.0175, 0.0015)]), c, tan, up, n, 0.0052)
    flat("eyeWhite", [(u * k, v * k) for u, v in [(0.0022, 0.0018), (0.0034, 0.0022), (0.0027, 0.001)]], c, tan, up, n, 0.0056)
    # 眉毛：粗、眉頭壓低靠近眼睛，眉峰在外側
    flat("hairDark", sb([(-0.02, 0.0085), (-0.019, 0.0145), (0.008, 0.0185), (0.026, 0.0125), (0.009, 0.0128), (-0.006, 0.0112)]), c, tan, up, n, 0.0065)
# 嘴唇
c, n = hit(0.0, MOUTH_Z)
n = Vector((0, -1, 0))
tan, up = Vector((1, 0, 0)), Vector((0, 0, 1))
flat("lipDark", [(-0.021, 0.0), (-0.008, 0.0045), (0, 0.0028), (0.008, 0.0045), (0.021, 0.0), (0, 0.0006)], c, tan, up, n, 0.004)
flat("lip", [(-0.017, -0.0004), (0, -0.0008), (0.017, -0.0004), (0.008, -0.0062), (-0.008, -0.0062)], c, tan, up, n, 0.004)

face = bpy.data.meshes.new("HeroineAIFace")
face_bm.to_mesh(face)
face_bm.free()
for m in face_mats:
    face.materials.append(mat(m))
COLORS = {"aiEyeSocket": (0.36, 0.2, 0.15, 1), "eyeWhite": (0.78, 0.72, 0.62, 1), "iris": (0.14, 0.05, 0.02, 1),
          "eye": (0.02, 0.01, 0.005, 1), "hairDark": (0.2, 0.025, 0.02, 1), "lipDark": (0.27, 0.06, 0.05, 1), "lip": (0.45, 0.14, 0.11, 1)}
for m in face.materials:
    m.diffuse_color = COLORS.get(m.name, (1, 0, 1, 1))
    if m.node_tree:
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = m.diffuse_color
fo = bpy.data.objects.new("HeroineAIFace", face)
ctx.scene.collection.objects.link(fo)
fo.parent = rig
fo.vertex_groups.new(name="head").add(list(range(len(face.vertices))), 1.0, "REPLACE")
fm = fo.modifiers.new("Armature", "ARMATURE")
fm.object = rig

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "heroine-ai.blend"))
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(
    filepath=os.path.join(out_dir, "heroine-ai.glb"),
    export_format="GLB",
    export_yup=True,
    export_skins=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_apply=False,
)
print(f"heroine-ai: 刪除碎片 {removed} 頂點，縮放 {scale:.3f}，手臂高 {arm_z:.3f}，"
      f"頂點 {len(ai.data.vertices)}，面 {len(ai.data.polygons)}，沒有權重的頂點 {unweighted}，眼窩重塗 {repainted} 面")
