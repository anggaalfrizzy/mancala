/**
 * Mancala AI — Game Logic v4
 * Animasi distribusi biji satu per satu (step-by-step)
 */

// ─────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────
let gameState = {
  board: null, currentPlayer: 1, gameOver: false,
  useAlphaBeta: true, depth: 5, mode: 'hva', startTime: null,
  animating: false,   // kunci: blokir input saat animasi berjalan
  difficulty: 'medium',
};

// Kecepatan animasi (ms per biji)
let seedDelay = 320;

// ─────────────────────────────────────────────────────────────────
// SEED COLORS
// ─────────────────────────────────────────────────────────────────
const GEM_SETS = [
  ['gem-dark','gem-pink','gem-red'],
  ['gem-pink','gem-dark','gem-red'],
  ['gem-red','gem-dark','gem-pink'],
];
let pitGemPattern = {};

function assignGemPatterns() {
  pitGemPattern = {};
  for (let i = 0; i < 14; i++)
    pitGemPattern[i] = Math.floor(Math.random() * GEM_SETS.length);
}

function gemClass(pitIdx, seedIdx) {
  const set = GEM_SETS[pitGemPattern[pitIdx] || 0];
  return set[seedIdx % set.length];
}

// ─────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const init = Array(14).fill(4); init[6] = 0; init[13] = 0;
  assignGemPatterns();
  renderBoard(init);
  setupSpeedButtons();
});

function setupSpeedButtons() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      seedDelay = parseInt(btn.dataset.ms);
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// CONTROLS
// ─────────────────────────────────────────────────────────────────
function setAlgo(a) {
  gameState.useAlphaBeta = a === 'ab';
  document.getElementById('btn-ab').classList.toggle('active', a === 'ab');
  document.getElementById('btn-mm').classList.toggle('active', a !== 'ab');
  document.getElementById('chip-algo-text').textContent =
    a === 'ab' ? 'Alpha-Beta Aktif' : 'Minimax Murni';
  showToast(a === 'ab' ? '✦ Alpha-Beta Pruning aktif' : '◈ Minimax Murni aktif', 'extra');
}
function setMode(m) {
  gameState.mode = m;
  document.getElementById('btn-hva').classList.toggle('active', m === 'hva');
  document.getElementById('btn-hvh').classList.toggle('active', m !== 'hva');
  document.getElementById('chip-mode').textContent = m === 'hva' ? '👤 vs 🤖' : '👤 vs 👤';
  showToast(m === 'hva' ? '🤖 Human vs AI' : '👥 Human vs Human', 'extra');
}

function setDifficulty(level) {
  gameState.difficulty = level;
  document.getElementById('btn-easy').classList.toggle('active', level === 'easy');
  document.getElementById('btn-medium').classList.toggle('active', level === 'medium');
  document.getElementById('btn-hard').classList.toggle('active', level === 'hard');

  const hints = {
    easy:   '😴 AI sering membuat kesalahan dan jarang memilih langkah terbaik — santai aja!',
    medium: '🙂 AI kadang membuat keputusan kurang optimal — cocok untuk latihan.',
    hard:   '🔥 AI selalu memilih langkah terbaik berdasarkan Minimax/Alpha-Beta — siap-siap!',
  };
  document.getElementById('difficulty-hint').textContent = hints[level];

  const toasts = {
    easy:   '😴 Mode Mudah — AI dibikin santai',
    medium: '🙂 Mode Sedang — AI cukup pintar',
    hard:   '🔥 Mode Sulit — AI bermain penuh!',
  };
  showToast(toasts[level], 'extra');
}
function setDepth(v) {
  gameState.depth = parseInt(v);
  document.getElementById('depth-badge').textContent = v;
  document.getElementById('nav-depth-val').textContent = v;
}

// ─────────────────────────────────────────────────────────────────
// NEW GAME
// ─────────────────────────────────────────────────────────────────
async function newGame() {
  if (gameState.animating) return;
  showLoading('Mempersiapkan papan Mancala...');
  try {
    const res  = await fetch('/api/new_game', { method: 'POST' });
    const data = await res.json();
    gameState.board         = data.board;
    gameState.currentPlayer = 1;
    gameState.gameOver      = false;
    gameState.startTime     = Date.now();
    gameState.animating     = false;
    assignGemPatterns();
    renderBoard(data.board);
    updateTurnCard();
    clearStats();
    document.getElementById('game-result').classList.add('hidden');
    clearLog();
    addLog('Permainan dimulai! Giliran kamu (Lubang 1–6 sisi bawah).', 'log-info');
    updateValidPits();
    refreshTree();
    showToast('▶ Game baru dimulai!', 'success');
  } catch(e) { addLog('Error: ' + e.message); }
  finally { hideLoading(); }
}

