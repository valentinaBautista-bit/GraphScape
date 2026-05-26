const canvas = document.getElementById('mazeCanvas');
const context = canvas.getContext('2d');

const difficultySelect = document.getElementById('difficulty');
const algorithmSelect = document.getElementById('algorithm');
const generateBtn = document.getElementById('generateBtn');
const stepBtn = document.getElementById('stepBtn');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');

const modeLabel = document.getElementById('modeLabel');
const statusLabel = document.getElementById('statusLabel');
const boardMeta = document.getElementById('boardMeta');
const timeStat = document.getElementById('timeStat');
const moveStat = document.getElementById('moveStat');
const visitedStat = document.getElementById('visitedStat');
const pathStat = document.getElementById('pathStat');

const SETTINGS = {
  easy: { rows: 8, cols: 10, extraLinks: 0.05 },
  medium: { rows: 12, cols: 16, extraLinks: 0.09 },
  hard: { rows: 16, cols: 22, extraLinks: 0.14 },
};

const STATE = {
  rows: 0,
  cols: 0,
  graph: new Map(),
  start: '0,0',
  goal: '0,0',
  player: '0,0',
  solutionPath: [],
  optimalPathLength: 0,
  playerTrail: [],
  moveCount: 0,
  visitedCount: 0,
  currentTime: 0,
  playing: false,
  gameActive: false,
  autoSolve: null,
  autoSolveTimer: null,
  lastSolvedBy: '',
  lastWinner: '',
  visitedDuringSolve: new Set(),
  playerWins: false,
  cellSize: 1,
  padding: 28,
  stepCursor: 0,
};

function keyOf(row, col) {
  return `${row},${col}`;
}

function parseKey(key) {
  return key.split(',').map(Number);
}

function shuffle(values) {
  const items = values.slice();
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function createEmptyGraph(rows, cols) {
  const graph = new Map();
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      graph.set(keyOf(row, col), new Set());
    }
  }
  return graph;
}

function connect(graph, a, b) {
  graph.get(a).add(b);
  graph.get(b).add(a);
}

function generateMaze(rows, cols, extraLinks) {
  const graph = createEmptyGraph(rows, cols);
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [[0, 0]];
  visited[0][0] = true;

  while (stack.length > 0) {
    const [row, col] = stack[stack.length - 1];
    const candidates = [];
    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];

    for (const [nextRow, nextCol] of neighbors) {
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols && !visited[nextRow][nextCol]) {
        candidates.push([nextRow, nextCol]);
      }
    }

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const [nextRow, nextCol] = candidates[Math.floor(Math.random() * candidates.length)];
    connect(graph, keyOf(row, col), keyOf(nextRow, nextCol));
    visited[nextRow][nextCol] = true;
    stack.push([nextRow, nextCol]);
  }

  const openWalls = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const current = keyOf(row, col);
      const options = [
        [row + 1, col],
        [row, col + 1],
      ];

      for (const [nextRow, nextCol] of options) {
        if (nextRow >= rows || nextCol >= cols) {
          continue;
        }

        const neighbor = keyOf(nextRow, nextCol);
        if (!graph.get(current).has(neighbor)) {
          openWalls.push([current, neighbor]);
        }
      }
    }
  }

  const extraCount = Math.floor(openWalls.length * extraLinks);
  const picks = shuffle(openWalls).slice(0, extraCount);
  for (const [a, b] of picks) {
    connect(graph, a, b);
  }

  return graph;
}

function buildTraversal(graph, start, goal, algorithm) {
  const visited = new Set([start]);
  const parent = new Map();
  const order = [];
  const frontier = [start];

  while (frontier.length > 0) {
    const current = algorithm === 'bfs' ? frontier.shift() : frontier.pop();
    order.push(current);

    if (current === goal) {
      break;
    }

    const neighbors = Array.from(graph.get(current)).sort();
    const nextNeighbors = algorithm === 'bfs' ? neighbors : neighbors.reverse();

    for (const neighbor of nextNeighbors) {
      if (visited.has(neighbor)) {
        continue;
      }

      visited.add(neighbor);
      parent.set(neighbor, current);
      frontier.push(neighbor);
    }
  }

  const path = [];
  let cursor = goal;
  if (!parent.has(goal) && goal !== start) {
    return { order, path, parent, found: false };
  }

  while (cursor) {
    path.push(cursor);
    if (cursor === start) {
      break;
    }
    cursor = parent.get(cursor);
  }

  path.reverse();
  return { order, path, parent, found: true };
}

