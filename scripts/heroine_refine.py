"""
Blender 端第二步：把 heroine.blend 的網格整理成參考圖（模型結構 / 構面分解）那種較密、不規則的三角構面，存回 .blend 並匯出 .glb。

  /Applications/Blender.app/Contents/MacOS/Blender --background art/heroine/heroine.blend \
      --python scripts/heroine_refine.py -- art/heroine

造型（8 頭身、粗跟靴、高馬尾、護膝、短裙……）都已經在程式版（src/tools/heroine3d/）裡，這裡只做：
- 劍分成獨立物件保持銳利；
- 身體三角化、長邊切一刀、頂點沿法線微幅推拉（固定亂數），面變多、每個面的角度略有不同，輪廓不變；臉不動。
只能對 npm run art:heroine 剛產生的檔案執行一次（重複執行會直接停止）；修整前的版本會另存成 heroine-base.blend。
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

out_dir = sys.argv[sys.argv.index("--") + 1]
ctx = bpy.context
rig = bpy.data.objects["HeroineRig"]
body = bpy.data.objects["Heroine"]
if rig.get("refined"):
    raise SystemExit("heroine.blend 已經修整過；請先執行 npm run art:heroine 重新產生")
# 修整前的版本另存一份（想從頭再修可以拿它來跑）
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "heroine-base.blend"), copy=True)


def B(x, y, z):
    """遊戲座標（Y 朝上、面向 +Z）→ Blender 座標"""
    return Vector((x, -z, y))


def activate(obj, mode="OBJECT"):
    if ctx.object and ctx.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    ctx.view_layer.objects.active = obj
    if mode != "OBJECT":
        bpy.ops.object.mode_set(mode=mode)


# ───── 劍分開、身體加密構面 ─────
activate(body, "EDIT")
bpy.ops.mesh.select_all(action="DESELECT")
body.vertex_groups.active_index = body.vertex_groups["sword"].index
bpy.ops.object.vertex_group_select()
bpy.ops.mesh.separate(type="SELECTED")
bpy.ops.object.mode_set(mode="OBJECT")
sword = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Heroine.")][0]
sword.name = "HeroineSword"

before = len(body.data.polygons)
# 不用細分曲面（會把頭髮束、布片這些薄的體積縮成一團）：
# 先三角化，把較長的邊切一刀，再把頂點沿法線做一點固定亂數的推拉 → 面變多、每個面的角度都略有不同，輪廓不變
rng = random.Random(7)
bm = bmesh.new()
bm.from_mesh(body.data)
bmesh.ops.triangulate(bm, faces=bm.faces)
# 臉（head 群組）保持乾淨的大面，不加密也不推拉，五官才不會被打亂
dl = bm.verts.layers.deform.verify()
head_gi = body.vertex_groups["head"].index
is_head = lambda v: v[dl].get(head_gi, 0) > 0.5
long_edges = [e for e in bm.edges if e.calc_length() > 0.05 and not (is_head(e.verts[0]) or is_head(e.verts[1]))]
bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=False)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.normal_update()
for v in bm.verts:
    if not v.is_boundary and len(v.link_faces) > 2 and not is_head(v):
        v.co += v.normal * rng.uniform(-0.0022, 0.0022)
bm.to_mesh(body.data)
bm.free()
for p in body.data.polygons:
    p.use_smooth = False

for o in (body, sword):
    for m in list(o.modifiers):
        if m.type == "ARMATURE":
            o.modifiers.remove(m)
    o.parent = rig
    mod = o.modifiers.new("Armature", "ARMATURE")
    mod.object = rig

rig["refined"] = True

# 參考圖：第二張（多邊形構面）放在第一張旁邊
ref = os.path.join(out_dir, "reference-wire.png")
if os.path.exists(ref):
    e = bpy.data.objects.new("DesignReferenceWire", None)
    e.empty_display_type = "IMAGE"
    e.data = bpy.data.images.load(ref)
    e.empty_display_size = 3.0
    e.location = (2.6, 0.6, 1.0)
    e.rotation_euler = (math.radians(90), 0, 0)
    e.hide_render = True
    ctx.scene.collection.objects.link(e)

tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print(f"heroine refine: faces {before} → {len(body.data.polygons)}（約 {tris} 三角形），劍 {len(sword.data.polygons)} 面")

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
