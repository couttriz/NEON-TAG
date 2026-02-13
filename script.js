// --- CẤU HÌNH & TRẠNG THÁI ---
const state = {
    mode: null, 
    p1: { x: 50, y: 230, score: 0, el: document.getElementById('p1'), speedBoost: false },
    p2: { x: 710, y: 230, score: 0, el: document.getElementById('p2'), speedBoost: false, stuckCount: 0, forceDirY: 0 },
    chaser: 'p1', 
    baseSpeed: 5,
    boostSpeed: 8,
    gameActive: false, 
    winScore: 500,
    playerSize: 40,
    arenaW: 800,
    arenaH: 500
};

// Cấu hình tường
const wallsConfig = [
    { top: 150, left: 350, width: 20, height: 250 },
    { top: 100, left: 100, width: 150, height: 20 },
    { top: 400, left: 550, width: 150, height: 20 },
    { top: 100, left: 650, width: 20, height: 100 }
];

const keys = {}; 
const touchKeys = {
    p1: { up: false, down: false, left: false, right: false },
    p2: { up: false, down: false, left: false, right: false }
};

const statusText = document.getElementById('statusText');
const powerUpEl = document.getElementById('powerup');
let powerUpActive = false;
let powerUpInterval = null;

// --- CẬP NHẬT KÍCH THƯỚC ARENA ---
function updateArenaSize() {
    const arenaEl = document.getElementById('arena');
    if(arenaEl) {
        state.arenaW = arenaEl.clientWidth;
        state.arenaH = arenaEl.clientHeight;
    }
}
window.addEventListener('resize', updateArenaSize);
// Gọi ngay sau khi load để lấy size đúng
setTimeout(updateArenaSize, 100);

// --- SỰ KIỆN BÀN PHÍM (PC) ---
window.addEventListener('keydown', e => {
    const gameKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD"];
    if(gameKeys.includes(e.code)) e.preventDefault();
    keys[e.code] = true;
});
window.addEventListener('keyup', e => keys[e.code] = false);

// --- SỰ KIỆN CẢM ỨNG (MOBILE) ---
function setupTouchControls() {
    const bindTouch = (btnId, player, dir) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        const setKey = (isActive) => { touchKeys[player][dir] = isActive; };
        // Sự kiện Touch (Mobile)
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); setKey(true); });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); setKey(false); });
        // Sự kiện Mouse (PC - để test giả lập)
        btn.addEventListener('mousedown', (e) => { setKey(true); });
        btn.addEventListener('mouseup', (e) => { setKey(false); });
        btn.addEventListener('mouseleave', (e) => { setKey(false); });
    };

    bindTouch('p1-up', 'p1', 'up'); bindTouch('p1-down', 'p1', 'down');
    bindTouch('p1-left', 'p1', 'left'); bindTouch('p1-right', 'p1', 'right');
    bindTouch('p2-up', 'p2', 'up'); bindTouch('p2-down', 'p2', 'down');
    bindTouch('p2-left', 'p2', 'left'); bindTouch('p2-right', 'p2', 'right');
}
setupTouchControls();

// --- LOGIC GAME ---
function selectMode(mode) {
    state.mode = mode;
    document.getElementById('startScreen').classList.add('hidden');
    
    updateArenaSize();
    setupArena(mode); 

    state.p1.x = state.arenaW * 0.1; state.p1.y = state.arenaH * 0.5;
    state.p2.x = state.arenaW * 0.9; state.p2.y = state.arenaH * 0.5;
    render(); 

    // Ẩn/Hiện nút P2 tùy chế độ
    const p2Pad = document.querySelector('.p2-pad');
    if(p2Pad) {
        p2Pad.style.display = (mode === 'pve') ? 'none' : 'flex';
    }

    document.getElementById('readyScreen').classList.remove('hidden');
}

function confirmStart() {
    document.getElementById('readyScreen').classList.add('hidden');
    state.gameActive = true;
    state.p2.stuckCount = 0; state.p2.forceDirY = 0;
    statusText.innerText = "XANH ĐANG ĐUỔI!";
    gameLoop();
    if (window.powerUpInterval) clearInterval(window.powerUpInterval);
    window.powerUpInterval = setInterval(spawnPowerUp, 8000);
}

