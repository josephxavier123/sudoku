/**
 * SudokuX — script.js
 * Vanilla JS Sudoku: generator, solver, validation,
 * timer, hints, notes, undo/redo, stats, leaderboard, confetti
 */

/* =============================================
   SECTION 1: STATE & CONSTANTS
   ============================================= */
const DIFFICULTY = {
  easy: { remove: 35, label: "Easy" },
  medium: { remove: 45, label: "Medium" },
  hard: { remove: 52, label: "Hard" },
  expert: { remove: 58, label: "Expert" },
};

let state = {
  puzzle: Array(81).fill(0),
  solution: Array(81).fill(0),
  board: Array(81).fill(0),
  notes: Array.from({ length: 81 }, () => new Set()),
  locked: Array(81).fill(false),
  errors: Array(81).fill(false),
  selected: -1,
  difficulty: "medium",
  notesMode: false,
  timer: 0,
  timerRunning: false,
  timerInterval: null,
  mistakes: 0,
  hintsLeft: 3,
  score: 0,
  undoStack: [],
  redoStack: [],
  gameActive: false,
  paused: false,
  isDaily: false,
};

/* =============================================
   SECTION 2: DOM REFS
   ============================================= */
const $ = (id) => document.getElementById(id);
const $board = $("sudokuBoard");
const $timer = $("timerDisplay");
const $mistakes = $("mistakeCount");
const $scoreDisp = $("scoreDisplay");
const $hintCnt = $("hintCount");
const $progressRing = $("progressRing");
const $progressPct = $("progressPct");
const $progressSub = $("progressSub");
const $currentDiff = $("currentDiff");
const $noteBadge = $("notesActiveBadge");
const $confetti = $("confettiCanvas");
const $toast = $("toast");

/* =============================================
   SECTION 3: SUDOKU ENGINE
   ============================================= */

/** Fisher-Yates shuffle */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Check if value is valid at index */
function isValid(board, idx, val) {
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  const boxR = Math.floor(row / 3) * 3;
  const boxC = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i++) {
    if (board[row * 9 + i] === val) return false;
    if (board[i * 9 + col] === val) return false;
    if (board[(boxR + Math.floor(i / 3)) * 9 + (boxC + (i % 3))] === val)
      return false;
  }
  return true;
}

/** Generate a full solved board */
function generateSolved() {
  const board = Array(81).fill(0);
  fillBoard(board, 0);
  return board;
}

function fillBoard(board, idx) {
  if (idx === 81) return true;
  if (board[idx] !== 0) return fillBoard(board, idx + 1);
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const n of nums) {
    if (isValid(board, idx, n)) {
      board[idx] = n;
      if (fillBoard(board, idx + 1)) return true;
      board[idx] = 0;
    }
  }
  return false;
}

/** Solver (returns true if unique, fills first solution) */
function solve(board) {
  const b = [...board];
  if (solveBoard(b, 0)) return b;
  return null;
}

function solveBoard(board, idx) {
  if (idx === 81) return true;
  if (board[idx] !== 0) return solveBoard(board, idx + 1);
  for (let n = 1; n <= 9; n++) {
    if (isValid(board, idx, n)) {
      board[idx] = n;
      if (solveBoard(board, idx + 1)) return true;
      board[idx] = 0;
    }
  }
  return false;
}

/** Create puzzle from solved board by removing cells */
function createPuzzle(solved, removeCount) {
  const puzzle = [...solved];
  const indices = shuffle([...Array(81).keys()]);
  let removed = 0;
  for (const idx of indices) {
    if (removed >= removeCount) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    // Check uniqueness (count solutions, stop at 2)
    const test = [...puzzle];
    if (countSolutions(test, 0) === 1) {
      removed++;
    } else {
      puzzle[idx] = backup;
    }
  }
  return puzzle;
}

function countSolutions(board, idx, count = { n: 0 }) {
  if (idx === 81) {
    count.n++;
    return count.n;
  }
  if (board[idx] !== 0) return countSolutions(board, idx + 1, count);
  for (let n = 1; n <= 9; n++) {
    if (isValid(board, idx, n)) {
      board[idx] = n;
      countSolutions(board, idx + 1, count);
      board[idx] = 0;
      if (count.n > 1) return count.n;
    }
  }
  return count.n;
}

