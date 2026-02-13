// --- 1. HỆ THỐNG ÂM THANH (AUDIO SYSTEM) ---
const Sound = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playTone: function(freq, type, duration) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    hit: function() { this.playTone(150, 'sawtooth', 0.1); },
    powerup: function() { 
        this.playTone(600, 'sine', 0.1); 
        setTimeout(() => this.playTone(1200, 'sine', 0.2), 100); 
    },
    win: function() {
        this.playTone(400, 'square', 0.2);
        setTimeout(() => this.playTone(600, 'square', 0.2), 200);
        setTimeout(() => this.playTone(800, 'square', 0.4), 400);
    }
};

// --- 2. HỆ THỐNG CẤU HÌNH & TRẠNG THÁI ---
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

// --- 3. INPUT HANDLERS ---
window.addEventListener('keydown', e => {
    const gKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"];
    if(gKeys.includes(e.code)) e.preventDefault();
    keys[e.code] = true;
});
window.addEventListener('keyup', e => keys[e.code] = false);

// --- 4. JOYSTICK ĐA ĐIỂM (MULTI-TOUCH FIX) ---
function setupJoystick(baseId, thumbId, playerKey) {
    const base = document.getElementById(baseId);
    const thumb = document.getElementById(thumbId);
    if (!base) return;

    let currentTouchId = null;
    const maxR = 40;

    const updateJoystick = (clientX, clientY) => {
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dX = clientX - centerX;
        let dY = clientY - centerY;
        const dist = Math.sqrt(dX * dX + dY * dY);

        if (dist > maxR) { dX *= maxR / dist; dY *= maxR / dist; }
        thumb.style.transform = `translate(calc(-50% + ${dX}px), calc(-50% + ${dY}px))`;
        joystickInput[playerKey].dx = dX / maxR;
        joystickInput[playerKey].dy = dY / maxR;
    };

    const resetJoystick = () => {
        currentTouchId = null;
        thumb.style.transform = `translate(-50%, -50%)`;
        joystickInput[playerKey].dx = 0;
        joystickInput[playerKey].dy = 0;
    };

    base.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (currentTouchId !== null) return;
        const touch = e.changedTouches[0];
        currentTouchId = touch.identifier;
        updateJoystick(touch.clientX, touch.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (currentTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === currentTouchId) {
                e.preventDefault();
                updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                break;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (currentTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === currentTouchId) {
                resetJoystick();
                break;
            }
        }
    });

    // Mouse support for testing
    let isMouseDown = false;
    base.addEventListener('mousedown', (e) => { isMouseDown = true; updateJoystick(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => { if (isMouseDown) { e.preventDefault(); updateJoystick(e.clientX, e.clientY); } });
    window.addEventListener('mouseup', () => { if (isMouseDown) { isMouseDown = false; resetJoystick(); } });
}

setupJoystick('joystick-base-p1', 'joystick-thumb-p1', 'p1');
setupJoystick('joystick-base-p2', 'joystick-thumb-p2', 'p2');

// --- 5. LOGIC GAME ---
function updateArenaSize() {
    const el = document.getElementById('arena');
    if (el) { state.arenaW = el.clientWidth; state.arenaH = el.clientHeight; }
}
window.addEventListener('resize', updateArenaSize);

function selectMode(mode) {
    state.mode = mode;
    document.getElementById('startScreen').classList.add('hidden');
    updateArenaSize();
    
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
    // KHỞI TẠO ÂM THANH KHI NGƯỜI DÙNG TƯƠNG TÁC
    Sound.init();
    if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();

    document.getElementById('readyScreen').classList.add('hidden');
    state.gameActive = true;
    statusText.innerText = "XANH ĐUỔI!";
    gameLoop();
    setInterval(spawnPowerUp, 8000);
}

function gameLoop() {
    if (!state.gameActive) return;

    movePlayer('p1', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'p1');
    
    if (state.mode === 'pvp') {
        movePlayer('p2', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'p2');
    } else {
        moveAI();
    }

    checkCollisions();
    updateScore();
    updateParticles(); // Cập nhật hiệu ứng hạt
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

    // Joystick (Ưu tiên)
    if (Math.abs(joystickInput[joyKey].dx) > 0.1 || Math.abs(joystickInput[joyKey].dy) > 0.1) {
        dx = joystickInput[joyKey].dx * spd;
        dy = joystickInput[joyKey].dy * spd;
    }

    if (!isBlocked(p.x + dx, p.y)) p.x += dx;
    if (!isBlocked(p.x, p.y + dy)) p.y += dy;
    p.x = Math.max(0, Math.min(state.arenaW - 40, p.x));
    p.y = Math.max(0, Math.min(state.arenaH - 40, p.y));
}

function moveAI() {
    const ai = state.p2; const target = state.p1;
    let spd = ai.speedBoost ? state.boostSpeed : state.baseSpeed * 0.85;
    let vX = target.x - ai.x; let vY = target.y - ai.y;
    if (state.chaser === 'p1') { vX *= -1; vY *= -1; }

    let mX = Math.abs(vX) > 5 ? (vX > 0 ? spd : -spd) : 0;
    let mY = Math.abs(vY) > 5 ? (vY > 0 ? spd : -spd) : 0;

    if (isBlocked(ai.x + mX, ai.y) && mX !== 0) {
        if (ai.forceDirY === 0) ai.forceDirY = !isBlocked(ai.x + mX, ai.y - 50) ? -1 : 1;
        mY = ai.forceDirY * spd; mX = 0;
    } else ai.forceDirY = 0;

    if (!isBlocked(ai.x + mX, ai.y)) ai.x += mX;
    if (!isBlocked(ai.x, ai.y + mY)) ai.y += mY;
    
    ai.x = Math.max(0, Math.min(state.arenaW - 40, ai.x));
    ai.y = Math.max(0, Math.min(state.arenaH - 40, ai.y));
}

function isBlocked(x, y) {
    if (x < 0 || x > state.arenaW - 40 || y < 0 || y > state.arenaH - 40) return true;
    const walls = document.querySelectorAll('.wall');
    for (let w of walls) {
        if (x + 4 < w.offsetLeft + w.offsetWidth && x + 36 > w.offsetLeft && y + 4 < w.offsetTop + w.offsetHeight && y + 36 > w.offsetTop) return true;
    }
    return false;
}

// --- 6. PARTICLE SYSTEM (HIỆU ỨNG HẠT) ---
const particles = [];
function createExplosion(x, y, color) {
    const layer = document.getElementById('arena'); 
    // Tạo 15 hạt
    for (let i = 0; i < 15; i++) {
        const el = document.createElement('div');
        el.className = 'particle';
        el.style.position = 'absolute';
        el.style.width = '6px'; el.style.height = '6px';
        el.style.backgroundColor = color;
        el.style.borderRadius = '50%';
        el.style.left = (x + 20) + 'px'; el.style.top = (y + 20) + 'px';
        layer.appendChild(el);
        
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        particles.push({
            el: el, x: x+20, y: y+20,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.0
        });
    }
}
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.05;
        p.el.style.left = p.x + 'px'; p.el.style.top = p.y + 'px';
        p.el.style.opacity = p.life;
        if (p.life <= 0) { p.el.remove(); particles.splice(i, 1); }
    }
}