function setupArena(mode) {
    const arena = document.getElementById('arena');
    const oldWalls = document.querySelectorAll('.wall');
    oldWalls.forEach(w => w.remove());

    const isLandscape = window.innerWidth > window.innerHeight;
    // Chỉ hiện tường khi PvP và màn hình đủ rộng (PC hoặc Mobile xoay ngang)
    if (mode === 'pvp' && (window.innerWidth > 600 || isLandscape)) {
        wallsConfig.forEach(cfg => {
            const w = document.createElement('div');
            w.className = 'wall';
            w.style.top = cfg.top + 'px'; w.style.left = cfg.left + 'px';
            w.style.width = cfg.width + 'px'; w.style.height = cfg.height + 'px';
            arena.appendChild(w);
        });
    }
}

function gameLoop() {
    if (!state.gameActive) return;

    movePlayer('p1', 'KeyW', 'KeyS', 'KeyA', 'KeyD', touchKeys.p1);

    if (state.mode === 'pvp') {
        movePlayer('p2', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', touchKeys.p2);
    } else {
        moveAI_Pathfinder();
    }

    checkTagCollision();
    checkPowerUp();
    updateScore();
    render();
    requestAnimationFrame(gameLoop);
}

function movePlayer(playerKey, up, down, left, right, touchInput) {
    const p = state[playerKey];
    let speed = p.speedBoost ? state.boostSpeed : state.baseSpeed;
    
    let dx = 0, dy = 0;
    
    // PC Keys
    if (keys[up]) dy = -speed;
    if (keys[down]) dy = speed;
    if (keys[left]) dx = -speed;
    if (keys[right]) dx = speed;

    // Mobile Touch
    if (touchInput) {
        if (touchInput.up) dy = -speed;
        if (touchInput.down) dy = speed;
        if (touchInput.left) dx = -speed;
        if (touchInput.right) dx = speed;
    }

    if (dx !== 0 && !checkCollision(p.x + dx, p.y)) p.x += dx;
    if (dy !== 0 && !checkCollision(p.x, p.y + dy)) p.y += dy;
    
    p.x = Math.max(0, Math.min(state.arenaW - state.playerSize, p.x));
    p.y = Math.max(0, Math.min(state.arenaH - state.playerSize, p.y));
}

function moveAI_Pathfinder() {
    const ai = state.p2; const target = state.p1;
    let speed = ai.speedBoost ? state.boostSpeed : (state.baseSpeed * 0.9);
    let vecX = target.x - ai.x; let vecY = target.y - ai.y;
    if (state.chaser === 'p1') { vecX = -vecX; vecY = -vecY; }

    let dirX = 0, dirY = 0;
    if (Math.abs(vecX) > 5) dirX = vecX > 0 ? 1 : -1;
    if (Math.abs(vecY) > 5) dirY = vecY > 0 ? 1 : -1;

    let moveX = dirX * speed; let moveY = dirY * speed;
    let blockedX = checkCollision(ai.x + moveX, ai.y);
    let blockedY = checkCollision(ai.x, ai.y + moveY);

    if (blockedX && moveX !== 0) {
        if (ai.forceDirY === 0) {
            let upBlocked = checkCollision(ai.x + moveX, ai.y - 50);
            let downBlocked = checkCollision(ai.x + moveX, ai.y + 50);
            if (!upBlocked) ai.forceDirY = -1; else if (!downBlocked) ai.forceDirY = 1; else ai.forceDirY = (ai.y > state.arenaH/2) ? -1 : 1;
        }
        moveY = ai.forceDirY * speed; moveX = 0; ai.el.style.backgroundColor = "orange";
    } else { ai.forceDirY = 0; ai.el.style.backgroundColor = ""; }

    if (blockedY && moveY !== 0 && moveX === 0) { 
        let leftBlocked = checkCollision(ai.x - 50, ai.y + moveY);
        let rightBlocked = checkCollision(ai.x + 50, ai.y + moveY);
        let forceX = 0;
        if (!leftBlocked) forceX = -1; else if (!rightBlocked) forceX = 1; else forceX = (ai.x > state.arenaW/2) ? -1 : 1;
        moveX = forceX * speed; moveY = 0;
    }

    if (!checkCollision(ai.x + moveX, ai.y)) ai.x += moveX;
    if (!checkCollision(ai.x, ai.y + moveY)) ai.y += moveY;
    ai.x = Math.max(0, Math.min(state.arenaW - state.playerSize, ai.x));
    ai.y = Math.max(0, Math.min(state.arenaH - state.playerSize, ai.y));
}

function checkCollision(x, y) {
    if (x < 0 || x > state.arenaW - state.playerSize || y < 0 || y > state.arenaH - state.playerSize) return true;
    const walls = document.querySelectorAll('.wall'); const size = state.playerSize; const pad = 2; 
    for (let wall of walls) {
        if (x + pad < wall.offsetLeft + wall.offsetWidth && x + size - pad > wall.offsetLeft && y + pad < wall.offsetTop + wall.offsetHeight && y + size - pad > wall.offsetTop) return true;
    }
    return false;
}

function checkTagCollision() {
    if (state.cooldown) return;
    const p1 = state.p1; const p2 = state.p2; const size = state.playerSize;
    if (p1.x < p2.x + size && p1.x + size > p2.x && p1.y < p2.y + size && p1.y + size > p2.y) {
        state.chaser = (state.chaser === 'p1') ? 'p2' : 'p1';
        state.cooldown = true;
        state.p1.el.classList.add('cooldown'); state.p2.el.classList.add('cooldown');
        statusText.innerText = `${state.chaser === 'p1' ? 'XANH' : 'ĐỎ'} ĐANG ĐUỔI!`;
        setTimeout(() => { state.cooldown = false; state.p1.el.classList.remove('cooldown'); state.p2.el.classList.remove('cooldown'); }, 1000);
    }
}
function spawnPowerUp() {
    if (!powerUpActive && state.gameActive) {
        const x = Math.random() * (state.arenaW - 40); const y = Math.random() * (state.arenaH - 40);
        if (!checkCollision(x, y)) { powerUpEl.style.left = x + 'px'; powerUpEl.style.top = y + 'px'; powerUpEl.style.display = 'flex'; powerUpActive = true; state.powerUpPos = { x, y, size: 30 }; }
    }
}
function checkPowerUp() {
    if (!powerUpActive) return;
    ['p1', 'p2'].forEach(key => {
        const p = state[key]; const item = state.powerUpPos; const size = state.playerSize;
        if (p.x < item.x + item.size && p.x + size > item.x && p.y < item.y + item.size && p.y + size > item.y) {
            powerUpActive = false; powerUpEl.style.display = 'none';
            p.speedBoost = true; p.el.style.filter = "brightness(200%) drop-shadow(0 0 10px yellow)";
            setTimeout(() => { p.speedBoost = false; p.el.style.filter = "none"; }, 3000);
        }
    });
}
function updateScore() {
    const runner = state.chaser === 'p1' ? 'p2' : 'p1'; state[runner].score++;
    document.getElementById('scoreP1').innerText = Math.floor(state.p1.score / 10);
    document.getElementById('scoreP2').innerText = Math.floor(state.p2.score / 10);
    const realScoreP1 = Math.floor(state.p1.score / 10); const realScoreP2 = Math.floor(state.p2.score / 10);
    if (realScoreP1 >= state.winScore || realScoreP2 >= state.winScore) {
        state.gameActive = false;
        const winner = realScoreP1 >= state.winScore ? "XANH (P1)" : "ĐỎ (P2)";
        document.getElementById('winnerText').innerText = `${winner} THẮNG!`;
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }
}
function render() {
    state.p1.el.style.left = state.p1.x + 'px'; state.p1.el.style.top = state.p1.y + 'px';
    state.p2.el.style.left = state.p2.x + 'px'; state.p2.el.style.top = state.p2.y + 'px';
    if (state.chaser === 'p1') { state.p1.el.classList.add('chaser'); state.p2.el.classList.remove('chaser'); } 
    else { state.p2.el.classList.add('chaser'); state.p1.el.classList.remove('chaser'); }
}