/** 角色的基本型別，獨立成檔避免 Actor 與 AiBrain 等模組互相引用 */
export type ActorId = number;
export type Faction = 'player' | 'enemy' | 'summon';
