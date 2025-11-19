import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { AtomEntity, BondEntity, Particle, AtomType, MoleculeResult } from '../types';
import { ATOM_DEFS, BOND_DISTANCE, BOND_STRENGTH, WORLD_FRICTION, REPULSION_FORCE } from '../constants';
import { identifyMoleculeWithGemini } from '../services/geminiService';
import { playSound } from '../utils/audio';

export interface ArenaHandle {
  undo: () => void;
  getAtomTypes: () => AtomType[];
}

interface ArenaProps {
  gameActive: boolean;
  onScoreUpdate: (points: number) => void;
  onMoleculeFormed: (molecule: MoleculeResult) => void;
  onGameOver: () => void;
  onError: (msg: string) => void;
}

const Arena = forwardRef<ArenaHandle, ArenaProps>(({ gameActive, onScoreUpdate, onMoleculeFormed, onGameOver, onError }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game State Refs (Mutable for performance)
  const atomsRef = useRef<AtomEntity[]>([]);
  const bondsRef = useRef<BondEntity[]>([]);
  const bondHistoryRef = useRef<string[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const requestRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const draggedAtomRef = useRef<string | null>(null);
  const mouseRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  
  // Tracks which pairs have been bonded during the current drag operation
  // This prevents "instant filling" of all bonds. User must click/drag again to add a double bond.
  const dragSessionBondedPairsRef = useRef<Set<string>>(new Set());

  // Helper to create ID
  const uuid = () => Math.random().toString(36).substr(2, 9);

  const createExplosion = (x: number, y: number, color: string, isShatter = false) => {
    const count = isShatter ? 20 : 15;
    const speed = isShatter ? 15 : 10;
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: uuid(),
        x, y,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        life: 1.0,
        maxLife: 1.0,
        color: isShatter ? (Math.random() > 0.5 ? '#EF4444' : '#FFFFFF') : color,
        size: Math.random() * 5 + 2
      });
    }
  };

  // Expose Undo Logic and State Access
  useImperativeHandle(ref, () => ({
    undo: () => {
        // Try to pop from history until we find a bond that still exists in the world
        while (bondHistoryRef.current.length > 0) {
            const lastBondId = bondHistoryRef.current.pop();
            const bondIndex = bondsRef.current.findIndex(b => b.id === lastBondId);
            
            if (bondIndex !== -1 && lastBondId) {
                const bond = bondsRef.current[bondIndex];
                const a1 = atomsRef.current.find(a => a.id === bond.atom1Id);
                const a2 = atomsRef.current.find(a => a.id === bond.atom2Id);

                // Decrement bonds
                if (a1) a1.currentBonds = Math.max(0, a1.currentBonds - 1);
                if (a2) a2.currentBonds = Math.max(0, a2.currentBonds - 1);

                // Remove bond
                bondsRef.current.splice(bondIndex, 1);

                // Visual feedback for undo
                if (a1 && a2) {
                    createExplosion((a1.x + a2.x)/2, (a1.y + a2.y)/2, '#F59E0B'); // Orange spark
                }
                return; // Successfully undid one action
            }
            // If bond not found (likely removed by molecule completion), loop continues to previous action
        }
    },
    getAtomTypes: () => {
        return atomsRef.current.map(a => a.type);
    }
  }));

  const spawnAtom = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    
    // Weighted Spawn Chances
    const types = [
        AtomType.H, AtomType.H, AtomType.H, 
        AtomType.O, AtomType.O, 
        AtomType.C, AtomType.C,
        AtomType.N, 
        AtomType.Cl, 
        AtomType.S, 
        AtomType.P
    ];
    
    const type = types[Math.floor(Math.random() * types.length)];
    const def = ATOM_DEFS[type];

    // Random edge spawn
    let x, y;
    if (Math.random() > 0.5) {
        x = Math.random() > 0.5 ? -def.radius : width + def.radius;
        y = Math.random() * height;
    } else {
        x = Math.random() * width;
        y = Math.random() > 0.5 ? -def.radius : height + def.radius;
    }

    const atom: AtomEntity = {
      id: uuid(),
      type,
      x,
      y,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      currentBonds: 0,
      bondedAtomIds: [],
      isDragging: false,
      fxScale: 0
    };
    atomsRef.current.push(atom);
  }, []);

  // Core Game Loop
  const update = (time: number) => {
    if (!gameActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Spawning
    if (time - lastSpawnRef.current > 1500 && atomsRef.current.length < 18) {
      spawnAtom();
      lastSpawnRef.current = time;
    }

    // 2. Physics
    atomsRef.current.forEach(atom => {
      const def = ATOM_DEFS[atom.type];

      if (atom.isDragging) {
        // Follow mouse with some lag/spring
        const dx = mouseRef.current.x - atom.x;
        const dy = mouseRef.current.y - atom.y;
        atom.vx = dx * 0.2;
        atom.vy = dy * 0.2;
      } else {
        // Wall bouncing
        if (atom.x < def.radius) { atom.x = def.radius; atom.vx *= -1; }
        if (atom.x > width - def.radius) { atom.x = width - def.radius; atom.vx *= -1; }
        if (atom.y < def.radius) { atom.y = def.radius; atom.vy *= -1; }
        if (atom.y > height - def.radius) { atom.y = height - def.radius; atom.vy *= -1; }
        
        // Friction
        atom.vx *= WORLD_FRICTION;
        atom.vy *= WORLD_FRICTION;
      }

      // Apply velocity
      atom.x += atom.vx;
      atom.y += atom.vy;

      // Grow effect
      if (atom.fxScale < 1) atom.fxScale += 0.05;
    });

    // 3. Repulsion (prevent overlap) & Attraction (Bonds)
    // Simple constraints
    for (let i = 0; i < atomsRef.current.length; i++) {
      for (let j = i + 1; j < atomsRef.current.length; j++) {
        const a = atomsRef.current[i];
        const b = atomsRef.current[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const isBonded = bondsRef.current.some(bond => 
          (bond.atom1Id === a.id && bond.atom2Id === b.id) || 
          (bond.atom1Id === b.id && bond.atom2Id === a.id)
        );

        if (isBonded) {
            // Spring force to maintain bond distance
            const offset = dist - BOND_DISTANCE;
            const force = offset * BOND_STRENGTH;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            if (!a.isDragging) { a.vx += fx / ATOM_DEFS[a.type].mass; a.vy += fy / ATOM_DEFS[a.type].mass; }
            if (!b.isDragging) { b.vx -= fx / ATOM_DEFS[b.type].mass; b.vy -= fy / ATOM_DEFS[b.type].mass; }

        } else {
            // Repulsion
            const minDist = ATOM_DEFS[a.type].radius + ATOM_DEFS[b.type].radius + 10;
            if (dist < minDist && dist > 0) {
                const force = (minDist - dist) * REPULSION_FORCE;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                if (!a.isDragging) { a.vx -= fx; a.vy -= fy; }
                if (!b.isDragging) { b.vx += fx; b.vy += fy; }
            }
        }
      }
    }

    // 4. Bond Attempt (Interaction)
    if (draggedAtomRef.current) {
      const dragger = atomsRef.current.find(a => a.id === draggedAtomRef.current);
      if (dragger) {
        const draggerDef = ATOM_DEFS[dragger.type];
        // Only bond if we have capacity
        if (dragger.currentBonds < draggerDef.valency) {
          // Find closest capable neighbor
          const neighbor = atomsRef.current.find(target => {
            if (target.id === dragger.id) return false;
            const targetDef = ATOM_DEFS[target.type];
            if (target.currentBonds >= targetDef.valency) return false;
            
            const dx = target.x - dragger.x;
            const dy = target.y - dragger.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Check if we have already created a bond with this specific atom DURING THIS DRAG session
            // We allow multiple bonds (Double/Triple), but require a new drag/click interaction for each one.
            const pairKey = [dragger.id, target.id].sort().join('-');
            const bondedInThisSession = dragSessionBondedPairsRef.current.has(pairKey);

            return dist < (BOND_DISTANCE + 10) && !bondedInThisSession;
          });

          if (neighbor) {
            const bondId = uuid();
            
            // Mark this pair as having bonded in this interaction
            const pairKey = [dragger.id, neighbor.id].sort().join('-');
            dragSessionBondedPairsRef.current.add(pairKey);

            // Create Bond
            bondsRef.current.push({
              id: bondId,
              atom1Id: dragger.id,
              atom2Id: neighbor.id,
              stress: 0
            });
            // Track history
            bondHistoryRef.current.push(bondId);

            dragger.currentBonds++;
            neighbor.currentBonds++;
            
            // Visual feedback
            playSound('pop');
            createExplosion((dragger.x + neighbor.x)/2, (dragger.y + neighbor.y)/2, '#FFF');
            
            // Check for Molecule Completion
            checkMolecules();
          }
        }
      }
    }

    // 5. Particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      p.size *= 0.95;
    });

    // 6. Render
    ctx.clearRect(0, 0, width, height);

    // Group bonds by pair to handle multiple bonds (Double/Triple)
    const bondGroups: Record<string, BondEntity[]> = {};
    bondsRef.current.forEach(bond => {
        const key = [bond.atom1Id, bond.atom2Id].sort().join('-');
        if (!bondGroups[key]) bondGroups[key] = [];
        bondGroups[key].push(bond);
    });

    // Draw Bonds
    ctx.lineWidth = 4;
    Object.values(bondGroups).forEach(group => {
        const count = group.length;
        group.forEach((bond, index) => {
            const a1 = atomsRef.current.find(a => a.id === bond.atom1Id);
            const a2 = atomsRef.current.find(a => a.id === bond.atom2Id);
            if (a1 && a2) {
                let offsetX = 0;
                let offsetY = 0;
                
                // Calculate parallel lines offset if multiple bonds exist
                if (count > 1) {
                    const dx = a2.x - a1.x;
                    const dy = a2.y - a1.y;
                    const len = Math.sqrt(dx*dx + dy*dy) || 1;
                    // Perpendicular vector
                    const perpX = -dy / len;
                    const perpY = dx / len;
                    
                    const spacing = 8;
                    const offset = (index - (count - 1) / 2) * spacing;
                    offsetX = perpX * offset;
                    offsetY = perpY * offset;
                }

                ctx.beginPath();
                ctx.strokeStyle = `rgba(255, 255, 255, 0.6)`;
                ctx.moveTo(a1.x + offsetX, a1.y + offsetY);
                ctx.lineTo(a2.x + offsetX, a2.y + offsetY);
                ctx.stroke();
                
                // Valence representation (dots on bond)
                ctx.fillStyle = '#fff';
                const midX = (a1.x + a2.x)/2 + offsetX;
                const midY = (a1.y + a2.y)/2 + offsetY;
                ctx.beginPath();
                ctx.arc(midX, midY, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    });

    // Draw Atoms
    atomsRef.current.forEach(atom => {
      const def = ATOM_DEFS[atom.type];
      // Wobble effect
      const wobble = Math.sin(Date.now() / 200 + atom.id.charCodeAt(0)) * 1.5;
      const r = (def.radius * atom.fxScale) + (atom.isDragging ? 2 : 0);
      
      // Glow
      const gradient = ctx.createRadialGradient(atom.x, atom.y, r * 0.2, atom.x, atom.y, r);
      gradient.addColorStop(0, def.color);
      gradient.addColorStop(1, '#000000');

      ctx.save();
      // Bond snap scaling
      if (atom.fxScale > 1.1) atom.fxScale -= 0.02;

      ctx.translate(wobble, wobble);

      ctx.beginPath();
      ctx.arc(atom.x, atom.y, r, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Symbol
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${14 * atom.fxScale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.symbol, atom.x, atom.y);

      // Valency dots (Available)
      const remaining = def.valency - atom.currentBonds;
      for(let i=0; i<remaining; i++) {
        const angle = (Date.now() / 500) + (i * (Math.PI * 2 / remaining));
        const dx = Math.cos(angle) * (r + 8);
        const dy = Math.sin(angle) * (r + 8);
        ctx.beginPath();
        ctx.arc(atom.x + dx, atom.y + dy, 3, 0, Math.PI*2);
        ctx.fillStyle = '#FFFF00';
        ctx.fill();
      }
      ctx.restore();
    });

    // Draw Particles
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });

    requestRef.current = requestAnimationFrame(() => update(Date.now()));
  };

  // Detect Stable Molecules (Connected Graphs where all nodes have full valency)
  const checkMolecules = async () => {
    const visited = new Set<string>();
    const toRemoveAtoms: string[] = [];

    for (const atom of atomsRef.current) {
      if (visited.has(atom.id)) continue;
      
      // BFS to find connected component
      const component: AtomEntity[] = [];
      const queue = [atom];
      visited.add(atom.id);
      
      let isStable = true;

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        
        const def = ATOM_DEFS[current.type];
        if (current.currentBonds !== def.valency) {
          isStable = false;
        }

        const neighbors = bondsRef.current
          .filter(b => b.atom1Id === current.id || b.atom2Id === current.id)
          .map(b => b.atom1Id === current.id ? b.atom2Id : b.atom1Id);
        
        for (const nid of neighbors) {
          const nAtom = atomsRef.current.find(a => a.id === nid);
          if (nAtom && !visited.has(nAtom.id)) {
            visited.add(nAtom.id);
            queue.push(nAtom);
          }
        }
      }

      // If component is stable and has at least 2 atoms
      if (isStable && component.length > 1) {
        playSound('success');
        // Calculate Score
        const points = component.length * 100;
        onScoreUpdate(points);

        // Composition
        const composition: Record<string, number> = {};
        component.forEach(a => {
          composition[a.type] = (composition[a.type] || 0) + 1;
          a.fxScale = 1.5; // Pop effect before disappearing
          createExplosion(a.x, a.y, ATOM_DEFS[a.type].color);
        });

        // Remove from world
        component.forEach(a => toRemoveAtoms.push(a.id));
        
        // Identify async (Gemini)
        identifyMoleculeWithGemini(composition).then(res => {
            if(res) onMoleculeFormed(res);
        });
      }
    }

    if (toRemoveAtoms.length > 0) {
      // Filter out atoms and bonds
      atomsRef.current = atomsRef.current.filter(a => !toRemoveAtoms.includes(a.id));
      bondsRef.current = bondsRef.current.filter(b => 
        !toRemoveAtoms.includes(b.atom1Id) && !toRemoveAtoms.includes(b.atom2Id)
      );
      
      // Reset dragged if it was removed
      if (draggedAtomRef.current && toRemoveAtoms.includes(draggedAtomRef.current)) {
        draggedAtomRef.current = null;
      }
    }
  };

  // Input Handling
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseRef.current = { x, y };

    // Find clicked atom
    const clicked = atomsRef.current.find(a => {
      const dx = a.x - x;
      const dy = a.y - y;
      return dx*dx + dy*dy < (ATOM_DEFS[a.type].radius + 10)**2;
    });

    if (clicked) {
      draggedAtomRef.current = clicked.id;
      clicked.isDragging = true;
      clicked.vx = 0; 
      clicked.vy = 0;
      // Clear drag session tracking to allow new bonds for this interaction
      dragSessionBondedPairsRef.current.clear();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    mouseRef.current = { 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top 
    };
  };

  const handlePointerUp = () => {
    if (draggedAtomRef.current) {
      const atom = atomsRef.current.find(a => a.id === draggedAtomRef.current);
      if (atom) {
        atom.isDragging = false;
        
        // Check for INVALID bond attempt (The "Shatter" logic)
        // We check if there are NO bonds at all between these two nearby atoms
        const nearby = atomsRef.current.find(target => {
            if (target.id === atom.id) return false;
            const dx = target.x - atom.x;
            const dy = target.y - atom.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            return dist < (BOND_DISTANCE + 20);
        });

        if (nearby) {
             const isBonded = bondsRef.current.some(b => 
              (b.atom1Id === atom.id && b.atom2Id === nearby.id) || 
              (b.atom1Id === nearby.id && b.atom2Id === atom.id)
            );

            // Only shatter if NO bonds exist (pure failure)
            if (!isBonded) {
                // TRIGGER "SHATTER" FEEDBACK for failed bond
                playSound('shatter');
                
                const dx = atom.x - nearby.x;
                const dy = atom.y - nearby.y;
                const angle = Math.atan2(dy, dx);
                
                // Violent repulsion (Shatter physics)
                atom.vx = Math.cos(angle) * 20; // Strong recoil
                atom.vy = Math.sin(angle) * 20;
                nearby.vx = -Math.cos(angle) * 10;
                nearby.vy = -Math.sin(angle) * 10;

                // Visual shatter effect
                createExplosion((atom.x + nearby.x)/2, (atom.y + nearby.y)/2, '#FFFFFF', true);
                
                // Hint Logic
                const targetDef = ATOM_DEFS[nearby.type];
                const atomDef = ATOM_DEFS[atom.type];
                
                if (targetDef.valency === nearby.currentBonds) {
                    onError(`${targetDef.symbol} is full! (Max ${targetDef.valency})`);
                } else if (atomDef.valency === atom.currentBonds) {
                     onError(`${atomDef.symbol} is full!`);
                } else {
                    onError("Bond blocked or invalid!");
                }
            } else {
                // Just a normal fling if not close to anything
                 atom.vx = (Math.random() - 0.5) * 2; 
                 atom.vy = (Math.random() - 0.5) * 2;
            }
        }
      }
      draggedAtomRef.current = null;
    }
  };

  useEffect(() => {
    if (containerRef.current && canvasRef.current) {
      canvasRef.current.width = containerRef.current.offsetWidth;
      canvasRef.current.height = containerRef.current.offsetHeight;
    }
    requestRef.current = requestAnimationFrame(() => update(Date.now()));
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameActive]);

  // Reset logic
  useEffect(() => {
      if (!gameActive) {
          atomsRef.current = [];
          bondsRef.current = [];
          particlesRef.current = [];
          bondHistoryRef.current = [];
          dragSessionBondedPairsRef.current.clear();
      }
  }, [gameActive]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden touch-none">
      <canvas
        ref={canvasRef}
        className="block cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
});

export default Arena;