/** Daily puzzle — seeded by date */
function getDailyPuzzle() {
  const date = new Date().toISOString().slice(0, 10);
  // Simple deterministic seed from date string
  let seed = 0;
  for (const c of date) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rng = seededRng(seed);
  const board = Array(81).fill(0);
  fillBoardSeeded(board, 0, rng);
  const puzzle = [...board];
  const indices = shuffleSeeded([...Array(81).keys()], rng);
  let removed = 0;
  for (const idx of indices) {
    if (removed >= DIFFICULTY.medium.remove) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    const test = [...puzzle];
    if (countSolutions(test, 0) === 1) removed++;
    else puzzle[idx] = backup;
  }
  return { puzzle, solution: board, date };
}

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function shuffleSeeded(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fillBoardSeeded(board, idx, rng) {
  if (idx === 81) return true;
  if (board[idx] !== 0) return fillBoardSeeded(board, idx + 1, rng);
  const nums = shuffleSeeded([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  for (const n of nums) {
    if (isValid(board, idx, n)) {
      board[idx] = n;
      if (fillBoardSeeded(board, idx + 1, rng)) return true;
      board[idx] = 0;
    }
  }
  return false;
}

/* =============================================
   SECTION 4: GAME INIT
   ============================================= */
function startNewGame(diff, daily = false) {
  stopTimer();
  state.difficulty = diff || state.difficulty;
  state.isDaily = daily;

  if (daily) {
    const { puzzle, solution, date } = getDailyPuzzle();
    state.puzzle = puzzle;
    state.solution = solution;
    showToast(`Daily Challenge — ${date}`, "info");
  } else {
    const solution = generateSolved();
    const puzzle = createPuzzle(solution, DIFFICULTY[state.difficulty].remove);
    state.solution = solution;
    state.puzzle = puzzle;
  }

  state.board = [...state.puzzle];
  state.locked = state.puzzle.map((v) => v !== 0);
  state.errors = Array(81).fill(false);
  state.notes = Array.from({ length: 81 }, () => new Set());
  state.selected = -1;
  state.mistakes = 0;
  state.hintsLeft = 3;
  state.score = 0;
  state.timer = 0;
  state.notesMode = false;
  state.undoStack = [];
  state.redoStack = [];
  state.gameActive = true;
  state.paused = false;

  updateDiffUI();
  renderBoard();
  updateInfoPanel();
  updateProgress();
  startTimer();

  // Show game page
  showPage("gamepage");
}

/* =============================================
   SECTION 5: RENDER
   ============================================= */
function renderBoard() {
  $board.innerHTML = "";
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.idx = i;
    cell.dataset.row = Math.floor(i / 9);
    cell.dataset.col = i % 9;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("tabindex", state.locked[i] ? "-1" : "0");
    cell.setAttribute(
      "aria-label",
      `Row ${Math.floor(i / 9) + 1} Column ${(i % 9) + 1}`,
    );

    if (state.locked[i]) cell.classList.add("prefilled");
    if (state.errors[i]) cell.classList.add("error");

    if (state.board[i] !== 0) {
      cell.textContent = state.board[i];
    } else if (state.notes[i].size > 0) {
      cell.appendChild(buildNotesEl(state.notes[i]));
    } else {
      cell.textContent = "";
    }

    cell.addEventListener("click", () => selectCell(i));
    cell.addEventListener("keydown", onCellKeyDown);
    $board.appendChild(cell);
  }
  applyHighlights();
  updateNumpadUsed();
}

function buildNotesEl(noteSet) {
  const grid = document.createElement("div");
  grid.className = "notes-grid";
  for (let n = 1; n <= 9; n++) {
    const span = document.createElement("span");
    span.className = "note-num";
    span.textContent = noteSet.has(n) ? n : "";
    grid.appendChild(span);
  }
  return grid;
}

function refreshCell(idx) {
  const cell = $board.children[idx];
  if (!cell) return;
  // Clear content
  cell.innerHTML = "";
  cell.className = "cell";
  cell.setAttribute("tabindex", state.locked[idx] ? "-1" : "0");
  if (state.locked[idx]) cell.classList.add("prefilled");
  if (state.errors[idx]) cell.classList.add("error");
  if (state.board[idx] !== 0) {
    cell.textContent = state.board[idx];
  } else if (state.notes[idx].size > 0) {
    cell.appendChild(buildNotesEl(state.notes[idx]));
  }
  applyHighlights();
  updateNumpadUsed();
}

function applyHighlights() {
  const cells = $board.children;
  const sel = state.selected;
  for (let i = 0; i < 81; i++) {
    cells[i].classList.remove("selected", "highlighted", "same-num");
    if (i === sel) {
      cells[i].classList.add("selected");
      continue;
    }
    if (sel === -1) continue;
    const selRow = Math.floor(sel / 9),
      selCol = sel % 9;
    const selBox = Math.floor(selRow / 3) * 3 + Math.floor(selCol / 3);
    const curRow = Math.floor(i / 9),
      curCol = i % 9;
    const curBox = Math.floor(curRow / 3) * 3 + Math.floor(curCol / 3);
    if (curRow === selRow || curCol === selCol || curBox === selBox) {
      cells[i].classList.add("highlighted");
    }
    if (
      state.board[sel] !== 0 &&
      state.board[i] === state.board[sel] &&
      i !== sel
    ) {
      cells[i].classList.add("same-num");
    }
  }
}

function updateNumpadUsed() {
  const counts = Array(10).fill(0);
  state.board.forEach((v) => {
    if (v) counts[v]++;
  });
  document.querySelectorAll(".num-key").forEach((btn) => {
    const n = +btn.dataset.num;
    if (n === 0) return;
    btn.classList.toggle("used", counts[n] >= 9);
  });
}

function updateInfoPanel() {
  $mistakes.textContent = state.mistakes;
  $scoreDisp.textContent = state.score;
  $hintCnt.textContent = state.hintsLeft;
  $noteBadge.textContent = state.notesMode ? "ON" : "OFF";
  $noteBadge.classList.toggle("on", state.notesMode);
  $("notesModeBtn").classList.toggle("active", state.notesMode);
}

function updateProgress() {
  const filled = state.board.filter((v) => v !== 0).length;
  const pct = Math.round((filled / 81) * 100);
  const circ = 2 * Math.PI * 32; // r=32
  $progressRing.style.strokeDashoffset = circ - (pct / 100) * circ;
  $progressPct.textContent = pct + "%";
  $progressSub.textContent = `${filled} / 81 cells`;
}

function updateDiffUI() {
  $currentDiff.textContent = DIFFICULTY[state.difficulty].label;
  document.querySelectorAll("#gameDiffPicker .diff-pill").forEach((p) => {
    p.classList.toggle("active", p.dataset.diff === state.difficulty);
  });
}

/* =============================================
   SECTION 6: CELL INTERACTION
   ============================================= */
function selectCell(idx) {
  if (!state.gameActive || state.paused) return;
  state.selected = idx;
  applyHighlights();
}

function inputNumber(num) {
  const idx = state.selected;
  if (idx < 0 || state.locked[idx] || !state.gameActive || state.paused) return;

  if (state.notesMode && num !== 0) {
    // Toggle note
    pushUndo();
    if (state.notes[idx].has(num)) state.notes[idx].delete(num);
    else state.notes[idx].add(num);
    state.board[idx] = 0;
    refreshCell(idx);
    return;
  }

  // Normal mode
  if (num === 0) {
    // Erase
    pushUndo();
    state.board[idx] = 0;
    state.notes[idx].clear();
    state.errors[idx] = false;
    refreshCell(idx);
    updateProgress();
    return;
  }

  pushUndo();
  state.notes[idx].clear();
  state.board[idx] = num;
  state.redoStack = [];

  const correct = state.solution[idx] === num;
  if (!correct) {
    state.mistakes++;
    state.errors[idx] = true;
    playSound("error");
    animateCell(idx, "error-anim");
    showToast("Incorrect!", "error");
  } else {
    state.errors[idx] = false;
    playSound("correct");
    animateCell(idx, "correct-anim");
    // Remove conflicting notes in row/col/box
    clearRelatedNotes(idx, num);
  }

  updateScore();
  updateInfoPanel();
  refreshCell(idx);
  updateProgress();
  checkWin();
}

function clearRelatedNotes(idx, num) {
  const row = Math.floor(idx / 9),
    col = idx % 9;
  const boxR = Math.floor(row / 3) * 3,
    boxC = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i++) {
    [
      row * 9 + i,
      i * 9 + col,
      (boxR + Math.floor(i / 3)) * 9 + (boxC + (i % 3)),
    ].forEach((ci) => {
      if (state.notes[ci].has(num)) {
        state.notes[ci].delete(num);
        refreshCell(ci);
      }
    });
  }
}

function animateCell(idx, cls) {
  const cell = $board.children[idx];
  if (!cell) return;
  cell.classList.remove(cls);
  void cell.offsetWidth;
  cell.classList.add(cls);
  cell.addEventListener("animationend", () => cell.classList.remove(cls), {
    once: true,
  });
}

/* =============================================
   SECTION 7: KEYBOARD SUPPORT
   ============================================= */
function onCellKeyDown(e) {
  const idx = +e.currentTarget.dataset.idx;
  const arrowMap = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (arrowMap[e.key] !== undefined) {
    e.preventDefault();
    const next = idx + arrowMap[e.key];
    if (next >= 0 && next < 81) {
      state.selected = next;
      $board.children[next]?.focus();
      applyHighlights();
    }
    return;
  }
  if (e.key >= "1" && e.key <= "9") {
    selectCell(idx);
    inputNumber(+e.key);
    return;
  }
  if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
    selectCell(idx);
    inputNumber(0);
  }
}