function resetSearchState() {
  STATE.autoSolve = null;
  STATE.stepCursor = 0;
  STATE.visitedDuringSolve = new Set();
  clearInterval(STATE.autoSolveTimer);
  STATE.autoSolveTimer = null;
}

function setModeText(text, subtitle) {
  modeLabel.textContent = text;
  statusLabel.textContent = subtitle;
}

function updateStats() {
  timeStat.textContent = formatTime(STATE.currentTime);
  moveStat.textContent = String(STATE.moveCount);
  visitedStat.textContent = String(STATE.visitedCount);
  pathStat.textContent = String(STATE.optimalPathLength || STATE.solutionPath.length || 0);
}

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(cssHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  computeCellMetrics();
  drawBoard();
}

function computeCellMetrics() {
  const usableWidth = canvas.clientWidth - STATE.padding * 2;
  const usableHeight = canvas.clientHeight - STATE.padding * 2;
  STATE.cellSize = Math.max(22, Math.floor(Math.min(usableWidth / Math.max(STATE.cols, 1), usableHeight / Math.max(STATE.rows, 1))));
}

function cellCenter(key) {
  const [row, col] = parseKey(key);
  return {
    x: STATE.padding + col * STATE.cellSize + STATE.cellSize / 2,
    y: STATE.padding + row * STATE.cellSize + STATE.cellSize / 2,
  };
}

function drawBoard() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#08111f');
  gradient.addColorStop(1, '#050b14');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  if (!STATE.graph.size) {
    context.fillStyle = 'rgba(234, 244, 255, 0.56)';
    context.font = '600 18px Inter, sans-serif';
    context.fillText('Genera un laberinto para comenzar.', 30, 48);
    return;
  }

  drawConnections();
  drawGridHints();
  drawVisitedOverlay();
  drawSolutionPath();
  drawNodes();
}

function drawGridHints() {
  context.strokeStyle = 'rgba(154, 205, 255, 0.04)';
  context.lineWidth = 1;
  for (let row = 0; row < STATE.rows; row += 1) {
    for (let col = 0; col < STATE.cols; col += 1) {
      const x = STATE.padding + col * STATE.cellSize;
      const y = STATE.padding + row * STATE.cellSize;
      context.strokeRect(x, y, STATE.cellSize, STATE.cellSize);
    }
  }
}

function drawConnections() {
  context.lineWidth = Math.max(2, Math.floor(STATE.cellSize * 0.08));
  context.lineCap = 'round';
  context.strokeStyle = 'rgba(154, 205, 255, 0.18)';

  for (const [node, neighbors] of STATE.graph.entries()) {
    const origin = cellCenter(node);
    for (const neighbor of neighbors) {
      if (node > neighbor) {
        continue;
      }
      const target = cellCenter(neighbor);
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }
  }
}

function drawVisitedOverlay() {
  if (!STATE.autoSolve) {
    return;
  }

  for (const node of STATE.visitedDuringSolve) {
    const center = cellCenter(node);
    context.fillStyle = 'rgba(255, 204, 107, 0.22)';
    context.beginPath();
    context.arc(center.x, center.y, STATE.cellSize * 0.26, 0, Math.PI * 2);
    context.fill();
  }
}

function drawSolutionPath() {
  if (!STATE.solutionPath.length) {
    return;
  }

  context.strokeStyle = 'rgba(233, 247, 255, 0.92)';
  context.lineWidth = Math.max(4, Math.floor(STATE.cellSize * 0.12));
  context.beginPath();

  STATE.solutionPath.forEach((node, index) => {
    const center = cellCenter(node);
    if (index === 0) {
      context.moveTo(center.x, center.y);
    } else {
      context.lineTo(center.x, center.y);
    }
  });

  context.stroke();
}

