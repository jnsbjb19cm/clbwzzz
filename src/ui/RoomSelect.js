// v0.20 - Single-player playable core

const ROWS = 5;
const COLS = 12;
const MAX_TEAM_SIZE = 10;
const MAX_RESOURCE = 40;
const START_RESOURCE = 8;
const PLAYER_BASE_HP = 1000;
const ENEMY_BASE_HP = 1000;
const GAME_TICK_MS = 100;
const WAVE_INTERVAL_MS = 15000;
const PROJECTILE_SPEED = 7;

let selectedTeam = [];
let draftTeam = [];
let currentFilter = 'all';
let selectedCard = null;
let gameRunning = false;
let sunlight = START_RESOURCE;
let food = START_RESOURCE;
let playerBaseHP = PLAYER_BASE_HP;
let enemyBaseHP = ENEMY_BASE_HP;
let waveNumber = 0;
let units = [];
let grid = [];
let cardCooldowns = {};
let resourceTimer = null;
let gameTimer = null;
let handTimer = null;
let waveTimer = null;
let spawnTimers = [];
let nextWaveAt = 0;
let lastGameTick = 0;
let projectiles = [];
let isPlacingCard = false;
let placingCardValidation = null;
let currentMousePos = { x: 0, y: 0 };

const dom = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
    cacheDom();
    bindEvents();
    resetGrid();
    renderTeamPreview();
    renderModalCards();
    updateSelectionState();
}

function cacheDom() {
    dom.selectionScreen = document.getElementById('selection-screen');
    dom.gameContainer = document.getElementById('game-container');
    dom.teamPreview = document.getElementById('team-preview');
    dom.teamCount = document.getElementById('team-count');
    dom.editTeamBtn = document.getElementById('edit-team-btn');
    dom.startBattleBtn = document.getElementById('start-battle-btn');
    dom.editModal = document.getElementById('edit-modal');
    dom.closeModalBtn = document.getElementById('close-modal-btn');
    dom.modalCardGrid = document.getElementById('modal-card-grid');
    dom.modalCount = document.getElementById('modal-count');
    dom.confirmBtn = document.getElementById('confirm-btn');
    dom.tabs = Array.from(document.querySelectorAll('.tab'));
    dom.battlefield = document.getElementById('battlefield');
    dom.cardSlots = document.getElementById('card-slots');
    dom.sunlight = document.getElementById('sunlight');
    dom.food = document.getElementById('food');
    dom.playerBaseHP = document.getElementById('player-base-hp');
    dom.enemyBaseHP = document.getElementById('enemy-base-hp');
    dom.startWaveBtn = document.getElementById('start-wave-btn');
    dom.resetBtn = document.getElementById('reset-btn');
    dom.logContent = document.getElementById('log-content');
}

function bindEvents() {
    dom.editTeamBtn.addEventListener('click', openEditModal);
    dom.closeModalBtn.addEventListener('click', closeEditModal);
    dom.confirmBtn.addEventListener('click', confirmTeam);
    dom.startBattleBtn.addEventListener('click', startBattle);
    dom.startWaveBtn.addEventListener('click', () => addLog('敌人每 15 秒自动进攻。'));
    dom.resetBtn.addEventListener('click', restartBattle);

    dom.editModal.addEventListener('click', (event) => {
        if (event.target === dom.editModal) closeEditModal();
    });

    dom.tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            currentFilter = tab.dataset.filter;
            dom.tabs.forEach((item) => item.classList.toggle('active', item === tab));
            renderModalCards();
        });
    });

    // 全局事件监听
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('contextmenu', handleRightClick);
}

function openEditModal() {
    draftTeam = [...selectedTeam];
    dom.editModal.style.display = 'block';
    renderModalCards();
}

function closeEditModal() {
    dom.editModal.style.display = 'none';
}

function confirmTeam() {
    selectedTeam = [...draftTeam];
    closeEditModal();
    renderTeamPreview();
    updateSelectionState();
}

