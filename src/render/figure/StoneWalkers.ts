import { aiFigure, I3, type AiMonsterData } from './AiRig';
import { grounded, type FigureModel, type Joint, type PartDef, type Pose, type PoseSet } from './FigureModel';
import type { V3 } from './Poly3D';
import DATA from './monsters/stoneWalkerAI.json';

/**
 * 結晶獸（火、冰、雷、毒）：設計者用 TRELLIS 生成的石頭獸（art/monsters/stone_walker），由 scripts/monster_ai.py 減面、綁骨架，
 * 並標出表面分類：凸出的尖岩（結晶）、尖岩的尖端、凹下的縫。四隻共用同一張網格與骨架：
 * - 貼圖烤死了光影，不使用；每個面依分類換成各屬性的顏色。
 * - 尖岩依屬性拉長或縮短（spike），輪廓才不會只差在顏色。
 * - 模型本身就是拳頭撐地的姿勢，所以四肢不轉正：所有角度為 0 就是模型的樣子，動作從這裡轉出去。
 * 動作：指節行走（左拳配右腳、右拳配左腳）、單拳砸地、橫掃、撲擊；施法是每隻的招牌動作。
 */

interface Surface {
  /** 每個面：0 岩石、1 結晶、2 結晶尖端、3 凹縫、4 眼睛 */
  kind: number[];
  /** [頂點, 往外凸出的向量 x, y, z]（公尺） */
  spikes: number[][];
}
const data = DATA as unknown as AiMonsterData & { surface: Surface };

/** 公尺 → 遊戲單位 */
const SCALE = 85;
const hipHeight = (data.joints.root![1]! - Math.min(...data.verts.map((v) => v[1]!))) * SCALE;

type Key = Partial<Record<Joint, V3>>;
const pose = (angles: Key, rootY = 0, rootZ = 0): Pose => ({ rootY, rootZ, angles });

/** 手臂與腿的對角步伐：s = 這一步的擺動（-1～1），lift = 抬起的程度（0～1） */
function gait(phase: number, amp: number): Pose {
  const s = Math.sin(phase);
  const liftA = Math.max(0, Math.cos(phase));
  const liftB = Math.max(0, -Math.cos(phase));
  return pose(
    {
      root: [0.03, 0.05 * s * amp, 0.05 * s * amp],
      torso: [0, -0.05 * s * amp, -0.03 * s * amp],
      chest: [0.03, -0.1 * s * amp, -0.05 * s * amp],
      head: [0, 0.12 * s * amp, 0.05 * s * amp],
      // 左腳配右拳
      thighL: [-0.42 * s * amp, 0, 0],
      shinL: [0.55 * liftA * amp, 0, 0],
      footL: [-0.3 * liftA * amp, 0, 0],
      upperArmR: [-0.38 * s * amp, 0, 0],
      forearmR: [-0.35 * liftA * amp, 0, 0],
      handR: [0.2 * liftA * amp, 0, 0],
      // 右腳配左拳
      thighR: [0.42 * s * amp, 0, 0],
      shinR: [0.55 * liftB * amp, 0, 0],
      footR: [-0.3 * liftB * amp, 0, 0],
      upperArmL: [0.38 * s * amp, 0, 0],
      forearmL: [-0.35 * liftB * amp, 0, 0],
      handL: [0.2 * liftB * amp, 0, 0],
    },
    -0.6 * amp + 0.6 * amp * Math.abs(Math.cos(phase)),
  );
}

