const boardElement = document.getElementById('chessboard');
const statusElement = document.getElementById('game-status');
const whiteScoreElement = document.getElementById('white-score');
const botScoreElement = document.getElementById('bot-score');
const whiteTooltipElement = document.getElementById('white-score-tooltip');
const botTooltipElement = document.getElementById('bot-score-tooltip');
const moveHistoryElement = document.getElementById('move-history');
const resetButton = document.getElementById('reset-game');
const difficultySelect = document.getElementById('difficulty-level');

const pieceSymbols = {
  wP: '♙', wR: '♖', wN: '♘', wB: '♗', wQ: '♕', wK: '♔',
  bP: '♟', bR: '♜', bN: '♞', bB: '♝', bQ: '♛', bK: '♚'
};

const pieceValues = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 0
};

let board = [];
let selectedSquare = null;
let legalMoves = [];
let isWhiteTurn = true;
let gameOver = false;
let whiteScore = 0;
let botScore = 0;
let lastMove = null;
let moveHistory = [];
let whiteCapturedPieces = [];
let botCapturedPieces = [];
let moveAudioContext = null;

function createInitialBoard() {
  const newBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

  for (let col = 0; col < 8; col += 1) {
    newBoard[0][col] = `b${backRank[col]}`;
    newBoard[1][col] = 'bP';
    newBoard[6][col] = 'wP';
    newBoard[7][col] = `w${backRank[col]}`;
  }

  return newBoard;
}

function getPieceLabel(piece) {
  const pieceMap = {
    P: 'Pawn',
    N: 'Knight',
    B: 'Bishop',
    R: 'Rook',
    Q: 'Queen',
    K: 'King'
  };

  return pieceMap[getPieceType(piece)] || 'Piece';
}

function updateScoreDisplay() {
  whiteScoreElement.textContent = String(whiteScore);
  botScoreElement.textContent = String(botScore);

  whiteTooltipElement.textContent = whiteCapturedPieces.length
    ? `Captured: ${whiteCapturedPieces.join(', ')}`
    : 'No captures yet';
  botTooltipElement.textContent = botCapturedPieces.length
    ? `Captured: ${botCapturedPieces.join(', ')}`
    : 'No captures yet';
}

function renderMoveHistory() {
  moveHistoryElement.innerHTML = '';

  moveHistory.slice(-12).forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry;
    moveHistoryElement.appendChild(item);
  });
}

function addMoveToHistory(description) {
  moveHistory.push(description);
  renderMoveHistory();
}

function playMoveSound() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    return;
  }

  if (!moveAudioContext) {
    moveAudioContext = new AudioCtor();
  }

  const context = moveAudioContext;
  if (context.state === 'suspended') {
    context.resume();
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(420, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(220, context.currentTime + 0.14);

  gainNode.gain.setValueAtTime(0.0001, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
}

function resetGame() {
  board = createInitialBoard();
  selectedSquare = null;
  legalMoves = [];
  isWhiteTurn = true;
  gameOver = false;
  whiteScore = 0;
  botScore = 0;
  lastMove = null;
  moveHistory = [];
  whiteCapturedPieces = [];
  botCapturedPieces = [];
  statusElement.textContent = 'White to move';
  updateScoreDisplay();
  renderMoveHistory();
  renderBoard();
}

function isInsideBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getPieceColor(piece) {
  return piece ? piece[0] : null;
}

function getPieceType(piece) {
  return piece ? piece[1] : null;
}

function getPieceValue(piece) {
  if (!piece) {
    return 0;
  }

  return pieceValues[getPieceType(piece)] ?? 0;
}

function cloneBoard(boardState) {
  return boardState.map((row) => [...row]);
}

function getKingPosition(boardState, color) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = boardState[row][col];
      if (piece === `${color}K`) {
        return { row, col };
      }
    }
  }

  return null;
}