document.addEventListener("keydown", (e) => {
  if (!state.gameActive) return;
  if (e.key >= "1" && e.key <= "9") {
    inputNumber(+e.key);
    return;
  }
  if (e.key === "Backspace" || e.key === "Delete") {
    inputNumber(0);
    return;
  }
  if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    undo();
    return;
  }
  if (
    (e.key === "y" && (e.ctrlKey || e.metaKey)) ||
    (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)
  )
    redo();
});

/* =============================================
   SECTION 8: UNDO / REDO
   ============================================= */
function pushUndo() {
  state.undoStack.push({
    board: [...state.board],
    notes: state.notes.map((s) => new Set(s)),
    errors: [...state.errors],
    mistakes: state.mistakes,
    score: state.score,
  });
  if (state.undoStack.length > 100) state.undoStack.shift();
}

function undo() {
  if (!state.undoStack.length) return showToast("Nothing to undo", "info");
  state.redoStack.push({
    board: [...state.board],
    notes: state.notes.map((s) => new Set(s)),
    errors: [...state.errors],
    mistakes: state.mistakes,
    score: state.score,
  });
  const snap = state.undoStack.pop();
  applySnapshot(snap);
}

function redo() {
  if (!state.redoStack.length) return showToast("Nothing to redo", "info");
  state.undoStack.push({
    board: [...state.board],
    notes: state.notes.map((s) => new Set(s)),
    errors: [...state.errors],
    mistakes: state.mistakes,
    score: state.score,
  });
  const snap = state.redoStack.pop();
  applySnapshot(snap);
}

