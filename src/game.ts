import * as THREE from "three";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const CELL = 4;
const WALL_H = 3.5;
const WALL_THICK = 0.3;
const MOVE_SPEED = 5;
const SPRINT_SPEED = 8;
const LOOK_SENS = 0.002;
const PICKUP_RANGE = 2.5;
const DOOR_RANGE = 3;
const ENEMY_SPEED = 3.5;
const ENEMY_CHASE_RANGE = 22;
const MAZE_W = 12;
const MAZE_H = 12;

// ─── MAZE GENERATION (recursive backtracker) ──────────────────────────────
type Cell = { x: number; z: number; walls: [boolean, boolean, boolean, boolean]; visited: boolean };

function generateMaze(w: number, h: number): Cell[][] {
  const grid: Cell[][] = [];
  for (let z = 0; z < h; z++) {
    grid[z] = [];
    for (let x = 0; x < w; x++) {
      grid[z][x] = { x, z, walls: [true, true, true, true], visited: false };
    }
  }
  const stack: Cell[] = [];
  const start = grid[0][0];
  start.visited = true;
  stack.push(start);
  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const neighbors: { cell: Cell; dir: number }[] = [];
    const dirs = [
      { dx: 0, dz: -1, dir: 0 },
      { dx: 1, dz: 0, dir: 1 },
      { dx: 0, dz: 1, dir: 2 },
      { dx: -1, dz: 0, dir: 3 },
    ];
    for (const d of dirs) {
      const nx = cur.x + d.dx;
      const nz = cur.z + d.dz;
      if (nx >= 0 && nx < w && nz >= 0 && nz < h && !grid[nz][nx].visited) {
        neighbors.push({ cell: grid[nz][nx], dir: d.dir });
      }
    }
    if (neighbors.length > 0) {
      const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
      const opposite = [2, 3, 0, 1];
      cur.walls[chosen.dir] = false;
      chosen.cell.walls[opposite[chosen.dir]] = false;
      chosen.cell.visited = true;
      stack.push(chosen.cell);
    } else {
      stack.pop();
    }
  }
  // Remove extra walls for loops
  for (let i = 0; i < Math.floor(w * h * 0.1); i++) {
    const x = Math.floor(Math.random() * (w - 1));
    const z = Math.floor(Math.random() * (h - 1));
    const dir = Math.floor(Math.random() * 2);
    if (dir === 0) {
      grid[z][x].walls[1] = false;
      grid[z][x + 1].walls[3] = false;
    } else {
      grid[z][x].walls[2] = false;
      grid[z + 1][x].walls[0] = false;
    }
  }
  return grid;
}

// ─── AUDIO ENGINE ─────────────────────────────────────────────────────────
class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private heartbeatOsc: OscillatorNode | null = null;
  private heartbeatGain: GainNode | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private initialized = false;

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch { /* audio not available */ }
  }

  playHeartbeat(intensity: number) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Double thump
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 40 + intensity * 20;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(intensity * 0.4, now + i * 0.15 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.25);
    }
  }

  playFootstep() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 60 + Math.random() * 30;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playDoorOpen() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.5);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  playPickup() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(900, now + 0.15);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playJumpScare() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Harsh noise burst
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2000;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
  }

  playScream() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
    osc.frequency.linearRampToValueAtTime(600, now + 0.4);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  startAmbientDrone() {
    if (!this.ctx || !this.masterGain) return;
    // Low rumble
    this.ambientOsc = this.ctx.createOscillator();
    this.ambientGain = this.ctx.createGain();
    this.ambientOsc.type = "sawtooth";
    this.ambientOsc.frequency.value = 30;
    this.ambientGain.gain.value = 0.04;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 100;
    this.ambientOsc.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);
    this.ambientOsc.start();
  }

  playDamage() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 100;
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

// ─── TYPES ────────────────────────────────────────────────────────────────
interface Door {
  mesh: THREE.Group;
  position: THREE.Vector3;
  isOpen: boolean;
  wallDir: number;
}

interface Pickup {
  mesh: THREE.Group;
  position: THREE.Vector3;
  type: "key" | "battery" | "note" | "medkit";
  collected: boolean;
}

interface Enemy {
  mesh: THREE.Group;
  name: string;
  speed: number;
  position: THREE.Vector3;
  path: { x: number; z: number }[];
  pathIdx: number;
  state: "patrol" | "chase" | "hunting";
  chaseTimer: number;
  screamPlayed: boolean;
}