function isSquareAttacked(row, col, attackingColor, boardState = board) {
  const pawnDirection = attackingColor === 'w' ? 1 : -1;
  const pawnRow = row + pawnDirection;
  const pawnColumns = [col - 1, col + 1];

  for (const pawnCol of pawnColumns) {
    if (isInsideBoard(pawnRow, pawnCol) && boardState[pawnRow][pawnCol] === `${attackingColor}P`) {
      return true;
    }
  }

  const knightOffsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];

  for (const [dRow, dCol] of knightOffsets) {
    const nextRow = row + dRow;
    const nextCol = col + dCol;
    if (isInsideBoard(nextRow, nextCol) && boardState[nextRow][nextCol] === `${attackingColor}N`) {
      return true;
    }
  }

  const slidingDirections = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  for (const [dRow, dCol] of slidingDirections) {
    let nextRow = row + dRow;
    let nextCol = col + dCol;

    while (isInsideBoard(nextRow, nextCol)) {
      const piece = boardState[nextRow][nextCol];
      if (!piece) {
        nextRow += dRow;
        nextCol += dCol;
        continue;
      }

      if (piece[0] === attackingColor) {
        const type = piece[1];
        if ((type === 'R' && (dRow === 0 || dCol === 0)) ||
            (type === 'B' && (dRow !== 0 && dCol !== 0)) ||
            (type === 'Q')) {
          return true;
        }
      }
      break;
    }
  }

  const kingOffsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  for (const [dRow, dCol] of kingOffsets) {
    const nextRow = row + dRow;
    const nextCol = col + dCol;
    if (isInsideBoard(nextRow, nextCol) && boardState[nextRow][nextCol] === `${attackingColor}K`) {
      return true;
    }
  }

  return false;
}

function isKingInCheck(color, boardState = board) {
  const kingPosition = getKingPosition(boardState, color);
  if (!kingPosition) {
    return false;
  }

  return isSquareAttacked(kingPosition.row, kingPosition.col, color === 'w' ? 'b' : 'w', boardState);
}

function generateMovesForPiece(row, col, piece, boardState = board) {
  const color = getPieceColor(piece);
  const type = getPieceType(piece);
  const moves = [];

  if (!piece) {
    return moves;
  }

  if (type === 'P') {
    const direction = color === 'w' ? -1 : 1;
    const startingRow = color === 'w' ? 6 : 1;

    const forwardOne = row + direction;
    if (isInsideBoard(forwardOne, col) && !boardState[forwardOne][col]) {
      moves.push({ row: forwardOne, col });

      const forwardTwo = row + direction * 2;
      if (row === startingRow && !boardState[forwardTwo][col]) {
        moves.push({ row: forwardTwo, col });
      }
    }

    [-1, 1].forEach((offset) => {
      const targetRow = row + direction;
      const targetCol = col + offset;
      if (!isInsideBoard(targetRow, targetCol)) {
        return;
      }

      const targetPiece = boardState[targetRow][targetCol];
      if (targetPiece && getPieceColor(targetPiece) !== color) {
        moves.push({ row: targetRow, col: targetCol });
      }
    });
  }

  if (type === 'R' || type === 'B' || type === 'Q') {
    const directions = [];

    if (type === 'R' || type === 'Q') {
      directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    }

    if (type === 'B' || type === 'Q') {
      directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    }

    directions.forEach(([dRow, dCol]) => {
      let nextRow = row + dRow;
      let nextCol = col + dCol;

      while (isInsideBoard(nextRow, nextCol)) {
        const targetPiece = boardState[nextRow][nextCol];

        if (!targetPiece) {
          moves.push({ row: nextRow, col: nextCol });
        } else {
          if (getPieceColor(targetPiece) !== color) {
            moves.push({ row: nextRow, col: nextCol });
          }
          break;
        }

        nextRow += dRow;
        nextCol += dCol;
      }
    });
  }

  if (type === 'N') {
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    offsets.forEach(([dRow, dCol]) => {
      const nextRow = row + dRow;
      const nextCol = col + dCol;

      if (!isInsideBoard(nextRow, nextCol)) {
        return;
      }

      const targetPiece = boardState[nextRow][nextCol];
      if (!targetPiece || getPieceColor(targetPiece) !== color) {
        moves.push({ row: nextRow, col: nextCol });
      }
    });
  }

  if (type === 'K') {
    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    directions.forEach(([dRow, dCol]) => {
      const nextRow = row + dRow;
      const nextCol = col + dCol;

      if (!isInsideBoard(nextRow, nextCol)) {
        return;
      }

      const targetPiece = boardState[nextRow][nextCol];
      if (!targetPiece || getPieceColor(targetPiece) !== color) {
        moves.push({ row: nextRow, col: nextCol });
      }
    });
  }

  return moves;
}

function getLegalMovesForPiece(row, col, piece, boardState = board) {
  const color = getPieceColor(piece);

  return generateMovesForPiece(row, col, piece, boardState).filter((move) => {
    const simulatedBoard = cloneBoard(boardState);
    simulatedBoard[move.row][move.col] = piece;
    simulatedBoard[row][col] = null;

    const kingPosition = getKingPosition(simulatedBoard, color);
    if (!kingPosition) {
      return false;
    }

    return !isSquareAttacked(kingPosition.row, kingPosition.col, color === 'w' ? 'b' : 'w', simulatedBoard);
  });
}