function applySnapshot(snap) {
  state.board = snap.board;
  state.notes = snap.notes;
  state.errors = snap.errors;
  state.mistakes = snap.mistakes;
  state.score = snap.score;
  renderBoard();
  updateInfoPanel();
  updateProgress();
}

/* =============================================
   SECTION 9: HINT
   ============================================= */
function giveHint() {
  if (state.hintsLeft <= 0) return showToast("No hints left!", "error");
  if (!state.gameActive) return;
  // Prefer selected empty cell
  const empties = [];
  for (let i = 0; i < 81; i++) {
    if (state.board[i] === 0) empties.push(i);
  }
  if (!empties.length) return;
  const idx =
    state.selected >= 0 && state.board[state.selected] === 0
      ? state.selected
      : empties[Math.floor(Math.random() * empties.length)];

  pushUndo();
  state.board[idx] = state.solution[idx];
  state.notes[idx].clear();
  state.errors[idx] = false;
  state.locked[idx] = true;
  state.hintsLeft--;
  clearRelatedNotes(idx, state.solution[idx]);
  refreshCell(idx);
  updateInfoPanel();
  updateProgress();
  animateCell(idx, "correct-anim");
  showToast(`Hint: ${state.solution[idx]} placed`, "info");
  checkWin();
}

/* =============================================
   SECTION 10: AUTO SOLVE
   ============================================= */
