"""
v13：把 TRELLIS 用四張頭像（女主角設計圖/女主角頭像-*.png）生成的頭，換到 AI 版女主角（heroine-ai.blend）身上。

  /Applications/Blender.app/Contents/MacOS/Blender --background art/heroine/heroine-ai.blend \
      --python scripts/heroine_ai_head.py -- art/heroine/ai/trellis-head-1.glb art/heroine

步驟：
1. 匯入新頭、合併重疊頂點、減面到約 HEAD_FACES 個三角形（遊戲每個面一個顏色，面太多會拖慢）。
2. 切掉生成時一起出現的黑色衣領（下巴以下、正面與兩側的深色面）；垂到背後的馬尾保留。
3. 依「眼睛到下巴」的距離縮放，眼睛對到原本頭上眼睛的位置。
4. 刪掉身體上原本的頭（含頭髮、馬尾）與臉上貼的眼睛，新頭併進身體，權重給 head 骨頭（脖子那一圈漸漸交給 neck）。
存回 heroine-ai.blend 與 heroine-ai.glb；之後執行 heroine_ai_game.py 更新遊戲資料。
"""
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
src, out_dir = args[0], args[1]
ctx = bpy.context
HEAD_FACES = 5000
# 原本 AI 頭上的位置（公尺，Blender 座標）：眼睛中心高度、眼睛到下巴、臉的正面
OLD_EYE_Z, OLD_EYE_CHIN, OLD_FRONT_Y = 1.665, 0.11, -0.145
# 新頭（TRELLIS 輸出的座標）上量到的：眼睛高度、下巴高度（從正面渲染量出）
NEW_EYE_Z, NEW_CHIN_Z = 0.094, -0.137

body = bpy.data.objects["HeroineAI"]
rig = bpy.data.objects["HeroineRig"]


def activate(obj, mode="OBJECT"):
    if ctx.object and ctx.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    ctx.view_layer.objects.active = obj
    if mode != "OBJECT":
        bpy.ops.object.mode_set(mode=mode)


# ── 1. 匯入、合併、減面 ──
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=src)
new = [o for o in bpy.data.objects if o not in before]
head = [o for o in new if o.type == "MESH"][0]
for o in new:
    if o is not head:
        bpy.data.objects.remove(o)
head.data.transform(head.matrix_world)
head.matrix_world = Matrix.Identity(4)
head.parent = None
head.name = "HeroineHead"
bm = bmesh.new()
bm.from_mesh(head.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(head.data)
bm.free()
activate(head)
dec = head.modifiers.new("Decimate", "DECIMATE")
dec.ratio = min(1.0, HEAD_FACES / max(1, len(head.data.polygons)))
dec.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier="Decimate")

