// --- STATE ---
const state = {
    mode: null,
    p1: { x: 50, y: 230, score: 0, el: document.getElementById('p1'), speedBoost: false },
    p2: { x: 710, y: 230, score: 0, el: document.getElementById('p2'), speedBoost: false, forceDirY: 0 },
    chaser: 'p1',
    baseSpeed: 5,
    boostSpeed: 8,
    gameActive: false,
    winScore: 500,
    playerSize: 40,
    arenaW: 800, arenaH: 500
};

const wallsConfig = [
    { top: 150, left: 350, width: 20, height: 250 },
    { top: 100, left: 100, width: 150, height: 20 },
    { top: 400, left: 550, width: 150, height: 20 },
    { top: 100, left: 650, width: 20, height: 100 }
];

const keys = {};
const joystickInput = {
    p1: { dx: 0, dy: 0 },
    p2: { dx: 0, dy: 0 }
};

const statusText = document.getElementById('statusText');
const powerUpEl = document.getElementById('powerup');
let powerUpActive = false;

// --- INPUTS ---
window.addEventListener('keydown', e => {
    const gKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"];
    if(gKeys.includes(e.code)) e.preventDefault();
    keys[e.code] = true;
});
window.addEventListener('keyup', e => keys[e.code] = false);

function setupJoystick(baseId, thumbId, playerKey) {
    const base = document.getElementById(baseId);
    const thumb = document.getElementById(thumbId);
    if (!base) return;

    let active = false;
    const maxR = 40;

    const move = (e) => {
        if (!active) return;
        const t = e.touches ? e.touches[0] : e;
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dX = t.clientX - centerX;
        let dY = t.clientY - centerY;
        const dist = Math.sqrt(dX*dX + dY*dY);

        if (dist > maxR) { dX *= maxR/dist; dY *= maxR/dist; }
        thumb.style.transform = `translate(calc(-50% + ${dX}px), calc(-50% + ${dY}px))`;

        // Normalize to -1 to 1
        joystickInput[playerKey].dx = dX / maxR;
        joystickInput[playerKey].dy = dY / maxR;
    };

    const stop = () => {
        active = false;
        thumb.style.transform = `translate(-50%, -50%)`;
        joystickInput[playerKey].dx = 0;
        joystickInput[playerKey].dy = 0;
    };

    base.addEventListener('touchstart', (e) => { active = true; move(e); }, {passive: false});
    window.addEventListener('touchmove', move, {passive: false});
    window.addEventListener('touchend', stop);
    base.addEventListener('mousedown', () => active = true);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
}

setupJoystick('joystick-base-p1', 'joystick-thumb-p1', 'p1');
setupJoystick('joystick-base-p2', 'joystick-thumb-p2', 'p2');

// --- LOGIC ---
function updateArenaSize() {
    const el = document.getElementById('arena');
    state.arenaW = el.clientWidth;
    state.arenaH = el.clientHeight;
}
window.addEventListener('resize', updateArenaSize);

function selectMode(mode) {
    state.mode = mode;
    document.getElementById('startScreen').classList.add('hidden');
    updateArenaSize();
    
    // Clear walls
    document.querySelectorAll('.wall').forEach(w => w.remove());
    if (mode === 'pvp') {
        wallsConfig.forEach(cfg => {
            const w = document.createElement('div');
            w.className = 'wall';
            w.style.cssText = `top:${cfg.top}px; left:${cfg.left}px; width:${cfg.width}px; height:${cfg.height}px;`;
            document.getElementById('arena').appendChild(w);
        });
        document.getElementById('dual-controls').style.justifyContent = 'space-between';
        document.querySelector('.p2-pad').style.display = 'flex';
    } else {
        document.getElementById('dual-controls').style.justifyContent = 'center';
        document.querySelector('.p2-pad').style.display = 'none';
    }

    state.p1.x = state.arenaW * 0.1; state.p1.y = state.arenaH * 0.5;
    state.p2.x = state.arenaW * 0.9; state.p2.y = state.arenaH * 0.5;
    render();
    document.getElementById('readyScreen').classList.remove('hidden');
}

function confirmStart() {
    document.getElementById('readyScreen').classList.add('hidden');
    state.gameActive = true;
    statusText.innerText = "XANH ĐUỔI!";
    gameLoop();
    setInterval(spawnPowerUp, 8000);
}

function gameLoop() {
    if (!state.gameActive) return;

    movePlayer('p1', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'p1');
    if (state.mode === 'pvp') movePlayer('p2', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'p2');
    else moveAI();

    checkCollisions();
    updateScore();
    render();
    requestAnimationFrame(gameLoop);
}