function drawNodes() {
  for (const node of STATE.graph.keys()) {
    const center = cellCenter(node);
    const isStart = node === STATE.start;
    const isGoal = node === STATE.goal;
    const isPlayer = node === STATE.player;
    const isVisited = STATE.visitedDuringSolve.has(node);
    const onPath = STATE.solutionPath.includes(node);

    context.beginPath();
    context.arc(center.x, center.y, STATE.cellSize * 0.19, 0, Math.PI * 2);

    if (isStart) {
      context.fillStyle = '#8cffc1';
    } else if (isGoal) {
      context.fillStyle = '#ff6b8a';
    } else if (isPlayer) {
      context.fillStyle = '#67d1ff';
    } else if (onPath) {
      context.fillStyle = '#eff7ff';
    } else if (isVisited) {
      context.fillStyle = '#ffcc6b';
    } else {
      context.fillStyle = 'rgba(180, 210, 240, 0.22)';
    }

    context.fill();

    if (isPlayer) {
      context.lineWidth = 3;
      context.strokeStyle = 'rgba(103, 209, 255, 0.8)';
      context.stroke();
    }
  }
}

function generateGame() {
  const config = SETTINGS[difficultySelect.value];
  STATE.rows = config.rows;
  STATE.cols = config.cols;
  STATE.graph = generateMaze(config.rows, config.cols, config.extraLinks);
  STATE.start = keyOf(0, 0);
  STATE.goal = keyOf(config.rows - 1, config.cols - 1);
  STATE.player = STATE.start;
  STATE.playerTrail = [STATE.start];
  STATE.moveCount = 0;
  STATE.visitedCount = 0;
  STATE.currentTime = 0;
  STATE.playing = true;
  STATE.gameActive = true;
  STATE.playerWins = false;
  STATE.solutionPath = [];
  STATE.optimalPathLength = buildTraversal(STATE.graph, STATE.start, STATE.goal, 'bfs').path.length;
  STATE.lastSolvedBy = '';
  STATE.lastWinner = '';
  STATE.visitedDuringSolve = new Set();
  resetSearchState();
  computeCellMetrics();
  updateMetaText();
  setModeText('Exploración manual', 'El jugador comienza en la esquina superior izquierda.');
  updateStats();
  updateControlsState();
  drawBoard();
}

function updateMetaText() {
  const nodeCount = STATE.rows * STATE.cols;
  const edgeCount = Array.from(STATE.graph.values()).reduce((sum, neighbors) => sum + neighbors.size, 0) / 2;
  boardMeta.textContent = `${STATE.rows} x ${STATE.cols} nodos · ${Math.round(edgeCount)} conexiones · grafo conexo no dirigido.`;
}

function updateControlsState() {
  const hasBoard = STATE.graph.size > 0;
  stepBtn.disabled = !hasBoard;
  playBtn.disabled = !hasBoard;
  pauseBtn.disabled = !STATE.autoSolve;
}

function movePlayer(deltaRow, deltaCol) {
  if (!STATE.gameActive || STATE.autoSolve) {
    return;
  }

  const [row, col] = parseKey(STATE.player);
  const nextKey = keyOf(row + deltaRow, col + deltaCol);
  const neighbors = STATE.graph.get(STATE.player);

  if (!neighbors || !neighbors.has(nextKey)) {
    setModeText('Exploración manual', 'Movimiento inválido: esa arista no existe en el grafo.');
    return;
  }

  STATE.player = nextKey;
  STATE.playerTrail.push(nextKey);
  STATE.moveCount += 1;
  STATE.currentTime += 0;
  STATE.lastWinner = '';

  if (STATE.player === STATE.goal) {
    STATE.gameActive = false;
    STATE.playing = false;
    STATE.playerWins = true;
    STATE.solutionPath = STATE.playerTrail.slice();
    setModeText('Meta alcanzada', `Tu ruta tuvo ${STATE.playerTrail.length} nodos; la óptima es de ${STATE.optimalPathLength}.`);
  } else {
    setModeText('Exploración manual', `Posición actual: ${nextKey}.`);
  }

  updateStats();
  drawBoard();
}