function getLegalMovesForColor(color, boardState = board) {
  const moves = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = boardState[row][col];
      if (piece && getPieceColor(piece) === color) {
        const legalMovesForPiece = getLegalMovesForPiece(row, col, piece, boardState);
        legalMovesForPiece.forEach((move) => {
          moves.push({
            from: { row, col },
            to: move,
            piece,
            score: 0
          });
        });
      }
    }
  }

  return moves;
}

function hasLegalMovesForColor(color) {
  return getLegalMovesForColor(color).length > 0;
}

function movePiece(fromRow, fromCol, toRow, toCol) {
  const movingPiece = board[fromRow][fromCol];
  if (!movingPiece) {
    return;
  }

  const targetPiece = board[toRow][toCol];
  if (targetPiece) {
    const capturedValue = getPieceValue(targetPiece);
    if (getPieceColor(movingPiece) === 'w') {
      whiteScore += capturedValue;
      whiteCapturedPieces.push(getPieceLabel(targetPiece));
    } else {
      botScore += capturedValue;
      botCapturedPieces.push(getPieceLabel(targetPiece));
    }
  }

  board[toRow][toCol] = movingPiece;
  board[fromRow][fromCol] = null;
  lastMove = {
    from: { row: fromRow, col: fromCol },
    to: { row: toRow, col: toCol }
  };
  updateScoreDisplay();
}

function addMoveEntry(fromRow, fromCol, toRow, toCol, movingPiece, targetPiece) {
  const fromSquare = `${String.fromCharCode(65 + fromCol)}${8 - fromRow}`;
  const toSquare = `${String.fromCharCode(65 + toCol)}${8 - toRow}`;
  const moverColor = getPieceColor(movingPiece) === 'w' ? 'White' : 'Bot';
  const targetText = targetPiece ? ` captured ${getPieceLabel(targetPiece)}` : '';
  const pieceName = getPieceLabel(movingPiece);

  addMoveToHistory(`${moverColor} ${pieceName} ${fromSquare} to ${toSquare}${targetText}.`);
}

function updateStatusText() {
  if (gameOver) {
    return;
  }

  if (isKingInCheck('w')) {
    statusElement.textContent = 'White is in check';
    return;
  }

  if (isKingInCheck('b')) {
    statusElement.textContent = 'Black is in check';
    return;
  }

  statusElement.textContent = isWhiteTurn ? 'White to move' : 'Bot is thinking...';
}

function scoreMove(fromRow, fromCol, toRow, toCol) {
  const movingPiece = board[fromRow][fromCol];
  const targetPiece = board[toRow][toCol];

  if (!movingPiece) {
    return 0;
  }

  const capturedValue = targetPiece ? getPieceValue(targetPiece) : 0;
  const movingValue = getPieceValue(movingPiece);
  const centerDistance = Math.abs(toRow - 3.5) + Math.abs(toCol - 3.5);
  let advancementBonus = 0;

  if (getPieceType(movingPiece) === 'P') {
    advancementBonus = getPieceColor(movingPiece) === 'w' ? (fromRow - toRow) * 0.5 : (toRow - fromRow) * 0.5;
  }

  return capturedValue + movingValue * 0.2 + (7 - centerDistance) * 0.3 + advancementBonus;
}

function evaluateBoardForBot(boardState = board) {
  let score = 0;

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = boardState[row][col];
      if (!piece) {
        continue;
      }

      const value = getPieceValue(piece);
      const pieceScore = getPieceColor(piece) === 'b' ? value : -value;
      score += pieceScore * 100;

      const blackKing = getKingPosition(boardState, 'b');
      const whiteKing = getKingPosition(boardState, 'w');

      if (blackKing && getPieceColor(piece) === 'b') {
        score += (7 - Math.abs(blackKing.row - row)) * 0.5;
        score += (7 - Math.abs(blackKing.col - col)) * 0.5;
      }

      if (whiteKing && getPieceColor(piece) === 'w') {
        score -= (7 - Math.abs(whiteKing.row - row)) * 0.5;
        score -= (7 - Math.abs(whiteKing.col - col)) * 0.5;
      }
    }
  }

  const blackMoves = getLegalMovesForColor('b', boardState).length;
  const whiteMoves = getLegalMovesForColor('w', boardState).length;
  score += (blackMoves - whiteMoves) * 8;

  const blackKingPosition = getKingPosition(boardState, 'b');
  if (blackKingPosition && isSquareAttacked(blackKingPosition.row, blackKingPosition.col, 'w', boardState)) {
    score -= 180;
  }

  const whiteKingPosition = getKingPosition(boardState, 'w');
  if (whiteKingPosition && isSquareAttacked(whiteKingPosition.row, whiteKingPosition.col, 'b', boardState)) {
    score += 170;
  }

  return score;
}

