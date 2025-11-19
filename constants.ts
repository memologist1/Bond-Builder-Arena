import { AtomType, AtomDef } from './types';

export const ATOM_DEFS: Record<AtomType, AtomDef> = {
  [AtomType.H]: { symbol: AtomType.H, valency: 1, color: '#06B6D4', radius: 20, mass: 1 }, // Cyan
  [AtomType.O]: { symbol: AtomType.O, valency: 2, color: '#EF4444', radius: 28, mass: 16 }, // Red
  [AtomType.N]: { symbol: AtomType.N, valency: 3, color: '#3B82F6', radius: 29, mass: 14 }, // Blue
  [AtomType.C]: { symbol: AtomType.C, valency: 4, color: '#1F2937', radius: 30, mass: 12 }, // Dark Grey
  [AtomType.Cl]: { symbol: AtomType.Cl, valency: 1, color: '#10B981', radius: 27, mass: 35 }, // Green
  [AtomType.S]: { symbol: AtomType.S, valency: 2, color: '#EAB308', radius: 29, mass: 32 }, // Yellow
  [AtomType.P]: { symbol: AtomType.P, valency: 3, color: '#F97316', radius: 30, mass: 31 }, // Orange
};

export const BOND_DISTANCE = 70;
export const BOND_STRENGTH = 0.1;
export const DRAG_FRICTION = 0.5;
export const WORLD_FRICTION = 0.98;
export const REPULSION_RADIUS = 50;
export const REPULSION_FORCE = 0.5;
export const GAME_DURATION = 120; // Seconds
export const SPAWN_INTERVAL = 2000; // ms