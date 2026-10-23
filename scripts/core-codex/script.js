// ── 熔核（v0.5.0）：由 update-codex 產生的資料 ──
(() => {
  const C = __CORES__;
  const $ = (id) => document.getElementById(id);
  const RAR = ['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic'];
  const SHORT = { normal: '白', magic: '藍', rare: '黃', epic: '紫', legendary: '橘', mythic: '紅' };
  const SLOTS = [['weapon', '武器'], ['helmet', '頭盔'], ['armor', '衣裝'], ['gloves', '手套'], ['boots', '鞋子'], ['shield', '盾牌']];
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  const gem = (types, tier, rarity, element, branded) => {
    try { return window.ItemIcons && ItemIcons.gemIcon ? ItemIcons.gemIcon(types, tier, rarity, element, branded) : ''; } catch (e) { return ''; }
  };
  const img = (src, size = 44) => (src ? `<img src="${src}" width="${size}" height="${size}" alt="" loading="lazy">` : '');

  // 寶石：核種 × 核階（T1～T5，核色依序白～橘）
  const rows = [[['sharp'], '銳核'], [['heavy'], '重核'], [['pierce'], '穿核'], [['arcane'], '靈核（火）', 'fire'], [['wall'], '壁核'], [['swift'], '疾核'], [['grip'], '掌核'], [['crown'], '冠核'], [['sharp', 'heavy'], '混核（銳＋重）']];
  $('gemRow').innerHTML = rows.map(([types, label, el]) => `<div class="gem-line"><span class="gem-label">${label}</span>${[1, 2, 3, 4, 5].map((t) => `<span class="gem-cell">${img(gem(types, t, RAR[t - 1], el, t === 5))}<small>T${t}</small></span>`).join('')}</div>`).join('') +
    '<p class="small muted">外框 = 核色；寶石顏色 = 核種（靈核依元素）；核階越高切工越細、星芒越多；T5 頂點的大星芒 = 帶印記。</p>';

  // 孔數
  const s = C.sockets;
  $('socketTable').innerHTML = `<thead><tr><th>稀有度</th><th class="n">孔數上限</th><th class="n">掉落時 0 / 1 / 2 孔</th><th class="n">鑲滿同核加成</th></tr></thead><tbody>${RAR.map((r) => {
    const w = s.dropWeights[r];
    const total = w.reduce((a, b) => a + b, 0);
    const drop = w.length > 1 ? w.map((x) => pct(x / total)).join(' / ') : '0 孔（要鑿）';
    return `<tr><td class="rowh rar r-${r}">${SHORT[r]}</td><td class="n">${s.max[r]}</td><td class="n">${s.max[r] === 0 ? '不能打孔' : drop}</td><td class="n">${s.max[r] === 0 ? '—' : '×' + +(1 + s.max[r] * s.matchBonus).toFixed(2)}</td></tr>`;
  }).join('')}</tbody>`;
  $('socketNote').textContent = `可以鑲的部位：武器、頭盔、衣裝、手套、鞋子、盾牌（盾牌只能配劍、斧）。熔核不看裝備稀有度，白裝也能打造成符合自己需求的強裝。同核加成：一件裝備的孔都鑲滿、每顆核種相同（混核要兩個核種都相同），那件裝備上的熔核數值 ×（1 + 孔數 × ${Math.round(s.matchBonus * 100)}%）（固定數值的屬性如穿透 +1 不乘）。鑲在武器的熔核另外依核階加武器傷害 ${s.weaponDamage.map((v, i) => `T${i + 1} +${Math.round(v * 100)}%`).join('、')}（和裝備主倍率相加，法杖放大法術強度；同核加成也乘，不受全身上限），白裝 5 顆 T5 同核 = +${Math.round(s.weaponDamage[4] * 5 * (1 + 5 * s.matchBonus) * 100)}%。全身上限：同一條屬性所有熔核合計，最多是「一顆 T5 橘核最高值」的 ${s.bodyCap} 倍；每件同核鑲滿、而且有提供這條屬性的裝備，再多「孔數 × ${s.matchCapPerSocket}」倍（白裝 5 孔 +${5 * s.matchCapPerSocket}、紫裝 2 孔 +${2 * s.matchCapPerSocket}）。印記同理（以單顆為準），超過的部分不生效。`;

  // 核階、核色
  const f = C.fusion;
  $('tierTable').innerHTML = `<thead><tr><th>核階</th>${f.tierMultiplier.map((_, i) => `<th class="n">T${i + 1}</th>`).join('')}</tr></thead><tbody>
    <tr><td class="rowh">平均物品等級</td>${f.tierMultiplier.map((_, i) => { const L = f.levelsPerTier; return `<td class="n">${i === 0 ? `1～${L - 1}` : i === f.tierMultiplier.length - 1 ? i * L + ' 以上' : `${i * L}～${i * L + L - 1}`}</td>`; }).join('')}</tr>
    <tr><td class="rowh">數值倍率</td>${f.tierMultiplier.map((m) => `<td class="n">×${m}</td>`).join('')}</tr></tbody>`;
  const colors = ['normal', 'magic', 'rare', 'epic', 'legendary'];
  const from = { normal: 0, ...f.rarityFrom };
  $('colorTable').innerHTML = `<thead><tr><th>核色</th>${colors.map((r) => `<th class="n rar r-${r}">${SHORT[r]}</th>`).join('')}</tr></thead><tbody>
    <tr><td class="rowh">權重合計</td>${colors.map((r, i) => `<td class="n">${i === colors.length - 1 ? from[r] + ' 以上' : `${from[r]}～${from[colors[i + 1]] - 1}`}</td>`).join('')}</tr>
    <tr><td class="rowh">屬性條數</td>${colors.map((r) => `<td class="n">${f.lineCount[r]}</td>`).join('')}</tr>
    <tr><td class="rowh">核色倍率</td>${colors.map((r) => { const [lo, hi] = C.rarityPower[r]; return `<td class="n">${lo === hi ? '×' + lo : `×${lo}～${hi}`}</td>`; }).join('')}</tr></tbody>`;
  $('colorNote').textContent = '權重：每把投入的武器依稀有度給分（白 0、藍 1、黃 2、紫 4、橘 7、紅 12）；沒有紅核。屬性條數含主屬性（第 1 條固定是鑲嵌部位的主屬性），印記另外加一條、不佔條數。';

  // 融合規則
  const b = f.brand;
  const boost = Object.entries(f.jewelryBoost).filter(([, v]) => v > 0).map(([r, v]) => `${SHORT[r]} +${pct(v)}`).join('、');
  $('fusionRules').innerHTML = [
    `投入 ${f.inputs.min}～${f.inputs.max} 件裝備（飾品以外，種類、稀有度不限，武器與防具可以混放）；飾品區最多 ${f.jewelrySlots} 件戒指 / 護身符（${boost}），只提高印記機率，融合後一起消失。`,
    '核種：多數決（劍 → 銳核、斧 → 重核、弓 → 穿核、法杖 → 靈核；盔甲與盾牌 → 壁核、鞋子 → 疾核、手套 → 掌核、頭盔 → 冠核）；平手 → 混核（每個部位兩個核種各取一條，數值 ×' + f.mixedMultiplier + '）；超過兩種平手時取物品等級最高的兩種。',
    `純核：四件同一類（四把劍、四件鞋子…）→ 屬性多 ${f.pureBonusLines} 條。盔甲與盾牌同屬壁核，但不算同一類。`,
    '元素：靈核看投入法杖的附加元素詞綴、冠核看投入頭盔的元素抗性詞綴，取最多的那一種（火 / 冰 / 雷），平手或沒有時隨機；鑲在哪個部位都是同一個元素。',
    '精華跟著多數決：武器多付武器精華、防具多付防具精華；一樣多時各付一半。',
    '副屬性：從核種在武器以外各部位的屬性＋通用池中均等抽，不重複；不會抽到武器欄的屬性（輸出主要靠武器欄的主屬性）。',
    `印記：投入的每件橘色裝備各有 ${pct(b.chance)}＋飾品加成的機率，把它的強屬性（◆）傳進熔核，數值 ×${b.valueMultiplier}（整數四捨五入、至少 1）；總機率最多 ${pct(b.chanceCap)}；永遠不傳傳奇 / 神話效果（✦）。紅色裝備沒有強屬性，只貢獻核色。`,
    '按下融合前，面板就會顯示核種（票數）、核階、核色（距下一級還差多少）、元素、條數、印記機率與候選、六個部位的主屬性範圍與費用；只隱藏骰子本身。投入傳奇 / 神話時要二次確認。',
  ].map((t) => `<li>${t}</li>`).join('');
  $('fusionFormula').textContent = `金幣 = ${f.cost.goldBase} + ${f.cost.goldPerItemLevel} × Σ物品等級；精華 = ${f.cost.essenceBase} + Σ⌈物品等級 ÷ ${f.cost.essenceLevelDivisor}⌉`;
  $('socketFormula').textContent = `鑿第 n 孔：金幣 ${s.drillGold} × 物品等級 × n、防具精華 ${s.drillEssence} × n（商人的鍛造格）；鑲嵌、取下：免費，在背包自己做`;

  // 核種 × 部位
  const enabled = C.types.filter((t) => t.enabled);
  $('coreTable').innerHTML = `<thead><tr><th>核種（來源）</th>${SLOTS.map(([, l]) => `<th>鑲${l}</th>`).join('')}</tr></thead><tbody>${enabled.map((t) =>
    `<tr><td class="rowh"><span class="core-name">${img(gem([t.id], 3, 'epic', t.id === 'arcane' ? 'fire' : undefined), 28)}${t.name}<small>（${t.source}）</small></span></td>${SLOTS.map(([k]) => `<td class="small">${t.slots[k].join('<br>或 ')}</td>`).join('')}</tr>`).join('')}
    <tr><td class="rowh">通用副屬性池</td><td class="small" colspan="${SLOTS.length}">${C.shared.join('、')}</td></tr></tbody>`;
  $('coreNote').textContent = '實際數值 = T1 範圍 × 核階倍率 × 核色倍率（× 同核加成）；不看裝備稀有度。攻核的武器欄偏專精（例：重擊類技能傷害），護核的武器欄偏通用（近戰傷害、所有傷害）；護核鑲在防具上偏防禦。盾牌欄偏防禦與控制抗性（只有近戰能配盾），唯一的輸出是重核的盾擊傷害；每條範圍都不高於其他部位欄的同一種屬性，所以全身上限不變。';

  // 範例
  $('exampleTable').innerHTML = `<thead><tr><th>投入</th><th>熔核</th><th class="n">核階</th><th>核色</th><th class="n">條數</th><th class="n">印記機率</th><th class="n">金幣 / 精華</th></tr></thead><tbody>${C.examples.map((e) =>
    `<tr><td class="small">${e.label}</td><td><span class="core-name">${img(gem(e.types, e.tier, e.rarity, e.element ?? undefined, false), 28)}${e.core}${e.pure ? '・純核' : ''}</span></td><td class="n">T${e.tier}</td><td class="rar r-${e.rarity}">${SHORT[e.rarity]}</td><td class="n">${e.lines}</td><td class="n">${e.brand ? e.brand + '%' : '—'}</td><td class="n">${e.gold.toLocaleString()} / ${e.essenceText}</td></tr>`).join('')}</tbody>`;
})();
