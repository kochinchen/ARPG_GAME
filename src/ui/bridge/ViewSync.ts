import type { DataRegistry } from '../../data/DataRegistry';
import type { GameWorld } from '../../game/GameWorld';
import type { ActorId } from '../../game/entities/Actor';
import { buildCharacterView, characterSignature } from './CharacterView';
import { gameView, type ComboBarView, type SkillSlotView } from './GameViewStore';
import { buildInventoryView } from './InventoryView';
import { buildSkillTreeView, skillTreeSignature } from './SkillTreeView';
import { buildShopView, shopSignature } from './ShopView';

const BANNER_SECONDS = 2.5;
const DISCOVERY_SECONDS = 4.5;

/**
 * 每幀（Tick 結束後）把 GameWorld 的狀態複製到 gameView。只讀取 GameWorld，不做任何寫入。
 * 背包、技能樹、角色面板的快照成本較高，只在版本簽章改變時重建。
 */
export class ViewSync {
  private inventoryVersion = -1;
  private skillTreeSig = '';
  private characterSig = '';
  private shopSig = '';
  private bestiaryVersion = -1;
  private bannerTimer = 0;
  private discoveryTimer = 0;
  private milestoneTimer = 0;

  constructor(
    private readonly world: GameWorld,
    private readonly data: DataRegistry,
  ) {
    const events = world.events;
    events.on('FloorEntered', (e) => {
      gameView.leavePrompt = null;
      gameView.challengePrompt = null;
      this.showBanner(e.floor);
    });
    events.on('ComboDiscovered', (e) => {
      gameView.discovery = { name: e.name, description: e.description };
      window.clearTimeout(this.discoveryTimer);
      this.discoveryTimer = window.setTimeout(() => (gameView.discovery = null), DISCOVERY_SECONDS * 1000);
    });
    events.on('ShopOpened', () => gameView.shopRequest++);
    events.on('ChallengeConfirm', (e) => {
      gameView.challengePrompt = { toFloor: e.toFloor, valuableItems: e.valuableItems };
    });
    events.on('GameCleared', (e) => {
      gameView.milestone =
        e.stage === 'normal'
          ? { title: '已通關', text: '擊敗了第 30 層的深淵魔王。出口通往第 31 層的極限挑戰；讀檔時也可以選擇回到 1～30 層。' }
          : { title: '已完成隱藏難關', text: '深淵統御者倒下了。之後讀檔可以選擇前往第 1～35 層的任何一層。' };
      window.clearTimeout(this.milestoneTimer);
      this.milestoneTimer = window.setTimeout(() => (gameView.milestone = null), 10_000);
    });
    events.on('LeaveFloorConfirm', (e) => {
      gameView.leavePrompt = { direction: e.direction, toFloor: e.toFloor, valuableItems: e.valuableItems };
    });
    this.showBanner(world.floors.floor);
    this.update();
  }