function autoSolve() {
  if (!state.gameActive) return;
  pushUndo();
  for (let i = 0; i < 81; i++) {
    state.board[i] = state.solution[i];
    state.notes[i].clear();
    state.errors[i] = false;
  }
  state.gameActive = false;
  stopTimer();
  renderBoard();
  updateProgress();
  showToast("Puzzle auto-solved!", "info");
}

/* =============================================
   SECTION 11: CHECK SOLUTION
   ============================================= */
function checkSolution() {
  let allCorrect = true;
  for (let i = 0; i < 81; i++) {
    if (state.board[i] !== 0 && state.board[i] !== state.solution[i]) {
      state.errors[i] = true;
      allCorrect = false;
    }
  }
  renderBoard();
  if (allCorrect && state.board.every((v) => v !== 0)) {
    showToast("Perfect! All correct!", "success");
  } else if (allCorrect) {
    showToast("So far so good!", "success");
  } else {
    showToast("Some cells are wrong — check highlighted", "error");
  }
}

/* =============================================
   SECTION 12: WIN DETECTION
   ============================================= */
function checkWin() {
  if (state.board.some((v) => v === 0)) return;
  if (state.board.some((v, i) => v !== state.solution[i])) return;
  // Won!
  state.gameActive = false;
  stopTimer();
  updateScore(true);
  saveResult();
  setTimeout(showWinModal, 400);
  launchConfetti();
}

function showWinModal() {
  $("winTime").textContent = formatTime(state.timer);
  $("winMistakes").textContent = state.mistakes;
  $("winScore").textContent = state.score;
  showModal("winModal");
}

/* =============================================
   SECTION 13: SCORE
   ============================================= */
function updateScore(final = false) {
  const base = { easy: 500, medium: 1000, hard: 1500, expert: 2000 }[
    state.difficulty
  ];
  const timePenalty = Math.floor(state.timer / 2);
  const mistakePenalty = state.mistakes * 50;
  state.score = Math.max(0, base - timePenalty - mistakePenalty);
}

/* =============================================
   SECTION 14: TIMER
   ============================================= */
function startTimer() {
  state.timerRunning = true;
  state.timerInterval = setInterval(() => {
    if (!state.paused) {
      state.timer++;
      $timer.textContent = formatTime(state.timer);
      if (state.gameActive) updateScore();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
}

function togglePause() {
  if (!state.gameActive) return;
  state.paused = !state.paused;
  $("pauseBtn").textContent = state.paused ? "▶" : "⏸";
  if (state.paused) {
    // Show overlay
    let ov = document.querySelector(".pause-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "pause-overlay";
      ov.innerHTML =
        '<div class="pause-msg">⏸ Paused<small>Click to resume</small></div>';
      ov.addEventListener("click", togglePause);
      document.body.appendChild(ov);
    }
    ov.classList.remove("hidden");
  } else {
    const ov = document.querySelector(".pause-overlay");
    if (ov) ov.classList.add("hidden");
  }
}

function resetTimer() {
  state.timer = 0;
  $timer.textContent = "00:00";
}

function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* =============================================
   SECTION 15: RESET GAME
   ============================================= */
function resetGame() {
  if (!state.gameActive && state.timer > 0) {
    // Restart from puzzle
  }
  state.board = [...state.puzzle];
  state.notes = Array.from({ length: 81 }, () => new Set());
  state.errors = Array(81).fill(false);
  state.mistakes = 0;
  state.hintsLeft = 3;
  state.score = 0;
  state.undoStack = [];
  state.redoStack = [];
  state.gameActive = true;
  state.paused = false;
  resetTimer();
  stopTimer();
  startTimer();
  renderBoard();
  updateInfoPanel();
  updateProgress();
  // Remove pause overlay
  const ov = document.querySelector(".pause-overlay");
  if (ov) ov.classList.add("hidden");
  showToast("Game reset!", "info");
}

/* =============================================
   SECTION 16: LOCAL STORAGE (STATS + LEADERBOARD)
   ============================================= */
const LS_STATS = "sudokux_stats";
const LS_LB = "sudokux_lb";

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS)) || defaultStats();
  } catch {
    return defaultStats();
  }
}