# ── 2. 切掉衣領 ──
img = next(n.image for n in head.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
W, H = img.size
PX = img.pixels[:]
uvd = head.data.uv_layers.active.data


def color(p):
    u = sum(uvd[li].uv.x for li in p.loop_indices) / p.loop_total
    v = sum(uvd[li].uv.y for li in p.loop_indices) / p.loop_total
    i = (min(H - 1, int(v * H)) * W + min(W - 1, int(u * W))) * 4
    return PX[i:i + 3]


CUT_Z = NEW_CHIN_Z - 0.03
bm = bmesh.new()
bm.from_mesh(head.data)
bm.faces.ensure_lookup_table()
polys = head.data.polygons
drop = []
for f in bm.faces:
    c = f.calc_center_median()
    if c.z > CUT_Z:
        continue
    r, g, b = color(polys[f.index])
    behind = c.y > 0.05  # 背後（Blender +Y）的馬尾保留
    dark = r < 0.16 and g < 0.12  # 衣領是近乎全黑；頭髮是暗紅
    reddish = r > g * 1.8 and r > 0.12
    if not behind and (dark or not reddish):
        drop.append(f)
    elif c.z < CUT_Z - 0.12 and not reddish:
        drop.append(f)
bmesh.ops.delete(bm, geom=drop, context="FACES")
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
bm.to_mesh(head.data)
bm.free()

# ── 3. 縮放、對齊 ──
s = OLD_EYE_CHIN / (NEW_EYE_Z - NEW_CHIN_Z)
eye_band = [v.co for v in head.data.vertices if abs(v.co.z - NEW_EYE_Z) < 0.03 and abs(v.co.x) < 0.04]
front_y = min(c.y for c in eye_band)
head.data.transform(Matrix.Translation((0, OLD_FRONT_Y, OLD_EYE_Z)) @ Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation((0, -front_y, -NEW_EYE_Z)))
for p in head.data.polygons:
    p.use_smooth = False

# ── 4. 刪掉身體上原本的頭與臉部貼片，新頭併進身體 ──
gi = {g.name: g.index for g in body.vertex_groups}
HEAD_BONES = {"head", "pony0", "pony1", "pony2", "pony3"}
bm = bmesh.new()
bm.from_mesh(body.data)
dl = bm.verts.layers.deform.verify()
head_ids = {gi[n] for n in HEAD_BONES if n in gi}


def dominant_head(v):
    w = v[dl]
    if not w:
        return False
    k = max(w.keys(), key=lambda k: w[k])
    return k in head_ids


old = [f for f in bm.faces if sum(dominant_head(v) for v in f.verts) >= 2]
bmesh.ops.delete(bm, geom=old, context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.to_mesh(body.data)
bm.free()
face = bpy.data.objects.get("HeroineAIFace")
if face:
    bpy.data.objects.remove(face)

# 新頭的權重：head = 1；脖子那一圈（眼睛下方 0.13～0.17 m）漸漸交給 neck，接縫跟著脖子動
vg_head = head.vertex_groups.new(name="head")
vg_neck = head.vertex_groups.new(name="neck")
for v in head.data.vertices:
    t = max(0.0, min(1.0, ((OLD_EYE_Z - 0.13) - v.co.z) / 0.04))
    if v.co.y > OLD_FRONT_Y + 0.17:  # 背後垂下的馬尾一律跟著頭
        t = 0.0
    vg_head.add([v.index], 1 - t, "REPLACE")
    if t > 0:
        vg_neck.add([v.index], t, "REPLACE")
head_faces = len(head.data.polygons)
activate(body)
head.select_set(True)
ctx.view_layer.objects.active = body
bpy.ops.object.join()
for p in body.data.polygons:
    p.use_smooth = False

# ── 5. 臉：減面後眼睛會糊成暗色的細縫，貼上清楚的眼睛與眉毛（照頭部參考圖：杏眼、棕色大虹膜、粗的上眼線、眉毛往外上揚） ──
import math
EYE_X, EYE_Z = 0.037, OLD_EYE_Z
deps = ctx.evaluated_depsgraph_get()
TEXS = {}
for mi, m in enumerate(body.data.materials):
    im = next((n.image for n in m.node_tree.nodes if n.type == "TEX_IMAGE"), None) if m and m.node_tree else None
    if im:
        TEXS[mi] = (im.size[0], im.size[1], im.pixels[:])
uvb = body.data.uv_layers.active.data


def body_color(poly):
    if poly.material_index not in TEXS:
        return (0, 0, 0)
    W2, H2, P2 = TEXS[poly.material_index]
    u = sum(uvb[li].uv.x for li in poly.loop_indices) / poly.loop_total
    v = sum(uvb[li].uv.y for li in poly.loop_indices) / poly.loop_total
    i = (min(H2 - 1, int(v * H2)) * W2 + min(W2 - 1, int(u * W2))) * 4
    return P2[i:i + 3]


def hit(x, z):
    """從正前方打到臉上；穿過擋在前面的頭髮"""
    origin = Vector((x, -1.0, z))
    for _ in range(8):
        ok, loc, nrm, idx = body.ray_cast(origin, Vector((0, 1, 0)), depsgraph=deps)
        if not ok:
            raise SystemExit(f"臉上找不到 ({x}, {z})")
        r, g, b = body_color(body.data.polygons[idx])
        if not (r > 0.2 and g < r * 0.55):
            return loc, nrm
        origin = loc + Vector((0, 1e-4, 0))
    raise SystemExit("一直打到頭髮")


fbm = bmesh.new()
fmats = []


def flat(mat_name, pts, c, tan, up, n, out):
    if mat_name not in fmats:
        fmats.append(mat_name)
    vs = [fbm.verts.new(c + tan * u + up * v + n * out) for u, v in pts]
    f = fbm.faces.new(vs)
    f.material_index = fmats.index(mat_name)
    f.normal_update()
    if f.normal.dot(n) < 0:
        f.normal_flip()


t8 = math.radians(8)
tilt = lambda pts: [(u * math.cos(t8) - v * math.sin(t8), u * math.sin(t8) + v * math.cos(t8)) for u, v in pts]
squash = lambda pts, k=0.62: [(u, v * k) for u, v in pts]
hexa = lambda cu, cv, r, k=0.75: [(cu + math.cos(i / 6 * math.tau) * r, cv + math.sin(i / 6 * math.tau) * r * k) for i in range(6)]
for sd in (1, -1):
    c, n = hit(EYE_X * sd, EYE_Z)
    n = Vector((n.x, n.y, 0)).normalized().lerp(Vector((0, -1, 0)), 0.5).normalized()
    up = Vector((0, 0, 1))
    tan = up.cross(n).normalized()
    if tan.x * sd < 0:
        tan = -tan  # 指向太陽穴
    flat("aiEyeSocket", tilt(squash([(-0.019, 0.0), (-0.012, 0.012), (0.009, 0.0145), (0.023, 0.008), (0.015, -0.008), (-0.011, -0.009)])), c, tan, up, n, 0.0025)
    flat("eyeWhite", tilt(squash([(-0.0155, -0.001), (-0.007, 0.006), (0.006, 0.007), (0.0165, 0.003), (0.008, -0.0045), (-0.007, -0.0048)])), c, tan, up, n, 0.0033)
    flat("iris", tilt(hexa(0.0005, 0.0004, 0.0058)), c, tan, up, n, 0.004)
    flat("eye", tilt(hexa(0.0005, 0.0004, 0.0026)), c, tan, up, n, 0.0046)
    flat("eye", tilt(squash([(-0.0165, -0.0006), (-0.007, 0.0064), (0.007, 0.0074), (0.018, 0.0036), (0.019, 0.0072), (0.007, 0.0112), (-0.007, 0.0102), (-0.0168, 0.0016)])), c, tan, up, n, 0.005)
    flat("eyeWhite", tilt([(0.0022, 0.0016), (0.0034, 0.002), (0.0027, 0.0008)]), c, tan, up, n, 0.0054)
    # 眉毛：在眉骨的表面上，往外上揚
    cb, nb = hit(EYE_X * sd, EYE_Z + 0.016)
    nb = Vector((nb.x, nb.y, 0)).normalized().lerp(Vector((0, -1, 0)), 0.5).normalized()
    a = math.tan(math.radians(18))
    brow = lambda u, v: (u, (u + 0.017) * a + v - 0.006)
    flat("aiBrow", [brow(-0.017, -0.0012), brow(-0.017, 0.0055), brow(0.004, 0.005), brow(0.021, 0.0015), brow(0.02, -0.001), brow(0.004, -0.0013)], cb, tan, up, nb, 0.004)

fm = bpy.data.meshes.new("HeroineAIFace")
fbm.to_mesh(fm)
fbm.free()
COLORS = {"aiEyeSocket": (0.55, 0.32, 0.24, 1), "eyeWhite": (0.78, 0.72, 0.62, 1), "iris": (0.2, 0.07, 0.02, 1), "eye": (0.02, 0.01, 0.005, 1), "aiBrow": (0.07, 0.026, 0.016, 1)}
for name in fmats:
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = COLORS[name]
    fm.materials.append(m)
fo = bpy.data.objects.new("HeroineAIFace", fm)
ctx.scene.collection.objects.link(fo)
fo.parent = rig
fo.vertex_groups.new(name="head").add(list(range(len(fm.vertices))), 1.0, "REPLACE")
fo.modifiers.new("Armature", "ARMATURE").object = rig

removed = len(old)
print(f"heroine head v13: 新頭 {head_faces} 面，刪掉舊頭 {removed} 面，縮放 {s:.3f}，身體現在 {len(body.data.polygons)} 面")

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "heroine-ai.blend"))
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "heroine-ai.glb"), export_format="GLB", export_yup=True, export_skins=True,
                          export_animations=False, export_cameras=False, export_lights=False, export_apply=False)
