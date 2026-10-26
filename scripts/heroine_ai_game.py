"""
AI 版女主角（art/heroine/heroine-ai.blend）→ 遊戲用的資料（src/render/figure/heroine/heroineAI.json）。

  /Applications/Blender.app/Contents/MacOS/Blender --background art/heroine/heroine-ai.blend \
      --python scripts/heroine_ai_game.py -- src/render/figure/heroine/heroineAI.json

遊戲的畫法是「每個面一個顏色」，所以：
- 每個三角形的顏色 = 貼圖在這個面上幾個取樣點的平均（再略提亮）；臉上貼的眼睛、嘴唇照材質顏色。
- 每個頂點最多 3 根骨頭的權重（骨頭名稱是 AI 版骨架的名稱，遊戲端再對應到遊戲的關節）。
- 每個面標記所屬部位（region）：穿上裝備時，遊戲會藏起被裝備蓋住的部位（例如穿靴子時藏起小腿與腳）。
座標：公尺、Y 朝上、角色面向 +Z（與 src/tools/heroine3d 相同）。劍與盾牌不輸出（遊戲依裝備顯示武器與盾牌）。
"""
import json
import sys

import bpy
from mathutils import Vector

out_path = sys.argv[sys.argv.index("--") + 1]
rig = bpy.data.objects["HeroineRig"]
body = bpy.data.objects["HeroineAI"]
face = bpy.data.objects.get("HeroineAIFace")


def G(v):
    """Blender（Z 朝上、面向 -Y）→ 遊戲（Y 朝上、面向 +Z）"""
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def to_srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def rgb_int(r, g, b):
    q = lambda x: max(0, min(255, round(x * 255)))
    return (q(r) << 16) | (q(g) << 8) | q(b)


joints = {b.name: G(b.head_local) for b in rig.data.bones}
parents = {b.name: (b.parent.name if b.parent else None) for b in rig.data.bones}

verts, weights, faces = [], [], []


def add_mesh(obj, color_of):
    base = len(verts)
    names = {g.index: g.name for g in obj.vertex_groups}
    mw = obj.matrix_world
    for v in obj.data.vertices:
        verts.append(G(mw @ v.co))
        ws = sorted(((names[g.group], g.weight) for g in v.groups if g.weight > 0.01), key=lambda x: -x[1])[:3]
        tot = sum(w for _, w in ws) or 1
        weights.append([[n, round(w / tot, 3)] for n, w in ws])
    for p in obj.data.polygons:
        idx = list(p.vertices)
        for t in range(1, len(idx) - 1):
            faces.append([base + idx[0], base + idx[t], base + idx[t + 1], color_of(p)])


# 身體：貼圖顏色
img = next(n.image for n in body.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
W, H = img.size
PX = img.pixels[:]
uvd = body.data.uv_layers.active.data
BRIGHT = 1.08


def tex_color(p):
    uvs = [uvd[li].uv for li in p.loop_indices]
    c = sum((Vector(u) for u in uvs), Vector((0, 0))) / len(uvs)
    samples = [c] + [c.lerp(Vector(u), 0.55) for u in uvs]
    acc = [0.0, 0.0, 0.0]
    for s in samples:
        x = min(W - 1, max(0, int(s.x * W)))
        y = min(H - 1, max(0, int(s.y * H)))
        i = (y * W + x) * 4
        for k in range(3):
            acc[k] += PX[i + k]
    return rgb_int(*(min(1.0, a / len(samples) * BRIGHT) for a in acc))


add_mesh(body, tex_color)
body_faces = len(faces)

# 臉上的眼睛、眉毛、嘴唇：材質顏色
if face:
    mats = face.data.materials
    add_mesh(face, lambda p: rgb_int(*(to_srgb(c) for c in mats[p.material_index].diffuse_color[:3])))

json.dump({
    "joints": joints,
    "parents": parents,
    "verts": verts,
    "weights": weights,
    "faces": faces,
    "decalStart": body_faces,
}, open(out_path, "w"), separators=(",", ":"))
print(f"heroine-ai game: 頂點 {len(verts)}，三角形 {len(faces)}（臉部貼片 {len(faces) - body_faces}）")
