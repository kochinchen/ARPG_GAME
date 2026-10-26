"""
Blender 端：讀 export-heroine-blender.mjs 給的 JSON，建出女主角的骨架、構面網格與材質，
存成 heroine.blend（給人編輯）與 heroine.glb（給 Three.js 頁面比較）。

座標：遊戲端 Y 朝上、面向 +Z；Blender Z 朝上、面向 -Y → (x, y, z) 轉成 (x, -z, y)。
匯出 glTF 時 Blender 會再轉回 Y 朝上，所以 Three.js 那邊座標與原本一致。

網格：每個 joint 的三角形先合併重疊頂點，再把幾乎共面的三角形合併成一個多邊形（構面），
最後合成一個 Heroine 物件；每個頂點只屬於一個 joint 的 vertex group（權重 1），由骨架帶動。
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
src, out_dir = args[0], args[1]
with open(src, encoding="utf-8") as f:
    data = json.load(f)


def B(p):
    return Vector((p[0], -p[2], p[1]))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(h):
    h = h.lstrip("#")
    return [srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)] + [1.0]


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

# ── 材質（名稱 = 調色盤 key，Three.js 載入時用名稱換回同一組顏色） ──
METALLIC = {"metal": 0.7, "metalDark": 0.6, "blade": 0.85, "bladeDark": 0.75, "bronze": 0.5, "gold": 0.6}
materials = {}
for key, p in data["palette"].items():
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    col = hex_color(p["color"])
    bsdf.inputs["Base Color"].default_value = col
    shin = p.get("shininess", 4)
    bsdf.inputs["Roughness"].default_value = max(0.25, 0.95 - shin / 110)
    bsdf.inputs["Metallic"].default_value = METALLIC.get(key, 0.0)
    m.diffuse_color = col  # 實體模式（Solid）下也看得到顏色
    materials[key] = m

# ── 骨架：bone 名稱 = joint 名稱，head = joint 位置 ──
joints = data["joints"]
pos = {j["name"]: Vector(j["pos"]) for j in joints}
children = {}
for j in joints:
    if j["parent"]:
        children.setdefault(j["parent"], []).append(j["name"])
# 骨頭朝向：預設指向第一個子 joint；頭朝上、手腕順著前臂延伸、末端順著父骨方向
TAIL_CHILD = {"pelvis": "waist", "chest": "neck", "neck": "head"}


def tail_of(name, parent):
    p = pos[name]
    if name == "head":
        return p + Vector((0, 0.16, 0))
    if name.startswith("wrist") or name == "sword":
        base = pos[parent] if name.startswith("wrist") else None
        if name == "sword":
            # 與 skeleton.ts 的 SWORD_DIR 相同：從前臂方向往正前方轉 SWORD_ANGLE（80°）
            d = (pos["wristR"] - pos["elbowR"]).normalized()
            f = Vector((0, 0, 1))
            fp = (f - d * f.dot(d)).normalized()
            a = math.radians(80)
            return p + (d * math.cos(a) + fp * math.sin(a)).normalized() * 0.12
        return p + (p - base).normalized() * 0.08
    kids = children.get(name, [])
    c = TAIL_CHILD.get(name) or (kids[0] if kids else None)
    if c and (pos[c] - p).length > 1e-3:
        return pos[c]
    if parent:
        d = p - pos[parent]
        if d.length > 1e-4:
            return p + d.normalized() * min(0.08, max(0.03, d.length * 0.6))
    return p + Vector((0, 0.06, 0))


arm_data = bpy.data.armatures.new("HeroineRig")
arm_data.display_type = "STICK"
rig = bpy.data.objects.new("HeroineRig", arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for j in joints:
    eb = arm_data.edit_bones.new(j["name"])
    eb.head = B(pos[j["name"]])
    eb.tail = B(tail_of(j["name"], j["parent"]))
    eb.use_deform = True
for j in joints:
    if j["parent"]:
        arm_data.edit_bones[j["name"]].parent = arm_data.edit_bones[j["parent"]]
bpy.ops.object.mode_set(mode="OBJECT")
rig.show_in_front = True

# ── 網格：每個 joint 一塊，合併頂點 → 合併共面三角形 → 合在一起 ──
mat_index = {k: i for i, k in enumerate(materials)}
mesh = bpy.data.meshes.new("Heroine")
for m in materials.values():
    mesh.materials.append(m)
bm = bmesh.new()
deform = bm.verts.layers.deform.verify()
group_index = {j["name"]: i for i, j in enumerate(joints)}

by_joint = {}
for part in data["parts"]:
    by_joint.setdefault(part["joint"], []).append(part)

for joint, parts in by_joint.items():
    sub = bmesh.new()
    for part in parts:
        p = part["pos"]
        mi = mat_index[part["mat"]]
        for i in range(0, len(p), 9):
            vs = [sub.verts.new(B(p[i + k:i + k + 3])) for k in (0, 3, 6)]
            try:
                f = sub.faces.new(vs)
                f.material_index = mi
                f.smooth = False
            except ValueError:
                pass
    bmesh.ops.remove_doubles(sub, verts=sub.verts, dist=1e-6)
    bmesh.ops.dissolve_limit(sub, angle_limit=math.radians(0.8), verts=sub.verts, edges=sub.edges, delimit={"MATERIAL"})
    # 搬進主網格，同時寫入 vertex group
    vmap = {}
    for v in sub.verts:
        nv = bm.verts.new(v.co)
        nv[deform][group_index[joint]] = 1.0
        vmap[v] = nv
    for f in sub.faces:
        try:
            nf = bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = f.material_index
            nf.smooth = False
        except ValueError:
            pass
    sub.free()

bm.to_mesh(mesh)
bm.free()
obj = bpy.data.objects.new("Heroine", mesh)
scene.collection.objects.link(obj)
for j in joints:
    obj.vertex_groups.new(name=j["name"])
obj.parent = rig
mod = obj.modifiers.new("Armature", "ARMATURE")
mod.object = rig

# ── 設計圖參考：轉面圖放在角色正後方，從正面視圖（數字鍵 1）看，正面那一張剛好跟模型對齊 ──
# 轉面圖（1536×1024）裡正面那一隻：腳底在 (312, 705) 像素、下巴在 y = 140；模型下巴高 1.521 m
TURN = os.path.join(out_dir, "reference-turnaround.png")
if os.path.exists(TURN):
    m_per_px = 1.521 / (705 - 140)
    img = bpy.data.images.load(TURN)
    e = bpy.data.objects.new("DesignTurnaround", None)
    e.empty_display_type = "IMAGE"
    e.data = img
    e.empty_display_size = img.size[0] * m_per_px
    e.location = ((768 - 312) * m_per_px, 0.8, (705 - 512) * m_per_px)
    e.rotation_euler = (math.radians(90), 0, 0)
    e.empty_image_side = "FRONT"
    e.color[3] = 0.85
    e.hide_render = True
    scene.collection.objects.link(e)
for ref_name, loc in (("reference-head.png", (-3.4, 0.0, 1.6)), ("reference-sheet.png", (-3.4, 1.2, 1.0)), ("reference.webp", (-3.4, 2.4, 1.0))):
    ref = os.path.join(out_dir, ref_name)
    if os.path.exists(ref):
        e = bpy.data.objects.new("Design " + ref_name, None)
        e.empty_display_type = "IMAGE"
        e.data = bpy.data.images.load(ref)
        e.empty_display_size = 3.0
        e.location = loc
        e.rotation_euler = (math.radians(90), 0, 0)
        e.empty_image_side = "FRONT"
        e.hide_render = True
        scene.collection.objects.link(e)

# ── 光與鏡頭（方便在 Blender 裡直接渲染看看） ──
sun = bpy.data.objects.new("KeyLight", bpy.data.lights.new("KeyLight", "SUN"))
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
scene.collection.objects.link(sun)
cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
cam.location = (1.6, -3.6, 1.5)
cam.rotation_euler = (math.radians(85), 0, math.radians(24))
scene.collection.objects.link(cam)
scene.camera = cam

# 3D 視圖：實體模式顯示材質顏色、平面明暗
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.color_type = "MATERIAL"

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "heroine.blend"))
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(
    filepath=os.path.join(out_dir, "heroine.glb"),
    export_format="GLB",
    export_yup=True,
    export_skins=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_apply=False,
)
print("heroine: verts", len(mesh.vertices), "faces", len(mesh.polygons), "bones", len(arm_data.bones))
