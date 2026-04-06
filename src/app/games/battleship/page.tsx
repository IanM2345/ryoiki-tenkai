'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession } from '@/lib/supabase';
import styles from './battleship.module.css';

type Difficulty = 'easy' | 'medium' | 'hard';
type GameStatus = 'idle' | 'placing' | 'playing' | 'won' | 'lost';
type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk';

const GRID = 10;
const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Destroyer', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Patrol Boat', size: 2 },
];
const TOTAL_HITS = SHIPS.reduce((a, s) => a + s.size, 0); // 17

type Grid = CellState[][];
type ShipPlacement = { row: number; col: number; size: number; horizontal: boolean };

function emptyGrid(): Grid {
  return Array.from({ length: GRID }, () => Array(GRID).fill('empty'));
}

function placeShipsRandomly(): { grid: Grid; placements: ShipPlacement[] } {
  const grid = emptyGrid();
  const placements: ShipPlacement[] = [];

  for (const ship of SHIPS) {
    let placed = false;
    while (!placed) {
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * (horizontal ? GRID : GRID - ship.size + 1));
      const col = Math.floor(Math.random() * (horizontal ? GRID - ship.size + 1 : GRID));
      let fits = true;
      for (let i = 0; i < ship.size; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;
        if (grid[r][c] !== 'empty') { fits = false; break; }
      }
      if (fits) {
        for (let i = 0; i < ship.size; i++) {
          const r = horizontal ? row : row + i;
          const c = horizontal ? col + i : col;
          grid[r][c] = 'ship';
        }
        placements.push({ row, col, size: ship.size, horizontal });
        placed = true;
      }
    }
  }
  return { grid, placements };
}

// --- AI targeting ---
type AIState = {
  mode: 'hunt' | 'target';
  hitStack: [number, number][];
  firstHit: [number, number] | null;
  direction: 'h' | 'v' | null;
  triedDirections: Set<string>;
  // Hard mode: probability heat map
  probMap: number[][];
};

function buildProbMap(oppFired: Set<string>, aiGrid: Grid): number[][] {
  const map: number[][] = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  for (const ship of SHIPS) {
    // Horizontal placements
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c <= GRID - ship.size; c++) {
        let valid = true;
        for (let i = 0; i < ship.size; i++) {
          const key = `${r}-${c+i}`;
          if (oppFired.has(key) && aiGrid[r][c+i] !== 'hit') { valid = false; break; }
        }
        if (valid) for (let i = 0; i < ship.size; i++) map[r][c+i]++;
      }
    }
    // Vertical placements
    for (let r = 0; r <= GRID - ship.size; r++) {
      for (let c = 0; c < GRID; c++) {
        let valid = true;
        for (let i = 0; i < ship.size; i++) {
          const key = `${r+i}-${c}`;
          if (oppFired.has(key) && aiGrid[r+i][c] !== 'hit') { valid = false; break; }
        }
        if (valid) for (let i = 0; i < ship.size; i++) map[r+i][c]++;
      }
    }
  }
  return map;
}

function aiShot(
  difficulty: Difficulty,
  aiState: AIState,
  playerGrid: Grid,
  fired: Set<string>
): [number, number] {
  const unfired = (): [number, number][] => {
    const cells: [number, number][] = [];
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (!fired.has(`${r}-${c}`)) cells.push([r, c]);
    return cells;
  };

  if (difficulty === 'easy') {
    const cells = unfired();
    return cells[Math.floor(Math.random() * cells.length)];
  }

  // Medium & Hard: finish off hits first
  if (aiState.mode === 'target' && aiState.hitStack.length > 0) {
    const [hr, hc] = aiState.hitStack[aiState.hitStack.length - 1];
    const dirs: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of dirs) {
      const nr = hr + dr; const nc = hc + dc;
      if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !fired.has(`${nr}-${nc}`)) {
        return [nr, nc];
      }
    }
  }

  if (difficulty === 'hard') {
    const prob = buildProbMap(fired, playerGrid);
    let best = -1;
    let bestCell: [number, number] = [0, 0];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!fired.has(`${r}-${c}`) && prob[r][c] > best) {
          best = prob[r][c]; bestCell = [r, c];
        }
      }
    }
    return bestCell;
  }

  // Medium fallback: random
  const cells = unfired();
  return cells[Math.floor(Math.random() * cells.length)];
}