// --- 7. COLLISION & LOGIC ---
function checkCollisions() {
    const p1 = state.p1; const p2 = state.p2;
    // Check Tag
    if (!state.cooldown && Math.abs(p1.x - p2.x) < 35 && Math.abs(p1.y - p2.y) < 35) {
        // AUDIO & VFX
        Sound.hit();
        const chaserColor = state.chaser === 'p1' ? '#00f2ff' : '#ff0055';
        createExplosion(p1.x, p1.y, chaserColor);
        
        state.chaser = state.chaser === 'p1' ? 'p2' : 'p1';
        state.cooldown = true;
        p1.el.classList.add('cooldown'); p2.el.classList.add('cooldown');
        statusText.innerText = `${state.chaser === 'p1' ? 'XANH' : 'ĐỎ'} ĐUỔI!`;
        setTimeout(() => { state.cooldown = false; p1.el.classList.remove('cooldown'); p2.el.classList.remove('cooldown'); }, 1000);
    }
    // Check Powerup
    let powerHit = false;
    if (powerUpActive) {
        if (Math.abs(p1.x - powerUpPos.x) < 35 && Math.abs(p1.y - powerUpPos.y) < 35) { applyBoost('p1'); powerHit = true; }
        else if (Math.abs(p2.x - powerUpPos.x) < 35 && Math.abs(p2.y - powerUpPos.y) < 35) { applyBoost('p2'); powerHit = true; }
    }
    if(powerHit) {
        Sound.powerup();
        createExplosion(powerUpPos.x, powerUpPos.y, '#ffea00');
    }
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
    const runner = state.chaser === 'p1' ? 'p2' : 'p1'; state[runner].score++;
    document.getElementById('scoreP1').innerText = Math.floor(state.p1.score/10);
    document.getElementById('scoreP2').innerText = Math.floor(state.p2.score/10);
    if (Math.floor(state[runner].score/10) >= state.winScore) {
        state.gameActive = false;
        Sound.win();
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