function updateSelectionState() {
    dom.teamCount.textContent = String(selectedTeam.length);
    dom.startBattleBtn.disabled = selectedTeam.length === 0;
}

function renderTeamPreview() {
    dom.teamPreview.innerHTML = '';

    for (let index = 0; index < MAX_TEAM_SIZE; index += 1) {
        const cardId = selectedTeam[index];
        if (cardId) {
            const card = createCardElement(cardDatabase[cardId], { compact: true });
            dom.teamPreview.appendChild(card);
        } else {
            const slot = document.createElement('div');
            slot.className = 'empty-slot';
            slot.textContent = '空位';
            dom.teamPreview.appendChild(slot);
        }
    }
}

function renderModalCards() {
    dom.modalCardGrid.innerHTML = '';
    dom.modalCount.textContent = String(draftTeam.length);

    Object.values(cardDatabase)
        .filter((card) => currentFilter === 'all' || card.type === currentFilter)
        .forEach((card) => {
            const isSelected = draftTeam.includes(card.id);
            const cardElement = createCardElement(card, { selected: isSelected });
            cardElement.addEventListener('click', () => toggleDraftCard(card.id));
            dom.modalCardGrid.appendChild(cardElement);
        });
}

function toggleDraftCard(cardId) {
    if (draftTeam.includes(cardId)) {
        draftTeam = draftTeam.filter((id) => id !== cardId);
    } else if (draftTeam.length < MAX_TEAM_SIZE) {
        draftTeam.push(cardId);
    }

    renderModalCards();
}

function createCardElement(card, options = {}) {
    const cardElement = document.createElement('button');
    cardElement.type = 'button';
    cardElement.className = 'card';
    cardElement.dataset.cardId = card.id;
    cardElement.style.setProperty('--card-color', card.color);

    if (options.selected) cardElement.classList.add('selected');
    if (options.compact) cardElement.classList.add('compact');
    if (options.disabled) cardElement.classList.add('disabled');
    if (options.onCooldown) cardElement.classList.add('on-cooldown');
    if (options.unaffordable) cardElement.classList.add('unaffordable');

    cardElement.innerHTML = `
        <span class="card-icon">${card.icon || getFallbackIcon(card)}</span>
        <span class="card-name">${card.name}</span>
        <span class="card-cost">${formatCost(card.cost)}</span>
        <span class="card-stats">攻 ${card.attack} · 血 ${card.hp} · ${card.canMove ? '移动' : '驻守'}</span>
    `;

    if (options.cooldownRemaining > 0) {
        const overlay = document.createElement('span');
        overlay.className = 'cooldown-overlay';
        overlay.textContent = `${Math.ceil(options.cooldownRemaining / 1000)}s`;
        cardElement.appendChild(overlay);
    }

    return cardElement;
}

function formatCost(cost) {
    const parts = [];
    if (cost.sunlight) parts.push(`阳光 ${cost.sunlight}`);
    if (cost.food) parts.push(`食物 ${cost.food}`);
    return parts.join(' / ') || '免费';
}

function getFallbackIcon(card) {
    return card.type === 'plant' ? '🌿' : '👹';
}

function startBattle() {
    if (selectedTeam.length === 0) return;

    clearTimers();
    resetBattleState();
    dom.selectionScreen.style.display = 'none';
    dom.gameContainer.style.display = 'flex';
    createBattlefield();
    renderCardSlots();
    renderBattlefield();
    addLog('战斗开始。');

    resourceTimer = setInterval(gainResources, 1000);
    gameTimer = setInterval(runGameStep, GAME_TICK_MS);
    handTimer = setInterval(() => {
        renderCardSlots();
        updateWaveButton();
    }, 250);
    nextWaveAt = Date.now() + WAVE_INTERVAL_MS;
    waveTimer = setInterval(spawnWave, WAVE_INTERVAL_MS);
    updateWaveButton();
}