function startAutoSolve() {
  if (!STATE.gameActive) {
    generateGame();
  }

  const algorithm = algorithmSelect.value;
  const traversal = buildTraversal(STATE.graph, STATE.player, STATE.goal, algorithm);
  STATE.autoSolve = {
    algorithm,
    order: traversal.order,
    path: traversal.path,
    index: 0,
    phase: 'search',
    pathIndex: 0,
    found: traversal.found,
  };
  STATE.visitedDuringSolve = new Set();
  STATE.solutionPath = [];
  STATE.playerWins = false;
  STATE.gameActive = true;
  STATE.playing = true;
  STATE.lastSolvedBy = algorithm.toUpperCase();
  setModeText(`${algorithm.toUpperCase()} en ejecución`, algorithm === 'bfs'
    ? 'BFS recorre por niveles y prioriza la solución más corta.'
    : 'DFS profundiza en una rama antes de retroceder.');
  updateControlsState();
  drawBoard();
}

function solveStep() {
  if (!STATE.autoSolve) {
    return;
  }

  if (STATE.autoSolve.phase === 'search') {
    const node = STATE.autoSolve.order[STATE.autoSolve.index];
    if (node) {
      STATE.visitedDuringSolve.add(node);
      STATE.autoSolve.index += 1;
      STATE.visitedCount = STATE.visitedDuringSolve.size;

      if (node === STATE.goal || STATE.autoSolve.index >= STATE.autoSolve.order.length) {
        STATE.autoSolve.phase = 'path';
        STATE.solutionPath = STATE.autoSolve.path.slice();
        STATE.playing = false;
        STATE.gameActive = false;
        STATE.lastWinner = STATE.autoSolve.algorithm.toUpperCase();
        setModeText(`${STATE.autoSolve.algorithm.toUpperCase()} finalizado`, `Se encontró una ruta de ${STATE.solutionPath.length} nodos.`);
      }
    }
  } else if (STATE.autoSolve.phase === 'path') {
    STATE.autoSolve.pathIndex += 1;
    if (STATE.autoSolve.pathIndex >= STATE.solutionPath.length) {
      STATE.autoSolve = null;
      setModeText('Ruta resuelta', `La solución del algoritmo quedó dibujada en el mapa.`);
      updateControlsState();
    }
  }

  updateStats();
  drawBoard();
}

function playSolve() {
  if (!STATE.autoSolve) {
    startAutoSolve();
  }

  if (STATE.autoSolveTimer) {
    return;
  }

  STATE.playing = true;
  STATE.autoSolveTimer = window.setInterval(() => {
    if (!STATE.autoSolve) {
      clearInterval(STATE.autoSolveTimer);
      STATE.autoSolveTimer = null;
      return;
    }

    solveStep();

    if (!STATE.autoSolve) {
      clearInterval(STATE.autoSolveTimer);
      STATE.autoSolveTimer = null;
      updateControlsState();
    }
  }, 110);
}

function pauseSolve() {
  STATE.playing = false;
  clearInterval(STATE.autoSolveTimer);
  STATE.autoSolveTimer = null;
  if (STATE.autoSolve) {
    setModeText(`${STATE.autoSolve.algorithm.toUpperCase()} pausado`, 'Puedes continuar la búsqueda o avanzar un paso manualmente.');
  }
}

function tickClock() {
  if (STATE.gameActive && STATE.playing && !STATE.autoSolve) {
    STATE.currentTime += 1;
    updateStats();
  }
}

function handleKeydown(event) {
  const keyMap = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };

  if (event.key in keyMap) {
    event.preventDefault();
    const [deltaRow, deltaCol] = keyMap[event.key];
    movePlayer(deltaRow, deltaCol);
  } else if (event.key === ' ') {
    event.preventDefault();
    if (STATE.autoSolve) {
      solveStep();
    }
  }
}

generateBtn.addEventListener('click', generateGame);
stepBtn.addEventListener('click', () => {
  if (!STATE.autoSolve) {
    startAutoSolve();
  }
  solveStep();
});
playBtn.addEventListener('click', playSolve);
pauseBtn.addEventListener('click', pauseSolve);
difficultySelect.addEventListener('change', generateGame);
algorithmSelect.addEventListener('change', () => {
  if (STATE.autoSolve) {
    pauseSolve();
    STATE.autoSolve = null;
    updateControlsState();
    drawBoard();
  }
});
window.addEventListener('keydown', handleKeydown);
window.addEventListener('resize', resizeCanvas);

setInterval(tickClock, 1000);
resizeCanvas();
generateGame();