function defaultStats() {
  return {
    played: 0,
    won: 0,
    streak: 0,
    bestStreak: 0,
    avgScore: 0,
    scoreTotal: 0,
    bestTime: null,
    byDiff: {
      easy: { played: 0, won: 0, best: null },
      medium: { played: 0, won: 0, best: null },
      hard: { played: 0, won: 0, best: null },
      expert: { played: 0, won: 0, best: null },
    },
  };
}

function saveStats(stats) {
  localStorage.setItem(LS_STATS, JSON.stringify(stats));
}

function loadLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem(LS_LB)) || [];
  } catch {
    return [];
  }
}

function saveLeaderboard(lb) {
  localStorage.setItem(LS_LB, JSON.stringify(lb));
}

function saveResult() {
  const stats = loadStats();
  stats.played++;
  stats.won++;
  stats.streak++;
  stats.bestStreak = Math.max(stats.bestStreak || 0, stats.streak);
  stats.scoreTotal = (stats.scoreTotal || 0) + state.score;
  stats.avgScore = Math.round(stats.scoreTotal / stats.won);
  if (!stats.bestTime || state.timer < stats.bestTime)
    stats.bestTime = state.timer;

  const d = state.difficulty;
  stats.byDiff[d].played++;
  stats.byDiff[d].won++;
  if (!stats.byDiff[d].best || state.timer < stats.byDiff[d].best)
    stats.byDiff[d].best = state.timer;

  saveStats(stats);

  // Leaderboard
  const lb = loadLeaderboard();
  lb.push({
    score: state.score,
    time: state.timer,
    diff: state.difficulty,
    date: new Date().toLocaleDateString(),
  });
  lb.sort((a, b) => b.score - a.score || a.time - b.time);
  lb.splice(50); // keep top 50
  saveLeaderboard(lb);

  updateHomepageStats();
  updateMiniLeaderboard();
}

function recordLoss() {
  const stats = loadStats();
  stats.played++;
  stats.streak = 0;
  saveStats(stats);
  updateHomepageStats();
}

/* =============================================
   SECTION 17: UI — STATS / LEADERBOARD MODALS
   ============================================= */