function restartBattle() {
    if (selectedTeam.length === 0) {
        dom.gameContainer.style.display = 'none';
        dom.selectionScreen.style.display = 'flex';
        return;
    }

    startBattle();
}

function resetBattleState() {
    gameRunning = true;
    selectedCard = null;
    isPlacingCard = false;
    sunlight = START_RESOURCE;
    food = START_RESOURCE;
    playerBaseHP = PLAYER_BASE_HP;
    enemyBaseHP = ENEMY_BASE_HP;
    waveNumber = 0;
    units = [];
    projectiles = [];
    cardCooldowns = {};
    lastGameTick = Date.now();
    nextWaveAt = 0;
    resetGrid();
    dom.logContent.innerHTML = '';
    updateResources();
}

function resetGrid() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function clearTimers() {
    [resourceTimer, gameTimer, handTimer, waveTimer].forEach((timer) => {
        if (timer) clearInterval(timer);
    });
    spawnTimers.forEach((timer) => clearTimeout(timer));
    resourceTimer = null;
    gameTimer = null;
    handTimer = null;
    waveTimer = null;
    spawnTimers = [];
}

function createBattlefield() {
    dom.battlefield.innerHTML = '';

    // 定义不同区域的背景色
    for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cell';
            
            // 根据列数设置区域
            if (col < 3) {
                cell.classList.add('player-zone');
            } else if (col >= 10) {
                cell.classList.add('enemy-zone');
            } else {
                cell.classList.add('neutral-zone');
            }
            
            cell.dataset.row = String(row);
            cell.dataset.col = String(col);
            cell.setAttribute('aria-label', `第 ${row + 1} 行，第 ${col + 1} 列`);
            cell.addEventListener('click', () => placeCard(row, col));
            cell.addEventListener('mouseover', () => validateCardPlacement(row, col));
            cell.addEventListener('mouseleave', () => clearPlacementPreview());
            dom.battlefield.appendChild(cell);
        }
    }
}

function renderCardSlots() {
    dom.cardSlots.innerHTML = '';
    const now = Date.now();

    selectedTeam.forEach((cardId, index) => {
        const card = cardDatabase[cardId];
        const cooldownRemaining = Math.max(0, (cardCooldowns[cardId] || 0) - now);
        const unaffordable = !canAfford(card);
        
        const slot = document.createElement('div');
        slot.className = 'card-slot';
        slot.dataset.slotIndex = String(index);
        slot.dataset.cardId = cardId;
        
        if (selectedCard === cardId) {
            slot.classList.add('selected');
        }
        if (cooldownRemaining > 0) {
            slot.classList.add('on-cooldown');
        } else if (cooldownRemaining === 0 && cardCooldowns[cardId] && cardCooldowns[cardId] <= now) {
            slot.classList.add('cooldown-ready');
        }
        if (unaffordable) {
            slot.classList.add('unaffordable');
        }

        const icon = document.createElement('div');
        icon.className = 'slot-icon';
        icon.textContent = card.icon || getFallbackIcon(card);

        const name = document.createElement('div');
        name.className = 'slot-name';
        name.textContent = card.name;

        const cost = document.createElement('div');
        cost.className = 'slot-cost';
        cost.textContent = formatCost(card.cost);

        const hint = document.createElement('div');
        hint.className = 'slot-keyboard-hint';
        hint.textContent = `[${index + 1}]`;

        slot.appendChild(icon);
        slot.appendChild(name);
        slot.appendChild(cost);
        slot.appendChild(hint);

        if (cooldownRemaining > 0) {
            const cooldownOverlay = document.createElement('div');
            cooldownOverlay.className = 'slot-cooldown';
            cooldownOverlay.textContent = `${Math.ceil(cooldownRemaining / 1000)}s`;
            slot.appendChild(cooldownOverlay);
        }

        slot.addEventListener('click', () => toggleCardSlot(cardId, index));
        dom.cardSlots.appendChild(slot);
    });
}