/** 第一段：預備；舉起、到頂；砸下、收勢 */
const SMASH = {
  windup: [
    pose({ chest: [-0.1, 0.2, 0], upperArmR: [-0.6, 0, -0.1], forearmR: [-0.5, 0, 0] }, 0.5, -0.5),
    pose({ chest: [-0.3, 0.35, 0], head: [-0.15, -0.2, 0], upperArmR: [-2, 0, -0.2], forearmR: [-1.1, 0, 0], thighR: [0.15, 0, 0] }, 1.2, -1),
    pose({ chest: [-0.35, 0.4, 0], head: [-0.2, -0.25, 0], upperArmR: [-2.4, 0, -0.2], forearmR: [-1.2, 0, 0], thighR: [0.2, 0, 0] }, 1.4, -1.2),
  ],
  strike: [
    pose({ root: [0.12, -0.1, 0], chest: [0.4, -0.25, 0], head: [-0.2, 0.15, 0], upperArmR: [-0.7, 0, -0.05], forearmR: [-0.1, 0, 0], thighL: [-0.2, 0, 0], shinL: [0.25, 0, 0] }, -2, 3),
    pose({ root: [0.1, -0.08, 0], chest: [0.3, -0.2, 0], head: [-0.15, 0.1, 0], upperArmR: [-0.55, 0, -0.05], forearmR: [-0.1, 0, 0] }, -1.8, 2.5),
  ],
};
/** 橫掃：右拳從外側掃到內側 */
const SWEEP = {
  windup: [
    pose({ root: [0, 0.2, 0], chest: [0, 0.35, 0], upperArmR: [-0.9, 0.7, -0.5], forearmR: [-0.5, 0, 0] }, 0, -0.5),
    pose({ root: [0, 0.35, 0], chest: [-0.05, 0.6, 0], head: [0, -0.5, 0], upperArmR: [-1.3, 1.1, -0.7], forearmR: [-0.4, 0, 0] }, 0.3, -0.8),
  ],
  strike: [
    pose({ root: [0.05, -0.35, 0], chest: [0.15, -0.6, 0], head: [0, 0.5, 0], upperArmR: [-1.35, -0.8, 0.1], forearmR: [-0.2, 0, 0] }, -0.8, 2),
    pose({ root: [0.05, -0.4, 0], chest: [0.12, -0.65, 0], head: [0, 0.5, 0], upperArmR: [-1, -0.9, 0.1], forearmR: [-0.25, 0, 0] }, -0.8, 1.8),
  ],
};
/** 撲擊：低身蓄力 → 雙拳在前撞出去 */
const LUNGE = {
  windup: [
    pose({ root: [0.15, 0, 0], chest: [0.2, 0, 0], thighL: [-0.3, 0, 0], thighR: [-0.3, 0, 0], shinL: [0.5, 0, 0], shinR: [0.5, 0, 0], upperArmL: [0.45, 0, 0], upperArmR: [0.45, 0, 0], forearmL: [-0.5, 0, 0], forearmR: [-0.5, 0, 0] }, -3, -1.5),
    pose({ root: [0.22, 0, 0], chest: [0.25, 0, 0], thighL: [-0.4, 0, 0], thighR: [-0.4, 0, 0], shinL: [0.65, 0, 0], shinR: [0.65, 0, 0], upperArmL: [0.6, 0, 0], upperArmR: [0.6, 0, 0], forearmL: [-0.6, 0, 0], forearmR: [-0.6, 0, 0] }, -3.6, -2),
  ],
  strike: [
    pose({ root: [0.1, 0, 0], chest: [0.1, 0, 0], thighL: [0.5, 0, 0], thighR: [0.2, 0, 0], upperArmL: [-1.25, 0, -0.2], upperArmR: [-1.25, 0, 0.2], forearmL: [-0.15, 0, 0], forearmR: [-0.15, 0, 0] }, 0, 8),
    pose({ root: [0.1, 0, 0], chest: [0.12, 0, 0], thighL: [0.35, 0, 0], thighR: [0.1, 0, 0], upperArmL: [-1, 0, -0.15], upperArmR: [-1, 0, 0.15], forearmL: [-0.2, 0, 0], forearmR: [-0.2, 0, 0] }, -0.6, 6.5),
  ],
};

const ROAR_UP: Key = { chest: [-0.5, 0, 0], head: [-0.3, 0, 0], upperArmL: [-2.3, 0, 0.15], upperArmR: [-2.3, 0, -0.15], forearmL: [-1, 0, 0], forearmR: [-1, 0, 0] };