function movePlayer(key, up, down, left, right, joyKey) {
    const p = state[key];
    const spd = p.speedBoost ? state.boostSpeed : state.baseSpeed;
    let dx = 0, dy = 0;

    // Keyboard
    if (keys[up]) dy = -spd; if (keys[down]) dy = spd;
    if (keys[left]) dx = -spd; if (keys[right]) dx = spd;

    // Joystick override
    if (Math.abs(joystickInput[joyKey].dx) > 0.1) dx = joystickInput[joyKey].dx * spd;
    if (Math.abs(joystickInput[joyKey].dy) > 0.1) dy = joystickInput[joyKey].dy * spd;

    if (!isBlocked(p.x + dx, p.y)) p.x += dx;
    if (!isBlocked(p.x, p.y + dy)) p.y += dy;
    p.x = Math.max(0, Math.min(state.arenaW-40, p.x));
    p.y = Math.max(0, Math.min(state.arenaH-40, p.y));
}

function moveAI() {
    const ai = state.p2; const target = state.p1;
    let spd = ai.speedBoost ? state.boostSpeed : state.baseSpeed * 0.85;
    let vX = target.x - ai.x; let vY = target.y - ai.y;
    if (state.chaser === 'p1') { vX *= -1; vY *= -1; }

    let mX = Math.abs(vX) > 5 ? (vX > 0 ? spd : -spd) : 0;
    let mY = Math.abs(vY) > 5 ? (vY > 0 ? spd : -spd) : 0;

    if (isBlocked(ai.x + mX, ai.y) && mX !== 0) {
        if (ai.forceDirY === 0) ai.forceDirY = !isBlocked(ai.x+mX, ai.y-50) ? -1 : 1;
        mY = ai.forceDirY * spd; mX = 0;
    } else ai.forceDirY = 0;

    if (!isBlocked(ai.x + mX, ai.y)) ai.x += mX;
    if (!isBlocked(ai.x, ai.y + mY)) ai.y += mY;
}

function isBlocked(x, y) {
    if (x < 0 || x > state.arenaW-40 || y < 0 || y > state.arenaH-40) return true;
    const walls = document.querySelectorAll('.wall');
    for (let w of walls) {
        if (x+4 < w.offsetLeft+w.offsetWidth && x+36 > w.offsetLeft && y+4 < w.offsetTop+w.offsetHeight && y+36 > w.offsetTop) return true;
    }
    return false;
}

function checkCollisions() {
    const p1 = state.p1; const p2 = state.p2;
    if (!state.cooldown && Math.abs(p1.x - p2.x) < 35 && Math.abs(p1.y - p2.y) < 35) {
        state.chaser = state.chaser === 'p1' ? 'p2' : 'p1';
        state.cooldown = true;
        p1.el.classList.add('cooldown'); p2.el.classList.add('cooldown');
        statusText.innerText = `${state.chaser === 'p1' ? 'XANH' : 'ĐỎ'} ĐUỔI!`;
        setTimeout(() => { state.cooldown = false; p1.el.classList.remove('cooldown'); p2.el.classList.remove('cooldown'); }, 1000);
    }
    // Powerup
    if (powerUpActive && Math.abs(p1.x - powerUpPos.x) < 35 && Math.abs(p1.y - powerUpPos.y) < 35) applyBoost('p1');
    if (powerUpActive && Math.abs(p2.x - powerUpPos.x) < 35 && Math.abs(p2.y - powerUpPos.y) < 35) applyBoost('p2');
}

let powerUpPos = { x: 0, y: 0 };
function spawnPowerUp() {
    if (powerUpActive || !state.gameActive) return;
    const x = Math.random()*(state.arenaW-40); const y = Math.random()*(state.arenaH-40);
    if (!isBlocked(x,y)) {
        powerUpPos = {x,y}; powerUpEl.style.cssText = `display:flex; left:${x}px; top:${y}px;`;
        powerUpActive = true;
    }
}
function applyBoost(p) {
    powerUpActive = false; powerUpEl.style.display = 'none';
    state[p].speedBoost = true; state[p].el.style.filter = "brightness(2)";
    setTimeout(() => { state[p].speedBoost = false; state[p].el.style.filter = ""; }, 3000);
}

function updateScore() {
    const runner = state.chaser === 'p1' ? 'p2' : 'p1';
    state[runner].score++;
    document.getElementById('scoreP1').innerText = Math.floor(state.p1.score/10);
    document.getElementById('scoreP2').innerText = Math.floor(state.p2.score/10);
    if (Math.floor(state[runner].score/10) >= state.winScore) {
        state.gameActive = false;
        document.getElementById('winnerText').innerText = `${runner === 'p1' ? 'XANH' : 'ĐỎ'} THẮNG!`;
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }
}

function render() {
    state.p1.el.style.left = state.p1.x + 'px'; state.p1.el.style.top = state.p1.y + 'px';
    state.p2.el.style.left = state.p2.x + 'px'; state.p2.el.style.top = state.p2.y + 'px';
    state.p1.el.classList.toggle('chaser', state.chaser === 'p1');
    state.p2.el.classList.toggle('chaser', state.chaser === 'p2');
}