function toggleCardSlot(cardId, index) {
    if (!gameRunning) return;
    
    const card = cardDatabase[cardId];
    const now = Date.now();
    const cooldownRemaining = Math.max(0, (cardCooldowns[cardId] || 0) - now);

    if (cooldownRemaining > 0) {
        addLog(`${card.name} 还在冷却中`);
        return;
    }

    if (!canAfford(card)) {
        addLog(`${card.name} 资源不足`);
        return;
    }

    selectedCard = selectedCard === cardId ? null : cardId;
    isPlacingCard = selectedCard !== null;
    renderCardSlots();
    updateBattlefieldDisplay();
}

function handleKeyPress(event) {
    if (!gameRunning || !isPlacingCard) return;

    // 数字键1-10选择卡牌
    if (event.key >= '1' && event.key <= '10') {
        const index = parseInt(event.key) - 1;
        if (index < selectedTeam.length) {
            event.preventDefault();
            const cardId = selectedTeam[index];
            toggleCardSlot(cardId, index);
        }
    }

    // 数字键0或ESC取消选择
    if (event.key === '0' || event.key === 'Escape') {
        event.preventDefault();
        selectedCard = null;
        isPlacingCard = false;
        renderCardSlots();
        updateBattlefieldDisplay();
    }
}

function handleMouseMove(event) {
    currentMousePos = { x: event.clientX, y: event.clientY };

    if (selectedCard && isPlacingCard) {
        updateBattlefieldDisplay();
    }
}

function handleRightClick(event) {
    if (!gameRunning) return;
    
    if (selectedCard && isPlacingCard) {
        event.preventDefault();
        selectedCard = null;
        isPlacingCard = false;
        renderCardSlots();
        updateBattlefieldDisplay();
    }
}

function validateCardPlacement(row, col) {
    if (!selectedCard || !gameRunning) {
        clearPlacementPreview();
        return;
    }

    const card = cardDatabase[selectedCard];
    let isValid = false;

    // 检查放置区域限制
    if (col >= 3 && col <= 9) {
        // 空地区域
        if (!card.canMove || col >= 3 && col <= 9) {
            isValid = true;
        }
    } else if (col < 3) {
        // 己方基地区域
        if (!card.canMove || (card.canMove && col >= 0)) {
            isValid = true;
        }
    }

    // 检查不可驻守单位是否已占据该格子
    if (isValid && !card.canMove && isCellOccupiedByPlayer(row, col)) {
        isValid = false;
    }

    // 更新预览
    updatePlacementPreview(row, col, isValid);
}

function clearPlacementPreview() {
    const cells = Array.from(dom.battlefield.querySelectorAll('.cell'));
    cells.forEach(cell => {
        cell.classList.remove('valid-placement', 'invalid-placement');
    });
}

function updatePlacementPreview(row, col, isValid) {
    clearPlacementPreview();
    const index = row * COLS + col;
    const cell = dom.battlefield.querySelectorAll('.cell')[index];
    
    if (cell) {
        if (isValid) {
            cell.classList.add('valid-placement');
        } else {
            cell.classList.add('invalid-placement');
        }
    }
}

function updateBattlefieldDisplay() {
    const container = dom.gameContainer;
    if (isPlacingCard && selectedCard) {
        container.classList.add('placing-card');
    } else {
        container.classList.remove('placing-card');
    }
}