// ─────────────────────────────────────────────────────────────────
// HUMAN MOVE — entry point
// ─────────────────────────────────────────────────────────────────
async function humanMove(pit) {
  if (!gameState.board || gameState.gameOver || gameState.animating) return;

  const pl = gameState.currentPlayer;
  if (pl === 1 && (pit < 0 || pit > 5))   return;
  if (pl === 2 && (pit < 7 || pit > 12))  return;
  if (gameState.board[pit] === 0)          return;
  if (gameState.mode === 'hva' && pl !== 1) return;

  await executeMove(pit, pl);
}

// ─────────────────────────────────────────────────────────────────
// EXECUTE MOVE — animasi distribusi + panggil server
// ─────────────────────────────────────────────────────────────────
async function executeMove(pit, player) {
  gameState.animating = true;
  disableAllPits();

  // 1. Hitung distribusi secara lokal (untuk animasi)
  const dist = computeDistribution(gameState.board, pit, player);

  // 2. Jalankan animasi distribusi satu per satu
  await animateDistribution(pit, dist, player);

  // 3. Setelah animasi, kirim ke server untuk validasi state resmi
  try {
    const res  = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: gameState.board, pit, player })
    });
    const data = await res.json();
    gameState.board         = data.board;
    gameState.currentPlayer = data.next_player;

    // Render state final dari server (koreksi jika ada capture dll)
    renderBoard(data.board, pit);
    bumpScores();
    updateTurnCard();

    const nm = player === 1
      ? `Lubang ${pit + 1}`
      : `Lubang ${String.fromCharCode(65 + 12 - pit)}`;
    addLog(`👤 Player ${player} memilih ${nm}`, 'log-move');

    if (data.extra_turn) {
      addLog('⭐ Giliran ekstra! Benih terakhir ke Mancala.', 'log-extra');
      showToast('⭐ Giliran ekstra!', 'extra');
    }
    if (data.captured > 0) {
      addLog(`💥 Capture! +${data.captured} benih diambil.`, 'log-capture');
      showToast(`💥 Capture! +${data.captured}`, 'extra');
      // Flash efek capture
      const oppPit = 12 - dist.lastLanded;
      flashCapture(dist.lastLanded, oppPit);
      await sleep(400);
    }

    gameState.animating = false;

    if (data.game_over) {
      endGame(data.winner);
    } else {
      updateValidPits();
      if (gameState.mode === 'hva' && gameState.currentPlayer === 2) {
        await sleep(300);
        await aiMove();
        return;
      }
      refreshTree();
    }
  } catch(e) {
    gameState.animating = false;
    addLog('Error: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// COMPUTE DISTRIBUTION (lokal, untuk animasi)
// Mengembalikan array urutan lubang yang menerima biji
// ─────────────────────────────────────────────────────────────────
function computeDistribution(board, pit, player) {
  const seeds    = board[pit];
  const sequence = [];   // [{slot, seedIdx}]
  let pos        = pit;

  for (let s = 0; s < seeds; s++) {
    pos = (pos + 1) % 14;
    // Lewati store lawan
    if (player === 1 && pos === 13) pos = 0;
    if (player === 2 && pos === 6)  pos = 7;
    sequence.push(pos);
  }

  return {
    sequence,
    lastLanded: sequence[sequence.length - 1],
    count: seeds,
  };
}

// ─────────────────────────────────────────────────────────────────
// ANIMATE DISTRIBUTION — inti animasi satu per satu
// ─────────────────────────────────────────────────────────────────
async function animateDistribution(sourcePit, dist, player) {
  // Tandai pit sumber
  const srcEl = document.querySelector(`[data-pit="${sourcePit}"]`);
  srcEl?.classList.add('pit-picked');
  await sleep(80);

  // Ambil semua biji dari sumber — buat "biji terbang" di atas
  // Kita simulasikan: board lokal sementara
  let localBoard = [...gameState.board];
  localBoard[sourcePit] = 0;

  // Update tampilan sumber jadi 0
  updatePitDisplay(sourcePit, 0);
  await sleep(seedDelay * 0.4);

  srcEl?.classList.remove('pit-picked');

  // Distribusikan satu per satu
  for (let i = 0; i < dist.sequence.length; i++) {
    const targetSlot = dist.sequence[i];

    // Animasi biji terbang dari sumber ke target
    await animateFlyingSeed(sourcePit, targetSlot, i);

    // Update jumlah di target
    localBoard[targetSlot]++;
    updatePitDisplay(targetSlot, localBoard[targetSlot]);

    // Flash lubang yang menerima
    flashReceive(targetSlot);

    // Delay antar biji (makin sedikit biji, lebih lambat = lebih dramatis)
    await sleep(seedDelay);
  }

  // Hapus mark distributing
  document.querySelectorAll('.pit-distributing').forEach(p =>
    p.classList.remove('pit-distributing')
  );
}

// ─────────────────────────────────────────────────────────────────
// FLYING SEED ANIMATION — CSS transform dari titik A ke B
// ─────────────────────────────────────────────────────────────────
async function animateFlyingSeed(fromSlot, toSlot, seedIdx) {
  const fromEl = getPitCenter(fromSlot);
  const toEl   = getPitCenter(toSlot);
  if (!fromEl || !toEl) return;

  // Tentukan warna biji sesuai pattern
  const cls = gemClass(fromSlot, seedIdx);

  // Buat elemen biji terbang
  const fly = document.createElement('div');
  fly.className = `flying-seed ${cls}`;
  fly.style.cssText = `
    left: ${fromEl.x - 7}px;
    top:  ${fromEl.y - 7}px;
    width: 14px;
    height: 14px;
  `;
  document.body.appendChild(fly);

  // Hitung arc (parabola pendek ke atas)
  const dx    = toEl.x - fromEl.x;
  const dy    = toEl.y - fromEl.y;
  const dist  = Math.sqrt(dx*dx + dy*dy);
  const arcH  = Math.min(60, dist * 0.35);  // tinggi lengkung
  const dur   = Math.max(180, Math.min(seedDelay * 0.85, 280));

  // Gunakan Web Animations API untuk kurva halus
  const midX  = fromEl.x + dx * 0.5 - 7;
  const midY  = fromEl.y + dy * 0.5 - arcH - 7;
  const endX  = toEl.x - 7;
  const endY  = toEl.y - 7;

  const anim = fly.animate([
    { left: `${fromEl.x - 7}px`, top: `${fromEl.y - 7}px`,
      transform: 'scale(1)',   opacity: '1' },
    { left: `${midX}px`,        top: `${midY}px`,
      transform: 'scale(1.15)', opacity: '1' },
    { left: `${endX}px`,        top: `${endY}px`,
      transform: 'scale(0.9)', opacity: '0.85' },
  ], {
    duration: dur,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    fill: 'forwards',
  });

  await new Promise(r => anim.onfinish = r);
  fly.remove();
}

// Dapatkan koordinat tengah sebuah slot (pit atau store) dalam viewport
function getPitCenter(slot) {
  let el;
  if (slot === 6)  el = document.getElementById('store-1');
  else if (slot === 13) el = document.getElementById('store-2');
  else el = document.querySelector(`[data-pit="${slot}"] .pit-hole`);

  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Flash efek saat pit menerima biji
function flashReceive(slot) {
  let el;
  if (slot === 6 || slot === 13) {
    el = document.getElementById(slot === 6 ? 'store-1' : 'store-2');
  } else {
    el = document.querySelector(`[data-pit="${slot}"]`);
  }
  if (!el) return;
  el.classList.remove('pit-receive');
  void el.offsetWidth;
  el.classList.add('pit-receive');
  setTimeout(() => el.classList.remove('pit-receive'), 260);
}

// Flash capture (lubang tujuan dan lubang lawan)
function flashCapture(myPit, oppPit) {
  [myPit, oppPit].forEach(slot => {
    const el = document.querySelector(`[data-pit="${slot}"]`);
    if (!el) return;
    el.style.transition = 'filter 0.1s';
    el.style.filter = 'brightness(2) drop-shadow(0 0 12px rgba(167,139,250,0.9))';
    setTimeout(() => { el.style.filter = ''; el.style.transition = ''; }, 500);
  });
}

// Update tampilan count + gems sebuah pit tanpa re-render seluruh board
function updatePitDisplay(slot, count) {
  if (slot === 6) {
    document.getElementById('store-1-count').textContent = count;
    renderStoreGems(document.getElementById('store-1-seeds'), count);
    return;
  }
  if (slot === 13) {
    document.getElementById('store-2-count').textContent = count;
    renderStoreGems(document.getElementById('store-2-seeds'), count);
    return;
  }
  const countEl = document.getElementById(`pit-${slot}`);
  const gemsEl  = document.getElementById(`pit-seeds-${slot}`);
  if (countEl) {
    countEl.textContent = count;
    countEl.style.transform = 'scale(1.3)';
    setTimeout(() => { if (countEl) countEl.style.transform = ''; }, 200);
  }
  if (gemsEl) renderGems(gemsEl, count, slot);
}

// ─────────────────────────────────────────────────────────────────
// AI MOVE
// ─────────────────────────────────────────────────────────────────
async function aiMove() {
  if (!gameState.board || gameState.gameOver) return;
  gameState.animating = true;
  showLoading('🤖 AI menganalisis posisi...');

  try {
    const res  = await fetch('/api/ai_move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: gameState.board,
        depth: gameState.depth,
        use_alphabeta: gameState.useAlphaBeta,
        difficulty: gameState.difficulty,
      })
    });
    const data = await res.json();

    // Simpan board SEBELUM move untuk animasi
    const boardBefore = [...gameState.board];

    hideLoading();

    // Hitung distribusi dari board sebelum move
    const dist = computeDistribution(boardBefore, data.pit, 2);

    // Animasi distribusi AI
    await animateDistribution(data.pit, dist, 2);

    // Terapkan state dari server
    gameState.board = data.board;
    gameState.currentPlayer = data.next_player;
    renderBoard(data.board, data.pit);
    updateStats(data);
    bumpScores();
    updateTurnCard();

    const pl = String.fromCharCode(65 + 12 - data.pit);
    addLog(
      `🤖 AI → Lubang ${pl} | ${data.nodes_evaluated.toLocaleString()} nodes | ${data.time_ms}ms`,
      'log-ai'
    );
    if (data.extra_turn) {
      addLog('⭐ AI mendapat giliran ekstra!', 'log-extra');
      showToast('🤖 AI giliran ekstra!', 'ai');
    }
    if (data.captured > 0) {
      addLog(`💥 AI capture! +${data.captured}`, 'log-capture');
      flashCapture(dist.lastLanded, 12 - dist.lastLanded);
      await sleep(400);
    }

    gameState.animating = false;

    if (data.game_over) {
      endGame(data.winner);
    } else {
      updateValidPits();
      if (data.extra_turn) {
        await sleep(500);
        await aiMove();
        return;
      }
      refreshTree();
    }
  } catch(e) {
    gameState.animating = false;
    hideLoading();
    addLog('Error AI: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// END GAME
// ─────────────────────────────────────────────────────────────────
function endGame(winner) {
  gameState.gameOver = true;
  const el = document.getElementById('game-result');
  el.classList.remove('hidden', 'win', 'lose', 'draw');
  if (winner === 1) {
    el.classList.add('win');  el.textContent = '🏆 Kamu Menang!';
    addLog('🏆 KAMU MENANG!', 'log-win');
    showToast('🏆 Selamat, kamu menang!', 'success');
    launchConfetti();
  } else if (winner === 2) {
    el.classList.add('lose'); el.textContent = '🤖 AI Menang';
    addLog('🤖 AI menang kali ini.', 'log-ai');
    showToast('🤖 AI menang!', 'ai');
  } else {
    el.classList.add('draw'); el.textContent = '🤝 Seri!';
    addLog('🤝 Seri!', 'log-extra');
    showToast('🤝 Seri!', 'extra');
  }
  disableAllPits();
  updateTurnCard();
}

// ─────────────────────────────────────────────────────────────────
// CONFETTI
// ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const colors = ['#f5a623','#4ade80','#4f9eff','#a78bfa','#ff6b6b','#d4a96a'];
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none';
  cv.width = innerWidth; cv.height = innerHeight;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const pieces = Array.from({ length: 130 }, () => ({
    x: Math.random() * cv.width, y: -15 - Math.random() * 60,
    r: Math.random() * 7 + 2, d: Math.random() * 100 + 50,
    color: colors[Math.floor(Math.random() * colors.length)],
    tA: 0, tS: Math.random() * 0.1 + 0.04, op: 1,
  }));
  let f = 0;
  (function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height); f++;
    pieces.forEach(p => {
      p.tA += p.tS; p.y += (Math.cos(p.d) + 2) * 2.2; p.x += Math.sin(f / 18) * 1.2;
      if (f > 130) p.op -= 0.01;
      ctx.globalAlpha = Math.max(0, p.op);
      ctx.fillStyle = p.color; ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.42, Math.sin(p.tA) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (f < 220) requestAnimationFrame(draw); else cv.remove();
  })();
}

// ─────────────────────────────────────────────────────────────────
// RENDER BOARD (full re-render setelah server response)
// ─────────────────────────────────────────────────────────────────
function renderBoard(board, lastPit = null) {
  for (let i = 0; i < 14; i++) {
    if (i === 6 || i === 13) continue;
    const cEl = document.getElementById(`pit-${i}`);
    const gEl = document.getElementById(`pit-seeds-${i}`);
    if (cEl) cEl.textContent = board[i];
    if (gEl) renderGems(gEl, board[i], i);
    const pitEl = document.querySelector(`[data-pit="${i}"]`);
    if (pitEl) { pitEl.classList.remove('last-move'); if (i === lastPit) pitEl.classList.add('last-move'); }
  }
  animCount('store-1-count', board[6]);
  animCount('store-2-count', board[13]);
  renderStoreGems(document.getElementById('store-1-seeds'), board[6]);
  renderStoreGems(document.getElementById('store-2-seeds'), board[13]);
  document.getElementById('score-p1').textContent = board[6];
  document.getElementById('score-p2').textContent = board[13];
  document.getElementById('banner-score-ai').textContent    = board[13];
  document.getElementById('banner-score-human').textContent = board[6];
}

function animCount(id, val) {
  const el = document.getElementById(id); if (!el) return;
  el.textContent = val;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}

// Render gems (biji) di dalam pit
function renderGems(container, count, pitIdx) {
  if (!container) return;
  container.innerHTML = '';
  const show = Math.min(count, 12);
  for (let i = 0; i < show; i++) {
    const gem = document.createElement('div');
    gem.className = `gem ${gemClass(pitIdx, i)} gem-anim`;
    gem.style.animationDelay = `${i * 0.022}s`;
    container.appendChild(gem);
  }
}

function renderStoreGems(container, count) {
  if (!container) return;
  container.innerHTML = '';
  const types = ['gem-dark','gem-pink','gem-red'];
  const show  = Math.min(count, 20);
  for (let i = 0; i < show; i++) {
    const gem = document.createElement('div');
    gem.className = `gem ${types[i % 3]} gem-anim`;
    gem.style.animationDelay = `${i * 0.018}s`;
    container.appendChild(gem);
  }
}

function bumpScores() {
  ['score-p1','score-p2','banner-score-ai','banner-score-human'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  });
}

// ─────────────────────────────────────────────────────────────────
// PIT STATES
// ─────────────────────────────────────────────────────────────────
function updateValidPits() {
  document.querySelectorAll('.pit').forEach(p => p.classList.remove('can-play','disabled'));
  if (gameState.gameOver || !gameState.board || gameState.animating) return;

  const pl = gameState.currentPlayer;
  if (pl === 1) {
    for (let i = 0; i <= 5; i++) {
      const p = document.querySelector(`[data-pit="${i}"]`); if (!p) continue;
      p.classList.add(gameState.board[i] > 0 ? 'can-play' : 'disabled');
    }
    if (gameState.mode === 'hva')
      for (let i = 7; i <= 12; i++)
        document.querySelector(`[data-pit="${i}"]`)?.classList.add('disabled');
  } else {
    if (gameState.mode === 'hvh') {
      for (let i = 7; i <= 12; i++) {
        const p = document.querySelector(`[data-pit="${i}"]`); if (!p) continue;
        p.classList.add(gameState.board[i] > 0 ? 'can-play' : 'disabled');
      }
    } else {
      for (let i = 0; i <= 5; i++)
        document.querySelector(`[data-pit="${i}"]`)?.classList.add('disabled');
    }
  }
}
function disableAllPits() {
  document.querySelectorAll('.pit').forEach(p => p.classList.add('disabled'));
}

// ─────────────────────────────────────────────────────────────────
// TURN CARD
// ─────────────────────────────────────────────────────────────────
function updateTurnCard() {
  const card  = document.getElementById('turn-card');
  const pulse = document.getElementById('turn-pulse');
  const who   = document.getElementById('turn-who');
  const sub   = document.getElementById('turn-sub');
  card.classList.remove('p1-turn','p2-turn');
  pulse.classList.remove('p1','p2');
  if (gameState.gameOver) {
    who.textContent = 'Permainan Selesai';
    sub.textContent = 'Tekan Mulai Game Baru untuk main lagi';
    return;
  }
  if (!gameState.board) {
    who.textContent = 'Belum Dimulai';
    sub.textContent = 'Tekan Mulai Game Baru';
    return;
  }
  if (gameState.currentPlayer === 1) {
    card.classList.add('p1-turn'); pulse.classList.add('p1');
    who.textContent = '👤 Giliran Kamu';
    sub.textContent = 'Pilih lubang sisi bawah';
  } else {
    card.classList.add('p2-turn'); pulse.classList.add('p2');
    who.textContent  = gameState.mode === 'hva' ? '🤖 Giliran AI' : '👤 Giliran Player 2';
    sub.textContent  = gameState.mode === 'hva' ? 'AI sedang berpikir...' : 'Pilih lubang sisi atas';
  }
}

// ─────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────
function updateStats(data) {
  setVal('stat-mm-nodes', data.nodes_evaluated.toLocaleString());
  if (data.algorithm === 'alphabeta' && data.difficulty === 'hard') {
    setVal('stat-ab-nodes', data.nodes_evaluated.toLocaleString());
    setVal('stat-pruned', data.nodes_pruned.toLocaleString());
    const t = data.nodes_evaluated + data.nodes_pruned;
    setVal('stat-efficiency', t > 0 ? Math.round(data.nodes_pruned / t * 100) + '%' : '—');
  } else {
    setVal('stat-ab-nodes','—'); setVal('stat-pruned','—'); setVal('stat-efficiency','—');
  }
  setVal('stat-time',  data.time_ms + ' ms');
  setVal('stat-score', data.score > 0 ? '+' + data.score : String(data.score));
}
function setVal(id, v) {
  const el = document.getElementById(id); if (!el) return;
  el.textContent = v;
  el.style.transform = 'scale(1.15)';
  setTimeout(() => el.style.transform = '', 280);
}
function clearStats() {
  ['stat-mm-nodes','stat-ab-nodes','stat-pruned','stat-efficiency','stat-time','stat-score']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
}

// ─────────────────────────────────────────────────────────────────
// BENCHMARK
// ─────────────────────────────────────────────────────────────────
async function runBenchmark() {
  if (!gameState.board) { showToast('⚠ Mulai game dulu','extra'); return; }
  showLoading('Benchmark depth 1–6...');
  try {
    const res = await fetch('/api/benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: gameState.board }),
    });
    const data = await res.json();
    document.getElementById('benchmark-section').style.display = '';
    const tb = document.getElementById('benchmark-body'); tb.innerHTML = '';
    data.results.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.style.animationDelay = `${i * 0.05}s`;
      tr.innerHTML = `
        <td>${r.depth}</td>
        <td>${r.minimax_nodes.toLocaleString()}</td>
        <td>${r.alphabeta_nodes.toLocaleString()}</td>
        <td class="col-pruned">${r.pruning_percentage}%</td>
        <td>${r.minimax_time_ms}</td>
        <td>${r.alphabeta_time_ms}</td>`;
      tb.appendChild(tr);
    });
    addLog('✅ Benchmark selesai!', 'log-extra');
    showToast('📊 Benchmark selesai!', 'success');
  } catch(e) { addLog('Error: ' + e.message); }
  finally { hideLoading(); }
}