/** 招牌動作（施法）：前搖 → 放出 */
const SIGNATURE: Record<'fire' | 'cold' | 'lightning' | 'poison', { up: Pose; down: Pose }> = {
  // 熔晶噴發：雙拳高舉 → 同時砸地
  fire: { up: pose(ROAR_UP, 2, -1.5), down: pose({ root: [0.15, 0, 0], chest: [0.5, 0, 0], head: [-0.25, 0, 0], upperArmL: [-0.75, 0, 0], upperArmR: [-0.75, 0, 0], forearmL: [-0.1, 0, 0], forearmR: [-0.1, 0, 0], shinL: [0.25, 0, 0], shinR: [0.25, 0, 0] }, -3, 2.5) },
  // 冰晶列：單拳貼地，往前橫掃推出
  cold: { up: pose({ root: [0.1, 0.25, 0], chest: [0.3, 0.5, 0], upperArmR: [-0.1, 0.9, -0.5], forearmR: [-0.15, 0, 0] }, -2, -0.5), down: pose({ root: [0.15, -0.3, 0], chest: [0.35, -0.5, 0], head: [-0.15, 0.3, 0], upperArmR: [-0.95, -0.7, 0], forearmR: [-0.1, 0, 0] }, -2.4, 2.2) },
  // 落雷：上身挺起、雙拳舉高 → 重重落下
  lightning: { up: pose({ root: [-0.2, 0, 0], chest: [-0.55, 0, 0], head: [-0.35, 0, 0], upperArmL: [-2.6, 0, 0.45], upperArmR: [-2.6, 0, -0.45], forearmL: [-0.3, 0, 0], forearmR: [-0.3, 0, 0] }, 3.5, -2), down: pose({ root: [0.12, 0, 0], chest: [0.4, 0, 0], upperArmL: [-1.2, 0, 0.3], upperArmR: [-1.2, 0, -0.3], forearmL: [-0.2, 0, 0], forearmR: [-0.2, 0, 0] }, -2, 2.5) },
  // 毒泡投擲：弓背聳肩 → 背部猛然前彎，把毒泡從背上甩出
  poison: { up: pose({ root: [-0.1, 0, 0], torso: [-0.2, 0, 0], chest: [-0.4, 0, 0], head: [0.35, 0, 0], ex_clavL: [0, 0, 0.25], ex_clavR: [0, 0, -0.25], upperArmL: [0.2, 0, 0], upperArmR: [0.2, 0, 0] }, 1, -2), down: pose({ root: [0.25, 0, 0], torso: [0.3, 0, 0], chest: [0.6, 0, 0], head: [-0.5, 0, 0], ex_clavL: [0, 0, -0.1], ex_clavR: [0, 0, 0.1], upperArmL: [-0.8, 0, 0], upperArmR: [-0.8, 0, 0], forearmL: [-0.15, 0, 0], forearmR: [-0.15, 0, 0] }, -2.6, 3) },
};

function poses(parts: readonly PartDef[], element: keyof typeof SIGNATURE): PoseSet {
  const onGround = (angles: Key, rootZ = 0): Pose => grounded(parts, hipHeight, { rootY: 0, rootZ, angles }, 'all');
  const deathKeys = [
    pose({ chest: [-0.35, 0.15, 0.1], head: [-0.35, 0.1, 0], upperArmL: [-0.3, 0, 0.2], upperArmR: [-0.3, 0, -0.2] }, 0.5, -1),
    onGround({ root: [0.55, 0, 0.05], chest: [0.4, 0, 0], upperArmL: [-1, 0, 0.2], upperArmR: [-1, 0, -0.2], thighL: [-0.5, 0, 0], thighR: [-0.5, 0, 0], shinL: [0.9, 0, 0], shinR: [0.9, 0, 0] }, 2),
    onGround({ root: [1.35, 0.1, 0.05], chest: [0.15, 0, 0.05], head: [-0.5, 0.5, 0], upperArmL: [-1.6, 0, 0.5], upperArmR: [-1.4, 0, -0.5], forearmL: [0.2, 0, 0], forearmR: [0.2, 0, 0], thighL: [-0.25, 0, 0], thighR: [-0.1, 0, 0], shinL: [0.3, 0, 0], shinR: [0.2, 0, 0] }, 4),
  ];
  const sig = SIGNATURE[element];
  return {
    // 雙拳撐地、肩膀隨呼吸起伏，偶爾低頭左右看
    ready: (t) =>
      pose(
        {
          chest: [0.03 * Math.sin(t * 1.3), 0.02 * Math.sin(t * 0.5), 0],
          ex_clavL: [0, 0, 0.03 * Math.sin(t * 1.3)],
          ex_clavR: [0, 0, -0.03 * Math.sin(t * 1.3)],
          head: [0.04 * Math.sin(t * 0.8), 0.22 * Math.sin(t * 0.37), 0],
        },
        0.25 * Math.sin(t * 1.3),
      ),
    walk: (phase) => gait(phase, 1),
    run: (phase) => gait(phase, 1.35),
    attackWindup: SMASH.windup[2]!,
    attackStrike: SMASH.strike[0]!,
    attackChain: SMASH,
    attackVariants: { overhead: SMASH, slash: SWEEP, thrust: LUNGE },
    castWindup: sig.up,
    castRelease: sig.down,
    hit: pose({ chest: [-0.14, 0.05, 0], head: [-0.2, 0, 0] }, 0, -0.8),
    hitKeys: [pose({ head: [-0.25, 0, 0] }), pose({ chest: [-0.14, 0.05, 0], head: [-0.2, 0, 0] }, 0, -0.8), pose({ chest: [-0.06, 0, 0] }, -0.4, -0.4)],
    dead: deathKeys[2]!,
    deathKeys,
  };
}