function placeCard(row, col) {
    if (!selectedCard || !gameRunning) return;

    const cardData = cardDatabase[selectedCard];
    if (!cardData) return;

    // 只能在己方区域放置(0-9列)
    if (col >= 10) {
        addLog('只能在我方区域放置');
        return;
    }

    // 不可移动单位(驻守类)检查
    if (!cardData.canMove && col < 3) {
        addLog('驻守单位只能在空地区域放置');
        return;
    }

    // 可移动单位(进攻类)可以在基地或空地区域放置
    if (cardData.canMove && col >= 10) {
        addLog('可移动单位只能在己方区域放置');
        return;
    }

    // 检查单位是否已占据该格子
    if (!cardData.canMove && isCellOccupiedByPlayer(row, col)) {
        addLog('该格子已有驻守单位，无法放置');
        return;
    }

    if (!canAfford(cardData)) {
        addLog(`${cardData.name} 资源不足`);
        return;
    }

    // 成功放置：创建单位、扣资源、进入冷却
    const unit = createUnit(selectedCard, 'player', row, col);
    sunlight -= cardData.cost.sunlight || 0;
    food -= cardData.cost.food || 0;
    units.push(unit);
    cardCooldowns[selectedCard] = Date.now() + (cardData.cooldown || 3000);
    
    selectedCard = null;
    isPlacingCard = false;
    updateResources();
    renderCardSlots();
    renderBattlefield();
    clearPlacementPreview();
    updateBattlefieldDisplay();
    addLog(`放置了 ${cardData.name}`);
}

function createUnit(cardId, owner, row, col, bonus = {}) {
    const card = cardDatabase[cardId];
    const hpMultiplier = bonus.hpMultiplier || 1;
    const attackMultiplier = bonus.attackMultiplier || 1;

    return {
        id: createUnitId(),
        cardId,
        owner,
        row,
        col,
        currentHP: Math.round(card.hp * hpMultiplier),
        maxHP: Math.round(card.hp * hpMultiplier),
        type: card.type,
        attack: Math.round(card.attack * attackMultiplier),
        range: card.range,
        canMove: card.canMove,
        special: card.special,
        icon: card.icon,
        name: card.name,
        color: card.color,
        lastActionTime: 0,
        nextMoveTime: 0,
        poisonUntil: 0,
        nextPoisonTick: 0,
        slowUntil: 0,
        freezeUntil: 0,
        freezeImmuneUntil: 0
    };
}

function spawnWave() {
    if (!gameRunning) return;

    waveNumber += 1;
    nextWaveAt = Date.now() + WAVE_INTERVAL_MS;
    updateWaveButton();

    const enemyDeck = ['wild-boar', 'giant-monster', 'scarecrow', 'bingkuai-lengcui'];
    const count = Math.min(2 + waveNumber, 7);
    const hpMultiplier = 1 + (waveNumber - 1) * 0.12;
    const attackMultiplier = 1 + (waveNumber - 1) * 0.08;

    for (let index = 0; index < count; index += 1) {
        const cardId = enemyDeck[(index + waveNumber) % enemyDeck.length];
        const row = (index * 2 + waveNumber) % ROWS;
        const delay = index * 550;

        const timer = setTimeout(() => {
            if (!gameRunning) return;
            units.push(createUnit(cardId, 'enemy', row, COLS - 1, { hpMultiplier, attackMultiplier }));
            renderBattlefield();
        }, delay);
        spawnTimers.push(timer);
    }

    addLog(`第 ${waveNumber} 波敌人正在接近。`);
}

function updateWaveButton() {
    if (!dom.startWaveBtn) return;

    if (!gameRunning || nextWaveAt <= 0) {
        dom.startWaveBtn.disabled = true;
        dom.startWaveBtn.textContent = '下一波 15s';
        return;
    }

    const seconds = Math.max(0, Math.ceil((nextWaveAt - Date.now()) / 1000));
    dom.startWaveBtn.disabled = true;
    dom.startWaveBtn.textContent = `下一波 ${seconds}s`;
}

function gainResources() {
    if (!gameRunning) return;
    sunlight = Math.min(MAX_RESOURCE, sunlight + 1);
    food = Math.min(MAX_RESOURCE, food + 1);
    updateResources();
}

function updateResources() {
    dom.sunlight.textContent = String(sunlight);
    dom.food.textContent = String(food);
    dom.playerBaseHP.textContent = String(Math.max(0, playerBaseHP));
    dom.enemyBaseHP.textContent = String(Math.max(0, enemyBaseHP));
}