function renderStatsModal() {
  const s = loadStats();
  $("stPlayed").textContent = s.played;
  $("stWon").textContent = s.won;
  $("stWinPct").textContent = s.played
    ? Math.round((s.won / s.played) * 100) + "%"
    : "0%";
  $("stBest").textContent =
    s.bestTime != null ? formatTime(s.bestTime) : "--:--";
  $("stStreak").textContent = s.streak || 0;
  $("stAvgScore").textContent = s.avgScore || 0;

  const tbody = $("diffTableBody");
  tbody.innerHTML = "";
  for (const [k, v] of Object.entries(s.byDiff)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${DIFFICULTY[k].label}</td><td>${v.played}</td><td>${v.won}</td><td>${v.best != null ? formatTime(v.best) : "--:--"}</td>`;
    tbody.appendChild(tr);
  }
}

function renderLeaderboardModal(filter = "all") {
  const lb = loadLeaderboard();
  const filtered = filter === "all" ? lb : lb.filter((e) => e.diff === filter);
  const tbody = $("leaderboardBody");
  tbody.innerHTML = "";
  if (!filtered.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">No scores yet — play some games!</td></tr>';
    return;
  }
  filtered.slice(0, 20).forEach((e, i) => {
    const tr = document.createElement("tr");
    tr.className = `rank-${i + 1}`;
    tr.innerHTML = `<td>${i + 1}</td><td>${e.score}</td><td>${formatTime(e.time)}</td><td>${DIFFICULTY[e.diff]?.label || e.diff}</td><td>${e.date}</td>`;
    tbody.appendChild(tr);
  });
}

function updateMiniLeaderboard() {
  const lb = loadLeaderboard().slice(0, 5);
  const el = $("miniLeaderboard");
  el.innerHTML = "";
  if (!lb.length) {
    el.innerHTML =
      '<li style="color:var(--text-muted);font-size:.75rem">No scores yet</li>';
    return;
  }
  lb.forEach((e, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="lb-rank">${i + 1}</span><span>${DIFFICULTY[e.diff]?.label || e.diff}</span><span class="lb-score">${e.score}</span>`;
    el.appendChild(li);
  });
}

function updateHomepageStats() {
  const s = loadStats();
  $("hpPlayed").textContent = s.played;
  $("hpWon").textContent = s.won;
  $("hpWinPct").textContent = s.played
    ? Math.round((s.won / s.played) * 100) + "%"
    : "0%";
  $("hpBest").textContent =
    s.bestTime != null ? formatTime(s.bestTime) : "--:--";
}

/* =============================================
   SECTION 18: CONFETTI
   ============================================= */
function launchConfetti() {
  const canvas = $confetti;
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;

  const pieces = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    r: 4 + Math.random() * 6,
    d: 2 + Math.random() * 3,
    color: ["#00d4ff", "#7c3aed", "#22d3a5", "#f59e0b", "#ff4d6d", "#fff"][
      Math.floor(Math.random() * 6)
    ],
    tilt: Math.random() * 10 - 5,
    tiltDir: Math.random() > 0.5 ? 1 : -1,
    alpha: 1,
  }));

  let frame;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of pieces) {
      p.y += p.d;
      p.tilt += p.tiltDir * 0.1;
      p.alpha -= 0.004;
      if (p.y < canvas.height && p.alpha > 0) alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.4, p.tilt, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (alive) frame = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  frame = requestAnimationFrame(tick);
}

/* =============================================
   SECTION 19: SOUND EFFECTS
   ============================================= */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "correct") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "win") {
      [440, 554, 659, 880].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = f;
        g.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.1);
        g.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + i * 0.1 + 0.25,
        );
        o.start(ctx.currentTime + i * 0.1);
        o.stop(ctx.currentTime + i * 0.1 + 0.3);
      });
    }
  } catch (_) {}
}

/* =============================================
   SECTION 20: TOAST
   ============================================= */
let toastTimer;
function showToast(msg, type = "") {
  $toast.textContent = msg;
  $toast.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $toast.className = "toast";
  }, 2500);
}

/* =============================================
   SECTION 21: MODALS
   ============================================= */
function showModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  $(id).hidden = true;
  document.body.style.overflow = "";
}

// Close on overlay click
document.querySelectorAll(".modal-overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeModal(ov.id);
  });
});

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

/* =============================================
   SECTION 22: THEME TOGGLE
   ============================================= */
function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("sudokux_theme", next);
  document.querySelectorAll("#themeToggle,#themeToggle2").forEach((b) => {
    b.textContent = next === "dark" ? "☀️" : "🌙";
  });
}

/* =============================================
   SECTION 23: PAGE NAVIGATION
   ============================================= */
function showPage(id) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo(0, 0);
}

/* =============================================
   SECTION 24: DECORATIVE BG GRID
   ============================================= */
function buildDecorGrid() {
  const grid = $("decorGrid");
  if (!grid) return;
  for (let i = 0; i < 81; i++) {
    const d = document.createElement("div");
    d.className = "mg-cell";
    d.style.animationDelay = `${(Math.random() * 3).toFixed(2)}s`;
    grid.appendChild(d);
  }
}