interface Look {
  element: keyof typeof SIGNATURE;
  /** 岩石（兩色交錯）、結晶、結晶尖端、凹縫 */
  rock: [number, number];
  crystal: [number, number];
  tip: number;
  seam: number;
  /** 尖岩拉長的倍率（0 = 模型原本的長度） */
  spike: number;
  gaitRate: number;
  /** 外觀固定和震地獸一樣高（相對女主角 ×2.26，npm run docs:models 的 manifest 量得到）；尖岩長度不同，所以各自校正 */
  visualScale: number;
}

/** 依面的順序取固定的色差（同一張網格、每次一樣） */
const pick = (i: number): number => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function make(look: Look): FigureModel {
  const verts = data.verts.map((v) => [...v]);
  for (const [i, x, y, z] of data.surface.spikes) {
    const v = verts[i!]!;
    v[0]! += x! * look.spike;
    v[1]! += y! * look.spike;
    v[2]! += z! * look.spike;
  }
  const faces = data.faces.map((f, i) => {
    const kind = data.surface.kind[i]!;
    const color = kind === 4 ? look.tip : kind === 1 ? look.crystal[pick(i) < 0.6 ? 0 : 1] : kind === 2 ? (pick(i) < 0.7 ? look.tip : look.crystal[0]) : kind === 3 ? look.seam : look.rock[pick(i) < 0.55 ? 0 : 1];
    return [f[0]!, f[1]!, f[2]!, color];
  });
  const { parts, skin } = aiFigure({ ...data, verts, faces }, { scale: SCALE }, () => I3);
  return {
    hipHeight,
    referenceRadius: 0.5,
    visualScale: look.visualScale,
    parts,
    poses: poses(parts, look.element),
    skin,
    gaitRate: look.gaitRate,
    dynamicShadow: true,
    softLight: true,
    rimLight: 0.2,
  };
}

/** 噴錢的結晶獸；生成規則見 balance.goldWalker */
export const STONE_WALKERS: Record<string, FigureModel> = {
  'enemy.ember_walker': make({ element: 'fire', rock: [0x4a2e24, 0x5e3a2a], crystal: [0xff5a14, 0xff8a24], tip: 0xffc844, seam: 0xff7a18, spike: 0.2, gaitRate: 0.62, visualScale: 2.179 }),
  'enemy.frost_walker': make({ element: 'cold', rock: [0x4a6f94, 0x5f88ae], crystal: [0x6cc8f8, 0x96dcff], tip: 0xe4f8ff, seam: 0x4aa8e0, spike: 0.45, gaitRate: 0.5, visualScale: 2.114 }),
  'enemy.storm_walker': make({ element: 'lightning', rock: [0x423660, 0x54467a], crystal: [0x9050f0, 0xb070ff], tip: 0xffe860, seam: 0xffe040, spike: 0.6, gaitRate: 0.8, visualScale: 2.074 }),
  'enemy.venom_walker': make({ element: 'poison', rock: [0x4c5a38, 0x606e44], crystal: [0x6ce030, 0x96f040], tip: 0xd0ff60, seam: 0x58c828, spike: 0, gaitRate: 0.56, visualScale: 2.236 }),
};