export default function BattleshipPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [status, setStatus] = useState<GameStatus>('idle');

  // Player
  const [playerGrid, setPlayerGrid] = useState<Grid>(emptyGrid());
  const [playerFired, setPlayerFired] = useState<Set<string>>(new Set());
  const [playerHits, setPlayerHits] = useState(0);

  // Enemy (AI's ships, player fires here)
  const [enemyGrid, setEnemyGrid] = useState<Grid>(emptyGrid());
  const [enemyFired, setEnemyFired] = useState<Set<string>>(new Set());
  const [enemyHits, setEnemyHits] = useState(0);

  // Placement
  const [placingIdx, setPlacingIdx] = useState(0);
  const [placingH, setPlacingH] = useState(true);
  const [hoverCells, setHoverCells] = useState<Set<string>>(new Set());

  const [aiState, setAiState] = useState<AIState>({
    mode: 'hunt', hitStack: [], firstHit: null, direction: null,
    triedDirections: new Set(), probMap: [],
  });

  const [message, setMessage] = useState('');
  const [playerTurn, setPlayerTurn] = useState(true);
  const aiTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    async function init() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      setLoading(false);
    }
    init();
    return () => clearTimeout(aiTimeout.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startPlacing = useCallback(() => {
    setPlayerGrid(emptyGrid());
    setPlacingIdx(0);
    setPlacingH(true);
    setStatus('placing');
    setMessage(`Place your ${SHIPS[0].name} (${SHIPS[0].size} cells)`);
  }, []);

  const handlePlaceHover = (row: number, col: number) => {
    if (status !== 'placing') return;
    const ship = SHIPS[placingIdx];
    const cells = new Set<string>();
    let valid = true;
    for (let i = 0; i < ship.size; i++) {
      const r = placingH ? row : row + i;
      const c = placingH ? col + i : col;
      if (r >= GRID || c >= GRID || playerGrid[r][c] === 'ship') { valid = false; }
      cells.add(`${r}-${c}`);
    }
    setHoverCells(valid ? cells : new Set());
  };

  const handlePlaceClick = (row: number, col: number) => {
    if (status !== 'placing') return;
    const ship = SHIPS[placingIdx];
    // Validate
    let fits = true;
    for (let i = 0; i < ship.size; i++) {
      const r = placingH ? row : row + i;
      const c = placingH ? col + i : col;
      if (r >= GRID || c >= GRID || playerGrid[r][c] === 'ship') { fits = false; break; }
    }
    if (!fits) return;

    const next = playerGrid.map(r => [...r]) as Grid;
    for (let i = 0; i < ship.size; i++) {
      const r = placingH ? row : row + i;
      const c = placingH ? col + i : col;
      next[r][c] = 'ship';
    }
    setPlayerGrid(next);
    setHoverCells(new Set());

    const nextIdx = placingIdx + 1;
    if (nextIdx >= SHIPS.length) {
      // Done placing — set up enemy grid and start game
      const { grid: eg } = placeShipsRandomly();
      setEnemyGrid(eg);
      setPlayerFired(new Set());
      setEnemyFired(new Set());
      setPlayerHits(0);
      setEnemyHits(0);
      setAiState({ mode: 'hunt', hitStack: [], firstHit: null, direction: null, triedDirections: new Set(), probMap: [] });
      setPlayerTurn(true);
      setStatus('playing');
      setMessage('Your turn — fire at the enemy grid!');
    } else {
      setPlacingIdx(nextIdx);
      setMessage(`Place your ${SHIPS[nextIdx].name} (${SHIPS[nextIdx].size} cells)`);
    }
  };

  const handlePlayerFire = useCallback((row: number, col: number) => {
    if (!playerTurn || status !== 'playing') return;
    const key = `${row}-${col}`;
    if (playerFired.has(key)) return;

    const newFired = new Set(playerFired);
    newFired.add(key);
    setPlayerFired(newFired);

    const next = enemyGrid.map(r => [...r]) as Grid;
    let newHits = playerHits;
    if (next[row][col] === 'ship') {
      next[row][col] = 'hit';
      newHits++;
      setMessage('Hit! 💥');
    } else {
      next[row][col] = 'miss';
      setMessage('Miss…');
    }
    setEnemyGrid(next);
    setPlayerHits(newHits);

    if (newHits >= TOTAL_HITS) {
      setStatus('won');
      setMessage('🎉 All enemy ships sunk! You win!');
      return;
    }

    setPlayerTurn(false);

    // AI fires back
    aiTimeout.current = setTimeout(() => {
      setAiState(prevAI => {
        const firedSet = new Set(enemyFired);
        const [ar, ac] = aiShot(difficulty, prevAI, playerGrid, firedSet);
        const aKey = `${ar}-${ac}`;
        const newEnemyFired = new Set(firedSet);
        newEnemyFired.add(aKey);
        setEnemyFired(newEnemyFired);

        setPlayerGrid(pg => {
          const pgNext = pg.map(r => [...r]) as Grid;
          let newEHits = enemyHits;
          let nextAI = { ...prevAI };

          if (pgNext[ar][ac] === 'ship') {
            pgNext[ar][ac] = 'hit';
            newEHits++;
            setMessage("AI hit your ship! 💥");
            nextAI = { ...prevAI, mode: 'target', hitStack: [...prevAI.hitStack, [ar, ac]], firstHit: prevAI.firstHit ?? [ar, ac] };
          } else {
            pgNext[ar][ac] = 'miss';
            setMessage("AI missed — your turn!");
            // If we had a hitStack but missed, pop it
            const newStack = prevAI.hitStack.slice(0, -1);
            nextAI = { ...prevAI, hitStack: newStack, mode: newStack.length > 0 ? 'target' : 'hunt' };
          }

          setEnemyHits(newEHits);

          if (newEHits >= TOTAL_HITS) {
            setStatus('lost');
            setMessage('💀 All your ships were sunk. You lost.');
          } else {
            setPlayerTurn(true);
          }
          return pgNext;
        });
        return { ...prevAI };
      });
    }, 700);
  }, [playerTurn, status, playerFired, enemyGrid, playerHits, enemyFired, enemyHits, playerGrid, difficulty]);

  if (loading) return <div className={styles.loading}><div className={styles.dot} /></div>;

  // Returns extra CSS classes for a player-grid cell (no inline styles)
  function playerCellClass(cell: CellState, hover: boolean): string {
    if (hover) return styles.cellHover;
    if (cell === 'hit')  return styles.cellHit;
    if (cell === 'miss') return styles.cellMiss;
    if (cell === 'ship') return styles.cellShip;
    return '';
  }

  // Returns extra CSS classes for an enemy-grid cell
  function enemyCellClass(cell: CellState, showShip: boolean, canFire: boolean): string {
    const classes: string[] = [];
    if (cell === 'hit')              classes.push(styles.cellHit);
    else if (cell === 'miss')        classes.push(styles.cellMiss);
    else if (showShip)               classes.push(styles.cellShip);
    if (canFire)                     classes.push(styles.cellCanFire);
    return classes.join(' ');
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => router.push('/games')}>← arcade</button>
        {(status === 'playing' || status === 'won' || status === 'lost') && (
          <div className={styles.hitCount}>
            <span>You: {playerHits}/{TOTAL_HITS} hits</span>
            <span>AI: {enemyHits}/{TOTAL_HITS} hits</span>
          </div>
        )}
      </div>

      <h1 className={styles.title}>Battleship</h1>

      {status === 'idle' && (
        <div className={styles.setup}>
          <p className={styles.setupLabel}>choose difficulty</p>
          <div className={styles.diffRow}>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                className={`${styles.diffBtn} ${difficulty === d ? styles.diffBtnActive : ''}`}
                onClick={() => setDifficulty(d)}
              >
                {d}
                <span className={styles.diffHint}>
                  {d === 'easy' ? 'random shots' : d === 'medium' ? 'hunts hits' : 'probability map'}
                </span>
              </button>
            ))}
          </div>
          <button className={styles.startBtn} onClick={startPlacing}>place ships</button>
        </div>
      )}

      {(status === 'placing' || status === 'playing' || status === 'won' || status === 'lost') && (
        <>
          <div className={styles.messageBar}>
            {message}
            {status === 'placing' && (
              <button
                className={styles.rotateBtn}
                onClick={() => setPlacingH(h => !h)}
              >
                rotate ({placingH ? 'horizontal' : 'vertical'})
              </button>
            )}
          </div>

          <div className={styles.gridsWrap}>
            {/* Player grid */}
            <div className={styles.gridSection}>
              <p className={styles.gridLabel}>your fleet</p>
              <div className={styles.grid}>
                {Array.from({ length: GRID }, (_, r) =>
                  Array.from({ length: GRID }, (_, c) => {
                    const cell = playerGrid[r][c];
                    const hover = hoverCells.has(`${r}-${c}`);
                    return (
                      <button
                        key={`p-${r}-${c}`}
                        className={`${styles.cell} ${playerCellClass(cell, hover)}`}
                        onClick={() => handlePlaceClick(r, c)}
                        onMouseEnter={() => handlePlaceHover(r, c)}
                        onMouseLeave={() => setHoverCells(new Set())}
                        aria-label={`Row ${r + 1}, column ${c + 1}${cell === 'ship' ? ' — ship' : ''}`}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {/* Ship legend */}
            {status === 'placing' && (
              <div className={styles.shipLegend}>
                {SHIPS.map(ship => (
                  <div key={ship.name} className={styles.legendRow}>
                    <div className={styles.legendShip} style={{ width: ship.size * 16 + 'px' }} />
                    <span className={styles.legendName}>{ship.name} ({ship.size})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Enemy grid */}
            {(status === 'playing' || status === 'won' || status === 'lost') && (
              <div className={styles.gridSection}>
                <p className={styles.gridLabel}>enemy waters</p>
                <div className={styles.grid}>
                  {Array.from({ length: GRID }, (_, r) =>
                    Array.from({ length: GRID }, (_, c) => {
                      const cell = enemyGrid[r][c];
                      const fired = playerFired.has(`${r}-${c}`);
                      const canFire = playerTurn && status === 'playing' && !fired;
                      const showShip = cell === 'hit' || (cell === 'ship' && status !== 'playing');
                      return (
                        <button
                          key={`e-${r}-${c}`}
                          className={`${styles.cell} ${enemyCellClass(cell, showShip, canFire)}`}
                          onClick={() => handlePlayerFire(r, c)}
                          disabled={!canFire && status === 'playing'}
                          aria-label={`Fire at row ${r + 1}, column ${c + 1}${fired ? ' — already fired' : ''}`}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {(status === 'won' || status === 'lost') && (
            <div className={styles.actions}>
              <button className={styles.startBtn} onClick={startPlacing}>play again</button>
              <button className={styles.diffChange} onClick={() => setStatus('idle')}>change difficulty</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}