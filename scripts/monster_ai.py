"""
AI 生成的怪物（微軟 TRELLIS 用設計圖四視圖生成的 .glb）→ 接上骨架 → 遊戲用的資料。

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/monster_ai.py -- \
      art/monsters/<怪物> src/render/figure/bosses/<輸出>.json

  蜘蛛女王：art/monsters/spider_queen → src/render/figure/bosses/spiderQueenAI.json
  深淵魔王：art/monsters/abyss_lord → src/render/figure/bosses/abyssLordAI.json
  深淵統御者：art/monsters/abyss_sovereign → src/render/figure/bosses/abyssSovereignAI.json（另有巨劍、盾牌）

輸入：<資料夾>/ai/trellis-1.glb；輸出：<資料夾>/<怪物>-ai.blend（網格 + 骨架 + 權重，可在 Blender 修整）、
遊戲用的 .json、<資料夾>/ai/preview/bones-*.png（每根骨頭一個顏色，檢查分區用）。
步驟：
1. 合併重疊頂點、減面（遊戲畫法是每個三角形一個顏色，減面後才看得出塊面）。
2. 每個三角形一個顏色：貼圖在面上幾個取樣點的平均（再略提亮）。
3. 骨架：每隻怪物的關節位置依模型手動擺放（下面的 SKELETONS，左半邊 +X，右半邊鏡像），名稱用遊戲的關節名稱。
   生成時多出來的部分寫在 CLEANUP（減面前切掉）；另外生成的獨立物件（巨劍、盾牌）寫在 PROPS；
   靠得太近、只看距離會分錯的部位（手臂貼著軀幹）用 ZONES 限制。
4. 權重：每個頂點到每根骨頭（線段，扣掉骨頭的粗細）的距離，最近的幾根依距離漸變，最多 3 根。
座標：輸出為遊戲的軸向（Y 朝上、面向 +Z、+X 為左手邊）、公尺；遊戲端（SpiderQueenAI.ts、AbyssLordAI.ts）再換成遊戲單位。
"""
import json
import math
import os
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
folder, out_json = args[0], args[1]
NAME = os.path.basename(os.path.normpath(folder))
TRIS = 7000

# 生成時多出來、要切掉的部分（Blender 座標、減面前判斷；整個三角形都在範圍內才刪）
CLEANUP = {
    # 深淵統御者：TRELLIS 把左右側面的尾巴混在一起，身體正前方多長出一條垂到地上的尾巴
    "abyss_sovereign": lambda p: p.y < -0.33 and abs(p.x) < 0.1 and p.z > -0.42,
}


def to_int(r, g, b):
    q = lambda x: max(0, min(255, round(x * 255)))
    return (q(r) << 16) | (q(g) << 8) | q(b)


