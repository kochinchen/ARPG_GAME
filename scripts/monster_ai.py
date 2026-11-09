"""
AI 生成的怪物（微軟 TRELLIS 用設計圖四視圖生成的 .glb）→ 接上骨架 → 遊戲用的資料。

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/monster_ai.py -- \
      art/monsters/<怪物> src/render/figure/bosses/<輸出>.json

  蜘蛛女王：art/monsters/spider_queen → src/render/figure/bosses/spiderQueenAI.json
  深淵魔王：art/monsters/abyss_lord → src/render/figure/bosses/abyssLordAI.json
  深淵統御者：art/monsters/abyss_sovereign → src/render/figure/bosses/abyssSovereignAI.json（另有巨劍、盾牌）
  骨刺獵獸 / 酸液甲蟲：art/monsters/<bone_hound|acid_beetle> → src/render/figure/monsters/<boneHoundAI|acidBeetleAI>.json
  石頭獸（結晶獸四種屬性共用）：art/monsters/stone_walker → src/render/figure/monsters/stoneWalkerAI.json
  骨龍（巨口、四根觸手、四隻腳）：art/monsters/bone_dragon → src/render/figure/bosses/boneDragonAI.json
  隱藏魔王「眼」（巨大眼球、八根花瓣爪、大翅膀）：art/monsters/abyss_dragon → bosses/abyssDragonAI.json；尾巴另外生成、第三階段脫離：同一個資料夾加第三個參數 tail → bosses/abyssDragonTailAI.json
  骸手爬行者（小怪：骷髏手臂當頭、每邊 9 隻蜘蛛腳）：art/monsters/bone_hand → src/render/figure/monsters/boneHandAI.json
  隱藏魔王「手」（爬行的骷髏手臂，一左一右）：身體 art/monsters/abyss_hand → bosses/abyssHandAI.json；前臂與手掌另外生成、第三階段打壞：加第三個參數 hand → bosses/abyssHandForearmAI.json
  熔岩巨獸 / 墮落騎士 / 墓穴守衛 / 墮落神官：art/monsters/<lava_behemoth|fallen_knight|crypt_guardian|fallen_priest> → bosses/<lavaBehemothAI|fallenKnightAI|cryptGuardianAI|fallenPriestAI>.json

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
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index("--") + 1:]
folder, out_json = args[0], args[1]
# 第三個參數：同一個資料夾裡另外生成的部位（ai/<部位>.glb），名稱是 <怪物>_<部位>
PART = args[2] if len(args) > 2 else None
NAME = os.path.basename(os.path.normpath(folder)) + (f"_{PART}" if PART else "")
TRIS = 7000
# 一般怪物同時出現的數量多，面數要少；魔王用預設（骨龍細節多又一次只有一隻，設計者要求加倍）
TRIS_OF = {"stone_walker": 4500, "bone_hand": 4500, "bone_dragon": 9000, "abyss_dragon": 9000, "abyss_dragon_tail": 3200, "abyss_hand": 7000, "abyss_hand_hand": 4800}
FLOOR_AT = {"stone_walker": -0.378}
# 一般怪（同時出現很多隻）：面數接近舊版程式畫的模型（加上武器約多 0～25%），遊戲時的負擔差不多；
# 但不低於 2500（太少會變成大片的三角面，設計者不喜歡）。舊版：骷髏 2816、冰霜骷髏 3104、弓手 2034、
# 食屍鬼 1416、毒液食屍鬼 1974、虛空孢子 4100、虛空吞噬者 3692（2026-11-07 量的）
TRIS_OF.update({"poison_spitter": 2500, "blood_lizard": 2500, "wheel_sword_beast": 3000, "eye_floater": 3000, "hatchling_spider": 2500, "burrower": 3200, "skeleton": 3000, "frost_skeleton": 3300, "skeleton_archer": 2500, "ghoul": 2500, "venom_ghoul": 2500, "void_spore": 4000, "void_maw": 3800, "armored_skeleton": 3600, "skeleton_mage": 2800, "storm_mage": 2800, "bone_hound": 2500, "acid_beetle": 2500})
# 生成的模型沒有面向 -Y：繞 Z 轉正（度；減面前）
ROTATE_Z = {"skeleton": -90, "skeleton_mage": -90, "eye_floater": -90}
# 減面後把過長的邊切開（公尺）：平的地方也是小三角面，貼圖取樣更細（不改形狀）
SPLIT_EDGE = {"bone_dragon": 0.042, "abyss_dragon": 0.032, "abyss_hand": 0.04, "abyss_hand_hand": 0.032}

# 鐵輪劍獸的輪軸（Blender 的 y、z）
WHEEL_CENTER = (0.156, -0.184)

# 生成時多出來、要切掉的部分（Blender 座標、減面前判斷；整個三角形都在範圍內才刪）
CLEANUP = {
    # 鐵輪劍獸：TRELLIS 把正面與側面的手臂混在一起，前臂後面多長了一束劍；輪子前面多一塊半圓（輪子修成圓形）
    "wheel_sword_beast": lambda p: (abs(p.x) > 0.26 and ((p.y > 0.05 and p.z < -0.02) or (p.y > 0.075 and p.z < 0.03)))
    or (0.07 < abs(p.x) < 0.235 and p.z < 0 and p.y < 0.1 and math.hypot(p.y - WHEEL_CENTER[0], p.z - WHEEL_CENTER[1]) > 0.155),
    # 深淵統御者：TRELLIS 把左右側面的尾巴混在一起，身體正前方多長出一條垂到地上的尾巴
    "abyss_sovereign": lambda p: p.y < -0.33 and abs(p.x) < 0.1 and p.z > -0.42,
    # 骨龍：TRELLIS 每邊多生一隻中間的腳（設計是四隻腳），切掉腳掌與小腿
    "bone_dragon": lambda p: 0.05 < p.y < 0.255 and 0.14 < abs(p.x) < 0.31 and p.z < -0.225,
    # 手：TRELLIS 每邊生成 6 隻腳（設計是 4 隻），切掉前後第二隻
    "abyss_hand": lambda p: abs(p.x) > HAND_LEG_CUT_X and any(abs(p.y - y) < 0.052 for y in HAND_CUT_LEGS),
    # 酸液甲蟲（設計者 2026-11-09）：拿掉大顎外側那兩根觸鬚，和原本的短管與兩顆液滴（換成砲管）
    "acid_beetle": lambda p: (0.168 < abs(p.x) < 0.34 and p.y < -0.3 and p.z < -0.1) or (abs(p.x) < 0.055 and p.y < -0.345 and -0.2 < p.z < -0.07),
}


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ── 眼（abyss_dragon）：四視圖的翅膀畫小、深口只有畫的，在這裡放大、挖深（減面前，三角形才會平均）──
WING = {"x0": 0.225, "kx": 2.5, "kz": 1.6, "ky": 1.5, "zc": 0.1, "yc": 0.03}
# 翅膀上的眼睛（左半邊，四視圖的位置）：不跟著翅膀壓扁，整顆等比放大
WING_EYES = [(0.256, 0.335), (0.479, 0.067), (0.439, -0.007), (0.324, -0.054)]
WING_EYE_R, WING_EYE_K = 0.05, 1.8
EYE_CENTER = Vector((0, -0.02, 0.05))
MOUTH_R, MOUTH_DEPTH = 0.058, 0.1
# 深口的一圈骨頭（支點在眼球中心，轉動時口緣往外 / 往內移，像吸氣吐氣）；喉嚨深處和眼球表面不動
MOUTH_BONES = 6
MOUTH_RING = (0.02, 0.045, 0.1, 0.125)


def in_wing(p):
    # 手掌在 z < -0.22；肩膀的小尖甲在 y < -0.07、|x| < 0.24；翅膀上的眼睛會往前凸
    return abs(p.x) > WING["x0"] and p.z > -0.1 and (p.y > -0.055 or abs(p.x) > 0.26)


def wing_stretch(x, y, z):
    """左半邊的點（x > 0）→ 放大後的位置"""
    t = smooth((x - WING["x0"]) / 0.05)
    return (WING["x0"] + (x - WING["x0"]) * WING["kx"], y + (y - WING["yc"]) * (WING["ky"] - 1) * t, z + (z - WING["zc"]) * (WING["kz"] - 1) * t)


def reshape_eye(bm):
    for v in bm.verts:
        p = v.co
        # 瞳孔的深口：往內凹成漏斗（牙齒在外圈不動）
        r = math.hypot(p.x, p.z - EYE_CENTER.z)
        if p.y < -0.08 and r < MOUTH_R:
            p.y += MOUTH_DEPTH * smooth(1 - r / MOUTH_R)
        if not in_wing(p):
            continue
        sx = 1 if p.x > 0 else -1
        x, y, z = abs(p.x), p.y, p.z
        nx, ny, nz = wing_stretch(x, y, z)
        for ex, ez in WING_EYES:
            d = math.hypot(x - ex, z - ez)
            w = smooth(1.35 - d / WING_EYE_R)
            if w > 0:
                cx, _, cz = wing_stretch(ex, y, ez)
                nx += (cx + (x - ex) * WING_EYE_K - nx) * w
                nz += (cz + (z - ez) * WING_EYE_K - nz) * w
                break
        p.x, p.y, p.z = sx * nx, ny, nz


def refine_wing_eyes(bm):
    """翅膀眼睛的瞳孔縫那一帶切細：一個三角形一個顏色，三角形太大畫不出直的黑縫"""
    w, h = WING_EYE_DISC * SLIT_W * 1.8, WING_EYE_DISC * SLIT_H * 1.1
    for _ in range(4):
        edges = []
        for e in bm.edges:
            if e.calc_length() <= 0.01:
                continue
            m = (e.verts[0].co + e.verts[1].co) / 2
            if any(abs(abs(m.x) - cx) < w and abs(m.z - cz) < h for cx, cz in WING_EYE_CENTERS):
                edges.append(e)
        if not edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=bm.faces)


WING_EYE_CENTERS = [(wing_stretch(ex, 0, ez)[0], wing_stretch(ex, 0, ez)[2]) for ex, ez in WING_EYES]
# 畫出來的眼球半徑；瞳孔黑縫：直立的橄欖形（半寬、半高，相對眼球半徑）
WING_EYE_DISC = 0.045 * WING_EYE_K * 0.62
SLIT_W, SLIT_H = 0.2, 0.9
# 切細（切長邊之後）
AFTER_SPLIT = {"abyss_dragon": refine_wing_eyes}
# 減面前改形狀
def reshape_bone_hand(bm):
    """骸手爬行者：模型的手掌朝 +Y、眼睛朝 -Y，轉 180° 讓手掌朝前（往下拍時掌心才會向地）；兩段浮空的拇指往手掌靠上"""
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, "Z"))
    seen = set()
    for v in bm.verts:
        if v in seen:
            continue
        stack, island = [v], []
        seen.add(v)
        while stack:
            x = stack.pop()
            island.append(x)
            for e in x.link_edges:
                w = e.other_vert(x)
                if w not in seen:
                    seen.add(w)
                    stack.append(w)
        if len(island) < 500:
            for x in island:
                x.co.y -= 0.055


# ── 手（abyss_hand）：TRELLIS 把腳生成直直往下，這裡往外、往前後張開成蜘蛛腳（減面前，三角形才會平均）──
HAND_LEG_CUT_X = 0.11
HAND_CUT_LEGS = (-0.157, 0.157)
# 留下的四隻腳（左半邊）：前後位置、往前後張開的角度（負 = 往前）
HAND_LEGS = [(-0.27, -38), (-0.05, -13), (0.06, 13), (0.27, 38)]
HAND_LEG_OUT = math.radians(30)
HAND_HIP = (0.085, 0.1)
HAND_EYE = Vector((0, -0.31, 0.1))
HAND_EYE_R = 0.205


def hand_leg_move(x, y, z, cy, yaw, k=1.0):
    """左半邊的點（x > 0）→ 張開後的位置；k = 張開的比例（靠近身體的地方漸變）"""
    hx, hz = HAND_HIP
    a, b = HAND_LEG_OUT * k, math.radians(yaw) * k
    dx, dz = x - hx, z - hz
    # 繞髖往外翻
    nx, nz = dx * math.cos(a) - dz * math.sin(a), dx * math.sin(a) + dz * math.cos(a)
    # 繞髖往前後張開
    dy = y - cy
    return hx + nx * math.cos(b) - dy * math.sin(b), cy + nx * math.sin(b) + dy * math.cos(b), hz + nz


def reshape_hand_body(bm):
    for v in bm.verts:
        p = v.co
        ax = abs(p.x)
        if ax < HAND_HIP[0] or p.z > 0.2 or (p - HAND_EYE).length < HAND_EYE_R:
            continue
        leg = next(((cy, yaw) for cy, yaw in HAND_LEGS if abs(p.y - cy) < 0.058), None)
        if not leg:
            continue
        nx, ny, nz = hand_leg_move(ax, p.y, p.z, leg[0], leg[1], smooth((ax - HAND_HIP[0]) / 0.08))
        p.x, p.y, p.z = nx if p.x > 0 else -nx, ny, nz


def reshape_hand_arm(bm):
    """前臂與手掌：模型的掌心朝 -X，轉 90° 讓掌心朝前（-Y）"""
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Z"))


def reshape_spore_eye(bm):
    """虛空孢子：TRELLIS 把正面的眼做成往前凸 17 公分的尖錐；壓成嵌在甲殼環裡、微微隆起的圓眼（四視圖的樣子）"""
    for v in bm.verts:
        r = math.hypot(v.co.x, v.co.z)
        if r < SPORE_EYE_R and v.co.y < -0.29:
            v.co.y = -0.29 - 0.05 * (1 - (r / SPORE_EYE_R) ** 2)


SPORE_EYE_R = 0.1
# 法師的眼：左右的 x、高度 z、半徑、中心色、外圈色
MAGE_EYE = {"skeleton_mage": (0.026, 0.349, 0.021, 0xf0a0ff, 0xb040f0), "storm_mage": (0.03, 0.36, 0.022, 0xd0ffff, 0x40d8f0)}
# 虛空吞噬者的嘴：中心（x, z）、鋸齒洞的內外半徑、齒數、深度；喉嚨表面約在 y = -0.41，牙齒前緣 -0.49
MAW_MOUTH = (0.14, 0.1)
MAW_HOLE = (0.03, 0.055, 9, 0.13)
MAW_THROAT_Y = -0.445


def maw_star(x, z):
    """嘴中心到 (x, z) 的距離 ÷ 這個角度上鋸齒洞的半徑（< 1 在洞裡）"""
    dx, dz = x - MAW_MOUTH[0], z - MAW_MOUTH[1]
    r0, r1, n, _ = MAW_HOLE
    a = math.atan2(dz, dx) * n / (2 * math.pi)
    tooth = abs((a % 1) * 2 - 1)  # 0 = 齒尖、1 = 齒間
    return math.hypot(dx, dz) / (r1 - (r1 - r0) * tooth)


def reshape_maw_mouth(bm):
    """虛空吞噬者：嘴裡往後挖一個鋸齒狀的深洞（喉嚨的表面往後推，越中間越深；牙齒不動）"""
    depth = MAW_HOLE[3]
    for v in bm.verts:
        d = maw_star(v.co.x, v.co.z)
        if d < 1 and v.co.y > MAW_THROAT_Y and v.co.y < -0.3:
            v.co.y += depth * (1 - d * d)


BURROWER_GEMS = []


def reshape_burrower(bm):
    """
    鑽地寄生蟲：用虛空吞噬者的模型（設計者 2026-11-07），身上的寶石拿掉大部分：
    頭以後的身體上，比周圍表面凸出的圓包（寶石）壓回表面，記下位置，之後把那裡的顏色換成身體的顏色
    """
    reshape_maw_mouth(bm)
    near = {v: [e.other_vert(v) for e in v.link_edges] for v in bm.verts}
    pos = {v: v.co.copy() for v in bm.verts}
    for _ in range(25):
        pos = {v: (sum((pos[n] for n in ns), Vector()) / len(ns)).lerp(pos[v], 0.3) if ns else pos[v] for v, ns in near.items()}
    bm.normal_update()
    flat = 0
    for v in bm.verts:
        out = (v.co - pos[v]).dot(v.normal)
        if v.co.y > -0.22 and v.co.z > -0.13 and out > BURROWER_GEM_OUT:
            v.co = pos[v] + v.normal * BURROWER_GEM_OUT * 0.3
            BURROWER_GEMS.append(v.co.copy())
            flat += 1
    print("寶石頂點壓平", flat)
    # 大獠牙壓平（設計者 2026-11-08：鑽地寄生蟲沒有大獠牙）：嘴的範圍內凸出來的牙齒壓回口緣的表面
    fangs = 0
    for v in bm.verts:
        if math.hypot(v.co.x - MAW_MOUTH[0], v.co.z - MAW_MOUTH[1]) < BURROWER_FANG_R and v.co.y < BURROWER_LIP_Y:
            v.co.y = BURROWER_LIP_Y
            fangs += 1
    print("獠牙頂點壓平", fangs)


BURROWER_GEM_OUT = 0.008
BURROWER_FANG_R = 0.135
BURROWER_LIP_Y = -0.43
# 嘴的一圈骨頭（快速一吐一吸）：口緣跟著轉；骨頭數、半徑範圍（洞邊 r0～r1 漸入、r2～r3 漸出）、只動最前面（y 小於）
MAW_RING_BONES = 6
MAW_RING = (0.025, 0.055, 0.125, 0.155)
MAW_RING_Y = -0.385
# 骨刺獵獸（設計者 2026-11-09）：胸部之後到尾巴之前，背上的骨刺拉長 2 倍（只沿著刺的方向拉，根部與粗細不變）
HOUND_CLAW_Z = -0.19
HOUND_CLAW_LONGER = 0.012
HOUND_SPIKE = {"from": -0.13, "to": 0.34, "min_z": 0.09, "scale": 2.0}


def reshape_bone_hound(bm):
    img = max(bpy.data.images, key=lambda i: i.size[0])
    tw, th = img.size
    px = img.pixels[:]
    uv = bm.loops.layers.uv.active

    def color(v):
        acc = [0.0, 0.0, 0.0]
        for l in v.link_loops:
            u = l[uv].uv
            i = (min(th - 1, int(u.y * th)) * tw + min(tw - 1, int(u.x * tw))) * 4
            for k in range(3):
                acc[k] += px[i + k]
        n = len(v.link_loops) or 1
        return [a / n for a in acc]

    def is_bone(v):
        r, g, b = color(v)
        return r > 0.6 and g > 0.5 and b > 0.33 and g > r * 0.72

    bone = {v for v in bm.verts if is_bone(v)}
    seen = set()
    stretched = 0
    claws = 0
    floor = min(v.co.z for v in bm.verts)
    for start in bone:
        if start in seen:
            continue
        comp, stack = [], [start]
        seen.add(start)
        while stack:
            v = stack.pop()
            comp.append(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o in bone and o not in seen:
                    seen.add(o)
                    stack.append(o)
        center = sum((v.co for v in comp), Vector()) / len(comp)
        # 腳趾（設計者 2026-11-09）：往前收成尖端，尖端壓到地面（根部不動）
        if center.z < HOUND_CLAW_Z and abs(center.x) > 0.1 and len(comp) >= 3:
            ys = [v.co.y for v in comp]
            y0, y1 = min(ys), max(ys)
            if y1 - y0 < 1e-4:
                continue
            base = sum((v.co for v in comp if v.co.y > y1 - (y1 - y0) * 0.3), Vector())
            base /= sum(1 for v in comp if v.co.y > y1 - (y1 - y0) * 0.3)
            front = [v.co for v in comp if v.co.y < y0 + (y1 - y0) * 0.25]
            old_tip = sum(front, Vector()) / len(front)
            new_tip = Vector((old_tip.x, y0 - HOUND_CLAW_LONGER, floor))
            for v in comp:
                t = min(1.0, max(0.0, (y1 - v.co.y) / (y1 - y0)))
                v.co = base.lerp(new_tip, t) + (v.co - base.lerp(old_tip, t)) * (1 - t)
            claws += 1
            continue
        if len(comp) < 10 or not HOUND_SPIKE["from"] < center.y < HOUND_SPIKE["to"] or center.z < HOUND_SPIKE["min_z"]:
            continue
        # 刺尖 = 最高的點（往後的刺也算），根部 = 離刺尖最遠的那一圈
        tip = max(comp, key=lambda v: v.co.z + v.co.y * 0.4).co.copy()
        along = (tip - center).normalized()
        ts = [(v.co - center).dot(along) for v in comp]
        t0 = min(ts)
        ring = [v.co for v, t in zip(comp, ts) if t < t0 + (max(ts) - t0) * 0.25]
        base = sum(ring, Vector()) / len(ring)
        axis = (tip - base).normalized()
        for v in comp:
            v.co += axis * max(0.0, (v.co - base).dot(axis)) * (HOUND_SPIKE["scale"] - 1)
        stretched += 1
    print("拉長的背刺", stretched, "捏尖的腳趾", claws)


RESHAPE = {"bone_hound": reshape_bone_hound, "burrower": reshape_burrower, "void_maw": reshape_maw_mouth, "void_spore": reshape_spore_eye, "abyss_dragon": reshape_eye, "bone_hand": reshape_bone_hand, "abyss_hand": reshape_hand_body, "abyss_hand_hand": reshape_hand_arm}
# 尾巴：中段重複成 TAIL_COPIES 段（每段自己封口、互相重疊一點，彎曲時不會破洞），總長約 3 倍；再整體縮到接在本體上的大小
TAIL_BAND = (-0.34, -0.06)
TAIL_COPIES = 6
TAIL_OVERLAP = 0.012
TAIL_SCALE = 0.5
TAIL_SECTIONS = []


def lengthen_tail(bm):
    a, b = TAIL_BAND
    for y in (a, b):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-4, plane_co=(0, y, 0), plane_no=(0, 1, 0))
        cut_edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        bmesh.ops.split_edges(bm, edges=cut_edges)
    L = b - a - TAIL_OVERLAP
    band = [f for f in bm.faces if a < f.calc_center_median().y < b]
    stump_verts = {v for f in bm.faces if f.calc_center_median().y <= a for v in f.verts}
    for v in stump_verts:
        v.co.y -= L * (TAIL_COPIES - 1)
    for i in range(1, TAIL_COPIES):
        dup = bmesh.ops.duplicate(bm, geom=band)
        verts = [g for g in dup["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=verts, vec=(0, -L * i, 0))
    # 每段封口（封口的面沒有貼圖，在裡面看不到）
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    for v in bm.verts:
        v.co *= TAIL_SCALE
    # 每段的範圍（從本體接上的斷口 → 臉）：骨架用
    TAIL_SECTIONS[:] = [(a - L * (TAIL_COPIES - 1)) * TAIL_SCALE] + [(a - L * i + L) * TAIL_SCALE for i in range(TAIL_COPIES - 1, -1, -1)]


# 減面後改形狀（切開的部位減面後才複製，面數才算得準）
# 酸液甲蟲的砲管：從頭的正面往前伸的短管，末端是往內凹的洞。減面後才加（不要被減掉）；顏色在下面照位置上
BEETLE_GUN = {"base": (0, -0.335, -0.135), "tip": (0, -0.42, -0.1455), "sides": 12, "bore": 0.015}
BEETLE_GUN_VERTS = set()


def add_beetle_gun(bm):
    base, tip = Vector(BEETLE_GUN["base"]), Vector(BEETLE_GUN["tip"])
    axis = (tip - base).normalized()
    u = axis.cross(Vector((0, 0, 1))).normalized()
    v = axis.cross(u).normalized()
    n = BEETLE_GUN["sides"]
    # 剖面（半徑, 沿砲管的比例）：後端粗（兩倍直徑）往前收細 → 砲口內緣 → 洞壁 → 洞底
    bore = BEETLE_GUN["bore"]
    profile = [(0.044, 0.0), (0.033, 0.5), (0.022, 1.0), (bore, 1.0), (bore, 0.5), (0.001, 0.5)]
    length = (tip - base).length
    rings = []
    for r, t in profile:
        c = base + axis * (length * t)
        rings.append([bm.verts.new(c + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r) for k in range(n)])
    for ring in rings:
        for x in ring:
            BEETLE_GUN_VERTS.add(tuple(round(c, 4) for c in x.co))
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((a[k], b[k], b[k2]))
            bm.faces.new((a[k], b[k2], a[k2]))


# 單眼浮體的瞳孔：減面後貼圖的十字看不出來，另外做一顆貼在眼球上的四角光芒（外層金色、內層亮白；x 半寬、z 半高、凹處半徑）
EYE_STAR = {"center": (0.0, 0.05), "layers": [(0.125, 0.118, 0.044, 0.004, 0xffd21e), (0.07, 0.066, 0.025, 0.014, 0xfff8c8)]}
EYE_STAR_VERTS = {}


def add_eye_star(bm):
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    cx, cz = EYE_STAR["center"]

    def on_eye(x, z, out):
        hit, *_ = tree.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        v = bm.verts.new(Vector((x, hit.y - out, z)))
        return v

    made = []
    for rx, rz, inner, out, color in EYE_STAR["layers"]:
        ring = []
        for k in range(8):
            a = math.pi * k / 4
            # 偶數是四個尖角，奇數是尖角之間的凹處
            px, pz = (rx * math.cos(a), rz * math.sin(a)) if k % 2 == 0 else (inner * math.cos(a), inner * math.sin(a))
            ring.append(on_eye(cx + px, cz + pz, out))
        made.append((on_eye(cx, cz, out + 0.002), ring, color))
    for center, ring, color in made:
        for x in [center, *ring]:
            EYE_STAR_VERTS[tuple(round(c, 4) for c in x.co)] = color
        for k in range(8):
            bm.faces.new((center, ring[k], ring[(k + 1) % 8]))


AFTER_DECIMATE = {"abyss_dragon_tail": lengthen_tail, "acid_beetle": add_beetle_gun, "eye_floater": add_eye_star}


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
    base0 = name[:-3] if name.endswith("_ai") else name
    if base0 in ROTATE_Z:
        obj.data.transform(Matrix.Rotation(math.radians(ROTATE_Z[base0]), 4, "Z"))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if cut:
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(cut(v.co) for v in f.verts)], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        # 骨龍：切掉多餘的腳留下的開口補起來，否則從旁邊看得到身體裡面（補的面沒有貼圖，下面當黑面處理）
        if name.startswith(("bone_dragon", "abyss_hand", "acid_beetle", "wheel_sword_beast")):
            bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    base = name[:-3] if name.endswith("_ai") else name
    if base in RESHAPE:
        RESHAPE[base](bm)
    bm.to_mesh(obj.data)
    bm.free()
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    dec = obj.modifiers.new("dec", "DECIMATE")
    dec.ratio = min(1.0, tris / len(obj.data.polygons))
    bpy.ops.object.modifier_apply(modifier=dec.name)
    if base in AFTER_DECIMATE:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        AFTER_DECIMATE[base](bm)
        bm.to_mesh(obj.data)
        bm.free()
    split = SPLIT_EDGE.get(base)
    if split:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        for _ in range(3):
            long_edges = [e for e in bm.edges if e.calc_length() > split]
            if not long_edges:
                break
            bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=False)
            bmesh.ops.triangulate(bm, faces=bm.faces)
        if base in AFTER_SPLIT:
            AFTER_SPLIT[base](bm)
        bm.to_mesh(obj.data)
        bm.free()
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
src, face_color = load(os.path.join(folder, "ai", f"{PART or 'trellis-1'}.glb"), TRIS_OF.get(NAME, TRIS), f"{NAME}_ai", CLEANUP.get(NAME))
me = src.data
# 石頭獸：拳頭比腳底低約 3 公分（單圖生成的誤差），壓平到腳底的高度，否則腳會浮在地上
if NAME in FLOOR_AT:
    for v in me.vertices:
        v.co.z = max(v.co.z, FLOOR_AT[NAME])


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


def humanoid(spine, radii, arm, arm_radii, leg, leg_radii, clav_from, clav_radius):
    """人形魔王（BossRig 的關節名稱）。spine：骨盆 → 腰 → 胸 → 頸 → 頭 → 頭頂；arm：肩 → 肘 → 腕 → 指根 → 指尖；leg：髖 → 膝 → 踝 → 趾根 → 趾尖（都是左半邊 +X）"""
    bones = chain(["root", "torso", "chest", "neck", "head"], None, [V(p) for p in spine], radii)

    def side(s, m):
        out = [(f"ex_clav{s}", "chest", m(V(clav_from)), m(V(arm[0])), clav_radius)]
        out += chain([f"upperArm{s}", f"forearm{s}", f"hand{s}", f"ex_fingers{s}"], f"ex_clav{s}", [m(V(p)) for p in arm], arm_radii)
        return out + chain([f"thigh{s}", f"shin{s}", f"foot{s}", f"ex_toe{s}"], "root", [m(V(p)) for p in leg], leg_radii)

    return bones + sides(side)


def monster_humanoid(spine, radii, arm, arm_radii, leg, leg_radii, clav_from, clav_radius):
    """
    一般人形怪（MonsterParts.humanoid 的關節名稱，動作沿用舊版）：骨盆 → 腰（到頸）→ 頸 → 頭 → 頭頂；
    手：肩 → 肘 → 腕 → 指尖；腳：髖 → 膝 → 踝 → 趾尖（都是左半邊 +X）。肩膀多一根鎖骨（動作不轉它），讓肩膀和身體平順地接起來
    """
    bones = chain(["root", "torso", "neck", "head"], None, [V(p) for p in spine], radii)

    def side(s, m):
        out = [(f"ex_clav{s}", "torso", m(V(clav_from)), m(V(arm[0])), clav_radius)]
        out += chain([f"upperArm{s}", f"forearm{s}", f"hand{s}"], f"ex_clav{s}", [m(V(p)) for p in arm], arm_radii)
        return out + chain([f"thigh{s}", f"shin{s}", f"foot{s}"], "root", [m(V(p)) for p in leg], leg_radii)

    return bones + sides(side)


def skeleton():
    """骷髏戰士：瘦長的骨架、斜背的皮帶、腰前的破布；空手（劍與盾由遊戲端畫）"""
    return monster_humanoid(
        [(0, 0, 0.0), (0, 0, 0.06), (0, -0.01, 0.285), (0, -0.01, 0.31), (0, -0.01, 0.5)], [0.07, 0.09, 0.03, 0.08],
        [(0.125, 0.01, 0.25), (0.195, 0.03, 0.09), (0.25, 0.02, -0.045), (0.24, 0.0, -0.17)], [0.04, 0.035, 0.035],
        [(0.1, 0, -0.06), (0.128, 0, -0.21), (0.14, 0.02, -0.42), (0.14, -0.12, -0.48)], [0.05, 0.045, 0.035],
        (0.03, 0, 0.255), 0.04,
    ), {}


def frost_skeleton():
    """冰霜骷髏：肩上、前臂、頭頂長著冰晶，膝上有冰甲；空手（劍與盾由遊戲端畫）"""
    return monster_humanoid(
        [(0, 0, 0.0), (0, 0, 0.06), (0, -0.03, 0.26), (0, -0.04, 0.285), (0, -0.04, 0.45)], [0.07, 0.09, 0.03, 0.08],
        [(0.15, 0.02, 0.2), (0.19, 0.03, 0.08), (0.23, 0.03, -0.04), (0.24, 0.02, -0.155)], [0.04, 0.04, 0.035],
        [(0.1, 0, -0.05), (0.105, 0, -0.23), (0.13, 0.03, -0.42), (0.13, -0.12, -0.48)], [0.05, 0.045, 0.035],
        (0.04, 0, 0.23), 0.045,
    ), {}


def skeleton_archer():
    """骷髏弓手：兜帽、短披肩、背後的箭筒（跟腰）、皮護腕與長靴；空手（弓由遊戲端畫）"""
    return monster_humanoid(
        [(0, 0, 0.0), (0, 0, 0.06), (0, -0.03, 0.25), (0, -0.04, 0.27), (0, -0.04, 0.48)], [0.07, 0.09, 0.03, 0.08],
        [(0.13, 0, 0.165), (0.15, 0, 0.07), (0.19, 0, -0.045), (0.18, -0.01, -0.135)], [0.035, 0.035, 0.03],
        [(0.08, 0, -0.06), (0.1, 0, -0.19), (0.12, 0, -0.42), (0.12, -0.135, -0.48)], [0.045, 0.045, 0.035],
        (0.035, 0, 0.2), 0.04,
    ), {}


def armored_skeleton():
    """重甲骷髏：全身厚重的鏽斑板甲、頭盔露出骷髏臉、紅盔纓、腰帶與紅色前襬；空手（斧頭由遊戲端畫）"""
    return monster_humanoid(
        [(0, 0, 0.0), (0, 0, 0.06), (0, -0.01, 0.27), (0, -0.01, 0.3), (0, 0.0, 0.47)], [0.1, 0.14, 0.05, 0.1],
        [(0.17, 0, 0.24), (0.215, 0, 0.08), (0.245, -0.01, -0.05), (0.25, -0.02, -0.15)], [0.07, 0.07, 0.05],
        [(0.1, 0, -0.03), (0.12, 0, -0.22), (0.13, 0, -0.42), (0.13, -0.14, -0.48)], [0.08, 0.075, 0.06],
        (0.05, 0, 0.23), 0.09,
    ), {}


def skeleton_mage():
    """骷髏法師：尖兜帽、斗篷領、喇叭袖、蓋到腳踝的長袍（腿不帶動長袍，只有靴子跟著腳）；空手（法杖由遊戲端畫）"""
    return monster_humanoid(
        [(0, 0, 0.0), (0, 0, 0.06), (0, -0.01, 0.25), (0, -0.01, 0.27), (0, 0.0, 0.47)], [0.1, 0.1, 0.04, 0.1],
        [(0.12, 0, 0.18), (0.21, 0, 0.05), (0.25, -0.01, -0.07), (0.25, -0.02, -0.17)], [0.05, 0.06, 0.03],
        [(0.08, 0, -0.06), (0.1, 0, -0.26), (0.12, 0, -0.43), (0.12, -0.14, -0.49)], [0.02, 0.03, 0.05],
        (0.04, 0, 0.17), 0.07,
    ), {}


def storm_mage():
    """雷霆法師：尖兜帽、肩上一對彎角、喇叭袖、長袍上有電光紋（腿不帶動長袍，只有靴子跟著腳）；空手（法杖由遊戲端畫）"""
    return monster_humanoid(
        [(0, 0, 0.0), (0, 0, 0.06), (0, -0.01, 0.24), (0, -0.01, 0.26), (0, 0.0, 0.47)], [0.1, 0.1, 0.04, 0.1],
        [(0.125, 0, 0.17), (0.215, 0, 0.05), (0.235, -0.01, -0.05), (0.235, -0.02, -0.16)], [0.05, 0.06, 0.03],
        [(0.08, 0, -0.06), (0.1, 0, -0.25), (0.14, 0, -0.41), (0.14, -0.13, -0.49)], [0.02, 0.03, 0.05],
        (0.04, 0, 0.17), 0.07,
    ), {}


def ghoul():
    """食屍鬼：嚴重駝背、頭往前伸、長臂垂到膝蓋前、長爪；背上一排骨刺"""
    return monster_humanoid(
        [(0, 0.14, 0.0), (0, 0.12, 0.06), (0, -0.08, 0.2), (0, -0.17, 0.22), (0, -0.36, 0.21)], [0.09, 0.14, 0.05, 0.09],
        [(0.19, 0.0, 0.15), (0.3, -0.03, -0.04), (0.38, -0.13, -0.12), (0.42, -0.15, -0.33)], [0.06, 0.05, 0.05],
        [(0.075, 0.15, -0.03), (0.15, 0.075, -0.17), (0.18, 0.19, -0.36), (0.2, 0.0, -0.43)], [0.07, 0.06, 0.05],
        (0.05, 0.02, 0.17), 0.07,
    ), {}


def venom_ghoul():
    """毒液食屍鬼：背上鼓著一大片綠色膿包、臉往前伸、長爪滴著毒液"""
    return monster_humanoid(
        [(0, 0.11, -0.06), (0, 0.1, 0.0), (0, -0.12, 0.13), (0, -0.17, 0.12), (0, -0.3, 0.04)], [0.1, 0.15, 0.06, 0.1],
        [(0.24, -0.03, 0.15), (0.36, -0.03, -0.03), (0.39, -0.1, -0.13), (0.42, -0.15, -0.33)], [0.07, 0.06, 0.05],
        [(0.08, 0.12, -0.1), (0.15, 0.075, -0.24), (0.19, 0.105, -0.36), (0.19, -0.045, -0.4)], [0.08, 0.07, 0.05],
        (0.06, 0.0, 0.18), 0.08,
    ), {}


def void_spore():
    """虛空孢子：滿是尖刺的甲殼球（root）、正面的眼（head）、底下四條短觸手（每條 3 節，關節名稱同 Creatures.floater）"""
    bones = [("root", None, V((0, 0, -0.05)), V((0, 0, 0.3)), 0.3), ("head", "root", V((0, -0.3, 0)), V((0, -0.46, 0)), 0.1)]
    for names, (x, y) in ((("upperArmL", "forearmL", "handL"), (0.18, 0)), (("upperArmR", "forearmR", "handR"), (-0.18, 0)),
                          (("thighL", "shinL", "footL"), (0, -0.18)), (("thighR", "shinR", "footR"), (0, 0.18))):
        pts = [V((x * k, y * k, z)) for k, z in ((0.75, -0.33), (0.9, -0.39), (1.0, -0.44), (1.02, -0.5))]
        bones += chain(list(names), "root", pts, [0.05, 0.045, 0.04])
    return bones, {}


def void_maw():
    """虛空吞噬者：一條巨蟲，前半身抬起、圓形巨口；身體由前到後 head → neck → torso → root → ponytail → thighL → shinL → footL（同舊版的關節）"""
    path = [(-0.47, 0.12), (-0.29, 0.03), (-0.2, -0.08), (-0.1, -0.15), (0.0, -0.155), (0.09, -0.155), (0.18, -0.155), (0.27, -0.155), (0.36, -0.155), (0.46, -0.16)]
    # 頭和脖子往 +X 偏（生成的模型抬頭時歪向一邊）
    xs = [0.14, 0.1, 0.05] + [0] * (len(path) - 3)
    P = [V((x, y, z)) for x, (y, z) in zip(xs, path)]
    bones = [
        ("root", None, P[4], P[3], 0.1),
        ("torso", "root", P[3], P[2], 0.1),
        ("neck", "torso", P[2], P[1], 0.1),
        ("head", "neck", P[1], P[0], 0.13),
    ]
    bones += chain(["ponytail", "thighL", "shinL", "footL"], "root", [P[5], P[6], P[7], P[8], P[9]], [0.09, 0.085, 0.08, 0.07])
    # root 到 ponytail 之間的那段跟 root
    bones[0] = ("root", None, P[5], P[3], 0.1)
    # 嘴的一圈骨頭：支點在嘴的後方，轉動時口緣往外張開或往內縮（權重在下面另外算）
    center = V((MAW_MOUTH[0], -0.3, MAW_MOUTH[1]))
    for i in range(MAW_RING_BONES):
        a = 2 * math.pi * i / MAW_RING_BONES
        bones.append((f"ex_mouth{i}", "head", center.copy(), V((MAW_MOUTH[0] + math.cos(a) * 0.09, -0.44, MAW_MOUTH[1] + math.sin(a) * 0.09)), 0.01))
    return bones, {}


def lava_behemoth():
    """熔岩巨獸：粗壯的人形，巨大的岩拳、肩上的巨岩跟著鎖骨"""
    return humanoid(
        [(0, 0, -0.03), (0, 0, 0.04), (0, 0, 0.13), (0, -0.04, 0.24), (0, -0.07, 0.28), (0, -0.07, 0.44)], [0.11, 0.12, 0.14, 0.05, 0.08],
        [(0.25, 0, 0.2), (0.29, -0.01, 0.06), (0.33, -0.04, -0.1), (0.34, -0.07, -0.18), (0.35, -0.07, -0.27)], [0.09, 0.11, 0.09, 0.06],
        [(0.13, 0, -0.055), (0.135, -0.01, -0.2), (0.16, -0.03, -0.36), (0.185, -0.09, -0.42), (0.19, -0.17, -0.44)], [0.09, 0.08, 0.07, 0.05],
        (0.06, 0, 0.22), 0.13,
    ), {}


def fallen_knight():
    """墮落騎士：全身板甲；背後的披風（ex_capeC?）與腰前的布（cloth）是獨立的骨頭，會延遲擺動"""
    bones = humanoid(
        [(0, -0.02, -0.03), (0, -0.03, 0.05), (0, -0.04, 0.14), (0, -0.04, 0.25), (0, -0.04, 0.28), (0, -0.03, 0.42)], [0.1, 0.1, 0.12, 0.05, 0.08],
        [(0.19, -0.03, 0.22), (0.24, -0.03, 0.08), (0.255, -0.04, -0.07), (0.24, -0.05, -0.12), (0.23, -0.06, -0.17)], [0.08, 0.08, 0.06, 0.04],
        [(0.1, -0.02, -0.06), (0.11, -0.02, -0.235), (0.135, 0, -0.4), (0.14, -0.06, -0.47), (0.15, -0.14, -0.49)], [0.085, 0.07, 0.06, 0.04],
        (0.06, -0.03, 0.23), 0.1,
    )
    bones += chain(["ex_capeC1", "ex_capeC2"], "chest", [V((0, 0.08, 0.18)), V((0, 0.12, 0)), V((0, 0.14, -0.24))], [0.2, 0.2])
    bones.append(("cloth", "root", V((0, -0.13, -0.02)), V((0, -0.14, -0.22)), 0.08))
    return bones, {}


def crypt_guardian():
    """墓穴守衛：矮壯的重甲；背後的破披風（ex_capeC?）與腰前的紅布（cloth）是獨立的骨頭"""
    bones = humanoid(
        [(0, 0, -0.03), (0, 0, 0.04), (0, 0, 0.14), (0, -0.01, 0.25), (0, -0.02, 0.28), (0, -0.02, 0.42)], [0.12, 0.12, 0.13, 0.05, 0.08],
        [(0.23, 0.015, 0.24), (0.275, 0.015, 0.09), (0.29, 0.01, -0.07), (0.295, -0.03, -0.13), (0.295, -0.03, -0.19)], [0.085, 0.095, 0.06, 0.04],
        [(0.11, 0, -0.06), (0.15, 0, -0.22), (0.2, 0.015, -0.4), (0.205, -0.04, -0.47), (0.22, -0.12, -0.49)], [0.1, 0.09, 0.07, 0.05],
        (0.07, 0.01, 0.25), 0.11,
    )
    bones += chain(["ex_capeC1", "ex_capeC2"], "chest", [V((0, 0.1, 0.2)), V((0, 0.14, 0)), V((0, 0.16, -0.2))], [0.2, 0.2])
    bones.append(("cloth", "root", V((0, -0.14, 0)), V((0, -0.15, -0.2)), 0.07))
    return bones, {}


def fallen_priest():
    """墮落神官：長袍蓋住腿（大腿、小腿不帶動長袍，只有靴子跟著腳）；長袍下半分成前後左右四片（cloth、clothBack、ex_tasset?），會延遲擺動"""
    bones = humanoid(
        [(0, 0, -0.05), (0, 0, 0.03), (0, -0.01, 0.12), (0, -0.03, 0.2), (0, -0.03, 0.23), (0, -0.05, 0.45)], [0.13, 0.1, 0.11, 0.04, 0.1],
        [(0.17, -0.02, 0.19), (0.225, -0.015, 0.08), (0.255, -0.02, -0.02), (0.26, -0.05, -0.055), (0.26, -0.05, -0.105)], [0.06, 0.07, 0.04, 0.03],
        [(0.08, -0.02, -0.08), (0.1, -0.03, -0.26), (0.12, -0.03, -0.43), (0.12, -0.06, -0.48), (0.12, -0.13, -0.5)], [0.02, 0.05, 0.05, 0.03],
        (0.05, -0.01, 0.19), 0.09,
    )
    bones.append(("cloth", "root", V((0, -0.1, -0.05)), V((0, -0.14, -0.42)), 0.15))
    bones.append(("clothBack", "root", V((0, 0.08, -0.05)), V((0, 0.18, -0.42)), 0.15))
    bones.append(("ex_tassetL", "root", V((0.14, 0, -0.05)), V((0.26, 0, -0.42)), 0.15))
    bones.append(("ex_tassetR", "root", V((-0.14, 0, -0.05)), V((-0.26, 0, -0.42)), 0.15))
    return bones, {}


def stone_walker():
    """石頭獸：大猩猩般用拳頭撐地；小頭往前探在肩膀之間、腿短且在身體後方。遊戲端不轉正四肢（靜止姿勢就是模型的樣子）"""
    return humanoid(
        [(0, 0.14, -0.1), (0, 0.08, -0.03), (0, -0.02, 0.1), (0, -0.16, 0.12), (0, -0.2, 0.1), (0, -0.33, 0.03)], [0.14, 0.16, 0.2, 0.06, 0.11],
        [(0.31, -0.03, 0.14), (0.37, -0.015, 0), (0.345, -0.04, -0.16), (0.33, -0.04, -0.26), (0.33, -0.04, -0.378)], [0.1, 0.11, 0.11, 0.1],
        [(0.125, 0.17, -0.12), (0.13, 0.2, -0.24), (0.13, 0.22, -0.32), (0.13, 0.18, -0.36), (0.13, 0.13, -0.375)], [0.09, 0.08, 0.06, 0.03],
        (0.08, -0.02, 0.2), 0.15,
    ), {}


def bone_hand():
    """骸手爬行者：身體是一顆骨球（後面是眼睛），手臂從身體前方斜往前上、手掌朝前；每邊 9 隻腳。座標是轉 180° 之後的（手掌朝 -Y）"""
    spine = [
        ("root", None, V((0, 0.0, -0.1)), V((0, -0.14, -0.12)), 0.06),
        ("ex_ball", "root", V((0, 0.06, -0.08)), V((0, 0.2, -0.05)), 0.095),
        ("ex_arm", "root", V((0, 0.03, -0.06)), V((0, -0.085, 0.135)), 0.05),
        ("ex_palm", "ex_arm", V((0, -0.09, 0.14)), V((0, -0.42, 0.15)), 0.09),
        ("ex_fingCa", "ex_palm", V((0, -0.25, 0.26)), V((0, -0.33, 0.41)), 0.03),
        ("ex_fingCb", "ex_fingCa", V((0, -0.33, 0.41)), V((0, -0.443, 0.35)), 0.025),
    ]
    # 腳（左，由前到後）：髖 → 膝 → 腳尖；最後兩隻短、腳尖不著地
    legs = [
        [(0.05, -0.17, -0.12), (0.07, -0.25, -0.17), (0.082, -0.405, -0.413)],
        [(0.06, -0.17, -0.12), (0.11, -0.24, -0.17), (0.165, -0.37, -0.41)],
        [(0.08, -0.12, -0.11), (0.15, -0.176, -0.16), (0.228, -0.272, -0.4)],
        [(0.08, -0.06, -0.1), (0.175, -0.07, -0.09), (0.318, -0.105, -0.413)],
        [(0.08, 0.015, -0.1), (0.17, 0.015, -0.1), (0.322, 0.014, -0.413)],
        [(0.08, 0.09, -0.1), (0.17, 0.105, -0.08), (0.322, 0.14, -0.413)],
        [(0.08, 0.15, -0.1), (0.142, 0.2, -0.08), (0.28, 0.3, -0.4)],
        [(0.06, 0.24, -0.1), (0.105, 0.311, -0.08), (0.163, 0.46, -0.27)],
        [(0.05, 0.3, -0.09), (0.093, 0.393, -0.08), (0.09, 0.505, -0.26)],
    ]

    def side(s, m):
        out = []
        for n, pts in (("I", [(0.07, -0.24, 0.26), (0.085, -0.32, 0.4), (0.085, -0.42, 0.33)]), ("O", [(0.125, -0.2, 0.22), (0.175, -0.235, 0.34), (0.194, -0.363, 0.2)])):
            out += chain([f"ex_fing{n}{s}a", f"ex_fing{n}{s}b"], "ex_palm", [m(V(p)) for p in pts], [0.03, 0.025])
        out += chain([f"ex_thumb{s}"], "ex_palm", [m(V((0.215, -0.155, 0.4))), m(V((0.18, -0.19, 0.285)))], [0.04])
        for i, leg in enumerate(legs):
            n = f"ex_leg{s}{i + 1}"
            out += chain([n + "a", n + "b"], "root", [m(V(p)) for p in leg], [0.035, 0.025])
        return out

    return spine + sides(side), {"legs": len(legs)}


def bone_dragon():
    """骨龍：身體就是一張巨口。上顎（head）掛在背上、下顎（jaw）掛在骨盆，兩根骨頭在嘴的最後方分開；肩背兩側各兩根觸手（A 上、B 下），四隻腳"""
    spine = [
        ("root", None, V((0, 0.10, -0.10)), V((0, 0.28, -0.12)), 0.16),
        ("torso", "root", V((0, 0.10, -0.10)), V((0, 0.08, 0.05)), 0.16),
        ("chest", "torso", V((0, 0.08, 0.05)), V((0, 0.16, 0.14)), 0.14),
        ("head", "chest", V((0, -0.02, 0.03)), V((0, -0.38, 0.13)), 0.09),
        ("jaw", "root", V((0, -0.02, -0.03)), V((0, -0.36, -0.14)), 0.10),
    ]

    def side(s, m):
        out = chain([f"ex_tentA{s}{i}" for i in range(1, 5)], "chest",
                    [m(V((0.17, -0.09, 0.08))), snap(m(V((0.28, -0.09, 0.19)))), snap(m(V((0.38, -0.07, 0.27)))), snap(m(V((0.44, -0.06, 0.27)))), m(V((0.49, -0.05, 0.22)))],
                    [0.06, 0.055, 0.05, 0.05])
        out += chain([f"ex_tentB{s}{i}" for i in range(1, 5)], "chest",
                     [m(V((0.20, 0.0, 0.0))), snap(m(V((0.31, 0.05, 0.08)))), snap(m(V((0.40, 0.08, 0.14)))), snap(m(V((0.45, 0.09, 0.12)))), m(V((0.49, 0.10, 0.06)))],
                     [0.06, 0.055, 0.05, 0.05])
        # 前腳：人形骨架的腿；後腳：斜向後
        out += chain([f"thigh{s}", f"shin{s}", f"foot{s}", f"ex_toe{s}"], "root",
                     [m(V((0.23, -0.10, -0.12))), m(V((0.25, -0.16, -0.21))), m(V((0.25, -0.20, -0.28))), m(V((0.25, -0.24, -0.31))), m(V((0.25, -0.31, -0.33)))],
                     [0.07, 0.07, 0.06, 0.05])
        out += chain([f"ex_hthigh{s}", f"ex_hshin{s}", f"ex_hfoot{s}", f"ex_htoe{s}"], "root",
                     [m(V((0.24, 0.08, -0.10))), m(V((0.29, 0.17, -0.20))), m(V((0.30, 0.26, -0.28))), m(V((0.30, 0.31, -0.31))), m(V((0.30, 0.39, -0.33)))],
                     [0.07, 0.07, 0.06, 0.05])
        return out

    return spine + sides(side), {}


def abyss_dragon():
    """眼：骨盆 → 背甲（chest）→ 眼球（head）；眼球周圍八根爪（ex_claw?a 根部、ex_claw?b 爪尖，掛在眼球上，收合時往前合起來）；兩腿的腳掌是人手（ex_toe 是手指）；翅膀放大後的翼骨"""
    bones = [
        ("root", None, V((0, 0.03, -0.10)), V((0, 0.03, -0.02)), 0.1),
        ("chest", "root", V((0, 0.05, -0.02)), V((0, 0.05, 0.2)), 0.12),
        ("head", "chest", V((0, -0.02, 0.05)), V((0, -0.16, 0.05)), 0.1),
    ]
    # 爪：根部 → 中段 → 爪尖（中段放在爪的中心）
    def claw(n, root, mid, tip):
        return chain([f"ex_claw{n}a", f"ex_claw{n}b"], "head", [V(root), snap(V(mid), 0.05), V(tip)], [0.06, 0.03])

    bones += claw("T", (0, 0.0, 0.2), (0, -0.12, 0.31), (0, -0.274, 0.291))
    bones += claw("B", (0, -0.04, -0.07), (0, -0.14, -0.11), (0.003, -0.292, -0.019))

    def side(s, m):
        out = claw(f"U{s}", tuple(m(V((0.12, -0.03, 0.12)))), tuple(m(V((0.19, -0.15, 0.16)))), tuple(m(V((0.148, -0.31, 0.104)))))
        out += claw(f"D{s}", tuple(m(V((0.12, -0.03, -0.01)))), tuple(m(V((0.2, -0.13, -0.04)))), tuple(m(V((0.15, -0.29, 0.01)))))
        # 上方兩根往後彎（TRELLIS 把四視圖的爪尖畫到背甲上方）
        out += claw(f"R{s}", tuple(m(V((0.1, 0.0, 0.18)))), tuple(m(V((0.12, 0.07, 0.3)))), tuple(m(V((0.08, 0.16, 0.31)))))
        # 腿：髖 → 膝 → 踝 → 手指根 → 指尖
        out += chain([f"thigh{s}", f"shin{s}", f"foot{s}", f"ex_toe{s}"], "root",
                     [m(V((0.15, 0.03, -0.10))), m(V((0.16, 0.03, -0.21))), m(V((0.17, 0.03, -0.29))), m(V((0.18, -0.09, -0.345))), m(V((0.18, -0.19, -0.36)))],
                     [0.09, 0.08, 0.07, 0.04])
        # 翅膀：肩胛 → 翼肘（頂端的眼睛）；翼肘伸出翼指撐住翼膜（ex_wing?3～5 跟著翼肘）
        elbow = m(V(wing_stretch(0.256, 0.04, 0.335)))
        out.append((f"ex_wing{s}1", "chest", m(V((0.2, 0.04, 0.14))), elbow, 0.03))
        out.append((f"ex_wing{s}2", f"ex_wing{s}1", elbow, m(V(wing_stretch(0.49, 0.04, 0.07))), 0.02))
        for k, (ex, ez) in enumerate(WING_EYES[2:] + [(0.405, -0.03)]):
            out.append((f"ex_wing{s}{k + 3}", f"ex_wing{s}2", elbow, m(V(wing_stretch(ex, 0.04, ez))), 0.02))
        return out

    for i in range(MOUTH_BONES):
        a = 2 * math.pi * i / MOUTH_BONES
        bones.append((f"ex_mouth{i}", "head", EYE_CENTER.copy(), V((math.cos(a) * 0.08, -0.17, EYE_CENTER.z + math.sin(a) * 0.08)), 0.01))
    return bones + sides(side), {}


def abyss_dragon_tail():
    """眼的尾巴：從斷口到臉一節一節（ex_tail1～N、最後是臉 ex_tailHead），每節是一段重複的甲殼；root 是斷口。遊戲端第三階段脫離時，反過來由臉帶頭爬行"""
    sec = TAIL_SECTIONS
    y0 = sec[0]
    ax = lambda y: V((0, y, 0))
    bones = [("root", None, ax(y0), ax(y0 + 0.02), 0.08)]
    names = [f"ex_tail{i + 1}" for i in range(len(sec) - 1)]
    points = [ax(y0 + 0.02)] + [ax(y) for y in sec[1:]]
    # 第一節從斷口開始，最後一節是臉
    bones += chain(names, "root", points, [0.05] * len(names))
    top = max(c.y for c in co)
    bones.append(("ex_tailHead", names[-1], ax(sec[-1]), ax(top), 0.09))
    return bones, {"tailSections": [round(y, 5) for y in sec]}


def abyss_hand():
    """手的身體：上手臂（root）、手肘的眼睛（ex_eye）、四對蜘蛛腳（ex_leg?1～4a 髖 → 膝、b 膝 → 腳尖）；前臂接在手肘上（遊戲端合併）"""
    bones = [
        ("root", None, V((0, 0.0, 0.13)), V((0, 0.3, 0.13)), 0.09),
        ("ex_ball", "root", V((0, 0.33, 0.13)), V((0, 0.5, 0.13)), 0.08),
        ("ex_eye", "root", V(tuple(HAND_EYE)), V((0, -0.5, HAND_EYE.z)), 0.17),
    ]

    def side(s, m):
        out = []
        for i, (cy, yaw) in enumerate(HAND_LEGS):
            hip = V((HAND_HIP[0], cy, 0.12))
            knee = V(hand_leg_move(0.225, cy, -0.02, cy, yaw))
            tip = V(hand_leg_move(0.23, cy, -0.354, cy, yaw))
            n = f"ex_leg{s}{i + 1}"
            out += chain([n + "a", n + "b"], "root", [m(hip), m(knee), m(tip)], [0.045, 0.035])
        return out

    return bones + sides(side), {"legs": len(HAND_LEGS)}


def abyss_hand_hand():
    """前臂與手掌（掌心朝 -Y）：ex_arm 手肘 → 手腕、ex_palm 手腕 → 指根、五根手指各三節（ex_fing1～5a、b、c，從 +X 到 -X）"""
    bones = [
        ("root", None, V((0, 0, -0.5)), V((0, 0, -0.44)), 0.05),
        ("ex_arm", "root", V((0, 0, -0.44)), V((0, 0, -0.02)), 0.075),
        ("ex_palm", "ex_arm", V((0, 0, -0.02)), V((0, 0, 0.17)), 0.09),
    ]
    # 模型的 y → -x：指根 → 指尖
    fingers = [
        ((0.144, 0.0, 0.043), (0.273, -0.02, 0.216)),
        ((0.1, 0.0, 0.187), (0.187, -0.03, 0.431)),
        ((0.009, 0.0, 0.187), (-0.009, -0.03, 0.495)),
        ((-0.063, 0.0, 0.187), (-0.178, -0.03, 0.425)),
        ((-0.109, 0.0, 0.086), (-0.264, -0.02, 0.236)),
    ]
    for i, (a, b) in enumerate(fingers):
        a, b = V(a), V(b)
        n = f"ex_fing{i + 1}"
        bones += chain([n + "a", n + "b", n + "c"], "ex_palm", [snap(a, 0.05), snap(a.lerp(b, 0.36), 0.04), snap(a.lerp(b, 0.68), 0.04), b], [0.035, 0.03, 0.025])
    return bones, {}


# 另外生成的獨立物件（<資料夾>/ai/<名稱>.glb → 不綁骨架的網格，遊戲端掛在關節上或掉在地上）：名稱 → 三角形數
PROPS = {"abyss_sovereign": {"sword": 1500, "shield": 2500}}


def limb_zone(in_arm, wing_ok):
    """
    人形魔王的手臂區（只看距離會分錯）：手臂和軀幹、大腿之間只有幾公分的空隙，軀幹側面、腋下、大腿外側
    會跟著手臂，手一舉就被拉成大片三角面。所以只有 in_arm(頂點) 範圍內的頂點能跟手臂骨頭（同一邊），
    範圍內除了手臂只能和鎖骨（肩膀）混合；翅膀骨頭只能在 wing_ok(頂點) 的範圍；兩腳之間垂下的腰布跟骨盆。
    """

    def zone(p, bone):
        arm = re.match(r"(upperArm|forearm|hand|ex_fingers)([LR])$", bone)
        inside = in_arm(p)
        if arm:
            return inside and (arm.group(2) == "L") == (p.x > 0)
        if inside and not bone.startswith("ex_clav"):
            return False
        # 腰布：跟骨盆，不跟左右大腿（否則兩腳分開時被拉成一根連到地上的尖刺）
        if abs(p.x) < 0.05 and p.y < -0.05 and re.match(r"(thigh|shin|foot|ex_toe)[LR]$", bone):
            return False
        # 翅膀下緣垂到腳旁，只看距離會和腳、身體混在一起
        if bone.startswith("ex_wing") and not wing_ok(p):
            return False
        return True

    return zone


def limb_part(bone):
    """骨頭屬於哪個部位：arm / clav / wing / leg / hind 加左右，或 body（軀幹、頭、尾巴）"""
    for pattern, name in ((r"(upperArm|forearm|hand|ex_fingers)", "arm"), (r"ex_clav", "clav"), (r"ex_wing", "wing"), (r"(thigh|shin|foot|ex_toe)", "leg"), (r"ex_h(thigh|shin|foot)", "hind")):
        m = re.match(pattern + r"([LR])\d*$", bone)
        if m:
            return name + m.groups()[-1]
    return "body"


# 部位之間只能從這些關節接起來（部位的根部骨頭 → 可以相連的身體骨頭）
LIMB_ROOTS = {"clav": ("chest", "torso", "neck"), "leg": ("root", "torso"), "hind": ("ex_barrel", "root"), "wing": ("chest", "torso")}
LIMB_ROOT_BONE = {"clav": "ex_clav", "leg": "thigh", "hind": "ex_hthigh", "wing": "ex_wing"}


def limbs_joined(bones, ws):
    """
    一個三角形跨到的骨頭可以留下來嗎：生成的網格把垂下的手、翅膀下緣、兩腳之間的腰布黏在旁邊的部位上，
    這些三角形在動作時會被拉成長條（連到地上的尖刺、翅膀黏著腳、手黏著大腿）。同一個部位、或部位的根部接身體才留下：
    手臂只接同一邊的鎖骨（而且只在肩膀，不到手肘）；鎖骨接胸 / 腰 / 頸；腳的大腿接骨盆；後腳的大腿接獸身；翅膀的根部（第 1 節）接胸。
    """
    parts = {limb_part(b) for b in bones}
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
    if kind not in LIMB_ROOTS:
        return False
    limb = [x for x in bones if limb_part(x) == b]
    body = [x for x in bones if limb_part(x) == "body"]
    root = LIMB_ROOT_BONE[kind]
    return all(x.startswith(root) and (kind != "wing" or x.endswith("1")) for x in limb) and all(x in LIMB_ROOTS[kind] for x in body)


def cloth_zone(p, bone, in_cape, in_cloth):
    """披風（ex_cape*）只在 in_cape 的範圍、腰前的布（cloth）只在 in_cloth 的範圍；範圍內也只能跟披風、布（腰布上緣接骨盆）"""
    cape, front = in_cape(p), in_cloth(p)
    if bone.startswith("ex_cape"):
        return cape
    if bone == "cloth":
        return front
    if cape:
        return bone == "chest"
    return not front or bone == "root"


def priest_zone(p, bone):
    """墮落神官：靴子（長袍下擺裡）只跟腳；大腿不帶動任何頂點；手臂區同其他人形"""
    boot = p.z < -0.37 and 0.05 < abs(p.x) < 0.19 and -0.16 < p.y < 0.03
    if re.match(r"(thigh)[LR]$", bone):
        return False
    if re.match(r"(shin|foot|ex_toe)([LR])$", bone):
        return boot and (bone[-1] == "L") == (p.x > 0)
    if boot:
        return False
    return PRIEST_ARMS(p, bone)


LAVA_ARMS = limb_zone(lambda p: -0.3 < p.z < 0.15 and abs(p.x) > (0.19 if p.z > -0.12 else 0.215 if p.z > -0.215 else 0.25), lambda p: True)
KNIGHT_ARMS = limb_zone(lambda p: -0.2 < p.z < 0.15 and abs(p.x) > (0.175 if p.z > -0.03 else 0.18) and p.y < 0.09, lambda p: True)
CRYPT_ARMS = limb_zone(lambda p: -0.22 < p.z < 0.17 and abs(p.x) > (0.2 if p.z > -0.03 else 0.23) and p.y < 0.11, lambda p: True)
PRIEST_ARMS = limb_zone(lambda p: -0.125 < p.z < 0.17 and abs(p.x) > 0.195 and p.y < 0.07, lambda p: True)

STONE_ARMS = limb_zone(lambda p: p.z < 0.12 and abs(p.x) > (0.2 if p.z < -0.25 else 0.22) and (p.z > -0.25 or p.y < 0.12), lambda p: True)

# 限制某些頂點只能跟哪些骨頭（zone(頂點, 骨頭名稱) → 可以或不可以）；沒有列出的怪物只看距離

# 下顎：絞鏈（嘴角）；嘴的分界線（絞鏈 → 上犬齒後方）與喉嚨的分界線（絞鏈 → 下巴後方）
HOUND_JAW_HINGE = (0, -0.345, -0.02)


def in_hound_jaw(p):
    return abs(p.x) < 0.08 and p.y > -0.45 and p.z < -0.02 + (p.y + 0.345) * 0.65 and p.y < -0.345


def wheel_beast_zone(p, bone):
    """輪子是獨立的剛體（整顆一起轉）；手臂和身體分開，肩上的骨板與水晶跟身體"""
    in_wheel = 0.075 < abs(p.x) < 0.24 and math.hypot(p.y - WHEEL_CENTER[0], p.z - WHEEL_CENTER[1]) < 0.175
    if bone.startswith("thigh"):
        return in_wheel
    if in_wheel:
        return False
    if bone.startswith(("upperArm", "forearm", "hand")):
        return abs(p.x) > 0.235 and p.z < 0.11
    return abs(p.x) < 0.3 or p.z > 0.03


def in_toad_jaw(p):
    return abs(p.x) < 0.235 and p.y < -0.1 and p.z < 0.03


def poison_spitter_zone(p, bone):
    """下顎連喉囊一起；喉囊的左右半邊（ex_sac）可以往外鼓；腿只拿腿的位置"""
    if bone == "jaw" or bone.startswith("ex_sac"):
        return in_toad_jaw(p)
    if in_toad_jaw(p):
        return False
    if bone.startswith(("upperArm", "forearm", "hand")):
        return abs(p.x) > 0.19 and p.y < 0.07 and p.z < 0.07
    if bone.startswith(("thigh", "shin", "foot")):
        return abs(p.x) > 0.19 and p.y > 0.03 and p.z < 0.09
    if bone in ("root", "torso", "neck"):
        return abs(p.x) < 0.3 or p.z > 0.0
    return True


def in_lizard_jaw(p):
    return abs(p.x) < 0.09 and p.y < -0.335 and p.z < 0.02 + (p.y + 0.35) * 0.3


def blood_lizard_zone(p, bone):
    """腿只拿腿的位置：背上的骨板與腹部跟身體；下顎只有嘴的下半部"""
    if bone == "jaw":
        return in_lizard_jaw(p)
    if in_lizard_jaw(p):
        return False
    if bone.startswith(("upperArm", "forearm", "hand")):
        return abs(p.x) > 0.085 and p.y < -0.05 and p.z < 0.05
    if bone.startswith(("thigh", "shin", "foot")):
        return abs(p.x) > 0.06 and -0.03 < p.y < 0.2 and p.z < 0.05
    if bone in ("root", "torso", "neck"):
        return p.z > -0.11
    return True


def eye_floater_zone(p, bone):
    """眼球（連眼瞼以內）跟 head；觸手只拿身體以下的部分"""
    in_eye = p.y < -0.16 and math.hypot(p.x, (p.z - 0.025) * 1.6) < 0.2
    if bone == "head":
        return in_eye
    if in_eye:
        return False
    if bone == "root":
        return p.z > -0.26
    return p.z < -0.17


def in_spider_body(p):
    return (p.x / 0.31) ** 2 + ((p.y - 0.1) / 0.3) ** 2 + ((p.z - 0.03) / 0.23) ** 2 < 1


def hatchling_zone(p, bone):
    """腳和腹部分開；前面兩根觸肢（shin）跟頭"""
    palp = 0.08 < abs(p.x) < 0.26 and p.y < -0.2 and p.z < -0.05
    if bone.startswith("shin"):
        return palp
    if palp:
        return False
    if bone.startswith(("upperArm", "forearm", "hand", "thigh", "ex_leg")):
        return not in_spider_body(p) and abs(p.x) > 0.16
    return in_spider_body(p) or abs(p.x) < 0.2


def bone_hound_zone(p, bone):
    """腿只能拿腿的位置：肋骨與背上的骨刺跟身體，腳掌不被身體搶走；下顎只有嘴下半部"""
    if bone == "jaw":
        return in_hound_jaw(p)
    if in_hound_jaw(p):
        return False
    if bone.startswith(("upperArm", "forearm", "hand")):
        # 手肘的後半（帶兩根小骨刺）在肋骨外側
        return abs(p.x) > 0.06 and (p.y < -0.055 or (abs(p.x) > 0.16 and p.z < 0.06 and p.y < 0.0))
    if bone.startswith(("thigh", "shin", "foot")):
        return p.y > 0.06 and p.z < 0.1
    if bone in ("root", "torso", "neck"):
        return p.z > -0.16
    return True


def acid_beetle_zone(p, bone):
    """甲殼的邊緣跟身體，不跟著腳動"""
    if bone.startswith(("upperArm", "forearm", "hand", "thigh", "ex_leg")):
        # 只拿腳本身的粗細以內：甲殼下緣和腹部不跟著腳動
        a, b = next((a, b) for name, _, a, b, _ in bones if name == bone)
        return p.z < -0.02 and seg_dist(p, a, b) < 0.1
    if bone.startswith("shin") and abs(p.x) < 0.075:
        # 砲管跟頭，不跟大顎
        return False
    if bone == "head" or bone.startswith("shin"):
        return p.y < -0.2 and p.z < 0.03
    return True


ZONES = {
    # 深淵統御者：手臂在身體兩側前半、大腿外側；翅膀在背後高處
    "abyss_sovereign": limb_zone(
        lambda p: p.y < -0.03 and ((-0.08 <= p.z < 0.17 and abs(p.x) > 0.185) or (-0.25 < p.z < -0.08 and abs(p.x) > 0.195)),
        lambda p: p.y > -0.05 and p.z > -0.12 and abs(p.x) > 0.12,
    ),
    # 深淵魔王：手臂垂在大腿外側（手肘以下比大腿更往外）；翅膀在背後
    "abyss_lord": limb_zone(
        lambda p: p.y < 0.02 and -0.25 < p.z < 0.17 and abs(p.x) > (0.17 if p.z >= -0.05 else 0.2),
        lambda p: p.y > -0.02 and abs(p.x) > 0.1,
    ),
    # 熔岩巨獸：巨拳比大腿更往外；肩上的噴孔不跟頭
    "lava_behemoth": lambda p, bone: (not bone.startswith("head") or abs(p.x) < 0.12) and LAVA_ARMS(p, bone),
    # 墮落騎士：手臂在身體兩側；背後的披風、腰前的布只跟自己的骨頭
    "fallen_knight": lambda p, bone: cloth_zone(p, bone, lambda p: p.y > 0.09 and abs(p.x) < 0.2 and p.z < 0.1, lambda p: p.y < -0.085 and abs(p.x) < 0.07 and p.z < -0.02) and KNIGHT_ARMS(p, bone),
    "crypt_guardian": lambda p, bone: cloth_zone(p, bone, lambda p: p.y > 0.115 and abs(p.x) < 0.22 and p.z < 0.14, lambda p: p.y < -0.11 and abs(p.x) < 0.07 and p.z < -0.01) and CRYPT_ARMS(p, bone),
    "fallen_priest": lambda p, bone: priest_zone(p, bone),
    # 石頭獸：頭只帶動正前方；手臂在身體外側，拳頭下方要和後面的腳分開
    "stone_walker": lambda p, bone: (not bone.startswith("head") or (abs(p.x) < 0.16 and p.y < -0.1)) and STONE_ARMS(p, bone),
}

def bone_dragon_zone(p, bone):
    """上下顎以嘴的水平面分開；觸手只帶動身體外側；腳不帶動側腹的塔盾"""
    ax = abs(p.x)
    side_mark = re.search(r"[LR]", bone)
    if side_mark and (p.x > 0) != (side_mark.group() == "L"):
        return False
    # 嘴裡的骷髏與骨手一律跟下顎；分界在上排牙尖的上下（牙尖約 z = 0.043）與骨手最高處（約 z = 0.03）之間
    # 嘴角兩側與喉嚨深處留一條跟身體的皮，張嘴時拉開而不是破洞
    cheek = abs(p.z) < 0.045 and ((ax > 0.15 and p.y > -0.2) or p.y > -0.12)
    if bone == "head":
        return p.z >= 0.035 and p.y < 0.06 and ax < 0.3 and not cheek
    if bone == "jaw":
        return p.z < 0.035 and p.y < 0.0 and (ax < 0.2 or p.z > -0.1) and not cheek
    if bone in ("root", "torso") and p.y < -0.12 and abs(p.z) < 0.05 and ax <= 0.15:
        return False
    if bone.startswith("ex_tentA"):
        return p.z > 0.06 and ax > 0.17
    if bone.startswith("ex_tentB"):
        return p.z > -0.03 and ax > 0.2
    front = re.match(r"(thigh|shin|foot|ex_toe)", bone)
    hind = re.match(r"ex_h", bone)
    if front or hind:
        if p.z > -0.06 or ax < 0.15 or (p.z > -0.2 and ax > 0.29 and -0.02 < p.y < 0.2):
            return False
        return p.y < 0.02 if front else p.y > 0.0
    return True


ZONES["bone_dragon"] = bone_dragon_zone


def abyss_dragon_zone(p, bone):
    """眼球表面只跟眼球；爪在眼球外面；翅膀區只跟翼骨（靠近身體的地方和背甲混合）；腳不帶動背甲；深口的骨頭另外算（mouth_weights）"""
    if bone.startswith("ex_mouth"):
        return False
    side_mark = re.search(r"[LR]$|[UDR][LR]", bone)
    if bone.startswith(("ex_", "thigh", "shin", "foot")) and bone[-1] in "LR" or re.match(r"ex_claw[UDR][LR]", bone) or re.match(r"ex_wing[LR]", bone):
        s = re.search(r"([LR])\d*[ab]?$", bone)
        if s and (p.x > 0) != (s.group(1) == "L"):
            return False
    ax = abs(p.x)
    # 手掌最遠到 |x| = 0.33；比那裡更外面的一定是翅膀（最下面那顆眼睛比手腕還低）
    wing_area = ax > 0.34 or (ax > WING["x0"] and p.z > -0.2 and (p.y > -0.08 or ax > 0.26))
    if bone.startswith("ex_wing"):
        return wing_area
    if wing_area and (ax > WING["x0"] + 0.045 or bone.startswith("ex_claw")):
        return False
    in_eye = (p - EYE_CENTER).length < 0.165 and p.y < 0.02
    if bone.startswith("ex_claw"):
        # 背後的尖甲不跟爪；只有上方往後彎的兩根（R）能到背後
        return not in_eye and (p.y < 0.04 or (bone.startswith("ex_clawR") and p.z > 0.2))
    # 眼球前半、眼球外面的是爪的肉，不跟背甲
    if bone in ("chest", "root") and p.y < -0.05 and not in_eye and p.z > -0.13 and not wing_area:
        return False
    if bone == "head":
        return p.y < 0.05 and p.z > -0.13 and ax < 0.2
    if re.match(r"(thigh|shin|foot|ex_toe)", bone):
        return p.z < -0.13
    return True


ZONES["abyss_dragon"] = abyss_dragon_zone


def abyss_hand_zone(p, bone):
    """手：眼睛整顆跟 ex_eye；腳只帶動身體外側、同一邊"""
    in_eye = (p - HAND_EYE).length < HAND_EYE_R
    if bone == "ex_eye":
        return in_eye
    if in_eye:
        return False
    if bone.startswith("ex_leg"):
        return abs(p.x) > HAND_HIP[0] and (p.x > 0) == (bone[6] == "L")
    return True


ZONES["abyss_hand"] = abyss_hand_zone
# 分開的部位（joined(三角形三個頂點的主要骨頭, 三個頂點的權重) → 可以留下嗎）：跨到不相連部位的三角形在動作時會被拉長，輸出時拿掉
ZONES["skeleton"] = limb_zone(lambda p: (abs(p.x) > 0.125 if p.z > 0.12 else abs(p.x) > 0.15 if p.z > 0 else abs(p.x) > 0.185) and -0.24 < p.z < 0.3, lambda p: True)
ZONES["frost_skeleton"] = limb_zone(lambda p: (abs(p.x) > 0.135 if p.z > 0.12 else abs(p.x) > 0.16 if p.z > 0 else abs(p.x) > 0.175) and -0.24 < p.z < 0.42, lambda p: True)
ZONES["armored_skeleton"] = limb_zone(lambda p: (abs(p.x) > 0.165 if p.z > 0.1 else abs(p.x) > 0.17) and -0.22 < p.z < 0.32, lambda p: True)
_ARCHER_ARMS = limb_zone(lambda p: (abs(p.x) > 0.11 if p.z > 0.1 else abs(p.x) > 0.145) and -0.2 < p.z < 0.24 and p.y < 0.045, lambda p: True)
# 箭筒在背後（頭與手臂不帶動）
ZONES["skeleton_archer"] = lambda p, bone: (bone == "torso" if p.y > 0.07 and p.z > 0.12 else True) and _ARCHER_ARMS(p, bone)
_GHOUL_ARMS = limb_zone(lambda p: ((p.z > 0.08 and abs(p.x) > 0.17) or abs(p.x) > 0.27) and p.y < 0.1 and p.z < 0.25, lambda p: True)
# 頭只帶動往前伸的部分（背上的骨刺跟身體）
ZONES["ghoul"] = lambda p, bone: (not bone.startswith(("head", "neck")) or p.y < -0.06) and _GHOUL_ARMS(p, bone)
_VENOM_ARMS = limb_zone(lambda p: ((p.z > 0.08 and abs(p.x) > 0.2) or abs(p.x) > 0.285) and p.y < 0.08 and p.z < 0.25, lambda p: True)
ZONES["venom_ghoul"] = lambda p, bone: (not bone.startswith(("head", "neck")) or p.y < -0.1) and _VENOM_ARMS(p, bone)
ZONES["bone_hound"] = bone_hound_zone
ZONES["wheel_sword_beast"] = wheel_beast_zone
ZONES["eye_floater"] = eye_floater_zone
ZONES["blood_lizard"] = blood_lizard_zone
ZONES["poison_spitter"] = poison_spitter_zone
ZONES["hatchling_spider"] = hatchling_zone
ZONES["acid_beetle"] = acid_beetle_zone
ZONES["void_spore"] = lambda p, bone: (bone != "head" or (p.y < -0.3 and math.hypot(p.x, p.z) < 0.17)) and (not re.match(r"(upperArm|forearm|hand|thigh|shin|foot)", bone) or p.z < -0.3)
def mage_zone(in_arm, boot_z):
    """長袍的法師：靴子（長袍下擺以下）只跟腳；大腿、小腿不帶動長袍；手臂區同其他人形"""
    arms = limb_zone(in_arm, lambda p: True)

    def zone(p, bone):
        boot = p.z < boot_z
        if re.match(r"(thigh|shin)[LR]$", bone):
            return False
        if re.match(r"foot[LR]$", bone):
            return boot and (bone[-1] == "L") == (p.x > 0)
        if boot:
            return False
        return arms(p, bone)

    return zone


ZONES["skeleton_mage"] = mage_zone(lambda p: abs(p.x) > (0.13 if p.z > 0.1 else 0.155 if p.z > -0.08 else 0.2) and -0.2 < p.z < 0.24, -0.41)
ZONES["storm_mage"] = mage_zone(lambda p: abs(p.x) > (0.13 if p.z > 0.1 else 0.15 if p.z > 0 else 0.16) and -0.2 < p.z < 0.36, -0.385)
ZONES["void_maw"] = ZONES["burrower"] = lambda p, bone: not bone.startswith("ex_mouth")
JOINED = {n: limbs_joined for n in ("storm_mage", "skeleton_mage", "armored_skeleton", "frost_skeleton", "skeleton_archer", "ghoul", "venom_ghoul", "skeleton", "abyss_sovereign", "abyss_lord", "lava_behemoth", "fallen_knight", "crypt_guardian", "fallen_priest", "stone_walker")}
# 骨龍：嘴裡的東西碰到上顎的三角形，張嘴時會被拉成長條
# 鐵輪劍獸：輪子是獨立的剛體，輪面和輪軸、身體之間的三角形切開，轉動時才不會拉出長條
JOINED["wheel_sword_beast"] = lambda bones, ws: not (any(b.startswith("thigh") for b in bones) and any(not b.startswith("thigh") for b in bones))
# 毒沫噴吐者：前腳和後腿在身體側面黏在一起，只切開前後腳之間（腿和身體不切，切了會破洞）；切口在匯出時往內收口
_TOAD_FRONT = ("upperArm", "forearm", "hand")
_TOAD_REAR = ("thigh", "shin", "foot")
JOINED["poison_spitter"] = lambda bones, ws: not (any(b.startswith(_TOAD_FRONT) for b in bones) and any(b.startswith(_TOAD_REAR) for b in bones))
JOINED["bone_dragon"] = lambda bones, ws: not {"head", "jaw"} <= bones

# 眼：爪碰到翅膀的三角形，收合時會被拉成長條
JOINED["abyss_dragon"] = lambda bones, ws: not (any(b.startswith("ex_claw") for b in bones) and any(b.startswith("ex_wing") for b in bones))

def bone_hound():
    """骨刺獵獸：四足，關節名稱同 Beasts.beast。root 放在身體中段（遊戲把 root 放在角色位置），root 的線段往後涵蓋臀部；
    後腿用腳尖站：大腿 → 膝、小腿 → 跗關節、foot = 跗關節到腳趾（遊戲的後腳保持水平，這段不會歪）"""
    bones = [
        ("root", None, V((0, 0.07, 0.03)), V((0, 0.27, 0.04)), 0.1),
        ("torso", "root", V((0, 0.03, 0.04)), V((0, -0.2, 0.05)), 0.11),
        ("neck", "torso", V((0, -0.2, 0.06)), V((0, -0.33, 0.03)), 0.07),
        ("head", "neck", V((0, -0.33, 0.03)), V((0, -0.49, -0.02)), 0.09),
        ("ponytail", "root", V((0, 0.33, 0.015)), V((0, 0.5, -0.1)), 0.02),
        ("jaw", "head", V(HOUND_JAW_HINGE), V((0, -0.42, -0.15)), 0.1),
    ]
    arm = [V((0.12, -0.14, 0.07)), V((0.165, -0.09, -0.066)), V((0.19, -0.18, -0.204)), V((0.195, -0.29, -0.254))]
    leg = [V((0.11, 0.17, 0.04)), V((0.155, 0.16, -0.08)), V((0.19, 0.29, -0.107)), V((0.2, 0.173, -0.254))]

    def side(s, m):
        out = chain([f"upperArm{s}", f"forearm{s}", f"hand{s}"], "torso", [m(p) for p in arm], [0.06, 0.05, 0.05])
        return out + chain([f"thigh{s}", f"shin{s}", f"foot{s}"], "root", [m(p) for p in leg], [0.07, 0.055, 0.065])

    return bones + sides(side), {}


# 甲蟲八隻腳（由前到後，左半邊）：腳根 → 膝 → 腳尖；遊戲的動作只轉腳根（整隻腳一起動），外段是不動的子骨頭，只用來分權重
BEETLE_LEGS = [
    ("upperArm", (0.07, -0.133, -0.1), (0.3, -0.225, -0.06), (0.44, -0.283, -0.275)),
    ("forearm", (0.126, -0.047, -0.1), (0.33, -0.056, -0.06), (0.47, -0.063, -0.275)),
    ("hand", (0.15, 0.086, -0.1), (0.34, 0.13, -0.06), (0.47, 0.17, -0.275)),
    ("thigh", (0.1, 0.204, -0.1), (0.21, 0.3, -0.06), (0.29, 0.369, -0.275)),
]


def acid_beetle():
    """酸液甲蟲：大甲殼（root）、頭、一對大顎（shinL/R，掛在頭上）、八隻腳（關節名稱同 Creatures.arthropod 的 LEG_JOINTS）"""
    bones = [
        ("root", None, V((0, 0.03, -0.02)), V((0, 0.3, 0.0)), 0.26),
        ("head", "root", V((0, -0.24, -0.1)), V((0, -0.46, -0.16)), 0.1),
    ]

    def side(s, m):
        out = [(f"shin{s}", "head", m(V((0.125, -0.3, -0.11))), m(V((0.11, -0.45, -0.13))), 0.06)]
        for i, (joint, a, b, c) in enumerate(BEETLE_LEGS):
            out.append((f"{joint}{s}", "root", m(V(a)), m(V(b)), 0.05))
            out.append((f"ex_leg{s}{i}", f"{joint}{s}", m(V(b)), m(V(c)), 0.05))
        return out

    return bones + sides(side), {}


def poison_spitter():
    """毒沫噴吐者：蟾蜍，四足外張；jaw 是下顎連喉囊，ex_sacL/R 是喉囊的左右半邊（往外轉就是鼓起來）"""
    bones = [
        ("root", None, V((0, 0.05, 0.0)), V((0, 0.3, 0.05)), 0.2),
        ("torso", "root", V((0, 0.05, 0.0)), V((0, -0.12, 0.04)), 0.2),
        ("neck", "torso", V((0, -0.1, 0.06)), V((0, -0.16, 0.08)), 0.1),
        ("head", "neck", V((0, -0.16, 0.08)), V((0, -0.4, 0.15)), 0.14),
        ("jaw", "head", V((0, -0.12, 0.03)), V((0, -0.38, -0.1)), 0.13),
    ]
    arm = [V((0.2, -0.1, 0.02)), V((0.27, -0.1, -0.11)), V((0.27, -0.15, -0.235)), V((0.4, -0.2, -0.262))]
    leg = [V((0.2, 0.22, 0.0)), V((0.33, 0.2, -0.1)), V((0.3, 0.16, -0.22)), V((0.47, 0.12, -0.26))]

    def side(s, m):
        out = chain([f"upperArm{s}", f"forearm{s}", f"hand{s}"], "torso", [m(p) for p in arm], [0.07, 0.07, 0.07])
        out += chain([f"thigh{s}", f"shin{s}", f"foot{s}"], "root", [m(p) for p in leg], [0.09, 0.07, 0.07])
        return out + [(f"ex_sac{s}", "jaw", m(V((0.06, -0.24, 0.0))), m(V((0.2, -0.24, -0.16))), 0.07)]

    return bones + sides(side), {}


def blood_lizard():
    """血鱗獵蜥：四足低伏，關節名稱同 Beasts.beast；下顎 jaw；尾巴三節（ponytail → ex_tail1 → ex_tail2，最後一節連骨球）"""
    bones = [
        ("root", None, V((0, 0.0, 0.03)), V((0, 0.2, 0.03)), 0.09),
        ("torso", "root", V((0, 0.0, 0.03)), V((0, -0.19, 0.03)), 0.1),
        ("neck", "torso", V((0, -0.2, 0.03)), V((0, -0.33, 0.01)), 0.06),
        ("head", "neck", V((0, -0.33, 0.01)), V((0, -0.5, -0.03)), 0.07),
        ("jaw", "head", V((0, -0.34, 0.01)), V((0, -0.49, -0.05)), 0.06),
        ("ponytail", "root", V((0, 0.21, 0.04)), V((0, 0.29, 0.05)), 0.06),
        ("ex_tail1", "ponytail", V((0, 0.29, 0.05)), V((0, 0.37, 0.06)), 0.055),
        ("ex_tail2", "ex_tail1", V((0, 0.37, 0.06)), V((0, 0.5, 0.08)), 0.07),
    ]
    arm = [V((0.14, -0.19, 0.04)), V((0.2, -0.155, -0.05)), V((0.19, -0.2, -0.14)), V((0.186, -0.28, -0.175))]
    leg = [V((0.1, 0.06, 0.03)), V((0.11, 0.125, -0.085)), V((0.135, 0.11, -0.15)), V((0.145, 0.04, -0.175))]

    def side(s, m):
        out = chain([f"upperArm{s}", f"forearm{s}", f"hand{s}"], "torso", [m(p) for p in arm], [0.06, 0.05, 0.05])
        return out + chain([f"thigh{s}", f"shin{s}", f"foot{s}"], "root", [m(p) for p in leg], [0.07, 0.05, 0.05])

    return bones + sides(side), {}


def eye_floater():
    """單眼浮體：身體（root）、正面的眼（head）、底下六條觸手（四條用舊版的關節名稱，外側兩條是 ex_tent，遊戲端跟著擺動）"""
    bones = [("root", None, V((0, 0.02, -0.08)), V((0, 0.02, 0.2)), 0.24), ("head", "root", V((0, -0.16, 0.025)), V((0, -0.3, 0.025)), 0.1)]
    for names, (x, y) in ((("upperArmL", "forearmL", "handL"), (0.09, -0.095)), (("upperArmR", "forearmR", "handR"), (-0.09, -0.095)),
                          (("thighL", "shinL", "footL"), (0.095, 0.15)), (("thighR", "shinR", "footR"), (-0.095, 0.15)),
                          (("ex_tentL0", "ex_tentL1", "ex_tentL2"), (0.225, 0.0)), (("ex_tentR0", "ex_tentR1", "ex_tentR2"), (-0.225, 0.0))):
        pts = [V((x * k, y * k, z)) for k, z in ((0.85, -0.2), (0.97, -0.3), (1.0, -0.4), (1.0, -0.5))]
        bones += chain(list(names), "root", pts, [0.055, 0.05, 0.045])
    return bones, {}


# 孵化蜘蛛八隻腳（由前到後，左半邊的腳尖 x、y）；腳根與膝蓋依腳尖的方向推算
HATCHLING_LEGS = [("upperArm", 0.327, -0.379), ("forearm", 0.47, -0.19), ("hand", 0.485, -0.008), ("thigh", 0.424, 0.232)]


def hatchling_spider():
    """孵化蜘蛛：頭胸（root）、腹部（ponytail）、頭、兩根觸肢（shinL/R，掛在頭上）、八隻腳（關節名稱同 Creatures.arthropod）"""
    bones = [
        ("root", None, V((0, -0.12, -0.06)), V((0, 0.02, -0.03)), 0.2),
        ("ponytail", "root", V((0, 0.02, 0.0)), V((0, 0.3, 0.05)), 0.24),
        ("head", "root", V((0, -0.16, -0.08)), V((0, -0.33, -0.1)), 0.1),
    ]

    def side(s, m):
        out = [(f"shin{s}", "head", m(V((0.12, -0.28, -0.1))), m(V((0.16, -0.39, -0.28))), 0.05)]
        for i, (joint, x, y) in enumerate(HATCHLING_LEGS):
            a, b, c = V((x * 0.45, y * 0.45, -0.09)), V((x * 0.72, y * 0.72, -0.05)), V((x, y, -0.28))
            out.append((f"{joint}{s}", "root", m(a), m(b), 0.05))
            out.append((f"ex_leg{s}{i}", f"{joint}{s}", m(b), m(c), 0.05))
        return out

    return bones + sides(side), {}


def wheel_sword_beast():
    """鐵輪劍獸：root 的原點在輪軸（身體前傾時輪子不會離地）；輪子用 thigh 的關節（原點在輪心，遊戲端繞 X 軸連續轉）；
    手臂到束環是 upperArm、forearm，整束劍是 hand"""
    wy, wz = WHEEL_CENTER
    bones = [
        ("root", None, V((0, wy, wz)), V((0, 0.17, -0.03)), 0.08),
        ("torso", "root", V((0, 0.17, -0.03)), V((0, 0.03, 0.14)), 0.2),
        ("neck", "torso", V((0, -0.03, 0.12)), V((0, -0.14, 0.12)), 0.08),
        ("head", "neck", V((0, -0.14, 0.12)), V((0, -0.33, 0.09)), 0.09),
    ]
    arm = [V((0.24, 0.03, 0.09)), V((0.31, 0.0, 0.02)), V((0.35, -0.06, -0.075)), V((0.42, -0.19, -0.19))]

    def side(s, m):
        out = chain([f"upperArm{s}", f"forearm{s}", f"hand{s}"], "torso", [m(p) for p in arm], [0.07, 0.08, 0.09])
        return out + [(f"thigh{s}", "root", m(V((0.13, wy, wz))), m(V((0.19, wy, wz))), 0.15)]

    return bones + sides(side), {}


SKELETONS = {
    "poison_spitter": poison_spitter,
    "blood_lizard": blood_lizard,
    "wheel_sword_beast": wheel_sword_beast,
    "eye_floater": eye_floater,
    "hatchling_spider": hatchling_spider,
    "spider_queen": spider_queen,
    "abyss_lord": abyss_lord,
    "abyss_sovereign": abyss_sovereign,
    "lava_behemoth": lava_behemoth,
    "fallen_knight": fallen_knight,
    "crypt_guardian": crypt_guardian,
    "fallen_priest": fallen_priest,
    "stone_walker": stone_walker,
    "bone_hand": bone_hand,
    "bone_dragon": bone_dragon,
    "abyss_dragon": abyss_dragon,
    "abyss_dragon_tail": abyss_dragon_tail,
    "abyss_hand": abyss_hand,
    "abyss_hand_hand": abyss_hand_hand,
    "skeleton": skeleton,
    "frost_skeleton": frost_skeleton,
    "skeleton_archer": skeleton_archer,
    "armored_skeleton": armored_skeleton,
    "skeleton_mage": skeleton_mage,
    "storm_mage": storm_mage,
    "ghoul": ghoul,
    "venom_ghoul": venom_ghoul,
    "void_spore": void_spore,
    "void_maw": void_maw,
    "burrower": void_maw,
    "bone_hound": bone_hound,
    "acid_beetle": acid_beetle,
}
bones, extra = SKELETONS[NAME]()

# 表面分類的範圍（只有背、肩、前臂、拳頭上的尖岩會變成結晶）與門檻（全部頂點凸出量的百分位：面數改變時絕對值會變）
SURFACE_ZONE = {"stone_walker": lambda p: (p.y > -0.16 and p.z > 0.0) or (abs(p.x) > 0.22 and p.z > -0.28)}
EYES = {"stone_walker": (0.08, -0.15, 0.11)}
SPIKE_Q = 0.8
SEAM_Q = 0.07


# ── 4. 權重 ──
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


SOFT = 0.012
# 關節處（最近的兩根骨頭是父子，例如肩膀的鎖骨與上臂、髖的骨盆與大腿）漸變的寬度：
# 只用 SOFT 時接縫很硬，手舉起來肩膀的三角形會被拉長好幾倍
JOINT_SOFT = {n: 0.04 for n in ("poison_spitter", "blood_lizard", "eye_floater", "hatchling_spider", "wheel_sword_beast", "bone_hound", "acid_beetle", "storm_mage", "skeleton_mage", "burrower", "void_spore", "void_maw", "frost_skeleton", "skeleton_archer", "ghoul", "venom_ghoul", "abyss_sovereign", "abyss_lord", "lava_behemoth", "fallen_knight", "crypt_guardian", "fallen_priest", "stone_walker", "bone_hand", "bone_dragon", "abyss_dragon", "abyss_hand", "abyss_hand_hand")}
# 這些骨頭彼此之間（長袍的四片）也要漸變，否則擺動時接縫被拉開
SOFT_GROUP = {"fallen_priest": {"root", "cloth", "clothBack", "ex_tassetL", "ex_tassetR"}}
parent_of = {name: parent for name, parent, *_ in bones}
weights = []
zone = ZONES.get(NAME)
for c in co:
    d = sorted(((seg_dist(c, a, b) - r, name) for name, _, a, b, r in bones if not zone or zone(c, name)))
    soft = SOFT
    group = SOFT_GROUP.get(NAME, ())
    if len(d) > 1 and NAME in JOINT_SOFT and (parent_of[d[0][1]] == d[1][1] or parent_of[d[1][1]] == d[0][1] or (d[0][1] in group and d[1][1] in group)):
        soft = JOINT_SOFT[NAME]
    near = [(dd, n) for dd, n in d[:3] if dd <= d[0][0] + 2.5 * soft]
    ws = [(n, math.exp(-(dd - d[0][0]) / soft)) for dd, n in near]
    tot = sum(w for _, w in ws)
    weights.append([[n, round(w / tot, 3)] for n, w in ws if w / tot > 0.02])

# 眼：深口的口緣跟著一圈骨頭，依角度混合相鄰兩根（喉嚨深處與眼球表面維持跟眼球）
if NAME == "abyss_dragon":
    r0, r1, r2, r3 = MOUTH_RING
    for i, c in enumerate(co):
        r = math.hypot(c.x, c.z - EYE_CENTER.z)
        if c.y > -0.04 or r >= r3 or r <= r0 or (c - EYE_CENTER).length > 0.165:
            continue
        s = smooth((r - r0) / (r1 - r0)) * smooth((r3 - r) / (r3 - r2))
        at = (math.atan2(c.z - EYE_CENTER.z, c.x) / (2 * math.pi) % 1) * MOUTH_BONES
        k = int(at) % MOUTH_BONES
        f = at - int(at)
        ws = [[f"ex_mouth{k}", s * (1 - f)], [f"ex_mouth{(k + 1) % MOUTH_BONES}", s * f], ["head", 1 - s]]
        weights[i] = [[n, round(w, 3)] for n, w in ws if w > 0.02]

# 蟲的嘴：口緣跟著一圈骨頭，依角度混合相鄰兩根（洞的深處與嘴外面維持跟頭）
if NAME in ("void_maw", "burrower"):
    r0, r1, r2, r3 = MAW_RING
    for i, c in enumerate(co):
        r = math.hypot(c.x - MAW_MOUTH[0], c.z - MAW_MOUTH[1])
        if c.y > MAW_RING_Y or r >= r3 or r <= r0:
            continue
        s = smooth((r - r0) / (r1 - r0)) * smooth((r3 - r) / (r3 - r2))
        at = (math.atan2(c.z - MAW_MOUTH[1], c.x - MAW_MOUTH[0]) / (2 * math.pi) % 1) * MAW_RING_BONES
        k = int(at) % MAW_RING_BONES
        f = at - int(at)
        ws = [[f"ex_mouth{k}", s * (1 - f)], [f"ex_mouth{(k + 1) % MAW_RING_BONES}", s * f], ["head", 1 - s]]
        weights[i] = [[n, round(w, 3)] for n, w in ws if w > 0.02]

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


def hound_joined(bones, ws, c):
    """骨刺獵獸（設計者 2026-11-09）：前腳、後腿在肩膀與髖以下和身體切開，腿往前後伸展時不會拉出長長的三角形"""
    limb = any(b.startswith(("upperArm", "forearm", "hand", "thigh", "shin", "foot")) for b in bones)
    body = any(b in ("root", "torso", "neck") for b in bones)
    return not (limb and body and c.z < 0.03)


if NAME in ("bone_hound", "blood_lizard"):
    joined = hound_joined
tris = [list(p.vertices)[:3] for p in me.polygons]


def kept_faces():
    if NAME in ("bone_hound", "blood_lizard"):
        return [joined({weights[i][0][0] for i in t}, [weights[i] for i in t], sum((co[i] for i in t), Vector()) / 3) for t in tris]
    return [joined({weights[i][0][0] for i in t}, [weights[i] for i in t]) if joined else True for t in tris]


keep = kept_faces()
if joined:
    # 切開後變成小碎片的部分（例如手爪內側被分到大腿、翅膀尖被切下）：整片改跟原本相連的部位，
    # 否則手或翅膀一動，碎片就留在原地浮在空中
    for _ in range(2):
        par = list(range(len(co)))

        def find(x):
            while par[x] != x:
                par[x] = par[par[x]]
                x = par[x]
            return x

        for t, k in zip(tris, keep):
            if k:
                par[find(t[0])] = find(t[1])
                par[find(t[1])] = find(t[2])
        islands = {}
        for t, k in zip(tris, keep):
            if k:
                islands.setdefault(find(t[0]), []).append(t)
        changed = False
        for root, ts in islands.items():
            if len(ts) >= 40:
                continue
            verts = {v for t in ts for v in t}
            # 被切掉的三角形另一端（不在這片碎片裡）的骨頭：碎片原本連著的部位
            others = [weights[v][0][0] for t, k in zip(tris, keep) if not k and verts & set(t) for v in t if v not in verts]
            if not others:
                continue
            bone = max(set(others), key=others.count)
            for v in verts:
                weights[v] = [[bone, 1.0]]
            changed = True
        if not changed:
            break
        keep = kept_faces()

# 表面分類（遊戲端換色用）：每個頂點和平滑後的表面比較，凸出的尖岩可以變成結晶，凹下的縫可以發光
surface_kind = None
spikes = []
if NAME in SURFACE_ZONE:
    pos = [c.copy() for c in co]
    near = [[] for _ in co]
    for e in me.edges:
        near[e.vertices[0]].append(e.vertices[1])
        near[e.vertices[1]].append(e.vertices[0])
    for _ in range(50):
        pos = [(sum((pos[n] for n in ns), Vector()) / len(ns)).lerp(p, 0.4) if ns else p for p, ns in zip(pos, near)]
    me.calc_loop_triangles()
    prot = [(c - q).dot(v.normal) for c, q, v in zip(co, pos, me.vertices)]
    ordered = sorted(prot)
    SPIKE, SEAM = ordered[int(len(prot) * SPIKE_Q)], ordered[int(len(prot) * SEAM_Q)]
    spike = [prot[i] > SPIKE and SURFACE_ZONE[NAME](co[i]) for i in range(len(co))]
    spikes = [[i, *G(co[i] - pos[i])] for i in range(len(co)) if spike[i]]
    surface_kind = []


def kind_of(idx, normal):
    # 眼睛：貼圖模糊看不出來，直接標出位置（4 = 發光）：頭正面、左右對稱的一小塊
    if NAME in EYES and normal.y < -0.25:
        c = sum((co[i] for i in idx), Vector()) / 3
        ex, ey, ez = EYES[NAME]
        if abs(abs(c.x) - ex) < 0.03 and abs(c.z - ez) < 0.022 and c.y < ey:
            return 4
    n = sum(spike[i] for i in idx)
    if n == 3:
        return 2
    if n >= 1:
        return 1
    return 3 if all(prot[i] < SEAM for i in idx) else 0


cut = keep.count(False)
for p, k in zip(me.polygons, keep):
    if k:
        idx = list(p.vertices)
        faces.append([idx[0], idx[1], idx[2], face_color(p)])
        if surface_kind is not None:
            surface_kind.append(kind_of(idx, p.normal))
# 切開的地方收口，否則看得到模型裡面：切口邊緣的每個頂點往自己骨頭的中心線收進去，做出一道往內的凹摺
# （不能橫跨切口補面：切口又長又窄，補出來的面會變成伸出去的細長片）
if NAME in ("poison_spitter",):
    edge_color = {}
    for a, b, c, color in [f[:4] for f in faces]:
        for e in ((a, b), (b, c), (c, a)):
            edge_color[e] = color
    open_edges = [(a, b) for (a, b) in edge_color if (b, a) not in edge_color]
    bone_of = {name: (p, q) for name, _, p, q, _ in bones}
    inner = {}

    def tucked(v):
        if v not in inner:
            p, q = bone_of[weights[v][0][0]]
            d = q - p
            t = max(0.0, min(1.0, (co[v] - p).dot(d) / d.length_squared))
            co.append(co[v].lerp(p + d * t, 0.6))
            weights.append(weights[v])
            inner[v] = len(co) - 1
        return inner[v]

    for a, b in open_edges:
        ca, cb = tucked(a), tucked(b)
        faces.append([b, a, ca, 0x1c2a10])
        faces.append([b, ca, cb, 0x1c2a10])
    print("收口的面", len(open_edges) * 2)
# 眼：TRELLIS 把翅膀尖端的眼睛糊成寶石，照位置畫上血紅眼球與直立的黑色瞳孔縫（正反兩面都畫）
if NAME == "abyss_dragon":
    def f_center(f):
        return sum((co[i] for i in f[:3]), Vector()) / 3

    def reddish(c):
        r, g, b = c >> 16, (c >> 8) & 255, c & 255
        return r > 110 and r > g * 1.7 and r > b * 1.7

    for s in (1, -1):
        for cx, cz in WING_EYE_CENTERS:
            # 中心對齊模型上紅色的那一塊（貼圖上的位置和估計的差一點）
            near = [c for c in map(f_center, (f for f in faces if reddish(f[3]))) if c.x * s > 0 and math.hypot(abs(c.x) - cx, c.z - cz) < WING_EYE_DISC]
            if len(near) >= 6:
                cx, cz = sum(abs(c.x) for c in near) / len(near), sum(c.z for c in near) / len(near)
            for f in faces:
                c = f_center(f)
                if c.x * s <= 0:
                    continue
                dx, dz = abs(c.x) - cx, c.z - cz
                d = math.hypot(dx, dz) / WING_EYE_DISC
                if d < 1:
                    u = dz / (WING_EYE_DISC * SLIT_H)
                    slit = abs(u) < 1 and abs(dx) < WING_EYE_DISC * SLIT_W * (1 - u * u)
                    f[3] = 0x0a0204 if slit else (0xe02418 if d < 0.6 else 0xa8140e)
# 酸液甲蟲的砲管：砲身與砲口用背上酸液的亮綠色，洞裡用腳爪的深色
if NAME == "acid_beetle":
    gun_base, gun_tip = Vector(BEETLE_GUN["base"]), Vector(BEETLE_GUN["tip"])
    gun_axis = (gun_tip - gun_base).normalized()
    painted = 0
    for f in faces:
        pts = [co[i] for i in f[:3]]
        if not all(tuple(round(c, 4) for c in q) in BEETLE_GUN_VERTS for q in pts):
            continue
        radial = [((q - gun_base) - gun_axis * (q - gun_base).dot(gun_axis)).length for q in pts]
        f[3] = 0x2a2630 if max(radial) < BEETLE_GUN["bore"] + 0.002 else (0xa8ec48 if sum(pts, Vector()).z / 3 > gun_base.z - 0.02 else 0x8fd63a)
        painted += 1
    print("砲管的面", painted)
# 單眼浮體瞳孔的四角光芒
if NAME == "eye_floater":
    for f in faces:
        star = [EYE_STAR_VERTS.get(tuple(round(c, 4) for c in co[i])) for i in f[:3]]
        if all(star):
            f[3] = star[0]
# 骨刺獵獸、血鱗獵蜥：上下顎之間的面張嘴時會被拉開，塗成口腔的暗紅色，看得出嘴是張開的
if NAME in ("bone_hound", "blood_lizard", "poison_spitter"):
    mouth = 0
    for f in faces:
        tops = {weights[i][0][0] for i in f[:3]}
        if "jaw" in tops and "head" in tops:
            f[3] = 0x3a0a0c
            mouth += 1
    print("口腔的面", mouth)
# 虛空吞噬者：洞裡（喉嚨往後推的部分與洞壁）塗成黑色
if NAME in ("void_maw", "burrower"):
    black = 0
    for f in faces:
        c = sum((co[i] for i in f[:3]), Vector()) / 3
        if maw_star(c.x, c.z) < 1.08 and c.y > MAW_THROAT_Y - 0.01 and c.y < -0.25:
            f[3] = 0x050208
            black += 1
    print("嘴裡的黑面", black)
# 鑽地寄生蟲：壓平的寶石換成周圍身體的顏色（相鄰、不是寶石的面的平均）
if NAME == "burrower" and BURROWER_GEMS:
    gem_set = {(round(p.x, 3), round(p.y, 3), round(p.z, 3)) for p in BURROWER_GEMS}

    def near_gem(c):
        return any((c - g).length < 0.014 for g in BURROWER_GEMS)

    edge_faces = {}
    for n, f in enumerate(faces):
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            edge_faces.setdefault((min(a, b), max(a, b)), []).append(n)
    around = [[] for _ in faces]
    for ns in edge_faces.values():
        for n in ns:
            around[n] += [m for m in ns if m != n]
    todo = {n for n, f in enumerate(faces) if near_gem(sum((co[i] for i in f[:3]), Vector()) / 3)}
    print("寶石的面", len(todo))
    for _ in range(12):
        done = {}
        for n in todo:
            ring = [faces[m][3] for m in around[n] if m not in todo]
            if ring:
                done[n] = to_int(*(sum(((c >> sh) & 255) for c in ring) / len(ring) / 255 for sh in (16, 8, 0)))
        for n, c in done.items():
            faces[n][3] = c
        todo -= set(done)
        if not todo:
            break
# 重甲骷髏（設計者 2026-11-08）：生成的顏色整體偏紅褐、看不出是金屬。板甲 → 金屬灰（保留明暗）、露出的骨頭與臉 → 骷髏白、
# 眼窩 → 深黑；紅色盔纓與前襬、金色的扣環與鉚釘不變
if NAME == "armored_skeleton":
    import colorsys

    def hls_of(c):
        h, l, s = colorsys.rgb_to_hls(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255)
        return h * 360, s, l

    def from_hls(h, s, l):
        return to_int(*colorsys.hls_to_rgb(h / 360, min(1.0, l), s))

    counts = {"甲": 0, "骨": 0, "眼": 0}
    for f in faces:
        c = sum((co[i] for i in f[:3]), Vector()) / 3
        h, s_, l = hls_of(f[3])
        face = c.y < -0.05 and 0.27 < c.z < 0.43 and abs(c.x) < 0.07
        if face and any(math.hypot(abs(c.x) - 0.026, c.z - 0.378) < r for r in (0.02,)) or (face and l < 0.15 and c.z > 0.355):
            f[3] = 0x0a0808
            counts["眼"] += 1
        elif s_ >= 0.45 and (h >= 330 or h < 12):
            continue
        elif s_ >= 0.4 and 35 <= h < 60 and l > 0.3:
            continue
        elif -0.02 < c.z < 0.06 and c.y < 0 and 8 <= h < 34 and s_ >= 0.28:
            # 腰帶（皮革）不變
            continue
        elif 21 <= h < 48 and s_ >= 0.17 and l >= 0.27:
            f[3] = from_hls(40, 0.16, 0.62 + l * 0.55)
            counts["骨"] += 1
        else:
            f[3] = from_hls(212, 0.09, 0.2 + l * 0.85)
            counts["甲"] += 1
    print("重甲骷髏換色", counts)
# 法師：TRELLIS 的臉偏暗、眼睛糊掉。照位置畫出發光的紫色雙眼（四視圖的樣子），頭骨與手的骨頭提亮
if NAME in MAGE_EYE:
    eye_x, eye_z, eye_r, eye_core, eye_rim = MAGE_EYE[NAME]

    def lift(c, k):
        return to_int(*(min(1.0, ((c >> sh) & 255) / 255 * k) for sh in (16, 8, 0)))

    eyes = 0
    for f in faces:
        c = sum((co[i] for i in f[:3]), Vector()) / 3
        r, g, b = f[3] >> 16, (f[3] >> 8) & 255, f[3] & 255
        hi, lo = max(r, g, b), min(r, g, b)
        boneish = hi > 50 and ((r >= g >= b and (hi - lo) / hi < 0.5) or (hi - lo) / hi < 0.18)
        d = math.hypot(abs(c.x) - eye_x, c.z - eye_z)
        if c.y < -0.07 and d < eye_r:
            f[3] = eye_core if d < eye_r * 0.5 else eye_rim
            eyes += 1
        elif boneish and ((c.y < -0.06 and abs(c.x) < 0.07 and 0.27 < c.z < 0.39) or (abs(c.x) > 0.2 and c.z < -0.08)):
            f[3] = lift(f[3], 1.9 if NAME == "storm_mage" else 1.55)
    print("眼的面", eyes)
# 虛空孢子：TRELLIS 把正面發光的眼糊成一團暗紫的圓頂（四視圖是洋紅色發光的核心、外面一圈亮紫的環）。
# 整體也比四視圖暗很多，先整體提亮，再照位置畫眼：核心（中心最亮）→ 環 → 環外一圈暗的凹槽
if NAME == "void_spore":
    def lift(c, k):
        return to_int(*(min(1.0, ((c >> sh) & 255) / 255 * k) for sh in (16, 8, 0)))

    def mix(a, b, t):
        return to_int(*(((((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) / 255) for sh in (16, 8, 0)))

    eye_faces = 0
    for f in faces:
        f[3] = lift(f[3], 1.7)
        c = sum((co[i] for i in f[:3]), Vector()) / 3
        d = math.hypot(c.x, c.z) / SPORE_EYE_R
        if c.y > -0.25 or d > 1.55:
            continue
        eye_faces += 1
        if d < 0.35:
            f[3] = mix(0xffe6ff, 0xff7aff, d / 0.35)
        elif d < 0.75:
            f[3] = mix(0xff7aff, 0xc23cf0, (d - 0.35) / 0.4)
        elif d < 1.0:
            f[3] = mix(0xc23cf0, 0x8a2ad0, (d - 0.75) / 0.25)
        elif d < 1.12:
            f[3] = 0x3a1060
        else:
            f[3] = 0xa45ae6 if (int(math.degrees(math.atan2(c.z, c.x)) // 24) % 2) else 0x8c46d2
    print("眼的面", eye_faces)
# 骨龍：TRELLIS 沒看到的地方貼圖是黑的（腿內側、身體接縫），嘴裡以外的黑面改成相鄰面的平均色
if NAME == "bone_dragon":
    def too_dark(c):
        return max(c >> 16, (c >> 8) & 255, c & 255) < 28

    def in_mouth(f):
        c = sum((co[i] for i in f[:3]), Vector()) / 3
        return abs(c.x) < 0.2 and c.y < -0.02 and -0.12 < c.z < 0.1

    edge_faces = {}
    for n, f in enumerate(faces):
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            edge_faces.setdefault((min(a, b), max(a, b)), []).append(n)
    around = [[] for _ in faces]
    for ns in edge_faces.values():
        for n in ns:
            around[n] += [m for m in ns if m != n]
    todo = {n for n, f in enumerate(faces) if too_dark(f[3]) and not in_mouth(f)}
    print("黑面", len(todo))
    for _ in range(12):
        done = {}
        for n in todo:
            near = [faces[m][3] for m in around[n] if m not in todo]
            if near:
                r, g, b = (sum((c >> shift) & 255 for c in near) // len(near) for shift in (16, 8, 0))
                done[n] = r << 16 | g << 8 | b
        for n, c in done.items():
            faces[n][3] = c
        todo -= set(done)
        if not todo:
            break
data = {
    "joints": {name: G(a) for name, _, a, _, _ in bones},
    "tips": {name: G(b) for name, _, _, b, _ in bones},
    "parents": {name: parent for name, parent, *_ in bones},
    **extra,
    "verts": [G(c) for c in co],
    "weights": weights,
    "faces": faces,
}
if surface_kind is not None:
    data["surface"] = {"kind": surface_kind, "spikes": spikes}
    print("表面分類：", {k: surface_kind.count(k) for k in range(5)}, "尖岩頂點", len(spikes))
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
# 收口多出來的頂點只在遊戲資料裡，Blender 的網格沒有
for i, ws in enumerate(weights[: len(me.vertices)]):
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
cam.data.ortho_scale = {"abyss_dragon": 2.2, "abyss_dragon_tail": 1.5, "abyss_hand": 1.3}.get(NAME, 1.1)
prev = os.path.join(folder, "ai", "preview")
os.makedirs(prev, exist_ok=True)
for n, loc, rot in [("top", (0, 0, 3), (0, 0, 0)), ("front", (0, -3, 0), (math.pi / 2, 0, 0)), ("side", (3, 0, 0), (math.pi / 2, 0, math.pi / 2)),
                    ("under", (0, 0, -3), (math.pi, 0, 0))]:
    cam.location, cam.rotation_euler = loc, rot
    sc.render.filepath = os.path.join(prev, f"{PART + '-' if PART else ''}bones-{n}.png")
    bpy.ops.render.render(write_still=True)
me.materials.clear()
for m in saved:
    me.materials.append(m)
me.color_attributes.remove(me.color_attributes["bone"])
bpy.data.objects.remove(cam)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, f"{NAME}-ai.blend"))
