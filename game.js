'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSel = document.getElementById('start-level');

// Nivel inicial elegido (1–10), persistido en localStorage
const MAX_START_LEVEL = 10;
let startLevel = loadStartLevel();
// Bloqueo de inputs tras reanudar
const RESUME_GRACE_MS = 150;
let inputBlockedUntil = 0;
let ignoreRepeats = false;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(level, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  updateCombo(clearLines());
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins ----
// Trazo de rectángulo redondeado manual (sin depender de roundRect)
function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  // Retro: bloques cuadrados, colores planos (estilo original)
  retro: {
    colors: COLORS,
    draw(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  // Neon: interior tenue + borde brillante con glow (shadowBlur)
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff9100', '#e0e0ff'],
    draw(context, px, py, size, color) {
      const a = context.globalAlpha;
      context.globalAlpha = a * 0.3;
      context.fillStyle = color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.globalAlpha = a;
      context.shadowColor = color;
      context.shadowBlur = size * 0.4;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 4, py + 4, size - 8, size - 8);
      context.shadowBlur = 0;
    },
  },
  // Pastel: colores suaves y esquinas redondeadas
  pastel: {
    colors: [null, '#a8e6ef', '#fff1a8', '#d9b8f0', '#b8e6c1', '#f7b8c0', '#b8d4f7', '#ffd1a8', '#d0d0d8'],
    draw(context, px, py, size, color) {
      const r = size * 0.28;
      roundedRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.15)';
      context.lineWidth = 1;
      context.stroke();
      // brillo suave arriba
      roundedRectPath(context, px + 5, py + 4, size - 10, size * 0.25, r * 0.5);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
    },
  },
  // Pixel art: color base + textura de sub-píxeles (luz, sombra, dither)
  pixel: {
    colors: COLORS,
    draw(context, px, py, size, color) {
      const p = Math.max(1, Math.round(size / 10));
      const n = Math.floor(size / p);
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      // borde exterior oscuro
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(px, py + size - p, size, p);
      context.fillRect(px + size - p, py, p, size);
      // luz arriba-izquierda
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.fillRect(px, py, size - p, p);
      context.fillRect(px, py, p, size - p);
      // sombra interior abajo-derecha
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(px + p, py + size - 2 * p, size - 2 * p, p);
      context.fillRect(px + size - 2 * p, py + p, p, size - 2 * p);
      // dither
      context.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 2; i < n - 2; i += 3)
        context.fillRect(px + i * p, py + (i % 2 + 2) * p, p, p);
      context.fillStyle = 'rgba(0,0,0,0.2)';
      for (let i = 3; i < n - 2; i += 3)
        context.fillRect(px + (n - i - 1) * p, py + (n - 3 - i % 2) * p, p, p);
    },
  },
};

let activeSkin = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[activeSkin];
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.draw(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
  }
}

// ---- Menú de pausa ----
function loadStartLevel() {
  let v = NaN;
  try { v = parseInt(localStorage.getItem('tetris-start-level'), 10); } catch (_) {}
  return v >= 1 && v <= MAX_START_LEVEL ? v : 1;
}

function openPauseMenu() {
  startLevelSel.value = String(startLevel);
  pauseControls.classList.add('hidden');
  controlsBtn.setAttribute('aria-expanded', 'false');
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  // Periodo de gracia: evita movimientos accidentales al volver
  inputBlockedUntil = performance.now() + RESUME_GRACE_MS;
  ignoreRepeats = true;
}

function menuItems() {
  return [...pauseMenu.querySelectorAll('button, select')];
}

function handleMenuKey(e) {
  // Space (caída rápida) no debe activar el botón enfocado; usar Enter
  if (e.code === 'Space') { e.preventDefault(); return; }
  // ↑/↓ mueven el foco entre opciones (salvo dentro del selector)
  if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && document.activeElement !== startLevelSel) {
    e.preventDefault();
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    const step = e.code === 'ArrowDown' ? 1 : -1;
    items[(i + step + items.length) % items.length].focus();
  }
}

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => {
  const open = pauseControls.classList.toggle('hidden') === false;
  controlsBtn.setAttribute('aria-expanded', String(open));
});
startLevelSel.addEventListener('change', () => {
  startLevel = parseInt(startLevelSel.value, 10) || 1;
  try { localStorage.setItem('tetris-start-level', String(startLevel)); } catch (_) {}
});

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  resetRecordsState();
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // ignorar teclas en pantalla de inicio o al escribir en un input
  if (!started || e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();
    return;
  }
  if (paused) { handleMenuKey(e); return; }
  if (gameOver) return;
  // Inputs bloqueados brevemente tras reanudar; ignora teclas mantenidas
  if (performance.now() < inputBlockedUntil) return;
  if (e.repeat && ignoreRepeats) return;
  ignoreRepeats = false;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const themeToggle = document.getElementById('theme-toggle');
const toggleIcon = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    toggleIcon.textContent = '☀';
    toggleLabel.textContent = 'DARK';
  } else {
    document.body.classList.remove('light-mode');
    toggleIcon.textContent = '☾';
    toggleLabel.textContent = 'LIGHT';
  }
}