def load(path, tris, name, cut=None):
    """匯入 .glb → 合併重疊頂點（UV 接縫）、切掉多餘部分、減面成三角形；回傳物件與「每個三角形的顏色」函式"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    obj = next(o for o in new if o.type == "MESH")
    obj.data.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    for o in new:
        if o is not obj:
            bpy.data.objects.remove(o)
    obj.name = name
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if cut:
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(cut(v.co) for v in f.verts)], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    dec = obj.modifiers.new("dec", "DECIMATE")
    dec.ratio = min(1.0, tris / len(obj.data.polygons))
    bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.object.mode_set(mode="OBJECT")

    # 每個三角形的顏色：貼圖在面上幾個取樣點的平均（再略提亮）
    me = obj.data
    img = next(n.image for m in me.materials for n in m.node_tree.nodes if n.type == "TEX_IMAGE")
    tw, th = img.size
    px = img.pixels[:]
    uvd = me.uv_layers.active.data

    def face_color(p):
        uvs = [uvd[li].uv for li in p.loop_indices]
        c = sum((Vector(u) for u in uvs), Vector((0, 0))) / len(uvs)
        acc = [0.0, 0.0, 0.0]
        samples = [c] + [c.lerp(Vector(u), 0.55) for u in uvs]
        for s in samples:
            x = min(tw - 1, max(0, int(s.x * tw)))
            y = min(th - 1, max(0, int(s.y * th)))
            i = (y * tw + x) * 4
            for k in range(3):
                acc[k] += px[i + k]
        return to_int(*(min(1.0, a / len(samples) * 1.08) for a in acc))

    return obj, face_color


# ── 1、2. 匯入、減面、顏色 ──
bpy.ops.wm.read_factory_settings(use_empty=True)
src, face_color = load(os.path.join(folder, "ai", "trellis-1.glb"), TRIS, f"{NAME}_ai", CLEANUP.get(NAME))
me = src.data


# ── 3. 骨架（Blender 座標：Z 朝上、面向 -Y；左半邊 +X）──
# 每根骨頭：(名稱, 父骨頭, 起點, 終點, 粗細)。終點是子骨頭的起點或末端。
V = Vector
co = [v.co.copy() for v in me.vertices]


def snap(p, r=0.035):
    """吸附到附近頂點的中心（骨頭放在肢體正中間）"""
    near = [c for c in co if (c - p).length < r]
    return sum(near, Vector()) / len(near) if len(near) >= 6 else p


def chain(names, parent, points, radii):
    """一串相連的骨頭：points 比 names 多一個（最後一個是末端）"""
    out = []
    for i, n in enumerate(names):
        out.append((n, parent if i == 0 else names[i - 1], points[i], points[i + 1], radii[i]))
    return out


def sides(fn):
    """左右各一份：fn(s, m)，s = 'L' / 'R'，m = 把左半邊的點鏡像到這一邊"""
    out = []
    for s, sx in (("L", 1), ("R", -1)):
        out += fn(s, lambda p, sx=sx: Vector((p.x * sx, p.y, p.z)))
    return out


def spider_queen():
    """蜘蛛女王：人形上身 + 巨蛛；AI 模型每邊有 6 隻腳 + 1 隻短螯肢"""
    spine = [
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
    arm = [V((0.075, -0.21, 0.15)), V((0.10, -0.25, 0.04)), V((0.11, -0.335, -0.05)), V((0.11, -0.35, -0.08)), V((0.11, -0.355, -0.22))]
    # 腳（左，由前到後）：髖 → 膝 → 踝 → 腳尖；膝、踝吸附到腳的中心
    legs = [
        [V((0.10, -0.20, -0.12)), V((0.16, -0.28, -0.08)), V((0.165, -0.32, -0.20)), V((0.17, -0.355, -0.36))],
        [V((0.15, -0.15, -0.07)), V((0.285, -0.20, 0.03)), V((0.38, -0.235, -0.13)), V((0.48, -0.27, -0.37))],
        [V((0.14, -0.04, -0.07)), V((0.26, -0.035, 0.01)), V((0.36, -0.025, -0.14)), V((0.475, -0.015, -0.37))],
        [V((0.14, 0.05, -0.07)), V((0.265, 0.115, 0.0)), V((0.36, 0.15, -0.14)), V((0.46, 0.19, -0.37))],
        [V((0.10, 0.00, -0.13)), V((0.178, 0.062, -0.153)), V((0.21, 0.09, -0.22)), V((0.235, 0.115, -0.37))],
        [V((0.10, 0.10, -0.12)), V((0.19, 0.18, -0.08)), V((0.23, 0.24, -0.20)), V((0.265, 0.30, -0.37))],
    ]
    # 短螯肢（左）：根部 → 關節圓珠 → 鉤尖
    palp = [V((0.18, -0.24, -0.02)), V((0.24, -0.296, -0.033)), V((0.275, -0.32, -0.16))]

    def side(s, m):
        out = chain([f"upperArm{s}", f"forearm{s}", f"hand{s}", f"ex_claw{s}"], "chest", [m(p) for p in arm], [0.025, 0.03, 0.025, 0.02])
        for i, leg in enumerate(legs):
            n = f"ex_leg{s}{i + 1}"
            out += chain([n + "a", n + "b", n + "c"], "root", [m(leg[0]), snap(m(leg[1])), snap(m(leg[2])), m(leg[3])], [0.03, 0.025, 0.02])
        return out + chain([f"ex_palp{s}a", f"ex_palp{s}b"], "root", [m(p) for p in palp], [0.025, 0.02])

    return spine + sides(side), {"legs": len(legs)}


def abyss_lord():
    """深淵魔王：魔王的人形骨架（BossRig 的關節名稱）+ 翅膀 + 尾巴"""
    spine = chain(["root", "torso", "chest", "neck", "head"], None,
                  [V((0, -0.04, -0.10)), V((0, -0.05, -0.03)), V((0, -0.05, 0.08)), V((0, -0.08, 0.17)), V((0, -0.10, 0.21)), V((0, -0.11, 0.36))],
                  [0.10, 0.08, 0.10, 0.04, 0.07])
    # 尾巴：腰後 → 往後往下拖到地面（箭頭尖端）
    tail = chain(["ex_tail1", "ex_tail2", "ex_tail3", "ex_tail4"], "root",
                 [V((0, 0.07, -0.06)), V((0, 0.10, -0.17)), V((0, 0.12, -0.28)), V((0, 0.15, -0.38)), V((0, 0.21, -0.46))],
                 [0.035, 0.03, 0.025, 0.02])

    def side(s, m):
        # 鎖骨 → 肩 → 肘 → 腕 → 爪 → 爪尖（手臂很粗：肩甲、前臂甲）
        out = [(f"ex_clav{s}", "chest", m(V((0.05, -0.04, 0.16))), m(V((0.20, -0.03, 0.15))), 0.04)]
        out += chain([f"upperArm{s}", f"forearm{s}", f"hand{s}", f"ex_fingers{s}"], f"ex_clav{s}",
                     [m(V((0.20, -0.03, 0.15))), m(V((0.23, -0.03, 0.03))), m(V((0.24, -0.07, -0.09))), m(V((0.24, -0.08, -0.15))), m(V((0.23, -0.08, -0.22)))],
                     [0.06, 0.065, 0.05, 0.03])
        # 髖 → 膝 → 踝 → 腳趾 → 爪尖
        out += chain([f"thigh{s}", f"shin{s}", f"foot{s}", f"ex_toe{s}"], "root",
                     [m(V((0.10, -0.03, -0.13))), m(V((0.12, -0.04, -0.27))), m(V((0.13, -0.03, -0.41))), m(V((0.14, -0.10, -0.45))), m(V((0.15, -0.17, -0.47)))],
                     [0.07, 0.065, 0.05, 0.03])
        # 翅膀：肩胛 → 翼肘（翅膀最高點）；翼肘往外 / 往下伸出四根翼指撐住翼膜（ex_wing?3～6 跟著翼肘）
        elbow = m(V((0.30, 0.04, 0.34)))
        out.append((f"ex_wing{s}1", "chest", m(V((0.09, 0.06, 0.20))), elbow, 0.03))
        out.append((f"ex_wing{s}2", f"ex_wing{s}1", elbow, m(V((0.49, 0.04, 0.20))), 0.015))
        for k, tip in enumerate([V((0.47, 0.06, 0.0)), V((0.36, 0.05, -0.10)), V((0.25, 0.06, 0.05))]):
            out.append((f"ex_wing{s}{k + 3}", f"ex_wing{s}2", elbow, m(tip), 0.012))
        return out

    return spine + tail + sides(side), {}


def abyss_sovereign():
    """深淵統御者：魔王的人形上身（BossRig 的關節名稱）+ 四足獸身（ex_barrel、後腳 ex_h*）+ 往後斜張的翅膀 + 長尾"""
    spine = chain(["root", "torso", "chest", "neck", "head"], None,
                  [V((0, -0.18, -0.08)), V((0, -0.20, 0.0)), V((0, -0.22, 0.10)), V((0, -0.21, 0.24)), V((0, -0.19, 0.28)), V((0, -0.17, 0.42))],
                  [0.10, 0.09, 0.10, 0.05, 0.08])
    # 獸身：骨盆往後到臀部；尾巴從臀部往後往下
    barrel = [("ex_barrel", "root", V((0, -0.10, -0.06)), V((0, 0.20, -0.07)), 0.11)]
    tail = chain(["ex_tail1", "ex_tail2", "ex_tail3", "ex_tail4", "ex_tail5"], "ex_barrel",
                 [V((0, 0.20, -0.07)), V((0, 0.27, -0.11)), V((0, 0.33, -0.15)), V((0, 0.39, -0.19)), V((0, 0.43, -0.22)), V((0, 0.48, -0.24))],
                 [0.04, 0.035, 0.03, 0.025, 0.02])

    def side(s, m):
        out = [(f"ex_clav{s}", "chest", m(V((0.06, -0.18, 0.20))), m(V((0.20, -0.15, 0.20))), 0.05)]
        out += chain([f"upperArm{s}", f"forearm{s}", f"hand{s}", f"ex_fingers{s}"], f"ex_clav{s}",
                     [m(V((0.20, -0.15, 0.20))), m(V((0.235, -0.15, 0.05))), m(V((0.27, -0.19, -0.07))), m(V((0.265, -0.21, -0.13))), m(V((0.26, -0.22, -0.19)))],
                     [0.06, 0.06, 0.05, 0.03])
        # 前腳（人形骨架的腿）：髖 → 膝 → 踝 → 腳趾 → 爪尖
        out += chain([f"thigh{s}", f"shin{s}", f"foot{s}", f"ex_toe{s}"], "root",
                     [m(V((0.12, -0.20, -0.08))), m(V((0.12, -0.20, -0.22))), m(V((0.14, -0.21, -0.38))), m(V((0.14, -0.26, -0.44))), m(V((0.15, -0.32, -0.47)))],
                     [0.08, 0.07, 0.06, 0.04])
        # 後腳：掛在獸身上
        out += chain([f"ex_hthigh{s}", f"ex_hshin{s}", f"ex_hfoot{s}"], "ex_barrel",
                     [m(V((0.12, 0.11, -0.08))), m(V((0.12, 0.12, -0.22))), m(V((0.15, 0.11, -0.38))), m(V((0.16, 0.03, -0.47)))],
                     [0.08, 0.07, 0.06])
        # 翅膀：肩胛 → 翼肘（最高點）→ 翼尖；翼肘再伸出三根翼指撐住翼膜（ex_wing?3～5 跟著翼肘）
        elbow = m(V((0.22, 0.06, 0.43)))
        out.append((f"ex_wing{s}1", "chest", m(V((0.15, 0.03, 0.28))), elbow, 0.035))
        out.append((f"ex_wing{s}2", f"ex_wing{s}1", elbow, m(V((0.49, 0.35, -0.06))), 0.015))
        for k, tip in enumerate([V((0.42, 0.24, 0.0)), V((0.33, 0.15, 0.05)), V((0.26, 0.08, 0.12))]):
            out.append((f"ex_wing{s}{k + 3}", f"ex_wing{s}2", elbow, m(tip), 0.012))
        return out

    return spine + barrel + tail + sides(side), {}


# 另外生成的獨立物件（<資料夾>/ai/<名稱>.glb → 不綁骨架的網格，遊戲端掛在關節上或掉在地上）：名稱 → 三角形數
PROPS = {"abyss_sovereign": {"sword": 1500, "shield": 2500}}


def sovereign_zone(p, bone):
    """
    深淵統御者的手臂區：手臂和軀幹之間只有 1～4 公分的空隙，只看距離時軀幹側面、腋下會跟著手臂，
    手臂往外伸時被拉成大片三角面。所以身體兩側、前半身、手臂位置的頂點才能跟手臂骨頭（同一邊），
    其他頂點不跟手臂；手臂區裡除了手臂，只能和鎖骨（肩膀）混合。
    """
    ax = abs(p.x)
    in_arm = p.y < -0.03 and ((-0.08 <= p.z < 0.17 and ax > 0.185) or (-0.25 < p.z < -0.08 and ax > 0.195))
    arm = re.match(r"(upperArm|forearm|hand|ex_fingers)([LR])$", bone)
    if arm:
        return in_arm and (arm.group(2) == "L") == (p.x > 0)
    if in_arm and not bone.startswith("ex_clav"):
        return False
    # 前腳之間垂下的腰布：跟骨盆，不跟左右大腿（否則兩腳分開時被拉成一根連到地上的尖刺）
    if abs(p.x) < 0.05 and p.y < -0.05 and re.match(r"(thigh|shin|foot|ex_toe)[LR]$", bone):
        return False
    # 翅膀只能在背後高處（翅膀下緣垂到後腳旁，只看距離會和後腳、獸身混在一起）
    if bone.startswith("ex_wing") and not (p.y > -0.05 and p.z > -0.12 and abs(p.x) > 0.12):
        return False
    return True


def sovereign_part(bone):
    """骨頭屬於哪個部位：arm / clav / wing / leg / hind 加左右，或 body"""
    for pattern, name in ((r"(upperArm|forearm|hand|ex_fingers)", "arm"), (r"ex_clav", "clav"), (r"ex_wing", "wing"), (r"(thigh|shin|foot|ex_toe)", "leg"), (r"ex_h(thigh|shin|foot)", "hind")):
        m = re.match(pattern + r"([LR])\d*$", bone)
        if m:
            return name + m.groups()[-1]
    return "body"


# 部位之間只能從這些關節接起來（部位的根部骨頭 → 可以相連的身體骨頭）
SOVEREIGN_ROOTS = {"clav": ("chest", "torso", "neck"), "leg": ("root", "torso"), "hind": ("ex_barrel", "root"), "wing": ("chest", "torso")}
SOVEREIGN_ROOT_BONE = {"clav": "ex_clav", "leg": "thigh", "hind": "ex_hthigh", "wing": "ex_wing"}


def sovereign_joined(bones, ws):
    """
    一個三角形跨到的骨頭可以留下來嗎：生成的網格把垂下的手、翅膀下緣、兩腳之間的腰布黏在旁邊的部位上，
    這些三角形在動作時會被拉成長條（連到地上的尖刺、翅膀黏著後腳）。同一個部位、或部位的根部接身體才留下：
    手臂只接同一邊的鎖骨（而且只在肩膀，不到手肘）；鎖骨接胸 / 腰 / 頸；前腳的大腿接骨盆；後腳的大腿接獸身；翅膀的根部（第 1 節）接胸。
    """
    parts = {sovereign_part(b) for b in bones}
    if len(parts) <= 1:
        return True
    if len(parts) > 2:
        return False
    a, b = sorted(parts)
    if a.startswith("arm") and b.startswith("clav"):
        # 鎖骨只接上臂的根部：連到手肘（前臂權重高）的是腋下到手肘的長三角形
        return a[-1] == b[-1] and all(dict(w).get(f"forearm{a[-1]}", 0) < 0.25 for w in ws)
    if a != "body":
        return False
    kind = b[:-1]
    if kind not in SOVEREIGN_ROOTS:
        return False
    limb = [x for x in bones if sovereign_part(x) == b]
    body = [x for x in bones if sovereign_part(x) == "body"]
    root = SOVEREIGN_ROOT_BONE[kind]
    return all(x.startswith(root) and (kind != "wing" or x.endswith("1")) for x in limb) and all(x in SOVEREIGN_ROOTS[kind] for x in body)


# 限制某些頂點只能跟哪些骨頭（zone(頂點, 骨頭名稱) → 可以或不可以）；沒有列出的怪物只看距離
ZONES = {"abyss_sovereign": sovereign_zone}
# 分開的部位（joined(三角形三個頂點的主要骨頭, 三個頂點的權重) → 可以留下嗎）：跨到不相連部位的三角形在動作時會被拉長，輸出時拿掉
JOINED = {"abyss_sovereign": sovereign_joined}

SKELETONS = {"spider_queen": spider_queen, "abyss_lord": abyss_lord, "abyss_sovereign": abyss_sovereign}
bones, extra = SKELETONS[NAME]()

# ── 4. 權重 ──
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


SOFT = 0.012
# 關節處（最近的兩根骨頭是父子，例如肩膀的鎖骨與上臂、髖的骨盆與大腿）漸變的寬度：
# 只用 SOFT 時接縫很硬，手舉起來肩膀的三角形會被拉長好幾倍
JOINT_SOFT = {"abyss_sovereign": 0.04}
parent_of = {name: parent for name, parent, *_ in bones}
weights = []
zone = ZONES.get(NAME)
for c in co:
    d = sorted(((seg_dist(c, a, b) - r, name) for name, _, a, b, r in bones if not zone or zone(c, name)))
    soft = SOFT
    if len(d) > 1 and NAME in JOINT_SOFT and (parent_of[d[0][1]] == d[1][1] or parent_of[d[1][1]] == d[0][1]):
        soft = JOINT_SOFT[NAME]
    near = [(dd, n) for dd, n in d[:3] if dd <= d[0][0] + 2.5 * soft]
    ws = [(n, math.exp(-(dd - d[0][0]) / soft)) for dd, n in near]
    tot = sum(w for _, w in ws)
    weights.append([[n, round(w / tot, 3)] for n, w in ws if w / tot > 0.02])

# ── 存成可編輯的 .blend：骨架 + 頂點群組 ──
arm_data = bpy.data.armatures.new(f"{NAME}_rig")
rig = bpy.data.objects.new(f"{NAME}_rig", arm_data)
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
joined = JOINED.get(NAME)
cut = 0
for p in me.polygons:
    idx = list(p.vertices)
    if joined and not joined({weights[i][0][0] for i in idx[:3]}, [weights[i] for i in idx[:3]]):
        cut += 1
        continue
    faces.append([idx[0], idx[1], idx[2], face_color(p)])
data = {
    "joints": {name: G(a) for name, _, a, _, _ in bones},
    "tips": {name: G(b) for name, _, _, b, _ in bones},
    "parents": {name: parent for name, parent, *_ in bones},
    **extra,
    "verts": [G(c) for c in co],
    "weights": weights,
    "faces": faces,
}
# 獨立物件：原本的位置與大小（公尺、遊戲軸向），檢查截圖與 .blend 裡藏起來
props = {}
for pname, ptris in PROPS.get(NAME, {}).items():
    obj, color = load(os.path.join(folder, "ai", f"{pname}.glb"), ptris, f"{NAME}_{pname}")
    props[pname] = {"verts": [G(v.co) for v in obj.data.vertices], "faces": [[*p.vertices[:3], color(p)] for p in obj.data.polygons]}
    obj.hide_render = True
    obj.hide_set(True)
if props:
    data["props"] = props
json.dump(data, open(out_json, "w"), separators=(",", ":"))
print(f"{NAME}-ai: 頂點 {len(co)}，三角形 {len(faces)}" + (f"（分開部位拿掉 {cut}）" if cut else "") + f"，骨頭 {len(bones)}" + "".join(f"，{k} {len(v['faces'])} 面" for k, v in props.items()))

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
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, f"{NAME}-ai.blend"))