// ─────────────────────────────────────────────────────────────────
// GAME TREE
// ─────────────────────────────────────────────────────────────────
async function refreshTree() {
  if (!gameState.board) return;
  const depth = parseInt(document.getElementById('tree-depth-select').value);
  try {
    const res = await fetch('/api/game_tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: gameState.board, player: gameState.currentPlayer,
        depth, use_alphabeta: gameState.useAlphaBeta,
      }),
    });
    const data = await res.json();
    renderTree(data.tree);
  } catch(e) { console.error(e); }
}

function renderTree(tree) {
  const container = document.getElementById('tree-container');
  const layout = [], edges = [];
  layoutTree(tree, 0, layout, edges, { x: 0 });
  if (!layout.length) {
    container.innerHTML = '<div class="tree-empty"><div class="tree-empty-icon">🌱</div><p>Tree kosong.</p></div>';
    return;
  }
  const NW = 48, LH = 74;
  const minX = Math.min(...layout.map(n => n.x));
  const maxX = Math.max(...layout.map(n => n.x));
  const maxD = Math.max(...layout.map(n => n.depth));
  const svgW = Math.max(300, (maxX - minX + 1) * (NW + 12) + 20);
  const svgH = (maxD + 1) * LH + 28;
  const cx = n => (n.x - minX) * (NW + 12) + NW / 2 + 10;
  const cy = n => n.depth * LH + NW / 2 + 12;
  let es = '', ns = '';
  edges.forEach(e => {
    const px = cx(e.parent), py = cy(e.parent), ex = cx(e.child), ey = cy(e.child);
    es += `<path class="t-edge${e.child.pruned?' t-edge-pruned':''}" d="M${px},${py+22} C${px},${(py+ey)/2} ${ex},${(py+ey)/2} ${ex},${ey-22}"/>`;
  });
  layout.forEach(n => {
    const x = cx(n), y = cy(n), r = 21;
    let cc = n.is_max ? 't-max' : 't-min';
    if (n.pruned) cc = 't-pruned'; else if (n.is_leaf) cc = 't-leaf';
    let vc = n.is_max ? 't-val-max' : 't-val-min';
    if (n.is_leaf) vc = 't-val-leaf'; if (n.pruned) vc = 't-val-pruned';
    const vt = n.pruned ? '✕' : (n.value !== null && n.value !== undefined ? n.value : '?');
    if (n.move != null) {
      const mn = n.player === 1 ? `P${n.move+1}` : String.fromCharCode(65 + 12 - n.move);
      ns += `<text class="t-move" x="${x}" y="${y-r-4}">${mn}</text>`;
    }
    ns += `<circle class="t-circle ${cc}" cx="${x}" cy="${y}" r="${r}"/>`;
    ns += `<text class="t-val ${vc}" x="${x}" y="${y}">${vt}</text>`;
    if (!n.pruned && n.alpha !== undefined) {
      ns += `<text class="t-ab" x="${x+r+2}" y="${y-5}" fill="#4f9eff">α:${n.alpha}</text>`;
      ns += `<text class="t-ab" x="${x+r+2}" y="${y+7}" fill="#ff6b6b">β:${n.beta}</text>`;
    }
  });
  container.innerHTML = `<svg class="tree-svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">${es}${ns}</svg>`;
}

