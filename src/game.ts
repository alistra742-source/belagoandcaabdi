import * as THREE from "three";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const CELL = 4;
const WALL_H = 4;
const WALL_THICK = 0.3;
const MOVE_SPEED = 6;
const LOOK_SENS = 0.002;
const GRAVITY = -20;
const PICKUP_RANGE = 2.5;
const DOOR_RANGE = 3;
const ENEMY_SPEED = 3.2;
const ENEMY_CHASE_RANGE = 18;
const MAZE_W = 12;
const MAZE_H = 12;

// ─── MAZE GENERATION (recursive backtracker) ──────────────────────────────
type Cell = { x: number; z: number; walls: [boolean, boolean, boolean, boolean]; visited: boolean };
// walls: [north, east, south, west]

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
      { dx: 0, dz: -1, dir: 0 }, // north
      { dx: 1, dz: 0, dir: 1 },  // east
      { dx: 0, dz: 1, dir: 2 },  // south
      { dx: -1, dz: 0, dir: 3 }, // west
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

  // Remove a few extra walls to make loops
  for (let i = 0; i < Math.floor(w * h * 0.08); i++) {
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

// ─── TYPES ────────────────────────────────────────────────────────────────
interface Door {
  mesh: THREE.Group;
  position: THREE.Vector3;
  rotation: number;
  isOpen: boolean;
  cellX: number;
  cellZ: number;
  wallDir: number;
  walls?: boolean[];
}

interface Pickup {
  mesh: THREE.Group;
  position: THREE.Vector3;
  type: "key" | "battery" | "note" | "medkit";
  collected: boolean;
}

interface Enemy {
  mesh: THREE.Group;
  bodyColor: string;
  name: string;
  speed: number;
  position: THREE.Vector3;
  targetPos: THREE.Vector3 | null;
  path: { x: number; z: number }[];
  pathIdx: number;
  state: "patrol" | "chase";
  patrolIdx: number;
}

// ─── GAME STATE ───────────────────────────────────────────────────────────
export function createGame(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.4;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x0a0a0a, 0.06);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(2, 1.7, 2);

  // ── Player state ──
  const keys: Record<string, boolean> = {};
  let yaw = 0;
  let pitch = 0;
  const velocity = new THREE.Vector3();
  let hasKey = false;
  let notesCollected = 0;
  let gameOver = false;
  let gameWon = false;

  // ── Generate Maze ──
  const maze = generateMaze(MAZE_W, MAZE_H);

  // ── Build scene ──
  buildMaze();
  const doors = createDoors();
  const pickups = createPickups();
  const enemies = createEnemies();
  setupLighting();

  // ── Player collision box ──
  const PLAYER_R = 0.35;

  // ── Collision detection ──
  function isWall(wx: number, wz: number): boolean {
    const cx = Math.floor(wx / CELL + 0.5);
    const cz = Math.floor(wz / CELL + 0.5);
    if (cx < 0 || cx >= MAZE_W || cz < 0 || cz >= MAZE_H) return true;
    // Check actual wall segments
    const cell = maze[Math.min(cz, MAZE_H - 1)][Math.min(cx, MAZE_W - 1)];
    const localX = wx - cx * CELL;
    const localZ = wz - cz * CELL;
    // Near cell boundary, check walls
    const margin = WALL_THICK + PLAYER_R;
    if (cell.walls[0] && localZ < -CELL / 2 + margin) return true; // north
    if (cell.walls[2] && localZ > CELL / 2 - margin) return true; // south
    if (cell.walls[3] && localX < -CELL / 2 + margin) return true; // west
    if (cell.walls[1] && localX > CELL / 2 - margin) return true; // east
    return false;
  }

  function resolveCollision(pos: THREE.Vector3) {
    // Check collisions in X and Z separately
    const testX = pos.clone();
    if (isWall(testX.x, testX.z)) {
      pos.x = camera.position.x;
    }
    const testZ = pos.clone();
    if (isWall(testZ.x, testZ.z)) {
      pos.z = camera.position.z;
    }
  }

  // ── KEY BINDING: E = doors, F = pickup ──
  let ePressed = false;
  let fPressed = false;

  // ── Maze Wall Builder ──
  function buildMaze() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.95,
      metalness: 0.05,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f0f0f,
      roughness: 0.9,
      metalness: 0,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x080808,
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

    // Blood stain decal on floor
    for (let i = 0; i < 20; i++) {
      const bloodGeo = new THREE.CircleGeometry(0.3 + Math.random() * 0.8, 16);
      const bloodMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.3 + Math.random() * 0.15, 0, 0),
        roughness: 0.7,
        transparent: true,
        opacity: 0.4 + Math.random() * 0.4,
      });
      const blood = new THREE.Mesh(bloodGeo, bloodMat);
      blood.rotation.x = -Math.PI / 2;
      blood.position.set(
        Math.random() * MAZE_W * CELL - CELL,
        0.01,
        Math.random() * MAZE_H * CELL - CELL
      );
      scene.add(blood);
    }

    // Walls — build only where maze has walls
    const wallGeoH = new THREE.BoxGeometry(CELL, WALL_H, WALL_THICK);
    const wallGeoV = new THREE.BoxGeometry(WALL_THICK, WALL_H, CELL);

    for (let z = 0; z < MAZE_H; z++) {
      for (let x = 0; x < MAZE_W; x++) {
        const cell = maze[z][x];
        const cx = x * CELL;
        const cz = z * CELL;

        // North wall
        if (cell.walls[0]) {
          const w = new THREE.Mesh(wallGeoH, wallMat);
          w.position.set(cx, WALL_H / 2, cz - CELL / 2);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
        }
        // West wall
        if (cell.walls[3]) {
          const w = new THREE.Mesh(wallGeoV, wallMat);
          w.position.set(cx - CELL / 2, WALL_H / 2, cz);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
        }
        // East wall (only for last column)
        if (x === MAZE_W - 1 && cell.walls[1]) {
          const w = new THREE.Mesh(wallGeoV, wallMat);
          w.position.set(cx + CELL / 2, WALL_H / 2, cz);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
        }
        // South wall (only for last row)
        if (z === MAZE_H - 1 && cell.walls[2]) {
          const w = new THREE.Mesh(wallGeoH, wallMat);
          w.position.set(cx, WALL_H / 2, cz + CELL / 2);
          w.castShadow = true;
          w.receiveShadow = true;
          scene.add(w);
        }
      }
    }

    // Creepy hanging body props
    for (let i = 0; i < 6; i++) {
      const x = (Math.floor(Math.random() * MAZE_W)) * CELL + (Math.random() - 0.5) * 2;
      const z = (Math.floor(Math.random() * MAZE_H)) * CELL + (Math.random() - 0.5) * 2;
      const bodyGroup = new THREE.Group();
      // Torso
      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.9 })
      );
      torso.position.y = WALL_H - 0.8;
      bodyGroup.add(torso);
      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 })
      );
      head.position.y = WALL_H - 0.3;
      bodyGroup.add(head);
      // Rope
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, WALL_H - 1.2, 4),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      rope.position.y = WALL_H - (WALL_H - 1.2) / 2;
      bodyGroup.add(rope);
      bodyGroup.position.set(x, 0, z);
      scene.add(bodyGroup);
    }
  }

  // ── Door Builder ──
  function createDoors(): Door[] {
    const doorsArr: Door[] = [];
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.8 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x887700, metalness: 0.8, roughness: 0.3 });

    // Place doors at openings between cells
    for (let z = 0; z < MAZE_H; z++) {
      for (let x = 0; x < MAZE_W; x++) {
        const cell = maze[z][x];
        // East opening
        if (!cell.walls[1] && x < MAZE_W - 1 && Math.random() < 0.35) {
          const doorGroup = new THREE.Group();
          const doorMesh = new THREE.Mesh(
            new THREE.BoxGeometry(CELL * 0.6, WALL_H * 0.8, 0.12),
            doorMat
          );
          doorMesh.position.y = WALL_H * 0.4;
          doorGroup.add(doorMesh);
          const handle = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 8, 8),
            handleMat
          );
          handle.position.set(0.4, WALL_H * 0.4, 0.08);
          doorGroup.add(handle);
          doorGroup.position.set(x * CELL + CELL / 2, 0, z * CELL);
          scene.add(doorGroup);
          doorsArr.push({
            mesh: doorGroup,
            position: doorGroup.position.clone(),
            rotation: 0,
            isOpen: false,
            cellX: x,
            cellZ: z,
            wallDir: 1,
          });
        }
        // South opening
        if (!cell.walls[2] && z < MAZE_H - 1 && Math.random() < 0.35) {
          const doorGroup = new THREE.Group();
          const doorMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, WALL_H * 0.8, CELL * 0.6),
            doorMat
          );
          doorMesh.position.y = WALL_H * 0.4;
          doorGroup.add(doorMesh);
          const handle = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 8, 8),
            handleMat
          );
          handle.position.set(0.08, WALL_H * 0.4, 0.4);
          doorGroup.add(handle);
          doorGroup.position.set(x * CELL, 0, z * CELL + CELL / 2);
          scene.add(doorGroup);
          doorsArr.push({
            mesh: doorGroup,
            position: doorGroup.position.clone(),
            rotation: Math.PI / 2,
            isOpen: false,
            cellX: x,
            cellZ: z,
            wallDir: 2,
          });
        }
      }
    }
    return doorsArr;
  }

  // ── Pickups ──
  function createPickups(): Pickup[] {
    const pickupsArr: Pickup[] = [];

    // Key (1)
    {
      const g = new THREE.Group();
      const keyMat = new THREE.MeshStandardMaterial({ color: 0xccaa00, metalness: 0.9, roughness: 0.2, emissive: 0x665500, emissiveIntensity: 0.5 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 16), keyMat);
      g.add(ring);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.02), keyMat);
      shaft.position.set(0, -0.25, 0);
      g.add(shaft);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02), keyMat);
      tip.position.set(0.03, -0.4, 0);
      g.add(tip);
      g.position.set(5 * CELL, 1.5, 5 * CELL);
      scene.add(g);
      pickupsArr.push({ mesh: g, position: g.position.clone(), type: "key", collected: false });
    }

    // Notes (3) — spread around maze
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const noteMat = new THREE.MeshStandardMaterial({ color: 0xccccaa, roughness: 0.8, emissive: 0x333300, emissiveIntensity: 0.3 });
      const note = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.01), noteMat);
      g.add(note);
      const nx = (2 + i * 3) * CELL;
      const nz = (3 + i * 2) * CELL;
      g.position.set(nx, 1.2, nz);
      scene.add(g);
      pickupsArr.push({ mesh: g, position: g.position.clone(), type: "note", collected: false });
    }

    // Batteries (2)
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const batMat = new THREE.MeshStandardMaterial({ color: 0x00aa00, emissive: 0x003300, emissiveIntensity: 0.4 });
      const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8), batMat);
      g.add(bat);
      const bx = (1 + i * 5) * CELL;
      const bz = (8 - i * 4) * CELL;
      g.position.set(bx, 0.8, bz);
      scene.add(g);
      pickupsArr.push({ mesh: g, position: g.position.clone(), type: "battery", collected: false });
    }

    // Medkits (2)
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const medMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x880000, emissiveIntensity: 0.3 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.15), medMat);
      g.add(box);
      // Cross
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 }));
      cross1.position.z = 0.08;
      g.add(cross1);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.01), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 }));
      cross2.position.z = 0.08;
      g.add(cross2);
      const mx = (7 + i * 3) * CELL;
      const mz = (6 + i * 3) * CELL;
      g.position.set(mx, 0.8, mz);
      scene.add(g);
      pickupsArr.push({ mesh: g, position: g.position.clone(), type: "medkit", collected: false });
    }

    // Exit sign
    {
      const g = new THREE.Group();
      const signMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1 });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.05), signMat);
      g.add(sign);
      g.position.set((MAZE_W - 1) * CELL, WALL_H - 0.5, (MAZE_H - 1) * CELL);
      scene.add(g);
      pickupsArr.push({ mesh: g, position: g.position.clone(), type: "key", collected: false });
    }

    return pickupsArr;
  }

  // ── Enemies ──
  function createEnemies(): Enemy[] {
    const enemyArr: Enemy[] = [];

    function makeEnemy(bodyColorHex: string, name: string, startX: number, startZ: number, speed: number): Enemy {
      const g = new THREE.Group();

      // Body
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColorHex, roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.0, 8), bodyMat);
      body.position.y = 0.5;
      body.castShadow = true;
      g.add(body);

      // Head
      const skinColor = bodyColorHex;
      const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), headMat);
      head.position.y = 1.3;
      head.castShadow = true;
      g.add(head);

      // Eyes (glowing red)
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
      eyeL.position.set(-0.08, 1.33, 0.18);
      g.add(eyeL);
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
      eyeR.position.set(0.08, 1.33, 0.18);
      g.add(eyeR);

      // Point light for eerie glow
      const glow = new THREE.PointLight(0xff0000, 0.5, 6);
      glow.position.y = 1.5;
      g.add(glow);

      g.position.set(startX * CELL, 0, startZ * CELL);
      scene.add(g);

      return {
        mesh: g,
        bodyColor: bodyColorHex,
        name,
        speed,
        position: g.position.clone(),
        targetPos: null,
        path: [],
        pathIdx: 0,
        state: "patrol" as const,
        patrolIdx: 0,
      };
    }

    // Somali girl with hijab - dark skin, blue/dark hijab
    const enemy1 = makeEnemy("#3d2b1f", "Zahra", MAZE_W - 2, MAZE_H - 2, ENEMY_SPEED);
    // Add hijab
    const hijabMat = new THREE.MeshStandardMaterial({ color: 0x1a237e, roughness: 0.9 });
    const hijab = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), hijabMat);
    hijab.scale.set(1.1, 0.9, 1.1);
    hijab.position.y = 1.35;
    enemy1.mesh.add(hijab);
    // Hijab drape
    const drape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, 0.4, 8, 1, true),
      hijabMat
    );
    drape.position.y = 1.1;
    enemy1.mesh.add(drape);
    enemyArr.push(enemy1);

    // Indian girl - light skin, long dark hair, no hijab
    const enemy2 = makeEnemy("#e8c4a0", "Priya", 1, 1, ENEMY_SPEED * 1.1);
    // Long black hair
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });
    const hairFront = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), hairMat);
    hairFront.scale.set(1.05, 1.1, 1.1);
    hairFront.position.y = 1.37;
    hairFront.position.z = -0.02;
    enemy2.mesh.add(hairFront);
    // Long hair flowing down
    const hairBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.12, 0.7, 8),
      hairMat
    );
    hairBack.position.set(0, 0.95, -0.12);
    enemy2.mesh.add(hairBack);
    // Side hair strands
    for (const side of [-0.15, 0.15]) {
      const strand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.03, 0.5, 6),
        hairMat
      );
      strand.position.set(side, 1.0, -0.05);
      strand.rotation.z = side > 0 ? -0.1 : 0.1;
      enemy2.mesh.add(strand);
    }
    enemyArr.push(enemy2);

    return enemyArr;
  }

  // ── Lighting ──
  function setupLighting() {
    // Minimal ambient — super dark
    const ambient = new THREE.AmbientLight(0x111111, 0.3);
    scene.add(ambient);

    // Player flashlight
    const flashlight = new THREE.SpotLight(0xffeedd, 2, 20, Math.PI / 5, 0.5, 1.5);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight.target);
    scene.add(camera);

    // Occasional dim flickering lights
    for (let i = 0; i < 8; i++) {
      const light = new THREE.PointLight(0xff4444, 0.3, 8);
      light.position.set(
        Math.random() * MAZE_W * CELL,
        WALL_H - 0.3,
        Math.random() * MAZE_H * CELL
      );
      scene.add(light);
      // Flicker effect via userData
      (light as any).__flickerPhase = Math.random() * Math.PI * 2;
    }
  }

  // ── Simple pathfinding (BFS) ──
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

  // ── HUD overlay element ──
  let hudEl: HTMLDivElement | null = null;
  let interactEl: HTMLDivElement | null = null;

  function createHUD() {
    hudEl = document.createElement("div");
    hudEl.style.cssText = `
      position: fixed; top: 20px; left: 20px; color: #cc0000;
      font-family: 'Courier New', monospace; font-size: 14px;
      text-shadow: 0 0 10px #ff0000; pointer-events: none; z-index: 100;
      line-height: 1.8;
    `;
    document.body.appendChild(hudEl);

    interactEl = document.createElement("div");
    interactEl.style.cssText = `
      position: fixed; bottom: 30%; left: 50%; transform: translateX(-50%);
      color: #cccccc; font-family: 'Courier New', monospace; font-size: 16px;
      text-shadow: 0 0 8px #ffffff44; pointer-events: none; z-index: 100;
      opacity: 0; transition: opacity 0.2s;
    `;
    interactEl.textContent = "";
    document.body.appendChild(interactEl);
  }

  function updateHUD() {
    if (hudEl) {
      hudEl.innerHTML = [
        `<span style="color:#8b0000">⚡ THE MAZE</span>`,
        hasKey ? `<span style="color:#00ff00">🔑 KEY OBTAINED</span>` : `<span style="color:#660000">🔑 No key</span>`,
        `📝 Notes: ${notesCollected}/3`,
        `<span style="color:#ffffff22">WASD Move · Mouse Look</span>`,
        `<span style="color:#ffffff22">E Open Doors · F Pick Up</span>`,
        gameOver ? `<span style="color:#ff0000;font-size:24px">☠ YOU DIED ☠</span>` : "",
        gameWon ? `<span style="color:#00ff00;font-size:24px">🎃 YOU ESCAPED 🎃</span>` : "",
      ].join("<br>");
    }
  }

  // ── Start screen ──
  let startScreen = true;
  let startEl: HTMLDivElement | null = null;

  function createStartScreen() {
    startEl = document.createElement("div");
    startEl.style.cssText = `
      position: fixed; inset: 0; background: #000; z-index: 200;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: #8b0000; font-family: 'Courier New', monospace; cursor: pointer;
      user-select: none;
    `;
    startEl.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 10px; text-shadow: 0 0 30px #ff0000, 0 0 60px #8b0000; animation: pulse 2s ease-in-out infinite;">
        THE MAZE
      </div>
      <div style="font-size: 16px; color: #660000; margin-bottom: 40px; letter-spacing: 4px;">
        ESCAPE IF YOU CAN
      </div>
      <div style="font-size: 14px; color: #440000; margin-bottom: 8px;">
        Two girls stalk these halls...
      </div>
      <div style="font-size: 14px; color: #440000; margin-bottom: 30px;">
        Zahra never stops running. Priya knows every turn.
      </div>
      <div style="font-size: 20px; color: #cc0000; animation: blink 1s steps(1) infinite;">
        [ CLICK TO ENTER ]
      </div>
      <div style="margin-top: 40px; font-size: 12px; color: #330000; line-height: 2;">
        WASD — Move &nbsp;|&nbsp; MOUSE — Look Around<br>
        E — Open Doors &nbsp;|&nbsp; F — Pick Up Items<br>
        Find the KEY and ESCAPE through the EXIT
      </div>
      <style>
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
      </style>
    `;
    startEl.addEventListener("click", () => {
      startScreen = false;
      if (startEl) {
        startEl.style.opacity = "0";
        startEl.style.transition = "opacity 2s";
        setTimeout(() => startEl?.remove(), 2000);
      }
      canvas.requestPointerLock();
    });
    document.body.appendChild(startEl);
  }

  // ── Crosshair ──
  let crosshairEl: HTMLDivElement | null = null;
  function createCrosshair() {
    crosshairEl = document.createElement("div");
    crosshairEl.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 20px; height: 20px; pointer-events: none; z-index: 100; opacity: 0.5;
    `;
    crosshairEl.innerHTML = `
      <div style="position:absolute;top:50%;left:0;width:100%;height:1px;background:#ff000088"></div>
      <div style="position:absolute;top:0;left:50%;width:1px;height:100%;background:#ff000088"></div>
    `;
    document.body.appendChild(crosshairEl);
  }

  // ── INPUT ──
  function onKeyDown(e: KeyboardEvent) {
    keys[e.code] = true;
    if (e.code === "KeyE") ePressed = true;
    if (e.code === "KeyF") fPressed = true;
  }
  function onKeyUp(e: KeyboardEvent) {
    keys[e.code] = false;
  }
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
    if (!startScreen) {
      canvas.requestPointerLock();
    }
  });

  // ── Flashlight flicker ──
  let flashlightFlicker = 0;

  // ── Fade / vignette overlay ──
  let vignetteEl: HTMLDivElement | null = null;
  function createVignette() {
    vignetteEl = document.createElement("div");
    vignetteEl.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 99;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.8) 100%);
    `;
    document.body.appendChild(vignetteEl);
  }

  // Damage screen flash
  let damageFlashEl: HTMLDivElement | null = null;
  function createDamageFlash() {
    damageFlashEl = document.createElement("div");
    damageFlashEl.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 150;
      background: radial-gradient(ellipse at center, #ff000044, #8b000066);
      opacity: 0; transition: opacity 0.1s;
    `;
    document.body.appendChild(damageFlashEl);
  }

  let playerHealth = 100;
  let lastDamageTime = 0;

  // ── MAIN LOOP ──
  let prevTime = performance.now();

  createHUD();
  createCrosshair();
  createVignette();
  createDamageFlash();
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

    // ── Player Movement ──
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const moveDir = new THREE.Vector3();

    if (keys["KeyW"] || keys["ArrowUp"]) moveDir.add(forward);
    if (keys["KeyS"] || keys["ArrowDown"]) moveDir.sub(forward);
    if (keys["KeyA"] || keys["ArrowLeft"]) moveDir.sub(right);
    if (keys["KeyD"] || keys["ArrowRight"]) moveDir.add(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      // Head bob
      const bobSpeed = 8;
      const bobAmount = 0.04;
      const bob = Math.sin(now * 0.01 * bobSpeed) * bobAmount;
      camera.position.y = 1.7 + bob;
    } else {
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.7, 5 * dt);
    }

    velocity.x = moveDir.x * MOVE_SPEED;
    velocity.z = moveDir.z * MOVE_SPEED;

    const newPos = camera.position.clone();
    newPos.x += velocity.x * dt;
    newPos.z += velocity.z * dt;
    resolveCollision(newPos);
    camera.position.x = newPos.x;
    camera.position.z = newPos.z;

    // Camera look
    const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);

    // ── Flashlight flicker ──
    flashlightFlicker += dt * (3 + Math.sin(now * 0.001) * 2);
    const flashLight = camera.children.find((c) => c instanceof THREE.SpotLight) as THREE.SpotLight | undefined;
    if (flashLight) {
      const flicker = 1.5 + Math.sin(flashlightFlicker * 7) * 0.3 + Math.sin(flashlightFlicker * 13) * 0.15;
      flashLight.intensity = flicker;
    }

    // ── Ambient light flicker ──
    scene.children.forEach((child) => {
      if (child instanceof THREE.PointLight && (child as any).__flickerPhase !== undefined) {
        const phase = (child as any).__flickerPhase;
        child.intensity = 0.15 + Math.sin(now * 0.003 + phase) * 0.1 + (Math.random() > 0.97 ? 0.5 : 0);
      }
    });

    // ── Door Interaction (E) ──
    if (ePressed) {
      ePressed = false;
      for (const door of doors) {
        if (door.isOpen) continue;
        const dist = camera.position.distanceTo(door.position);
        if (dist < DOOR_RANGE) {
          if (door.walls?.[0]) {
            // It has a "wallDir" property we set; use that
          }
          door.isOpen = true;
          // Animate door open
          const startRot = door.mesh.rotation.y;
          const openAngle = door.wallDir === 1 ? -Math.PI / 2 : -Math.PI / 2;
          const startTime = now;
          const duration = 500;
          function animateDoor() {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = t * t * (3 - 2 * t); // smoothstep
            door.mesh.rotation.y = startRot + openAngle * ease;
            if (t < 1) requestAnimationFrame(animateDoor);
          }
          animateDoor();
          break;
        }
      }
    }

    // ── Pickup Interaction (F) ──
    if (fPressed) {
      fPressed = false;
      for (const p of pickups) {
        if (p.collected) continue;
        const dist = camera.position.distanceTo(p.position);
        if (dist < PICKUP_RANGE) {
          p.collected = true;
          scene.remove(p.mesh);
          if (p.type === "key") {
            hasKey = true;
          } else if (p.type === "note") {
            notesCollected++;
          }
          break;
        }
      }
    }

    // ── Show interact prompt ──
    let showPrompt = false;
    let promptText = "";
    for (const p of pickups) {
      if (p.collected) continue;
      const dist = camera.position.distanceTo(p.position);
      if (dist < PICKUP_RANGE) {
        showPrompt = true;
        if (p.type === "key") promptText = "[F] Pick up KEY";
        else if (p.type === "note") promptText = "[F] Read NOTE";
        else if (p.type === "battery") promptText = "[F] Pick up BATTERY";
        else if (p.type === "medkit") promptText = "[F] Pick up MEDKIT";
        break;
      }
    }
    if (!showPrompt) {
      for (const door of doors) {
        if (door.isOpen) continue;
        const dist = camera.position.distanceTo(door.position);
        if (dist < DOOR_RANGE) {
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
    const playerCellX = Math.round(camera.position.x / CELL);
    const playerCellZ = Math.round(camera.position.z / CELL);

    for (const enemy of enemies) {
      const distToPlayer = enemy.position.distanceTo(camera.position);

      // Switch state
      if (distToPlayer < ENEMY_CHASE_RANGE) {
        if (enemy.state !== "chase") {
          enemy.state = "chase";
          enemy.path = findPath(
            Math.round(enemy.position.x / CELL),
            Math.round(enemy.position.z / CELL),
            playerCellX,
            playerCellZ
          );
          enemy.pathIdx = 0;
        }
      } else {
        enemy.state = "patrol";
      }

      // Chase: re-pathfind occasionally
      if (enemy.state === "chase") {
        if (now % 500 < dt * 1000) {
          enemy.path = findPath(
            Math.round(enemy.position.x / CELL),
            Math.round(enemy.position.z / CELL),
            playerCellX,
            playerCellZ
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
            const speed = enemy.speed * dt;
            enemy.position.x += (dx / dist) * speed;
            enemy.position.z += (dz / dist) * speed;
          }
          // Face movement direction
          enemy.mesh.rotation.y = Math.atan2(dx, dz);
        } else {
          // Direct chase if no path
          const dx = camera.position.x - enemy.position.x;
          const dz = camera.position.z - enemy.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 0.1) {
            const speed = enemy.speed * dt;
            enemy.position.x += (dx / dist) * speed;
            enemy.position.z += (dz / dist) * speed;
          }
          enemy.mesh.rotation.y = Math.atan2(dx, dz);
        }

        // Attack
        if (distToPlayer < 1.2 && now - lastDamageTime > 1000) {
          playerHealth -= 15;
          lastDamageTime = now;
          if (damageFlashEl) {
            damageFlashEl.style.opacity = "1";
            setTimeout(() => {
              if (damageFlashEl) damageFlashEl.style.opacity = "0";
            }, 200);
          }
          if (playerHealth <= 0) {
            gameOver = true;
          }
        }
      } else {
        // Patrol — wander around
        if (enemy.path.length === 0 || Math.random() < 0.005) {
          const rx = Math.floor(Math.random() * MAZE_W);
          const rz = Math.floor(Math.random() * MAZE_H);
          enemy.path = findPath(
            Math.round(enemy.position.x / CELL),
            Math.round(enemy.position.z / CELL),
            rx,
            rz
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
            const speed = enemy.speed * 0.5 * dt;
            enemy.position.x += (dx / dist) * speed;
            enemy.position.z += (dz / dist) * speed;
          }
          enemy.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }

      // Bob animation for enemies
      enemy.mesh.position.y = Math.sin(now * 0.005 + enemy.mesh.position.x) * 0.1;
      enemy.mesh.position.x = enemy.position.x;
      enemy.mesh.position.z = enemy.position.z;
    }

    // ── Pickup rotation animation ──
    for (const p of pickups) {
      if (p.collected) continue;
      p.mesh.rotation.y = now * 0.002;
      p.mesh.position.y = p.position.y + Math.sin(now * 0.003) * 0.15;
    }

    // ── Win condition: reach exit with key ──
    const exitPos = new THREE.Vector3((MAZE_W - 1) * CELL, 0, (MAZE_H - 1) * CELL);
    if (hasKey && camera.position.distanceTo(exitPos) < 2) {
      gameWon = true;
    }

    // ── Health-based vignette ──
    if (vignetteEl) {
      const healthPct = playerHealth / 100;
      const vignetteStrength = 0.5 + (1 - healthPct) * 0.5;
      vignetteEl.style.background = `radial-gradient(ellipse at center, transparent ${40 - (1 - healthPct) * 20}%, rgba(${healthPct < 0.5 ? '139,0,0' : '0,0,0'},${vignetteStrength}) 100%)`;
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  animate();

  // ── Resize ──
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Cleanup ──
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    hudEl?.remove();
    interactEl?.remove();
    startEl?.remove();
    crosshairEl?.remove();
    vignetteEl?.remove();
    damageFlashEl?.remove();
    renderer.dispose();
  };
}
