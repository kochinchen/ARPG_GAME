"""
AI 生成的胸甲（微軟 TRELLIS 用設計圖四視圖生成的 .glb）→ 穿在 AI 版女主角身上 → 遊戲用的資料。

  /Applications/Blender.app/Contents/MacOS/Blender --background art/heroine/heroine-ai.blend \
      --python scripts/gear_ai.py -- art/gear/armor_lava_behemoth src/render/figure/gear/ai/armor_lava_behemoth.json

輸入：<資料夾>/ai/trellis-1.glb；輸出：<資料夾>/armor-ai.blend（可編輯、與女主角放在一起）、遊戲用的 .json、
<資料夾>/ai/preview/fit-*.png（穿在女主角身上的截圖）。
步驟：
1. 減面成兩份：放大時畫的細網格、遊戲地圖上畫的粗網格（Mesh.coarse）。
2. 依女主角的骨架縮放、擺到胸口（正面朝 -Y，與女主角相同）。
3. 胸口中央重新上色、補一顆發光的「熔核」（多張圖生成時正面與背面被平均，熔核不見了）。
4. 依位置拆成胸甲（chest 關節）與左右護肩（upperArmL / upperArmR 關節），各自跟著關節轉動。
5. 每個三角形一個顏色（貼圖在面上幾個取樣點的平均），座標換成遊戲的軸向（Y 朝上、面向 +Z、公尺）；
   遊戲端（ArmorAI.ts）再換成各關節的區域座標。
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
ctx = bpy.context

rig = bpy.data.objects["HeroineRig"]
body = bpy.data.objects["HeroineAI"]
bone = {b.name: b for b in rig.data.bones}

# ── 匯入 AI 模型 ──
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(folder, "ai", "trellis-1.glb"))
new = [o for o in bpy.data.objects if o not in before]
src = next(o for o in new if o.type == "MESH")
src.data.transform(src.matrix_world)
src.parent = None
src.matrix_world = Matrix.Identity(4)
for o in new:
    if o is not src:
        bpy.data.objects.remove(o)
src.name = "ArmorAI"

# ── 1. 合併重疊頂點（UV 接縫）、擺到胸口 ──
bm = bmesh.new()
bm.from_mesh(src.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(src.data)
bm.free()

co = [v.co for v in src.data.vertices]
lo = Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co)))
hi = Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))
# 寬度：兩邊護肩的外緣 = 肩關節往外 FIT["pauldron"]
FIT = {"pauldron": 0.15, "margin": 0.03, "drop": 0.02}
sh = bone["shoulderL"].head_local
neck = bone["neck"].head_local
k = (sh.x + FIT["pauldron"]) * 2 / (hi.x - lo.x)
# 前後：AI 生成的岩殼是實心的，依女主角胸口的厚度（前胸到背）加一點空隙，把身體包在裡面
chest_band = [body.matrix_world @ v.co for v in body.data.vertices
              if abs(v.co.x) < 0.15 and bone["chest"].head_local.z < v.co.z < neck.z - 0.02]
front = min(c.y for c in chest_band) - FIT["margin"]
back = max(c.y for c in chest_band if c.y < 0.12) + FIT["margin"]
ky = (back - front) / (hi.y - lo.y)
src.data.transform(
    Matrix.Translation((0.0, (front + back) / 2, 0.0))
    @ Matrix.Diagonal((k, ky, k, 1))
    @ Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -hi.z))
)
src.data.update()
# 高度：兩邊護肩的中心對齊肩關節（略低一點，蓋住肩頭）
pad = [v.co for v in src.data.vertices if abs(v.co.x) > sh.x * 0.95]
pad_z = sum(c.z for c in pad) / len(pad)
src.data.transform(Matrix.Translation((0, 0, sh.z - FIT["drop"] - pad_z)))
src.data.update()
co = [v.co for v in src.data.vertices]
lo = Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co)))
hi = Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))
print(f"armor-ai: 縮放 {k:.3f}，範圍 x {lo.x:.3f}~{hi.x:.3f} y {lo.y:.3f}~{hi.y:.3f} z {lo.z:.3f}~{hi.z:.3f}")

# ── 2. 貼圖顏色（每個三角形一個顏色）：在減面前先記在面上 ──
mat = src.data.materials[0]
img = next(n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
W, H = img.size
PX = img.pixels[:]
BRIGHT = 1.1


def sample(uv):
    x = min(W - 1, max(0, int(uv.x * W)))
    y = min(H - 1, max(0, int(uv.y * H)))
    i = (y * W + x) * 4
    return PX[i:i + 3]


def face_colors(obj):
    uvd = obj.data.uv_layers.active.data
    out = []
    for p in obj.data.polygons:
        uvs = [Vector(uvd[li].uv) for li in p.loop_indices]
        c = sum(uvs, Vector((0, 0))) / len(uvs)
        acc = [0.0, 0.0, 0.0]
        pts = [c] + [c.lerp(u, 0.55) for u in uvs]
        for s in pts:
            for i, v in enumerate(sample(s)):
                acc[i] += v
        out.append([min(1.0, a / len(pts) * BRIGHT) for a in acc])
    return out


def decimated(name, tris):
    o = src.copy()
    o.data = src.data.copy()
    o.name = name
    ctx.collection.objects.link(o)
    m = o.modifiers.new("dec", "DECIMATE")
    m.ratio = tris / len(src.data.polygons)
    ctx.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    for p in o.data.polygons:
        p.use_smooth = False
    return o


fine = decimated("ArmorAI_fine", 4000)
coarse = decimated("ArmorAI_coarse", 900)

# ── 3. 熔核：胸口正中央（設計圖：寬度中央、高度約一半），正面的面重新上色，再補一顆多面體 ──
CORE = Vector((0.0, lo.y, hi.z - (hi.z - lo.z) * 0.5))
CORE_R = (hi.x - lo.x) * 0.06
GLOW = [(0.0, (1.0, 0.93, 0.55)), (0.45, (1.0, 0.72, 0.18)), (0.8, (0.98, 0.42, 0.08)), (1.0, (0.75, 0.2, 0.05))]


def glow(t):
    for (t0, c0), (t1, c1) in zip(GLOW, GLOW[1:]):
        if t <= t1:
            f = (t - t0) / (t1 - t0)
            return [a + (b - a) * f for a, b in zip(c0, c1)]
    return list(GLOW[-1][1])


def recolor_core(obj, cols):
    for p, c in zip(obj.data.polygons, cols):
        if p.normal.y > -0.25:
            continue
        d = math.hypot(p.center.x - CORE.x, p.center.z - CORE.z)
        if d < CORE_R * 1.6:
            g = glow(d / (CORE_R * 1.6))
            w = max(0.0, 1 - d / (CORE_R * 1.6)) ** 0.5
            c[:] = [a * (1 - w) + b * w for a, b in zip(c, g)]


def front_y(x, z):
    """這個高度、正面最前面的 y（熔核貼在表面上）"""
    best = 0.0
    for v in fine.data.vertices:
        if abs(v.co.x - x) < CORE_R and abs(v.co.z - z) < CORE_R:
            best = min(best, v.co.y)
    return best


def add_core():
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    # 菱形的寶石：上下拉長、前後壓扁；面朝外的方向決定亮度（中央最亮）
    for v in bm.verts:
        v.co = Vector((v.co.x * CORE_R * 0.8, v.co.y * CORE_R * 0.45, v.co.z * CORE_R * 1.15))
    y = front_y(CORE.x, CORE.z) + CORE_R * 0.12
    for v in bm.verts:
        v.co += Vector((CORE.x, y, CORE.z))
    me = bpy.data.meshes.new("ArmorAI_core")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("ArmorAI_core", me)
    ctx.collection.objects.link(o)
    cols = []
    for p in me.polygons:
        t = min(1.0, max(0.0, 1 + p.normal.y))  # 正對前方 = 0
        cols.append(glow(t * 0.9))
    return o, cols


core_obj, core_cols = add_core()

# ── 4. 拆成胸甲與左右護肩（依面的中心離中線多遠） ──
SPLIT = bone["clavL"].tail_local.x * 0.92


def part_of(center):
    if center.x > SPLIT:
        return "upperArmL"
    if center.x < -SPLIT:
        return "upperArmR"
    return "chest"


def G(v):
    """Blender（Z 朝上、面向 -Y）→ 遊戲軸向（Y 朝上、面向 +Z），公尺"""
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def hexcol(c):
    q = lambda x: max(0, min(255, round(x * 255)))
    return (q(c[0]) << 16) | (q(c[1]) << 8) | q(c[2])


def export(objs_cols):
    parts = {}
    for obj, cols in objs_cols:
        for p, c in zip(obj.data.polygons, cols):
            part = parts.setdefault(part_of(p.center), {"verts": [], "faces": [], "_map": {}})
            idx = []
            for vi in p.vertices:
                key = (obj.name, vi)
                if key not in part["_map"]:
                    part["_map"][key] = len(part["verts"])
                    part["verts"].append(G(obj.data.vertices[vi].co))
                idx.append(part["_map"][key])
            part["faces"].append(idx + [hexcol(c)])
    for part in parts.values():
        del part["_map"]
    return parts


fine_cols = face_colors(fine)
coarse_cols = face_colors(coarse)
recolor_core(fine, fine_cols)
recolor_core(coarse, coarse_cols)
data = {
    "fine": export([(fine, fine_cols), (core_obj, core_cols)]),
    "coarse": export([(coarse, coarse_cols), (core_obj, core_cols)]),
}
os.makedirs(os.path.dirname(out_json), exist_ok=True)
json.dump(data, open(out_json, "w"), separators=(",", ":"))
for lod, parts in data.items():
    print(f"armor-ai {lod}: " + "，".join(f"{k} {len(v['faces'])} 面" for k, v in parts.items()))

# ── 預覽：顏色寫成頂點色（面角色），和女主角一起截圖 ──
def paint(obj, cols, tint=None):
    me = obj.data
    attr = me.color_attributes.new("col", "BYTE_COLOR", "CORNER")
    for p, c in zip(me.polygons, cols):
        cc = c
        if tint:
            part = part_of(p.center)
            cc = [a * 0.6 + b * 0.4 for a, b in zip(c, tint[part])]
        for li in p.loop_indices:
            attr.data[li].color_srgb = (*cc, 1)
    me.color_attributes.active_color = attr


paint(fine, fine_cols)
paint(core_obj, core_cols)
for o in (src, coarse):
    o.hide_render = True
    o.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, "armor-ai.blend"), copy=True)

s = ctx.scene
s.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE_NEXT"
s.render.resolution_x, s.render.resolution_y = 700, 900
s.world = bpy.data.worlds.new("w")
s.world.use_nodes = True
bg = next(n for n in s.world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1)
bg.inputs["Strength"].default_value = 1.2
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 2.5
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
ctx.collection.objects.link(sun)
for o in bpy.data.objects:
    if o.name in ("HeroineSword", "HeroineShield"):
        o.hide_render = True
# 和遊戲一樣：穿上盔甲時，胸口與腰（權重最大的骨頭是 chest / waist / clav）的皮膚不畫
groups = {g.index: g.name for g in body.vertex_groups}
dom = {}
for v in body.data.vertices:
    if v.groups:
        dom[v.index] = groups[max(v.groups, key=lambda g: g.weight).group]
bm = bmesh.new()
bm.from_mesh(body.data)
hidden = [f for f in bm.faces if sum(dom.get(v.index, "").startswith(("chest", "waist", "clav")) for v in f.verts) >= 2]
bmesh.ops.delete(bm, geom=hidden, context="FACES")
bm.to_mesh(body.data)
bm.free()
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
ctx.collection.objects.link(cam)
s.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = 0.95
c = Vector((0, 0, 1.2))


def shot(name, az, el=0.12):
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    cam.location = c + d * 4
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    s.render.filepath = os.path.join(folder, "ai", "preview", f"fit-{name}.png")
    bpy.ops.render.render(write_still=True)


for o in (fine, core_obj):
    # 預覽用：把頂點色接到材質上，TEXTURE 模式也看得到
    m = bpy.data.materials.new(o.name + "_m")
    m.use_nodes = True
    nt = m.node_tree
    a = nt.nodes.new("ShaderNodeVertexColor")
    a.layer_name = "col"
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nt.links.new(a.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    o.data.materials.clear()
    o.data.materials.append(m)
for name, az in [("front", 0.0), ("threequarter", 0.6), ("side", math.pi / 2), ("back", math.pi)]:
    shot(name, az)