function runGameStep() {
    if (!gameRunning) return;

    const now = Date.now();
    const deltaSeconds = Math.min((now - lastGameTick) / 1000, 0.25) || (GAME_TICK_MS / 1000);
    lastGameTick = now;

    applyPoison(now);
    updateProjectiles(now, deltaSeconds);

    [...units].forEach((unit) => {
        if (!isAlive(unit)) return;
        if (unit.freezeUntil > now) return;

        if (unit.special === 'heal') {
            tryHeal(unit, now);
            return;
        }

        if (unit.special === 'aura_attack') {
            tryAuraAttack(unit, now);
            return;
        }

        const target = findTarget(unit);
        if (target) {
            tryAttack(unit, target, now);
            return;
        }

        if (tryAttackBase(unit, now)) return;

        if (unit.canMove) moveUnit(unit, now);
    });

    removeDeadUnits();
    rebuildGrid();
    renderBattlefield();
    updateResources();
    checkGameOver();
}

function tryAttack(unit, target, now) {
    if (unit.attack <= 0 || now - unit.lastActionTime < getAttackDelay(unit)) return;
    if (usesProjectile(unit, target)) {
        fireProjectile(unit, target);
    } else {
        dealDamage(target, unit.attack, unit, now);
    }
    unit.lastActionTime = now;
}

function tryAttackBase(unit, now) {
    if (unit.attack <= 0 || now - unit.lastActionTime < getAttackDelay(unit)) return false;

    const distanceToBase = unit.owner === 'player' ? COLS - unit.col : unit.col + 1;
    if (distanceToBase > Math.max(1, unit.range)) return false;

    if (unit.range > 1) {
        fireProjectileAtBase(unit);
    } else {
        damageBase(unit.owner === 'player' ? 'enemy' : 'player', unit.attack, unit.name);
    }

    unit.lastActionTime = now;
    return true;
}

function usesProjectile(unit, target) {
    return unit.range > 1 || Math.abs(target.col - unit.col) > 1;
}

function fireProjectile(unit, target) {
    const direction = unit.owner === 'player' ? 1 : -1;
    projectiles.push({
        id: createUnitId(),
        owner: unit.owner,
        sourceName: unit.name,
        sourceId: unit.id,
        targetId: target.id,
        targetBase: null,
        row: unit.row,
        x: unit.col + direction * 0.2,
        damage: unit.attack,
        special: unit.special,
        color: unit.color,
        icon: getProjectileIcon(unit)
    });
}

function fireProjectileAtBase(unit) {
    const direction = unit.owner === 'player' ? 1 : -1;
    projectiles.push({
        id: createUnitId(),
        owner: unit.owner,
        sourceName: unit.name,
        sourceId: unit.id,
        targetId: null,
        targetBase: unit.owner === 'player' ? 'enemy' : 'player',
        row: unit.row,
        x: unit.col + direction * 0.2,
        damage: unit.attack,
        special: unit.special,
        color: unit.color,
        icon: getProjectileIcon(unit)
    });
}

function updateProjectiles(now, deltaSeconds) {
    projectiles.forEach((projectile) => {
        const target = projectile.targetId
            ? units.find((unit) => unit.id === projectile.targetId && isAlive(unit))
            : null;

        if (projectile.targetId && !target) {
            projectile.done = true;
            return;
        }

        const targetX = projectile.targetBase === 'enemy'
            ? COLS
            : projectile.targetBase === 'player'
                ? -1
                : target.col;
        const direction = Math.sign(targetX - projectile.x) || (projectile.owner === 'player' ? 1 : -1);
        projectile.x += direction * PROJECTILE_SPEED * deltaSeconds;

        if ((direction > 0 && projectile.x >= targetX) || (direction < 0 && projectile.x <= targetX)) {
            projectile.x = targetX;
            resolveProjectileHit(projectile, target, now);
            projectile.done = true;
        }
    });

    projectiles = projectiles.filter((projectile) => !projectile.done);
}