const savedTheme = storageGet('tetris-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  storageSet('tetris-theme', isLight ? 'light' : 'dark');
});

const skinSelect = document.getElementById('skin-select');

function applySkin(name) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = 'retro';
  activeSkin = name;
  document.body.dataset.skin = name;
  skinSelect.value = name;
  // redibujar al instante (también en pausa o game over)
  if (board && current) draw();
  if (next) drawNext();
}

let savedSkin = 'retro';
try { savedSkin = localStorage.getItem('tetris-skin') || 'retro'; } catch (e) { /* sin storage */ }
applySkin(savedSkin);

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  try { localStorage.setItem('tetris-skin', activeSkin); } catch (e) { /* sin storage */ }
  skinSelect.blur();
});

// Teclas de juego con el select enfocado: no cambian la skin, van al juego
skinSelect.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyP', 'KeyX'].includes(e.code)) {
    e.preventDefault();
    skinSelect.blur();
  }
});

/* ---- Records ---- */
const HS_KEY = 'tetris-highscores';
const COMBO_KEY = 'tetris-best-combo';
const MAXLINES_KEY = 'tetris-max-lines';
const HS_MAX = 5;

const startScreen = document.getElementById('start-screen');
const startRecordsBody = document.getElementById('start-records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const gameoverRecords = document.getElementById('gameover-records');
const gameoverRecordsBody = document.getElementById('gameover-records-body');
const recordNote = document.getElementById('record-note');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

let started = false;   // false mientras se muestra la pantalla de inicio
let combo = 0, maxCombo = 0, pendingRecord = false;

// lectura/escritura segura de localStorage
function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* sin almacenamiento */ }
}

function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function loadHighScores() {
  let data;
  try { data = JSON.parse(storageGet(HS_KEY)); } catch { return []; }
  if (!Array.isArray(data)) return [];
  return data
    .filter(e => e && typeof e === 'object' && typeof e.name === 'string')
    .map(e => ({
      name: e.name.slice(0, 12),
      score: toCount(e.score),
      lines: toCount(e.lines),
      combo: toCount(e.combo),
      date: typeof e.date === 'string' ? e.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, HS_MAX);
}

function saveHighScores(list) {
  storageSet(HS_KEY, JSON.stringify(list));
}

function qualifies(s, list) {
  return s > 0 && (list.length < HS_MAX || s > list[list.length - 1].score);
}

// combo: locks consecutivos que limpian líneas
function updateCombo(cleared) {
  combo = cleared ? combo + 1 : 0;
  if (combo > maxCombo) maxCombo = combo;
}

// filas de la tabla con textContent (sin innerHTML con datos del usuario)
function renderTable(tbody, list, highlight) {
  tbody.replaceChildren();
  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'empty';
    td.textContent = 'Sin récords';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  list.forEach((e, i) => {
    const tr = document.createElement('tr');
    if (e === highlight) tr.classList.add('highlight');
    [i + 1, e.name, e.score.toLocaleString(), e.lines, e.combo].forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderStartScreen() {
  renderTable(startRecordsBody, loadHighScores(), null);
  bestComboEl.textContent = toCount(storageGet(COMBO_KEY));
  maxLinesEl.textContent = toCount(storageGet(MAXLINES_KEY));
}

function resetRecordsState() {
  // si se reinicia sin guardar, guardar como Anónimo
  if (pendingRecord) saveRecord();
  combo = 0;
  maxCombo = 0;
  pendingRecord = false;
  gameoverRecords.classList.add('hidden');
  recordNote.classList.add('hidden');
  nameForm.classList.add('hidden');
}

function showGameOverRecords() {
  // mejor combo y líneas máximas, siempre
  if (maxCombo > toCount(storageGet(COMBO_KEY))) storageSet(COMBO_KEY, String(maxCombo));
  if (lines > toCount(storageGet(MAXLINES_KEY))) storageSet(MAXLINES_KEY, String(lines));

  const list = loadHighScores();
  pendingRecord = qualifies(score, list);
  recordNote.classList.toggle('hidden', !pendingRecord);
  nameForm.classList.toggle('hidden', !pendingRecord);
  renderTable(gameoverRecordsBody, list, null);
  gameoverRecords.classList.remove('hidden');
  if (pendingRecord) {
    nameInput.value = '';
    nameInput.focus();
  }
}

function saveRecord() {
  if (!pendingRecord) return;
  pendingRecord = false;
  const entry = {
    name: nameInput.value.trim().slice(0, 12) || 'Anónimo',
    score, lines, combo: maxCombo,
    date: new Date().toISOString(),
  };
  const list = loadHighScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, HS_MAX);
  saveHighScores(top);
  nameForm.classList.add('hidden');
  nameInput.blur();
  renderTable(gameoverRecordsBody, top, entry);
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();   // Enter o botón Guardar
  saveRecord();
});

document.getElementById('play-btn').addEventListener('click', () => {
  startScreen.classList.add('hidden');
  started = true;
  init();
});

document.getElementById('reset-records-btn').addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  storageRemove(HS_KEY);
  storageRemove(COMBO_KEY);
  storageRemove(MAXLINES_KEY);
  renderStartScreen();
});

renderStartScreen();