function minimax(boardState, depth, isMaximizing, alpha, beta) {
  const blackHasMoves = getLegalMovesForColor('b', boardState).length > 0;
  const whiteHasMoves = getLegalMovesForColor('w', boardState).length > 0;

  if (depth === 0 || !blackHasMoves || !whiteHasMoves) {
    return evaluateBoardForBot(boardState);
  }

  if (isMaximizing) {
    let bestScore = -Infinity;

    for (const move of getLegalMovesForColor('b', boardState)) {
      const nextBoard = cloneBoard(boardState);
      nextBoard[move.to.row][move.to.col] = move.piece;
      nextBoard[move.from.row][move.from.col] = null;

      const score = minimax(nextBoard, depth - 1, false, alpha, beta);
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) {
        break;
      }
    }

    return bestScore;
  }

  let bestScore = Infinity;

  for (const move of getLegalMovesForColor('w', boardState)) {
    const nextBoard = cloneBoard(boardState);
    nextBoard[move.to.row][move.to.col] = move.piece;
    nextBoard[move.from.row][move.from.col] = null;

    const score = minimax(nextBoard, depth - 1, true, alpha, beta);
    bestScore = Math.min(bestScore, score);
    beta = Math.min(beta, score);
    if (beta <= alpha) {
      break;
    }
  }

  return bestScore;
}

function evaluateBotMove(fromRow, fromCol, toRow, toCol) {
  const movingPiece = board[fromRow][fromCol];
  if (!movingPiece) {
    return -Infinity;
  }

  const targetPiece = board[toRow][toCol];
  const baseScore = scoreMove(fromRow, fromCol, toRow, toCol);
  const capturedValue = targetPiece ? getPieceValue(targetPiece) : 0;

  const simulatedBoard = cloneBoard(board);
  simulatedBoard[toRow][toCol] = movingPiece;
  simulatedBoard[fromRow][fromCol] = null;

  let moveScore = baseScore * 18 + capturedValue * 30;

  if (isKingInCheck('b', simulatedBoard)) {
    moveScore -= 500;
  }

  if (isKingInCheck('w', simulatedBoard)) {
    moveScore += 140 + (capturedValue * 5);
  }

  const whiteKing = getKingPosition(simulatedBoard, 'w');
  if (whiteKing && isSquareAttacked(whiteKing.row, whiteKing.col, 'b', simulatedBoard)) {
    moveScore += 120;
  }

  const blackKing = getKingPosition(simulatedBoard, 'b');
  if (blackKing && isSquareAttacked(blackKing.row, blackKing.col, 'w', simulatedBoard)) {
    moveScore -= 200;
  }

  const blackMovesAfter = getLegalMovesForColor('b', simulatedBoard).length;
  const whiteMovesAfter = getLegalMovesForColor('w', simulatedBoard).length;
  moveScore += (blackMovesAfter - whiteMovesAfter) * 6;

  return moveScore;
}

function getBotMoveForDifficulty() {
  const botMoves = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && getPieceColor(piece) === 'b') {
        getLegalMovesForPiece(row, col, piece).forEach((move) => {
          const tacticalScore = evaluateBotMove(row, col, move.row, move.col);
          botMoves.push({
            from: { row, col },
            to: move,
            score: tacticalScore
          });
        });
      }
    }
  }

  if (botMoves.length === 0) {
    return null;
  }

  const difficulty = difficultySelect.value;
  const sortedMoves = [...botMoves].sort((a, b) => b.score - a.score);

  if (difficulty === 'easy') {
    const pickFrom = sortedMoves.slice(0, Math.min(8, sortedMoves.length));
    return pickFrom[Math.floor(Math.random() * pickFrom.length)];
  }

  if (difficulty === 'medium') {
    const pickFrom = sortedMoves.slice(0, Math.min(5, sortedMoves.length));
    return pickFrom[Math.floor(Math.random() * pickFrom.length)];
  }

  if (difficulty === 'hard') {
    const pickFrom = sortedMoves.slice(0, Math.min(3, sortedMoves.length));
    return pickFrom[Math.floor(Math.random() * pickFrom.length)];
  }

  if (difficulty === 'impossible') {
    let bestChoice = sortedMoves[0];
    let bestScore = -Infinity;

    for (const move of sortedMoves) {
      const nextBoard = cloneBoard(board);
      nextBoard[move.to.row][move.to.col] = board[move.from.row][move.from.col];
      nextBoard[move.from.row][move.from.col] = null;

      const boardScore = minimax(nextBoard, 2, false, -Infinity, Infinity);
      if (boardScore > bestScore) {
        bestScore = boardScore;
        bestChoice = move;
      }
    }

    return bestChoice;
  }

  return sortedMoves[0];
}