  /** 每幀呼叫；hoveredActor 與 fps 只用於開發用除錯資訊 */
  update(frame: { tick?: number; fps?: number; hoveredActor?: ActorId | null } = {}): void {
    const world = this.world;
    const player = world.player;
    const hud = gameView.hud;
    hud.hp.value = player.hp;
    hud.hp.max = player.maxHp;
    hud.mp.value = player.mana;
    hud.mp.max = player.maxMana;
    hud.xp.level = world.progress.level;
    hud.xp.value = world.progress.xp;
    hud.xp.next = world.experience.xpForNextLevel;
    hud.skillPoints = world.progress.skillPoints;
    const buffs = world.itemEffects.activeBuffs;
    if (buffs.length !== hud.buffs.length || buffs.some((b, i) => b.stacks !== hud.buffs[i]?.stacks || Math.ceil(b.remaining) !== Math.ceil(hud.buffs[i]?.remaining ?? 0))) {
      hud.buffs = buffs;
    }
    if (world.progress.version !== this.bestiaryVersion) {
      this.bestiaryVersion = world.progress.version;
      if (Object.keys(gameView.bestiary).length !== world.progress.bestiary.size || [...world.progress.bestiary].some(([id, n]) => gameView.bestiary[id] !== n)) {
        gameView.bestiary = Object.fromEntries(world.progress.bestiary);
      }
      if (gameView.collection.length !== world.progress.collection.size) gameView.collection = [...world.progress.collection];
    }
    hud.attributePoints = world.progress.attributePoints;
    hud.potions = world.potions.count;
    hud.gold = world.wallet.gold;

    this.updateSkillBar();

    const floors = world.floors;
    gameView.floor.floor = floors.floor;
    gameView.floor.killed = floors.killed;
    gameView.floor.total = floors.total;
    gameView.floor.remaining = floors.remainingToOpen;
    gameView.floor.exitOpen = floors.exitOpen;
    gameView.floor.bossFloor = floors.bossFloor;
    gameView.floor.lastFloor = floors.floor >= this.data.balance.endgame.lastFloor;
    this.updateBoss();
    gameView.respawnIn = world.deathHandler.secondsUntilRespawn;
    gameView.respawnAt = { stairs: '樓梯口', midway: '中途存檔點', boss: '魔王門前' }[world.checkpoints.respawn.kind];

    if (world.itemsVersion !== this.inventoryVersion) {
      this.inventoryVersion = world.itemsVersion;
      gameView.inventory = buildInventoryView(world, this.data);
    }
    const treeSig = skillTreeSignature(world);
    if (treeSig !== this.skillTreeSig) {
      this.skillTreeSig = treeSig;
      gameView.skillTree = buildSkillTreeView(world, this.data);
    }
    const shopSig = shopSignature(world);
    if (shopSig !== this.shopSig) {
      this.shopSig = shopSig;
      gameView.shop = buildShopView(world, this.data);
    }
    const charSig = characterSignature(world);
    if (charSig !== this.characterSig) {
      this.characterSig = charSig;
      gameView.character = buildCharacterView(world, this.data);
    }

    const dev = gameView.dev;
    if (dev.enabled) {
      dev.tick = frame.tick ?? dev.tick;
      dev.fps = frame.fps ?? dev.fps;
      dev.player.x = player.position.x;
      dev.player.y = player.position.y;
      dev.waypoints = player.path.length;
      dev.enemies = world.actors.filter((a) => a.faction === 'enemy' && a.ai !== null).length;
      const hovered = frame.hoveredActor == null ? undefined : world.targeting.getActor(frame.hoveredActor);
      dev.target = hovered ? `${hovered.name} ${Math.ceil(hovered.hp - 1e-6)} / ${Math.round(hovered.maxHp)}` : '—';
    }
  }

  private updateSkillBar(): void {
    const world = this.world;
    const player = world.player;
    const loadout = world.loadout;
    const slot = (id: string | null): SkillSlotView | null => {
      if (id === null || !this.data.skills.has(id)) return null;
      const skill = this.data.skills.get(id);
      const rank = player.skillRanks.get(id) ?? 1;
      return { id, name: skill.name, affordable: player.mana >= world.skills.manaCost(skill, rank, player) };
    };
    const unlocked = world.comboSlotsUnlocked;
    const running = world.combos.currentStep(player);
    const rankOf = (id: string) => player.skillRanks.get(id) ?? 1;
    const bar = gameView.skillBar;
    bar.left = slot(loadout.left);
    bar.combos = loadout.combos.map((steps, i): ComboBarView => {
      const sequence = steps.slice(0, unlocked).filter((s): s is string => s !== null);
      const resolved = sequence.length === 3 ? world.comboResolver.resolve(sequence, rankOf) : null;
      const comboName =
        resolved?.status === 'combo' ? (world.codex.has(resolved.comboId) ? resolved.displayName : '???') : null;
      return {
        key: (['Q', 'W', 'E'] as const)[i]!,
        index: i as 0 | 1 | 2,
        steps: steps.map((id, step) => ({ skill: step < unlocked ? slot(id) : null, locked: step >= unlocked })),
        active: loadout.activeCombo === i,
        running: loadout.activeCombo === i ? running : 0,
        comboName,
      };
    });
    bar.supports = loadout.supports.flatMap((id) => (id === null || !this.data.skills.has(id) ? [] : [this.data.skills.get(id).name]));
  }

  /** Boss 發現玩家或玩家靠近時顯示上方大血條 */
  private updateBoss(): void {
    const world = this.world;
    const boss = world.actors.find(
      (a) => a.isBoss && !a.miniBoss && a.alive && (a.ai?.state === 'chase' || Math.hypot(a.position.x - world.player.position.x, a.position.y - world.player.position.y) < 10),
    );
    if (!boss) {
      gameView.boss = null;
      return;
    }
    const view = gameView.boss ?? (gameView.boss = { name: '', hp: 0, max: 1, phase: 0, phaseLabel: null });
    view.name = boss.name;
    view.hp = boss.hp;
    view.max = boss.maxHp;
    view.phase = world.bosses.phaseOf(boss);
    view.phaseLabel = world.bosses.phaseLabel(boss);
  }

  private showBanner(floor: number): void {
    if (floor <= 0) return;
    gameView.floorBanner = floor;
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (gameView.floorBanner = null), BANNER_SECONDS * 1000);
  }
}
