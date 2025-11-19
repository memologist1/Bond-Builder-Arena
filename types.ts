export enum AtomType {
  H = 'H',
  O = 'O',
  N = 'N',
  C = 'C',
  Cl = 'Cl',
  S = 'S',
  P = 'P'
}

export interface AtomDef {
  symbol: AtomType;
  valency: number;
  color: string;
  radius: number;
  mass: number;
}

export interface AtomEntity {
  id: string;
  type: AtomType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  currentBonds: number;
  bondedAtomIds: string[];
  isDragging: boolean;
  fxScale: number; // For spawn/bond animation
}

export interface BondEntity {
  id: string;
  atom1Id: string;
  atom2Id: string;
  stress: number; // Visual stress on bond
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface MoleculeResult {
  name: string;
  formula: string;
  fact: string;
}

export interface GameStats {
  score: number;
  moleculesBuilt: number;
  timeLeft: number;
  gameOver: boolean;
}