"""
AI 生成的蜘蛛女王（微軟 TRELLIS 用設計圖四視圖生成的 .glb）→ 接上骨架 → 遊戲用的資料。

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/spider_queen_ai.py -- \
      art/monsters/spider_queen src/render/figure/bosses/spiderQueenAI.json

輸入：<資料夾>/ai/trellis-1.glb；輸出：<資料夾>/spider_queen-ai.blend（網格 + 骨架 + 權重，可在 Blender 修整）、
遊戲用的 .json、<資料夾>/ai/preview/bones-*.png（每根骨頭一個顏色，檢查分區用）。
步驟：
1. 合併重疊頂點、減面（遊戲畫法是每個三角形一個顏色，減面後才看得出塊面）。
2. 每個三角形一個顏色：貼圖在面上幾個取樣點的平均（再略提亮）。
3. 骨架：AI 模型每邊有 6 隻腳 + 1 隻短螯肢，關節位置依模型手動擺放（下面的 SKELETON，左半邊 +X，右半邊鏡像）；
   腳的膝、踝吸附到附近頂點的中心，讓骨頭在腳的正中間。
4. 權重：每個頂點到每根骨頭（線段，扣掉骨頭的粗細）的距離，最近的幾根依距離漸變，最多 3 根。
座標：輸出為遊戲的軸向（Y 朝上、面向 +Z、+X 為左手邊）、公尺；遊戲端（SpiderQueenAI.ts）再換成遊戲單位。
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
folder, out_json = args[0], args[1]
TRIS = 7000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(folder, "ai", "trellis-1.glb"))
src = next(o for o in bpy.data.objects if o.type == "MESH")
src.data.transform(src.matrix_world)
src.parent = None
src.matrix_world = Matrix.Identity(4)
for o in list(bpy.data.objects):
    if o is not src:
        bpy.data.objects.remove(o)
src.name = "SpiderQueenAI"

# ── 1. 合併重疊頂點（UV 接縫）、減面 ──
bm = bmesh.new()
bm.from_mesh(src.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(src.data)
bm.free()
bpy.context.view_layer.objects.active = src
src.select_set(True)
dec = src.modifiers.new("dec", "DECIMATE")
dec.ratio = min(1.0, TRIS / len(src.data.polygons))
bpy.ops.object.modifier_apply(modifier=dec.name)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.object.mode_set(mode="OBJECT")
me = src.data

# ── 2. 每個三角形的顏色 ──
def to_int(r, g, b):
    q = lambda x: max(0, min(255, round(x * 255)))
    return (q(r) << 16) | (q(g) << 8) | q(b)


img = next(n.image for m in me.materials for n in m.node_tree.nodes if n.type == "TEX_IMAGE")
TW, TH = img.size
PX = img.pixels[:]
uvd = me.uv_layers.active.data
BRIGHT = 1.08


def face_color(p):
    uvs = [uvd[li].uv for li in p.loop_indices]
    c = sum((Vector(u) for u in uvs), Vector((0, 0))) / len(uvs)
    acc = [0.0, 0.0, 0.0]
    samples = [c] + [c.lerp(Vector(u), 0.55) for u in uvs]
    for s in samples:
        x = min(TW - 1, max(0, int(s.x * TW)))
        y = min(TH - 1, max(0, int(s.y * TH)))
        i = (y * TW + x) * 4
        for k in range(3):
            acc[k] += PX[i + k]
    return to_int(*(min(1.0, a / len(samples) * BRIGHT) for a in acc))


# ── 3. 骨架（Blender 座標：Z 朝上、面向 -Y；左半邊 +X）──
# 每根骨頭：(名稱, 父骨頭, 起點, 終點, 粗細)。終點是子骨頭的起點或末端。名稱用遊戲的關節名稱。
V = Vector
SPINE = [
    ("root", None, V((0, -0.02, -0.10)), V((0, -0.20, -0.08)), 0.09),
    ("ex_abd1", "root", V((0, 0.02, -0.06)), V((0, 0.24, 0.02)), 0.16),
    ("ex_abd2", "ex_abd1", V((0, 0.24, 0.02)), V((0, 0.33, 0.15)), 0.09),
    ("ex_sting", "ex_abd2", V((0, 0.33, 0.15)), V((0, 0.42, 0.26)), 0.025),
    ("torso", "root", V((0, -0.20, -0.06)), V((0, -0.21, 0.06)), 0.055),
    ("chest", "torso", V((0, -0.21, 0.06)), V((0, -0.22, 0.17)), 0.065),
    ("neck", "chest", V((0, -0.22, 0.17)), V((0, -0.225, 0.20)), 0.025),
    ("head", "neck", V((0, -0.225, 0.20)), V((0, -0.225, 0.31)), 0.06),
]
# 手臂（左）：肩 → 肘 → 腕 → 鐮爪根部 → 爪尖
ARM = [V((0.075, -0.21, 0.15)), V((0.10, -0.25, 0.04)), V((0.11, -0.335, -0.05)), V((0.11, -0.35, -0.08)), V((0.11, -0.355, -0.22))]
# 腳（左，由前到後）：髖 → 膝 → 踝 → 腳尖
LEGS = [
    [V((0.10, -0.20, -0.12)), V((0.16, -0.28, -0.08)), V((0.165, -0.32, -0.20)), V((0.17, -0.355, -0.36))],
    [V((0.15, -0.15, -0.07)), V((0.285, -0.20, 0.03)), V((0.38, -0.235, -0.13)), V((0.48, -0.27, -0.37))],
    [V((0.14, -0.04, -0.07)), V((0.26, -0.035, 0.01)), V((0.36, -0.025, -0.14)), V((0.475, -0.015, -0.37))],
    [V((0.14, 0.05, -0.07)), V((0.265, 0.115, 0.0)), V((0.36, 0.15, -0.14)), V((0.46, 0.19, -0.37))],
    [V((0.10, 0.00, -0.13)), V((0.178, 0.062, -0.153)), V((0.21, 0.09, -0.22)), V((0.235, 0.115, -0.37))],
    [V((0.10, 0.10, -0.12)), V((0.19, 0.18, -0.08)), V((0.23, 0.24, -0.20)), V((0.265, 0.30, -0.37))],
]
# 短螯肢（左）：根部 → 關節圓珠 → 鉤尖
PALP = [V((0.18, -0.24, -0.02)), V((0.24, -0.296, -0.033)), V((0.275, -0.32, -0.16))]

co = [v.co.copy() for v in me.vertices]


def snap(p, r=0.035):
    """吸附到附近頂點的中心（骨頭放在肢體正中間）"""
    near = [c for c in co if (c - p).length < r]
    return sum(near, Vector()) / len(near) if len(near) >= 6 else p


bones = list(SPINE)
for s, sx in (("L", 1), ("R", -1)):
    m = lambda p: Vector((p.x * sx, p.y, p.z))
    a = [m(p) for p in ARM]
    bones += [
        (f"upperArm{s}", "chest", a[0], a[1], 0.025),
        (f"forearm{s}", f"upperArm{s}", a[1], a[2], 0.03),
        (f"hand{s}", f"forearm{s}", a[2], a[3], 0.025),
        (f"ex_claw{s}", f"hand{s}", a[3], a[4], 0.02),
    ]
    for i, leg in enumerate(LEGS):
        p = [m(leg[0]), snap(m(leg[1])), snap(m(leg[2])), m(leg[3])]
        n = f"ex_leg{s}{i + 1}"
        bones += [(n + "a", "root", p[0], p[1], 0.03), (n + "b", n + "a", p[1], p[2], 0.025), (n + "c", n + "b", p[2], p[3], 0.02)]
    pp = [m(q) for q in PALP]
    bones += [(f"ex_palp{s}a", "root", pp[0], pp[1], 0.025), (f"ex_palp{s}b", f"ex_palp{s}a", pp[1], pp[2], 0.02)]

# ── 4. 權重 ──
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


SOFT = 0.012
weights = []
for c in co:
    d = sorted(((seg_dist(c, a, b) - r, name) for name, _, a, b, r in bones))
    near = [(dd, n) for dd, n in d[:3] if dd <= d[0][0] + 2.5 * SOFT]
    ws = [(n, math.exp(-(dd - d[0][0]) / SOFT)) for dd, n in near]
    tot = sum(w for _, w in ws)
    weights.append([[n, round(w / tot, 3)] for n, w in ws if w / tot > 0.02])

# ── 存成可編輯的 .blend：骨架 + 頂點群組 ──
arm_data = bpy.data.armatures.new("SpiderQueenRig")
rig = bpy.data.objects.new("SpiderQueenRig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, parent, a, b, _ in bones:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = a, b
for name, parent, *_ in bones:
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")
for name, *_ in bones:
    src.vertex_groups.new(name=name)
for i, ws in enumerate(weights):
    for n, w in ws:
        src.vertex_groups[n].add([i], w, "REPLACE")
src.parent = rig
mod = src.modifiers.new("rig", "ARMATURE")
mod.object = rig

# ── 5. 遊戲用的資料 ──
def G(v):
    """Blender（Z 朝上、面向 -Y）→ 遊戲（Y 朝上、面向 +Z）"""
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


faces = []
for p in me.polygons:
    idx = list(p.vertices)
    faces.append([idx[0], idx[1], idx[2], face_color(p)])
data = {
    "joints": {name: G(a) for name, _, a, _, _ in bones},
    "tips": {name: G(b) for name, _, _, b, _ in bones},
    "parents": {name: parent for name, parent, *_ in bones},
    "legs": len(LEGS),
    "verts": [G(c) for c in co],
    "weights": weights,
    "faces": faces,
}
json.dump(data, open(out_json, "w"), separators=(",", ":"))
print(f"spider-queen-ai: 頂點 {len(co)}，三角形 {len(faces)}，骨頭 {len(bones)}")

# ── 檢查用截圖：每根骨頭一個顏色（頂點顏色 = 權重最大的骨頭）──
palette = {}
for i, (name, *_) in enumerate(bones):
    h = (i * 0.618034) % 1
    palette[name] = [0.5 + 0.5 * math.cos(2 * math.pi * (h + k / 3)) for k in range(3)] + [1]
cattr = me.color_attributes.new("bone", "FLOAT_COLOR", "POINT")
for i, ws in enumerate(weights):
    cattr.data[i].color = palette[ws[0][0]]
dbg = bpy.data.materials.new("bones")
dbg.use_nodes = True
nt = dbg.node_tree
attr = nt.nodes.new("ShaderNodeAttribute")
attr.attribute_name = "bone"
emit = nt.nodes.new("ShaderNodeEmission")
nt.links.new(attr.outputs["Color"], emit.inputs["Color"])
nt.links.new(emit.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
saved = list(me.materials)
me.materials.clear()
me.materials.append(dbg)
sc = bpy.context.scene
sc.render.resolution_x = sc.render.resolution_y = 900
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = 1.1
prev = os.path.join(folder, "ai", "preview")
os.makedirs(prev, exist_ok=True)
for n, loc, rot in [("top", (0, 0, 3), (0, 0, 0)), ("front", (0, -3, 0), (math.pi / 2, 0, 0)), ("side", (3, 0, 0), (math.pi / 2, 0, math.pi / 2)),
                    ("under", (0, 0, -3), (math.pi, 0, 0))]:
    cam.location, cam.rotation_euler = loc, rot
    sc.render.filepath = os.path.join(prev, f"bones-{n}.png")
    bpy.ops.render.render(write_still=True)
me.materials.clear()
for m in saved:
    me.materials.append(m)
me.color_attributes.remove(me.color_attributes["bone"])
bpy.data.objects.remove(cam)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, "spider_queen-ai.blend"))