// ─── GAME STATE ───────────────────────────────────────────────────────────
export function createGame(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020204);
  scene.fog = new THREE.FogExp2(0x020204, 0.022);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(2, 1.6, 2);

  const audio = new AudioEngine();
  let audioStarted = false;

  // Player state
  const keys: Record<string, boolean> = {};
  let yaw = 0;
  let pitch = 0;
  let hasKey = false;
  let notesCollected = 0;
  let gameOver = false;
  let gameWon = false;
  let playerHealth = 100;
  let lastDamageTime = 0;
  let ePressed = false;
  let fPressed = false;
  let screenShake = 0;
  let footstepTimer = 0;
  let heartbeatTimer = 0;
  let enemyProximityIntensity = 0;
  let jumpScareCooldown = 0;
  let sprintStamina = 100;

  const maze = generateMaze(MAZE_W, MAZE_H);
  buildMaze();
  const doors = createDoors();
  const pickups = createPickups();
  const enemies = createEnemies();
  setupLighting();

  const PLAYER_R = 0.35;

  // ── Wall collision ──
  function isWall(wx: number, wz: number): boolean {
    const cx = Math.floor(wx / CELL + 0.5);
    const cz = Math.floor(wz / CELL + 0.5);
    if (cx < 0 || cx >= MAZE_W || cz < 0 || cz >= MAZE_H) return true;
    const cell = maze[Math.min(cz, MAZE_H - 1)][Math.min(cx, MAZE_W - 1)];
    const localX = wx - cx * CELL;
    const localZ = wz - cz * CELL;
    const margin = WALL_THICK + PLAYER_R;
    if (cell.walls[0] && localZ < -CELL / 2 + margin) return true;
    if (cell.walls[2] && localZ > CELL / 2 - margin) return true;
    if (cell.walls[3] && localX < -CELL / 2 + margin) return true;
    if (cell.walls[1] && localX > CELL / 2 - margin) return true;
    return false;
  }

  function resolveCollision(pos: THREE.Vector3) {
    if (isWall(pos.x, pos.z)) {
      // Try sliding along each axis
      if (!isWall(pos.x, camera.position.z)) {
        pos.z = camera.position.z;
      } else if (!isWall(camera.position.x, pos.z)) {
        pos.x = camera.position.x;
      } else {
        pos.x = camera.position.x;
        pos.z = camera.position.z;
      }
    }
  }

  // ── Maze Wall Builder ──
  function buildMaze() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.92,
      metalness: 0.05,
    });
    const wallMat2 = new THREE.MeshStandardMaterial({
      color: 0x1f1f1f,
      roughness: 0.95,
      metalness: 0.05,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.85,
      metalness: 0.1,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 1,
      metalness: 0,
    });

    // Floor
    const floorGeo = new THREE.PlaneGeometry(MAZE_W * CELL, MAZE_H * CELL);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((MAZE_W * CELL) / 2 - CELL / 2, 0, (MAZE_H * CELL) / 2 - CELL / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(floorGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((MAZE_W * CELL) / 2 - CELL / 2, WALL_H, (MAZE_H * CELL) / 2 - CELL / 2);
    scene.add(ceil);

    // Blood splatters on floor
    for (let i = 0; i < 30; i++) {
      const size = 0.2 + Math.random() * 1.0;
      const bloodGeo = new THREE.CircleGeometry(size, 12);
      const bloodMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.4 + Math.random() * 0.2, 0, 0),
        roughness: 0.6,
        transparent: true,
        opacity: 0.35 + Math.random() * 0.5,
      });
      const blood = new THREE.Mesh(bloodGeo, bloodMat);
      blood.rotation.x = -Math.PI / 2;
      blood.rotation.z = Math.random() * Math.PI * 2;
      blood.position.set(
        Math.random() * MAZE_W * CELL - CELL,
        0.005,
        Math.random() * MAZE_H * CELL - CELL
      );
      scene.add(blood);
    }

    // Wall grid pattern — scratch marks
    const scratchMat = new THREE.MeshStandardMaterial({
      color: 0x151515,
      roughness: 0.95,
    });

    // Walls
    const wallGeoH = new THREE.BoxGeometry(CELL, WALL_H, WALL_THICK);
    const wallGeoV = new THREE.BoxGeometry(WALL_THICK, WALL_H, CELL);

    for (let z = 0; z < MAZE_H; z++) {
      for (let x = 0; x < MAZE_W; x++) {
        const cell = maze[z][x];
        const cx = x * CELL;
        const cz = z * CELL;
        const mat = (x + z) % 2 === 0 ? wallMat : wallMat2;

        if (cell.walls[0]) {
          const w = new THREE.Mesh(wallGeoH, mat);
          w.position.set(cx, WALL_H / 2, cz - CELL / 2);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
        }
        if (cell.walls[3]) {
          const w = new THREE.Mesh(wallGeoV, mat);
          w.position.set(cx - CELL / 2, WALL_H / 2, cz);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
        }
        if (x === MAZE_W - 1 && cell.walls[1]) {
          const w = new THREE.Mesh(wallGeoV, mat);
          w.position.set(cx + CELL / 2, WALL_H / 2, cz);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
        }
        if (z === MAZE_H - 1 && cell.walls[2]) {
          const w = new THREE.Mesh(wallGeoH, mat);
          w.position.set(cx, WALL_H / 2, cz + CELL / 2);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
        }
      }
    }

    // Hanging bodies
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.9 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
    for (let i = 0; i < 8; i++) {
      const bx = (Math.floor(Math.random() * MAZE_W)) * CELL + (Math.random() - 0.5) * 2;
      const bz = (Math.floor(Math.random() * MAZE_H)) * CELL + (Math.random() - 0.5) * 2;
      if (isWall(bx, bz)) continue;
      const g = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8), bodyMat);
      torso.position.y = WALL_H - 0.8;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), bodyMat);
      head.position.y = WALL_H - 0.3;
      g.add(head);
      // Limbs
      for (const sx of [-0.25, 0.25]) {
        const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), bodyMat);
        limb.position.set(sx, WALL_H - 0.7, 0);
        limb.rotation.z = sx > 0 ? -0.3 : 0.3;
        g.add(limb);
      }
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, WALL_H - 1.2, 4), ropeMat);
      rope.position.y = (WALL_H + WALL_H - 1.2) / 2 - 0.1;
      g.add(rope);
      g.position.set(bx, 0, bz);
      scene.add(g);
    }

    // Chains hanging from ceiling
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 10; i++) {
      const cx = Math.random() * MAZE_W * CELL;
      const cz = Math.random() * MAZE_H * CELL;
      const chainLen = 0.5 + Math.random() * 1.5;
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, chainLen, 6),
        chainMat
      );
      chain.position.set(cx, WALL_H - chainLen / 2, cz);
      scene.add(chain);
    }

    // Pool of blood (darker, larger)
    for (let i = 0; i < 5; i++) {
      const px = Math.random() * MAZE_W * CELL - CELL;
      const pz = Math.random() * MAZE_H * CELL - CELL;
      const poolGeo = new THREE.CircleGeometry(0.5 + Math.random() * 0.8, 16);
      const poolMat = new THREE.MeshStandardMaterial({
        color: 0x300000,
        roughness: 0.3,
        transparent: true,
        opacity: 0.7,
      });
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(px, 0.003, pz);
      scene.add(pool);
    }
  }

  // ── Doors ──
  function createDoors(): Door[] {
    const doorsArr: Door[] = [];
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a2810, roughness: 0.7, metalness: 0.1 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, metalness: 0.3 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xaa9933, metalness: 0.85, roughness: 0.2 });

    for (let z = 0; z < MAZE_H; z++) {
      for (let x = 0; x < MAZE_W; x++) {
        const cell = maze[z][x];
        if (!cell.walls[1] && x < MAZE_W - 1 && Math.random() < 0.3) {
          const g = new THREE.Group();
          // Door frame
          const frame = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.7, WALL_H, 0.08), frameMat);
          frame.position.y = WALL_H / 2;
          g.add(frame);
          // Door panel
          const door = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.55, WALL_H * 0.85, 0.1), doorMat);
          door.position.y = WALL_H * 0.42;
          door.position.z = 0.05;
          g.add(door);
          // Handle
          const handle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), handleMat);
          handle.position.set(0.3, WALL_H * 0.42, 0.12);
          g.add(handle);
          g.position.set(x * CELL + CELL / 2, 0, z * CELL);
          scene.add(g);
          doorsArr.push({ mesh: g, position: g.position.clone(), isOpen: false, wallDir: 1 });
        }
        if (!cell.walls[2] && z < MAZE_H - 1 && Math.random() < 0.3) {
          const g = new THREE.Group();
          const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, WALL_H, CELL * 0.7), frameMat);
          frame.position.y = WALL_H / 2;
          g.add(frame);
          const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, WALL_H * 0.85, CELL * 0.55), doorMat);
          door.position.y = WALL_H * 0.42;
          door.position.x = 0.05;
          g.add(door);
          const handle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), handleMat);
          handle.position.set(0.12, WALL_H * 0.42, 0.3);
          g.add(handle);
          g.position.set(x * CELL, 0, z * CELL + CELL / 2);
          scene.add(g);
          doorsArr.push({ mesh: g, position: g.position.clone(), isOpen: false, wallDir: 2 });
        }
      }
    }
    return doorsArr;
  }

  // ── Pickups ──
  function createPickups(): Pickup[] {
    const arr: Pickup[] = [];

    // Key
    {
      const g = new THREE.Group();
      const keyMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.9, roughness: 0.15, emissive: 0x997700, emissiveIntensity: 0.8 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 16), keyMat);
      g.add(ring);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.02), keyMat);
      shaft.position.y = -0.25;
      g.add(shaft);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02), keyMat);
      tip.position.set(0.03, -0.4, 0);
      g.add(tip);
      // Glow
      const keyGlow = new THREE.PointLight(0xffcc00, 1.5, 5);
      keyGlow.position.y = 0;
      g.add(keyGlow);
      g.position.set(5 * CELL, 1.5, 5 * CELL);
      scene.add(g);
      arr.push({ mesh: g, position: g.position.clone(), type: "key", collected: false });
    }

    // Notes
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const noteMat = new THREE.MeshStandardMaterial({ color: 0xddddaa, roughness: 0.7, emissive: 0x554400, emissiveIntensity: 0.5 });
      const note = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.01), noteMat);
      g.add(note);
      // Glow
      const noteGlow = new THREE.PointLight(0xffaa00, 0.8, 4);
      g.add(noteGlow);
      g.position.set((2 + i * 3) * CELL, 1.2, (3 + i * 2) * CELL);
      scene.add(g);
      arr.push({ mesh: g, position: g.position.clone(), type: "note", collected: false });
    }

    // Batteries
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const batMat = new THREE.MeshStandardMaterial({ color: 0x00cc00, emissive: 0x00aa00, emissiveIntensity: 0.6 });
      const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8), batMat);
      g.add(bat);
      const batGlow = new THREE.PointLight(0x00ff00, 0.6, 3);
      g.add(batGlow);
      g.position.set((1 + i * 5) * CELL, 0.8, (8 - i * 4) * CELL);
      scene.add(g);
      arr.push({ mesh: g, position: g.position.clone(), type: "battery", collected: false });
    }

    // Medkits
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const medMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff0000, emissiveIntensity: 0.4 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.15), medMat);
      g.add(box);
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1 }));
      cross1.position.z = 0.08;
      g.add(cross1);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.01), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1 }));
      cross2.position.z = 0.08;
      g.add(cross2);
      const medGlow = new THREE.PointLight(0xff3333, 0.8, 3);
      g.add(medGlow);
      g.position.set((7 + i * 3) * CELL, 0.8, (6 + i * 3) * CELL);
      scene.add(g);
      arr.push({ mesh: g, position: g.position.clone(), type: "medkit", collected: false });
    }

    return arr;
  }

  // ── Enemies ──
  function createEnemies(): Enemy[] {
    const arr: Enemy[] = [];

    function makeEnemy(skinColor: string, name: string, sx: number, sz: number, speed: number): Enemy {
      const g = new THREE.Group();

      // Body — dress/robe
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 1.2, 8), bodyMat);
      body.position.y = 0.6;
      body.castShadow = true;
      g.add(body);

      // Arms
      const armMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), armMat);
        arm.position.set(side * 0.3, 0.8, 0.15);
        arm.rotation.x = -0.5;
        g.add(arm);
        // Clawed hand
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshStandardMaterial({ color: 0x880000, emissive: 0x440000, emissiveIntensity: 0.5 }));
        hand.position.set(side * 0.3, 0.55, 0.3);
        g.add(hand);
      }

      // Head
      const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), headMat);
      head.position.y = 1.4;
      head.castShadow = true;
      g.add(head);

      // Eyes — deep red, glowing
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3 });
      for (const sx2 of [-0.07, 0.07]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
        eye.position.set(sx2, 1.43, 0.18);
        g.add(eye);
      }
      // Eye glow lights
      const eyeGlow = new THREE.PointLight(0xff0000, 1.2, 4);
      eyeGlow.position.y = 1.4;
      g.add(eyeGlow);

      g.position.set(sx * CELL, 0, sz * CELL);
      scene.add(g);

      return {
        mesh: g,
        name,
        speed,
        position: g.position.clone(),
        path: [],
        pathIdx: 0,
        state: "patrol",
        chaseTimer: 0,
        screamPlayed: false,
      };
    }

    // Zahra — Somali, dark skin, blue hijab
    const z = makeEnemy("#3d2b1f", "Zahra", MAZE_W - 2, MAZE_H - 2, ENEMY_SPEED);
    const hijabMat = new THREE.MeshStandardMaterial({ color: 0x0d1b5e, roughness: 0.85 });
    const hijab = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), hijabMat);
    hijab.scale.set(1.1, 0.9, 1.1);
    hijab.position.y = 1.45;
    z.mesh.add(hijab);
    const drape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.35, 0.35, 10, 1, true),
      hijabMat
    );
    drape.position.y = 1.2;
    z.mesh.add(drape);
    arr.push(z);

    // Priya — Indian, light skin, long black hair
    const p = makeEnemy("#e8c4a0", "Priya", 1, 1, ENEMY_SPEED * 1.15);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95 });
    const hairFront = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), hairMat);
    hairFront.scale.set(1.05, 1.1, 1.1);
    hairFront.position.set(0, 1.47, -0.02);
    p.mesh.add(hairFront);
    const hairBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.1, 0.7, 8),
      hairMat
    );
    hairBack.position.set(0, 1.05, -0.12);
    p.mesh.add(hairBack);
    for (const side of [-0.14, 0.14]) {
      const strand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.02, 0.5, 6),
        hairMat
      );
      strand.position.set(side, 1.1, -0.05);
      strand.rotation.z = side > 0 ? -0.1 : 0.1;
      p.mesh.add(strand);
    }
    arr.push(p);

    return arr;
  }

  // ── Lighting ──────────────────────────────────────────────────────────
  function setupLighting() {
    // Ambient — clearly visible
    const ambient = new THREE.AmbientLight(0x443333, 2.0);
    scene.add(ambient);

    // Hemisphere
    const hemi = new THREE.HemisphereLight(0x332211, 0x221108, 1.2);
    scene.add(hemi);

    // Flashlight
    const flashlight = new THREE.SpotLight(0xffeedd, 8, 30, Math.PI / 4.5, 0.3, 1.0);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight.target);
    scene.add(camera);

    // Corridor lights — brighter, more of them
    for (let i = 0; i < 15; i++) {
      const light = new THREE.PointLight(0xff6644, 2.0, 14);
      light.position.set(
        (Math.floor(Math.random() * MAZE_W)) * CELL,
        WALL_H - 0.2,
        (Math.floor(Math.random() * MAZE_H)) * CELL
      );
      scene.add(light);
      (light as any).__flickerPhase = Math.random() * Math.PI * 2;
      // Light fixture mesh
      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 0.05, 8),
        new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff4400, emissiveIntensity: 0.5 })
      );
      fixture.position.copy(light.position);
      fixture.position.y = WALL_H;
      scene.add(fixture);
    }

    // Eerie green/red accent lights at random spots
    for (let i = 0; i < 4; i++) {
      const color = i % 2 === 0 ? 0x00ff44 : 0xff0022;
      const light = new THREE.PointLight(color, 1.5, 8);
      light.position.set(
        Math.random() * MAZE_W * CELL,
        1.0,
        Math.random() * MAZE_H * CELL
      );
      scene.add(light);
      (light as any).__flickerPhase = Math.random() * Math.PI * 2;
      (light as any).__accentColor = true;
    }
  }

  // ── BFS Pathfinding ──
  function findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] {
    const sxCell = Math.round(sx / CELL);
    const szCell = Math.round(sz / CELL);
    const txCell = Math.round(tx / CELL);
    const tzCell = Math.round(tz / CELL);
    if (sxCell === txCell && szCell === tzCell) return [];
    const visited = new Set<string>();
    const queue: { x: number; z: number; path: { x: number; z: number }[] }[] = [];
    const key = (x: number, z: number) => `${x},${z}`;
    queue.push({ x: sxCell, z: szCell, path: [] });
    visited.add(key(sxCell, szCell));
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const cell = maze[Math.min(cur.z, MAZE_H - 1)]?.[Math.min(cur.x, MAZE_W - 1)];
      if (!cell) continue;
      const dirs = [
        { dx: 0, dz: -1, wall: 0 },
        { dx: 1, dz: 0, wall: 1 },
        { dx: 0, dz: 1, wall: 2 },
        { dx: -1, dz: 0, wall: 3 },
      ];
      for (const d of dirs) {
        const nx = cur.x + d.dx;
        const nz = cur.z + d.dz;
        if (nx < 0 || nx >= MAZE_W || nz < 0 || nz >= MAZE_H) continue;
        if (visited.has(key(nx, nz))) continue;
        if (cell.walls[d.wall]) continue;
        const newPath = [...cur.path, { x: nx, z: nz }];
        if (nx === txCell && nz === tzCell) return newPath;
        visited.add(key(nx, nz));
        queue.push({ x: nx, z: nz, path: newPath });
      }
    }
    return [];
  }

  // ── HUD ──
  let hudEl: HTMLDivElement | null = null;
  let interactEl: HTMLDivElement | null = null;
  let heartbeatEl: HTMLDivElement | null = null;
  let damageOverlayEl: HTMLDivElement | null = null;
  let minimapEl: HTMLDivElement | null = null;

  function createHUD() {
    hudEl = document.createElement("div");
    hudEl.style.cssText = `position:fixed;top:16px;left:16px;color:#cc0000;font-family:'Courier New',monospace;font-size:13px;text-shadow:0 0 10px #ff0000;pointer-events:none;z-index:100;line-height:2;`;
    document.body.appendChild(hudEl);

    interactEl = document.createElement("div");
    interactEl.style.cssText = `position:fixed;bottom:25%;left:50%;transform:translateX(-50%);color:#eeeecc;font-family:'Courier New',monospace;font-size:18px;text-shadow:0 0 12px #ffffff66;pointer-events:none;z-index:100;opacity:0;transition:opacity 0.15s;letter-spacing:2px;`;
    document.body.appendChild(interactEl);

    // Heartbeat pulse overlay
    heartbeatEl = document.createElement("div");
    heartbeatEl.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:98;background:radial-gradient(ellipse at center,transparent 50%,rgba(180,0,0,0) 100%);opacity:0;transition:opacity 0.3s;`;
    document.body.appendChild(heartbeatEl);

    // Damage overlay
    damageOverlayEl = document.createElement("div");
    damageOverlayEl.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:150;background:radial-gradient(ellipse at center,rgba(200,0,0,0.3),rgba(139,0,0,0.5));opacity:0;transition:opacity 0.1s;`;
    document.body.appendChild(damageOverlayEl);

    // Minimap
    minimapEl = document.createElement("div");
    minimapEl.style.cssText = `position:fixed;bottom:16px;right:16px;width:140px;height:140px;border:1px solid #cc000066;border-radius:4px;pointer-events:none;z-index:100;opacity:0.6;background:rgba(0,0,0,0.7);`;
    document.body.appendChild(minimapEl);
  }

  function updateHUD() {
    if (hudEl) {
      const staminaBar = "█".repeat(Math.floor(sprintStamina / 10)) + "░".repeat(10 - Math.floor(sprintStamina / 10));
      const healthColor = playerHealth > 60 ? "#00cc00" : playerHealth > 30 ? "#cccc00" : "#cc0000";
      const healthBar = "█".repeat(Math.floor(playerHealth / 10)) + "░".repeat(10 - Math.floor(playerHealth / 10));
      hudEl.innerHTML = [
        `<span style="color:#aa0000;font-size:16px">⚡ THE MAZE</span>`,
        `<span style="color:${healthColor}">♥ ${healthBar} ${playerHealth}%</span>`,
        `<span style="color:#aaaacc">🏃 ${staminaBar}</span>`,
        hasKey ? `<span style="color:#ffcc00">🔑 KEY</span>` : `<span style="color:#440000">🔑 ---</span>`,
        `📝 ${notesCollected}/3`,
        `<span style="color:#555555">WASD · Mouse · Shift Sprint</span>`,
        `<span style="color:#555555">E Door · F Pickup</span>`,
        gameOver ? `<span style="color:#ff0000;font-size:28px;text-shadow:0 0 20px #ff0000">☠ YOU DIED ☠</span>` : "",
        gameWon ? `<span style="color:#00ff00;font-size:28px;text-shadow:0 0 20px #00ff00">🎃 ESCAPED 🎃</span>` : "",
      ].join("<br>");
    }

    // Update minimap
    if (minimapEl) {
      let svg = `<svg width="140" height="140" xmlns="http://www.w3.org/2000/svg">`;
      svg += `<rect width="140" height="140" fill="rgba(0,0,0,0.9)"/>`;
      const scale = 140 / (MAZE_W * CELL);
      // Draw walls
      for (let z = 0; z < MAZE_H; z++) {
        for (let x = 0; x < MAZE_W; x++) {
          const cell = maze[z][x];
          const px = (x * CELL) * scale;
          const pz = (z * CELL) * scale;
          const lineW = 1;
          svg += `<line x1="${px}" y1="${pz}" x2="${px + CELL * scale}" y2="${pz}" stroke="#550000" stroke-width="${cell.walls[0] ? lineW : 0}"/>`;
          svg += `<line x1="${px + CELL * scale}" y1="${pz}" x2="${px + CELL * scale}" y2="${pz + CELL * scale}" stroke="#550000" stroke-width="${cell.walls[1] ? lineW : 0}"/>`;
          svg += `<line x1="${px}" y1="${pz + CELL * scale}" x2="${px + CELL * scale}" y2="${pz + CELL * scale}" stroke="#550000" stroke-width="${cell.walls[2] ? lineW : 0}"/>`;
          svg += `<line x1="${px}" y1="${pz}" x2="${px}" y2="${pz + CELL * scale}" stroke="#550000" stroke-width="${cell.walls[3] ? lineW : 0}"/>`;
        }
      }
      // Enemies as red dots
      for (const e of enemies) {
        const ex = e.position.x * scale;
        const ez = e.position.z * scale;
        const r = e.state === "chase" || e.state === "hunting" ? 4 : 3;
        svg += `<circle cx="${ex}" cy="${ez}" r="${r}" fill="${e.state === "chase" ? "#ff0000" : "#880000"}"/>`;
      }
      // Player as green dot
      const ppx = camera.position.x * scale;
      const ppz = camera.position.z * scale;
      svg += `<circle cx="${ppx}" cy="${ppz}" r="3" fill="#00ff00"/>`;
      svg += `</svg>`;
      minimapEl.innerHTML = svg;
    }
  }

  // ── Start Screen ──
  let startScreen = true;
  let startEl: HTMLDivElement | null = null;

  function createStartScreen() {
    startEl = document.createElement("div");
    startEl.style.cssText = `position:fixed;inset:0;background:#000;z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8b0000;font-family:'Courier New',monospace;cursor:pointer;user-select:none;`;
    startEl.innerHTML = `
      <div style="font-size:56px;margin-bottom:8px;text-shadow:0 0 40px #ff0000,0 0 80px #8b0000;animation:pulse 2s ease-in-out infinite;letter-spacing:8px;">THE MAZE</div>
      <div style="font-size:14px;color:#550000;margin-bottom:50px;letter-spacing:6px;">ESCAPE IF YOU CAN</div>
      <div style="font-size:13px;color:#440000;margin-bottom:6px;">Two girls stalk these halls...</div>
      <div style="font-size:13px;color:#440000;margin-bottom:6px;">Zahra never stops running. Priya knows every turn.</div>
      <div style="font-size:13px;color:#440000;margin-bottom:40px;">Find the KEY. Reach the EXIT. Survive.</div>
      <div style="font-size:22px;color:#cc0000;animation:blink 1s steps(1) infinite;letter-spacing:4px;">[ CLICK TO ENTER ]</div>
      <div style="margin-top:50px;font-size:11px;color:#330000;line-height:2.2;">
        WASD — Move &nbsp;|&nbsp; MOUSE — Look<br>
        SHIFT — Sprint &nbsp;|&nbsp; E — Open Doors<br>
        F — Pick Up Items
      </div>
      <style>
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
      </style>
    `;
    startEl.addEventListener("click", () => {
      startScreen = false;
      if (!audioStarted) { audio.init(); audio.startAmbientDrone(); audioStarted = true; }
      if (startEl) {
        startEl.style.opacity = "0";
        startEl.style.transition = "opacity 1.5s";
        setTimeout(() => startEl?.remove(), 1500);
      }
      canvas.requestPointerLock();
    });
    document.body.appendChild(startEl);
  }

  // ── Crosshair ──
  let crosshairEl: HTMLDivElement | null = null;
  function createCrosshair() {
    crosshairEl = document.createElement("div");
    crosshairEl.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:24px;height:24px;pointer-events:none;z-index:100;opacity:0.4;`;
    crosshairEl.innerHTML = `
      <div style="position:absolute;top:50%;left:0;width:100%;height:1px;background:#ff000088"></div>
      <div style="position:absolute;top:0;left:50%;width:1px;height:100%;background:#ff000088"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:3px;height:3px;background:#ff0000;border-radius:50%;"></div>
    `;
    document.body.appendChild(crosshairEl);
  }

  // ── Vignette ──
  let vignetteEl: HTMLDivElement | null = null;
  function createVignette() {
    vignetteEl = document.createElement("div");
    vignetteEl.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:97;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.7) 100%);`;
    document.body.appendChild(vignetteEl);
  }

  // ── INPUT ──
  function onKeyDown(e: KeyboardEvent) {
    keys[e.code] = true;
    if (e.code === "KeyE") ePressed = true;
    if (e.code === "KeyF") fPressed = true;
  }
  function onKeyUp(e: KeyboardEvent) { keys[e.code] = false; }
  function onMouseMove(e: MouseEvent) {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * LOOK_SENS;
    pitch -= e.movementY * LOOK_SENS;
    pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("click", () => {
    if (!startScreen) canvas.requestPointerLock();
  });

  let flashlightFlicker = 0;

  // ── MAIN LOOP ──
  let prevTime = performance.now();
  createHUD();
  createCrosshair();
  createVignette();
  createStartScreen();

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - prevTime) / 1000, 0.1);
    prevTime = now;

    if (startScreen || gameOver || gameWon) {
      renderer.render(scene, camera);
      return;
    }

    // ── Sprint ──
    const isSprinting = (keys["ShiftLeft"] || keys["ShiftRight"]) && sprintStamina > 0;
    const speed = isSprinting ? SPRINT_SPEED : MOVE_SPEED;
    if (isSprinting && (keys["KeyW"] || keys["KeyS"] || keys["KeyA"] || keys["KeyD"])) {
      sprintStamina = Math.max(0, sprintStamina - 30 * dt);
    } else {
      sprintStamina = Math.min(100, sprintStamina + 15 * dt);
    }

    // ── Player Movement ──
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const moveDir = new THREE.Vector3();
    if (keys["KeyW"] || keys["ArrowUp"]) moveDir.add(forward);
    if (keys["KeyS"] || keys["ArrowDown"]) moveDir.sub(forward);
    if (keys["KeyA"] || keys["ArrowLeft"]) moveDir.sub(right);
    if (keys["KeyD"] || keys["ArrowRight"]) moveDir.add(right);

    const isMoving = moveDir.lengthSq() > 0;
    if (isMoving) {
      moveDir.normalize();
      const bobSpeed = isSprinting ? 10 : 7;
      const bobAmount = isSprinting ? 0.06 : 0.035;
      const bob = Math.sin(now * 0.01 * bobSpeed) * bobAmount;
      camera.position.y = 1.6 + bob;

      // Footstep sounds
      footstepTimer += dt * (isSprinting ? 8 : 5);
      if (footstepTimer > 1) {
        footstepTimer = 0;
        audio.playFootstep();
      }
    } else {
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.6, 5 * dt);
      footstepTimer = 0.5;
    }

    const newPos = camera.position.clone();
    newPos.x += moveDir.x * speed * dt;
    newPos.z += moveDir.z * speed * dt;
    resolveCollision(newPos);
    camera.position.x = newPos.x;
    camera.position.z = newPos.z;

    // Camera look
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));

    // Screen shake
    if (screenShake > 0) {
      camera.position.x += (Math.random() - 0.5) * screenShake * 0.1;
      camera.position.y += (Math.random() - 0.5) * screenShake * 0.05;
      screenShake *= 0.9;
      if (screenShake < 0.01) screenShake = 0;
    }

    // ── Flashlight flicker ──
    flashlightFlicker += dt * 4;
    const flashLight = camera.children.find((c) => c instanceof THREE.SpotLight) as THREE.SpotLight | undefined;
    if (flashLight) {
      const base = isSprinting ? 6 : 8;
      const flicker = base + Math.sin(flashlightFlicker * 5) * 1.0 + Math.sin(flashlightFlicker * 11) * 0.5;
      flashLight.intensity = flicker;
    }

    // ── Ambient light flicker ──
    scene.children.forEach((child) => {
      if (child instanceof THREE.PointLight && (child as any).__flickerPhase !== undefined) {
        const phase = (child as any).__flickerPhase;
        const isAccent = (child as any).__accentColor;
        const base = isAccent ? 1.0 : 1.5;
        child.intensity = base + Math.sin(now * 0.003 + phase) * 0.5 + (Math.random() > 0.97 ? 1.0 : 0);
      }
    });

    // ── Door Interaction ──
    if (ePressed) {
      ePressed = false;
      for (const door of doors) {
        if (door.isOpen) continue;
        if (camera.position.distanceTo(door.position) < DOOR_RANGE) {
          door.isOpen = true;
          audio.playDoorOpen();
          const startRot = door.mesh.rotation.y;
          const openAngle = -Math.PI / 2;
          const startTime = now;
          const dur = 600;
          const animDoor = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / dur, 1);
            const ease = t * t * (3 - 2 * t);
            door.mesh.rotation.y = startRot + openAngle * ease;
            if (t < 1) requestAnimationFrame(animDoor);
          };
          animDoor();
          break;
        }
      }
    }

    // ── Pickup Interaction ──
    if (fPressed) {
      fPressed = false;
      for (const p of pickups) {
        if (p.collected) continue;
        if (camera.position.distanceTo(p.position) < PICKUP_RANGE) {
          p.collected = true;
          scene.remove(p.mesh);
          audio.playPickup();
          if (p.type === "key") hasKey = true;
          else if (p.type === "note") notesCollected++;
          else if (p.type === "medkit") playerHealth = Math.min(100, playerHealth + 30);
          else if (p.type === "battery") sprintStamina = 100;
          screenShake = 0.5;
          break;
        }
      }
    }

    // ── Interaction prompt ──
    let showPrompt = false;
    let promptText = "";
    for (const p of pickups) {
      if (p.collected) continue;
      if (camera.position.distanceTo(p.position) < PICKUP_RANGE) {
        showPrompt = true;
        promptText = p.type === "key" ? "[F] Pick up KEY" : p.type === "note" ? "[F] Read NOTE" : p.type === "medkit" ? "[F] MEDKIT (+30 HP)" : "[F] BATTERY (Sprint)";
        break;
      }
    }
    if (!showPrompt) {
      for (const door of doors) {
        if (door.isOpen) continue;
        if (camera.position.distanceTo(door.position) < DOOR_RANGE) {
          showPrompt = true;
          promptText = "[E] Open Door";
          break;
        }
      }
    }
    if (interactEl) {
      interactEl.style.opacity = showPrompt ? "1" : "0";
      interactEl.textContent = promptText;
    }

    // ── Enemy AI ──
    const playerCX = Math.round(camera.position.x / CELL);
    const playerCZ = Math.round(camera.position.z / CELL);

    let closestEnemyDist = Infinity;

    for (const enemy of enemies) {
      const distToPlayer = enemy.position.distanceTo(camera.position);
      closestEnemyDist = Math.min(closestEnemyDist, distToPlayer);

      // State transitions
      if (distToPlayer < ENEMY_CHASE_RANGE) {
        if (enemy.state === "patrol") {
          enemy.state = "chase";
          enemy.chaseTimer = 0;
          enemy.screamPlayed = false;
        }
      } else if (enemy.state === "chase") {
        enemy.state = "hunting";
        enemy.chaseTimer = 5;
      }

      if (enemy.state === "hunting") {
        enemy.chaseTimer -= dt;
        if (enemy.chaseTimer <= 0) enemy.state = "patrol";
      }

      // Chase behavior
      if (enemy.state === "chase" || enemy.state === "hunting") {
        // Re-pathfind periodically
        if (enemy.path.length === 0 || Math.random() < 0.02) {
          enemy.path = findPath(
            Math.round(enemy.position.x / CELL),
            Math.round(enemy.position.z / CELL),
            playerCX,
            playerCZ
          );
        }

        if (enemy.path.length > 0) {
          const target = enemy.path[0];
          const tx = target.x * CELL;
          const tz = target.z * CELL;
          const dx = tx - enemy.position.x;
          const dz = tz - enemy.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 0.5) {
            enemy.path.shift();
          } else {
            const spd = enemy.speed * (enemy.state === "hunting" ? 0.6 : 1.0) * dt;
            enemy.position.x += (dx / dist) * spd;
            enemy.position.z += (dz / dist) * spd;
          }
          enemy.mesh.rotation.y = Math.atan2(dx, dz);
        } else {
          // Direct chase
          const dx = camera.position.x - enemy.position.x;
          const dz = camera.position.z - enemy.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 0.1) {
            const spd = enemy.speed * dt;
            enemy.position.x += (dx / dist) * spd;
            enemy.position.z += (dz / dist) * spd;
          }
          enemy.mesh.rotation.y = Math.atan2(dx, dz);
        }

        // Scream when close
        if (distToPlayer < 5 && !enemy.screamPlayed) {
          enemy.screamPlayed = true;
          audio.playScream();
          screenShake = 1.5;
        }

        // Jump scare when very close
        if (distToPlayer < 3 && jumpScareCooldown <= 0) {
          jumpScareCooldown = 3;
          audio.playJumpScare();
          screenShake = 2;
        }

        // Attack
        if (distToPlayer < 1.5 && now - lastDamageTime > 800) {
          playerHealth -= 12;
          lastDamageTime = now;
          screenShake = 2;
          audio.playDamage();
          if (damageOverlayEl) {
            damageOverlayEl.style.opacity = "1";
            setTimeout(() => { if (damageOverlayEl) damageOverlayEl.style.opacity = "0"; }, 250);
          }
          if (playerHealth <= 0) {
            gameOver = true;
            audio.playJumpScare();
          }
        }
      } else {
        // Patrol
        if (enemy.path.length === 0 || Math.random() < 0.005) {
          const rx = Math.floor(Math.random() * MAZE_W);
          const rz = Math.floor(Math.random() * MAZE_H);
          enemy.path = findPath(
            Math.round(enemy.position.x / CELL),
            Math.round(enemy.position.z / CELL),
            rx, rz
          );
        }
        if (enemy.path.length > 0) {
          const target = enemy.path[0];
          const tx = target.x * CELL;
          const tz = target.z * CELL;
          const dx = tx - enemy.position.x;
          const dz = tz - enemy.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 0.5) enemy.path.shift();
          else {
            const spd = enemy.speed * 0.4 * dt;
            enemy.position.x += (dx / dist) * spd;
            enemy.position.z += (dz / dist) * spd;
          }
          enemy.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }

      // Animation
      enemy.mesh.position.y = Math.sin(now * 0.006 + enemy.position.x) * 0.08;
      enemy.mesh.position.x = enemy.position.x;
      enemy.mesh.position.z = enemy.position.z;

      // Arm swing during chase
      if (enemy.state === "chase") {
        const swing = Math.sin(now * 0.01) * 0.3;
        enemy.mesh.children.forEach((child, i) => {
          if (i === 1 || i === 2) { // arms
            child.rotation.x = -0.5 + swing * (i === 1 ? 1 : -1);
          }
        });
      }
    }

    // Jump scare cooldown
    jumpScareCooldown -= dt;

    // ── Heartbeat effect when enemies nearby ──
    enemyProximityIntensity = Math.max(0, 1 - closestEnemyDist / 15);
    if (enemyProximityIntensity > 0.1) {
      heartbeatTimer += dt * (2 + enemyProximityIntensity * 4);
      if (heartbeatTimer > 1) {
        heartbeatTimer = 0;
        audio.playHeartbeat(enemyProximityIntensity);
      }
      if (heartbeatEl) {
        const pulse = Math.sin(heartbeatTimer * Math.PI) * enemyProximityIntensity;
        heartbeatEl.style.opacity = String(Math.max(0, pulse * 0.4));
        heartbeatEl.style.background = `radial-gradient(ellipse at center, transparent 45%, rgba(180,0,0,${enemyProximityIntensity * 0.3}) 100%)`;
      }
    } else {
      if (heartbeatEl) heartbeatEl.style.opacity = "0";
    }

    // ── Pickup animations ──
    for (const p of pickups) {
      if (p.collected) continue;
      p.mesh.rotation.y = now * 0.002;
      p.mesh.position.y = p.position.y + Math.sin(now * 0.003) * 0.12;
    }

    // ── Win condition ──
    const exitPos = new THREE.Vector3((MAZE_W - 1) * CELL, 0, (MAZE_H - 1) * CELL);
    if (hasKey && camera.position.distanceTo(exitPos) < 2) {
      gameWon = true;
    }

    // ── Vignette based on health ──
    if (vignetteEl) {
      const hp = playerHealth / 100;
      const inner = 45 - (1 - hp) * 15;
      const color = hp < 0.4 ? "rgba(139,0,0," : "rgba(0,0,0,";
      const strength = 0.5 + (1 - hp) * 0.4;
      vignetteEl.style.background = `radial-gradient(ellipse at center, transparent ${inner}%, ${color}${strength}) 100%)`;
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    hudEl?.remove();
    interactEl?.remove();
    startEl?.remove();
    crosshairEl?.remove();
    vignetteEl?.remove();
    heartbeatEl?.remove();
    damageOverlayEl?.remove();
    minimapEl?.remove();
    renderer.dispose();
  };
}
