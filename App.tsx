import React, { useState, useEffect, useRef } from 'react';
import Arena, { ArenaHandle } from './components/Arena';
import { GameStats, MoleculeResult } from './types';
import { GAME_DURATION } from './constants';
import { getLevelChallenge, getRecipeHint } from './services/geminiService';
import { playSound } from './utils/audio';

const App: React.FC = () => {
  const [gameActive, setGameActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    moleculesBuilt: 0,
    timeLeft: GAME_DURATION,
    gameOver: false
  });
  const [highScore, setHighScore] = useState(0);
  const [lastMolecule, setLastMolecule] = useState<MoleculeResult | null>(null);
  const [mission, setMission] = useState<string>("Initialize the reaction chamber.");
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  
  const arenaRef = useRef<ArenaHandle>(null);

  useEffect(() => {
    const stored = localStorage.getItem('bondBuilderHighScore');
    if (stored) {
      setHighScore(parseInt(stored, 10));
    }
  }, []);

  useEffect(() => {
    if (stats.score > highScore) {
        setHighScore(stats.score);
        localStorage.setItem('bondBuilderHighScore', stats.score.toString());
    }
  }, [stats.score, highScore]);

  // Clear mission after 10 seconds
  useEffect(() => {
    if (mission) {
      const timer = setTimeout(() => {
        setMission("");
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [mission]);

  useEffect(() => {
    let timer: number;
    if (gameActive && stats.timeLeft > 0) {
      timer = window.setInterval(() => {
        setStats(prev => {
          if (prev.timeLeft <= 1) {
            setGameActive(false);
            return { ...prev, timeLeft: 0, gameOver: true };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameActive, stats.timeLeft]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameActive && (e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        arenaRef.current?.undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameActive]);

  const startGame = async () => {
    setLoading(true);
    setStats({ score: 0, moleculesBuilt: 0, timeLeft: GAME_DURATION, gameOver: false });
    setLastMolecule(null);
    setHint(null);
    playSound('levelUp');
    
    // Gemini Challenge
    const challenge = await getLevelChallenge(1);
    setMission(challenge);
    
    setLoading(false);
    setGameActive(true);
  };

  const handleScore = (points: number) => {
    setStats(prev => ({
      ...prev,
      score: prev.score + points,
      moleculesBuilt: prev.moleculesBuilt + 1
    }));
  };

  const handleMoleculeFormed = (molecule: MoleculeResult) => {
    setLastMolecule(molecule);
    // Clear after 8 seconds
    setTimeout(() => {
      setLastMolecule(prev => prev === molecule ? null : prev);
    }, 8000);
  };

  const handleError = (msg: string) => {
      setHint(msg);
      // Vibrate if on mobile
      if (navigator.vibrate) navigator.vibrate(200);
      setTimeout(() => setHint(null), 2000);
  };

  const requestUndo = () => {
    arenaRef.current?.undo();
  };

  const requestHint = async () => {
    if (!arenaRef.current || hintLoading) return;
    setHintLoading(true);
    setHint("Analyzing atoms...");
    
    const atoms = arenaRef.current.getAtomTypes();
    const hintText = await getRecipeHint(atoms);
    
    setHint(hintText);
    setHintLoading(false);
    
    // Clear hint after 4 seconds
    setTimeout(() => {
      setHint(prev => prev === hintText ? null : prev);
    }, 4000);
  };

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col text-white relative font-sans select-none">
      {/* HUD */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-20 pointer-events-none">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-cyan-400 tracking-wider drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
            BOND BUILDER
          </h1>
          <div className="text-xl font-bold text-white">
            SCORE: <span className="text-yellow-400">{stats.score}</span>
          </div>
          <div className="text-sm text-slate-400 font-display">
            HIGH SCORE: {highScore}
          </div>
        </div>

        <div className="flex flex-col items-center">
           <div className={`text-4xl font-display font-bold ${stats.timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
             {stats.timeLeft}s
           </div>
           <div className="text-xs text-slate-400 tracking-widest">TIME REMAINING</div>
        </div>

        <div className="flex flex-col items-end gap-1">
           <div className="text-xl font-bold text-white">
             MOLECULES: <span className="text-green-400">{stats.moleculesBuilt}</span>
           </div>
        </div>
      </div>

      {/* Mission / Hints */}
      <div className="absolute top-24 left-0 w-full flex flex-col items-center z-10 pointer-events-none">
        {mission && gameActive && (
             <div className="bg-black/50 backdrop-blur-sm px-6 py-2 rounded-full border border-slate-700 text-cyan-200 text-sm mb-2">
                MISSION: {mission}
             </div>
        )}
        {hint && (
            <div className="animate-bounce bg-blue-600/90 text-white px-6 py-3 rounded-xl font-bold shadow-lg border border-blue-400/50">
                {hint}
            </div>
        )}
      </div>

      {/* Controls */}
      {gameActive && (
        <div className="absolute bottom-8 w-full px-6 flex justify-between items-end z-30 pointer-events-none">
            <button 
              onClick={requestUndo}
              className="pointer-events-auto group flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-yellow-400 px-6 py-4 rounded-full border-2 border-slate-600 hover:border-yellow-400 transition-all active:scale-95 shadow-lg backdrop-blur-sm"
            >
              <span className="text-2xl font-bold">↶</span>
              <span className="font-display text-sm tracking-wider">UNDO</span>
            </button>

            <button 
              onClick={requestHint}
              disabled={hintLoading}
              className="pointer-events-auto group flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 text-cyan-400 px-6 py-4 rounded-full border-2 border-slate-600 hover:border-cyan-400 transition-all active:scale-95 shadow-lg backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="font-display text-sm tracking-wider">{hintLoading ? 'THINKING...' : 'HINT'}</span>
              <span className="text-2xl">💡</span>
            </button>
        </div>
      )}

      {/* Molecule Card */}
      {lastMolecule && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-[slideUp_0.5s_ease-out]">
           <div className="bg-slate-800/90 backdrop-blur-md border border-cyan-500/50 p-6 rounded-2xl text-center shadow-[0_0_30px_rgba(6,182,212,0.3)] max-w-md">
              <h2 className="text-3xl font-display text-cyan-400 mb-1">{lastMolecule.formula}</h2>
              <h3 className="text-xl font-bold text-white mb-2">{lastMolecule.name}</h3>
              <p className="text-slate-300 text-sm italic">"{lastMolecule.fact}"</p>
              <div className="mt-2 text-yellow-400 font-bold text-sm">+100 POINTS</div>
           </div>
        </div>
      )}

      {/* Menus */}
      {(!gameActive && !stats.gameOver) && (
         <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm">
            <div className="text-center">
               <h1 className="font-display text-6xl text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-blue-600 mb-2 drop-shadow-lg">
                 BOND BUILDER
               </h1>
               <p className="text-slate-400 mb-8 tracking-widest uppercase text-sm">Arena</p>
               
               <div className="mb-8">
                 <div className="text-slate-500 text-sm font-display mb-1">BEST SCORE</div>
                 <div className="text-4xl text-yellow-400 font-display">{highScore}</div>
               </div>

               <button 
                 onClick={startGame}
                 disabled={loading}
                 className="group relative px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-display font-bold text-xl rounded-full transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(6,182,212,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {loading ? "INITIALIZING..." : "START REACTION"}
                 <div className="absolute inset-0 rounded-full ring-2 ring-white/20 group-hover:ring-white/40 transition-all"></div>
               </button>
               
               <div className="mt-8 grid grid-cols-3 gap-4 text-xs text-slate-500">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
                    <span>Hydrogen (1)</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span>Oxygen (2)</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span>Nitrogen (3)</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-gray-700"></div>
                    <span>Carbon (4)</span>
                  </div>
                   <div className="flex flex-col items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span>Chlorine (1)</span>
                  </div>
                   <div className="flex flex-col items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span>Sulfur (2)</span>
                  </div>
               </div>
            </div>
         </div>
      )}

      {stats.gameOver && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-red-900/90 backdrop-blur-md">
             <div className="text-center animate-[popIn_0.5s_cubic-bezier(0.175,0.885,0.32,1.275)]">
                <h2 className="font-display text-5xl text-white mb-2">REACTION ENDED</h2>
                <div className="text-6xl font-bold text-yellow-400 mb-2">{stats.score}</div>
                <div className="text-slate-300 mb-8">MOLECULES: {stats.moleculesBuilt}</div>

                {stats.score >= highScore && stats.score > 0 && (
                    <div className="mb-8 animate-bounce">
                        <span className="px-4 py-1 bg-yellow-500 text-black font-bold rounded-full text-sm">NEW HIGH SCORE!</span>
                    </div>
                )}

                <button 
                 onClick={startGame}
                 disabled={loading}
                 className="px-8 py-3 bg-white text-red-900 hover:bg-gray-200 font-display font-bold text-xl rounded-full transition-all hover:scale-105 shadow-xl"
               >
                 PLAY AGAIN
               </button>
             </div>
          </div>
      )}

      <Arena 
        ref={arenaRef}
        gameActive={gameActive}
        onScoreUpdate={handleScore}
        onMoleculeFormed={handleMoleculeFormed}
        onGameOver={() => setStats(prev => ({ ...prev, gameOver: true }))}
        onError={handleError}
      />
      
      {/* Global Styles for Animations */}
      <style>{`
        @keyframes slideUp {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes popIn {
            from { opacity: 0; transform: scale(0.8); }
            to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default App;