function layoutTree(node, depth, layout, edges, ctr) {
  if (!node) return;
  node.depth = depth;
  if (!node.children || !node.children.length) { node.x = ctr.x++; layout.push(node); return; }
  const s = ctr.x;
  node.children.forEach(ch => { edges.push({ parent: node, child: ch }); layoutTree(ch, depth+1, layout, edges, ctr); });
  node.x = (s + ctr.x - 1) / 2;
  layout.push(node);
}

// ─────────────────────────────────────────────────────────────────
// LOG
// ─────────────────────────────────────────────────────────────────
function addLog(msg, cls = 'log-info') {
  const log = document.getElementById('message-log');
  const el  = Math.floor((Date.now() - (gameState.startTime || Date.now())) / 1000);
  const mm  = String(Math.floor(el / 60)).padStart(2, '0');
  const ss  = String(el % 60).padStart(2, '0');
  const div = document.createElement('div');
  div.className = `log-entry ${cls}`;
  div.innerHTML = `<span class="log-time">${mm}:${ss}</span><span>${msg}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 25) log.removeChild(log.firstChild);
}
function clearLog() { document.getElementById('message-log').innerHTML = ''; }

// ─────────────────────────────────────────────────────────────────
// TOAST / LOADING / UTILS
// ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast type-${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function showLoading(msg = 'Memproses...') {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