function handleSquareClick(row, col) {
  if (gameOver || !isWhiteTurn) {
    return;
  }

  const piece = board[row][col];

  if (selectedSquare) {
    const isTargetLegal = legalMoves.some((move) => move.row === row && move.col === col);

    if (isTargetLegal) {
      const fromRow = selectedSquare.row;
      const fromCol = selectedSquare.col;
      const targetPiece = board[row][col];
      movePiece(fromRow, fromCol, row, col);
      addMoveEntry(fromRow, fromCol, row, col, board[row][col], targetPiece);
      playMoveSound();
      selectedSquare = null;
      legalMoves = [];
      isWhiteTurn = false;
      updateStatusText();
      renderBoard();

      setTimeout(() => {
        if (gameOver) {
          return;
        }

        makeBotMove();
      }, 500);
      return;
    }

    selectedSquare = null;
    legalMoves = [];
  }

  if (piece && getPieceColor(piece) === 'w') {
    selectedSquare = { row, col };
    legalMoves = getLegalMovesForPiece(row, col, piece);
    updateStatusText();
    renderBoard();
  }
}

function makeBotMove() {
  const chosenMove = getBotMoveForDifficulty();

  if (!chosenMove) {
    gameOver = true;
    statusElement.textContent = 'No legal black moves left. White wins!';
    renderBoard();
    return;
  }

  const fromRow = chosenMove.from.row;
  const fromCol = chosenMove.from.col;
  const toRow = chosenMove.to.row;
  const toCol = chosenMove.to.col;
  const targetPiece = board[toRow][toCol];

  movePiece(fromRow, fromCol, toRow, toCol);
  addMoveEntry(fromRow, fromCol, toRow, toCol, board[toRow][toCol], targetPiece);
  playMoveSound();
  isWhiteTurn = true;
  updateStatusText();

  if (!hasLegalMovesForColor('w')) {
    gameOver = true;
    statusElement.textContent = 'No legal white moves left. Black wins!';
  }

  renderBoard();
}

function renderBoard() {
  boardElement.innerHTML = '';

  const checkedKing = isKingInCheck('w') ? getKingPosition(board, 'w') : isKingInCheck('b') ? getKingPosition(board, 'b') : null;

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = document.createElement('button');
      square.type = 'button';
      square.className = 'square';
      square.setAttribute('role', 'gridcell');
      square.setAttribute('aria-label', `Row ${row + 1}, column ${String.fromCharCode(65 + col)}`);

      if ((row + col) % 2 === 0) {
        square.classList.add('light');
      } else {
        square.classList.add('dark');
      }

      if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
        square.classList.add('selected');
      }

      if (legalMoves.some((move) => move.row === row && move.col === col)) {
        square.classList.add('legal');
      }

      if (lastMove && ((lastMove.from.row === row && lastMove.from.col === col) || (lastMove.to.row === row && lastMove.to.col === col))) {
        square.classList.add('last-move');
      }

      if (checkedKing && checkedKing.row === row && checkedKing.col === col) {
        square.classList.add('in-check');
      }

      const piece = board[row][col];
      if (piece) {
        const pieceSymbol = document.createElement('span');
        pieceSymbol.textContent = pieceSymbols[piece];
        pieceSymbol.classList.add(getPieceColor(piece) === 'w' ? 'white-piece' : 'black-piece');
        square.appendChild(pieceSymbol);
      }

      square.addEventListener('click', () => handleSquareClick(row, col));
      boardElement.appendChild(square);
    }
  }
}

resetButton.addEventListener('click', resetGame);
difficultySelect.addEventListener('change', () => {
  if (!isWhiteTurn && !gameOver) {
    statusElement.textContent = 'Bot is thinking...';
  } else if (!gameOver) {
    statusElement.textContent = 'White to move';
  }
});
resetGame();