function resolveProjectileHit(projectile, target, now) {
    if (target) {
        dealDamage(target, projectile.damage, projectile, now);
        return;
    }

    if (projectile.targetBase) {
        damageBase(projectile.targetBase, projectile.damage, projectile.sourceName);
    }
}

function damageBase(baseOwner, amount, sourceName) {
    if (baseOwner === 'enemy') {
        enemyBaseHP -= amount;
        addLog(`${sourceName} 命中敌方基地，造成 ${amount} 伤害`);
    } else {
        playerBaseHP -= amount;
        addLog(`${sourceName} 命中我方基地，造成 ${amount} 伤害`);
    }
}

function getProjectileIcon(unit) {
    if (unit.special === 'ice') return '❄';
    if (unit.special === 'poison') return '•';
    if (unit.type === 'monster') return '•';
    return '✦';
}

function tryHeal(unit, now) {
    if (now - unit.lastActionTime < 11000) return;

    const target = units
        .filter((candidate) => (
            candidate.owner === unit.owner
            && candidate.id !== unit.id
            && isAlive(candidate)
            && candidate.currentHP < candidate.maxHP
            && Math.abs(candidate.row - unit.row) <= 1
            && Math.abs(candidate.col - unit.col) <= 2
        ))
        .sort((a, b) => (a.currentHP / a.maxHP) - (b.currentHP / b.maxHP))[0];

    if (!target) return;

    const amount = Math.max(12, unit.attack * 2);
    target.currentHP = Math.min(target.maxHP, target.currentHP + amount);
    unit.lastActionTime = now;
}

function tryAuraAttack(unit, now) {
    if (unit.attack <= 0 || now - unit.lastActionTime < 1500) return;

    const targets = units.filter((candidate) => (
        candidate.owner !== unit.owner
        && isAlive(candidate)
        && Math.abs(candidate.row - unit.row) <= 1
        && Math.abs(candidate.col - unit.col) <= 1
    ));

    if (targets.length === 0) return;

    targets.forEach((target) => dealDamage(target, unit.attack, unit, now));
    unit.lastActionTime = now;
}

function dealDamage(target, amount, attacker, now) {
    target.currentHP -= amount;

    if (attacker.special === 'ice' && target.freezeImmuneUntil <= now) {
        target.freezeUntil = now + 550;
        target.slowUntil = now + 2400;
        target.freezeImmuneUntil = now + 21000;
    }

    if (attacker.special === 'poison') {
        target.poisonUntil = Math.max(target.poisonUntil, now + 31000);
    }

    if (attacker.special === 'knockback') {
        const direction = attacker.owner === 'player' ? 1 : -1;
        target.col = clamp(target.col + direction, 0, COLS - 1);
    }

    if (target.special === 'thorns' && attacker && isAlive(attacker)) {
        attacker.currentHP -= 10;
    }
}

function applyPoison(now) {
    units.forEach((unit) => {
        if (!isAlive(unit) || unit.poisonUntil <= now || unit.nextPoisonTick > now) return;
        unit.currentHP -= 4;
        unit.nextPoisonTick = now + 800;
    });
}

function findTarget(unit) {
    const direction = unit.owner === 'player' ? 1 : -1;

    return units
        .filter((candidate) => {
            if (candidate.owner === unit.owner || !isAlive(candidate) || candidate.row !== unit.row) {
                return false;
            }

            const distance = (candidate.col - unit.col) * direction;
            return distance >= 0 && distance <= Math.max(1, unit.range);
        })
        .sort((a, b) => Math.abs(a.col - unit.col) - Math.abs(b.col - unit.col))[0];
}