/* =============================================
   SECTION 25: EVENT WIRING
   ============================================= */
function wireEvents() {
  // Homepage
  $("playNowBtn").addEventListener("click", () => {
    const diff =
      document.querySelector("#difficultyPicker .diff-pill.active")?.dataset
        .diff || "medium";
    startNewGame(diff);
  });
  $("dailyBtn").addEventListener("click", () => startNewGame("medium", true));

  document.querySelectorAll("#difficultyPicker .diff-pill").forEach((p) => {
    p.addEventListener("click", () => {
      document.querySelectorAll("#difficultyPicker .diff-pill").forEach((x) => {
        x.classList.remove("active");
        x.setAttribute("aria-checked", "false");
      });
      p.classList.add("active");
      p.setAttribute("aria-checked", "true");
    });
  });

  // Theme
  $("themeToggle").addEventListener("click", toggleTheme);
  $("themeToggle2").addEventListener("click", toggleTheme);

  // Stats
  $("statsBtn").addEventListener("click", () => {
    renderStatsModal();
    showModal("statsModal");
  });
  $("leaderboardBtn").addEventListener("click", () => {
    renderLeaderboardModal();
    showModal("leaderboardModal");
  });

  // Game page
  $("backBtn").addEventListener("click", () => {
    if (state.gameActive) {
      if (!confirm("Leave game? Progress will not be saved.")) return;
      stopTimer();
      state.gameActive = false;
    }
    showPage("homepage");
  });

  // Numpad
  document.querySelectorAll(".num-key").forEach((btn) => {
    btn.addEventListener("click", () => inputNumber(+btn.dataset.num));
  });

  // Tools
  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  $("hintBtn").addEventListener("click", giveHint);
  $("checkBtn").addEventListener("click", checkSolution);
  $("notesModeBtn").addEventListener("click", () => {
    state.notesMode = !state.notesMode;
    updateInfoPanel();
  });

  // Game actions
  $("newGameBtn").addEventListener("click", () => {
    if (confirm("Start a new game?")) startNewGame(state.difficulty);
  });
  $("resetGameBtn").addEventListener("click", () => {
    if (confirm("Reset current puzzle?")) resetGame();
  });
  $("solveBtn").addEventListener("click", () => {
    if (confirm("Auto-solve this puzzle?")) autoSolve();
  });
  $("pauseBtn").addEventListener("click", togglePause);
  $("resetTimerBtn").addEventListener("click", resetTimer);

  // Game difficulty picker
  document.querySelectorAll("#gameDiffPicker .diff-pill").forEach((p) => {
    p.addEventListener("click", () => {
      if (
        confirm(
          `Switch to ${DIFFICULTY[p.dataset.diff].label}? This starts a new game.`,
        )
      ) {
        startNewGame(p.dataset.diff);
      }
    });
  });

  // Win modal
  $("winNewGame").addEventListener("click", () => {
    closeModal("winModal");
    startNewGame(state.difficulty);
  });
  $("winHome").addEventListener("click", () => {
    closeModal("winModal");
    showPage("homepage");
  });

  // Leaderboard filter
  document.querySelectorAll("[data-lb-diff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-lb-diff]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderLeaderboardModal(btn.dataset.lbDiff);
    });
  });

  // Keyboard ESC closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document
        .querySelectorAll(".modal-overlay:not([hidden])")
        .forEach((m) => closeModal(m.id));
    }
  });
}

/* =============================================
   SECTION 26: INIT
   ============================================= */
function init() {
  // Restore theme
  const savedTheme = localStorage.getItem("sudokux_theme") || "dark";
  document.documentElement.dataset.theme = savedTheme;
  document.querySelectorAll("#themeToggle,#themeToggle2").forEach((b) => {
    b.textContent = savedTheme === "dark" ? "☀️" : "🌙";
  });

  buildDecorGrid();
  wireEvents();
  updateHomepageStats();
  updateMiniLeaderboard();
  showPage("homepage");
}

document.addEventListener("DOMContentLoaded", init);