function moveUnit(unit, now) {
    if (now < unit.nextMoveTime) return;

    const direction = unit.owner === 'player' ? 1 : -1;
    const nextCol = unit.col + direction;
    const delay = unit.slowUntil > now ? 1050 : 1020;

    if (nextCol < 0 || nextCol >= COLS) {
        unit.nextMoveTime = now + delay;
        return;
    }

    unit.col = nextCol;
    unit.nextMoveTime = now + delay;
}

function getAttackDelay(unit) {
    const baseDelay = unit.canMove ? 1050 : 1250;
    return unit.slowUntil > Date.now() ? baseDelay + 500 : baseDelay;
}

function removeDeadUnits() {
    units = units.filter(isAlive);
}

function rebuildGrid() {
    resetGrid();
    units.forEach((unit) => {
        if (!grid[unit.row][unit.col]) {
            grid[unit.row][unit.col] = unit;
        }
    });
}

function renderBattlefield() {
    const cells = Array.from(dom.battlefield.querySelectorAll('.cell'));
    dom.battlefield.querySelectorAll('.projectile').forEach((projectile) => projectile.remove());

    cells.forEach((cell) => {
        cell.innerHTML = '';
        cell.classList.remove('occupied');
    });

    units.forEach((unit) => {
        if (!isAlive(unit)) return;

        const index = unit.row * COLS + unit.col;
        const cell = cells[index];
        if (!cell) return;

        cell.classList.add('occupied');
        const unitElement = document.createElement('span');
        unitElement.className = `unit ${unit.owner} ${unit.freezeUntil > Date.now() ? 'frozen' : ''}`;
        unitElement.style.setProperty('--unit-color', unit.color);
        unitElement.innerHTML = `
            <span class="unit-icon">${unit.icon || getFallbackIcon(unit)}</span>
            <span class="unit-name">${unit.name}</span>
            <span class="hp-bar"><span style="width: ${getHpPercent(unit)}%"></span></span>
        `;
        cell.appendChild(unitElement);
    });

    projectiles.forEach((projectile) => {
        const projectileElement = document.createElement('span');
        projectileElement.className = `projectile ${projectile.owner}`;
        projectileElement.style.setProperty('--projectile-x', String(clamp(projectile.x, -0.4, COLS - 0.10)));
        projectileElement.style.setProperty('--projectile-row', String(projectile.row));
        projectileElement.style.setProperty('--projectile-color', projectile.color);
        projectileElement.textContent = projectile.icon;
        dom.battlefield.appendChild(projectileElement);
    });
}

function getHpPercent(unit) {
    return clamp(Math.round((unit.currentHP / unit.maxHP) * 100), 0, 100);
}

function checkGameOver() {
    if (enemyBaseHP <= 0) {
        finishGame('胜利，敌方基地已被摧毁。');
    } else if (playerBaseHP <= 0) {
        finishGame('失败，我方基地被攻破。');
    }
}

function finishGame(message) {
    gameRunning = false;
    selectedCard = null;
    isPlacingCard = false;
    clearTimers();
    updateResources();
    renderCardSlots();
    clearPlacementPreview();
    updateBattlefieldDisplay();
    updateWaveButton();
    addLog(message);
}

function canAfford(card) {
    return (card.cost.sunlight || 0) <= sunlight && (card.cost.food || 0) <= food;
}

function isCellOccupied(row, col) {
    return units.some((unit) => isAlive(unit) && unit.row === row && unit.col === col);
}

function isCellOccupiedByPlayer(row, col) {
    return units.some((unit) => isAlive(unit) && unit.owner === 'player' && unit.row === row && unit.col === col);
}

function isAlive(unit) {
    return unit.currentHP > 0;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function createUnitId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()}`;
}

function updateUnitDisplay() {
    renderBattlefield();
}

function addLog(message) {
    if (!dom.logContent) return;

    const item = document.createElement('div');
    item.className = 'log-entry';
    item.textContent = message;
    dom.logContent.prepend(item);

    while (dom.logContent.children.length > 100) {
        dom.logContent.removeChild(dom.logContent.lastChild);
    }
}
