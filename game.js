import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

export class Game {
  constructor(opts) {
    this.THREE = opts.THREE;
    this.canvas = opts.canvas;
    this.getHighScore = opts.getHighScore;
    this.setHighScore = opts.setHighScore;
    this.onHud = opts.onHud;
    this.onGameOver = opts.onGameOver;

    this.state = "menu"; 

    this._initRenderer();
    this._initTextures();
    this._initScene();
    this._initAudio();
    this._initInput();
    this._initWorld();

    // Resize handling
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this._lastTime = performance.now();
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  // ---------------------------
  // SETTINGS & RESIZE
  // ---------------------------
  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    this._applyQuality();
  }

  setQuality(q) {
    this._shadows = (q !== 'low');
    // Low: 1.0, Med: 1.5, High: Device Native
    this._pixelRatioCap = (q === 'low') ? 1.0 : (q === 'high' ? window.devicePixelRatio : 1.5);
    this._applyQuality();
    // Re-render immediately to prevent glitches
    this.renderer.render(this.scene, this.camera);
  }

  setAudioSettings({ volume, musicEnabled }) {
    this.audio.setVolume(volume);
    if(musicEnabled) this.audio.startMusic(); else this.audio.stopMusic();
  }

  // ---------------------------
  // INITIALIZATION
  // ---------------------------
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ 
        canvas: this.canvas, 
        antialias: true, 
        powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x87CEEB, 1); // Sky blue
    this._pixelRatioCap = 1.5;
    this._shadows = true; 
  }

  _applyQuality() {
    const pr = Math.min(window.devicePixelRatio || 1, this._pixelRatioCap);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = this._shadows;
    if(this._shadows) this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _initTextures() {
    // Helper to generate textures procedurally
    const createTex = (c1, c2, type) => {
      const size = 512;
      const cvs = document.createElement('canvas');
      cvs.width = cvs.height = size;
      const ctx = cvs.getContext('2d');
      ctx.fillStyle = c1;
      ctx.fillRect(0,0,size,size);
      
      if(type === 'noise') { // Asphalt / Concrete
        ctx.fillStyle = c2;
        for(let i=0; i<8000; i++) ctx.fillRect(Math.random()*size, Math.random()*size, 2, 2);
      } else if(type === 'planks') { // Wood sleepers
        ctx.fillStyle = c2;
        for(let i=0; i<size; i+=40) { 
            ctx.fillRect(0, i, size, 4); 
            ctx.fillRect(Math.random()*size, i, 4, 40); 
        }
      } else if(type === 'metal') { // Trains
         const grd = ctx.createLinearGradient(0,0,size,size);
         grd.addColorStop(0, c1); grd.addColorStop(1, c2);
         ctx.fillStyle = grd; ctx.fillRect(0,0,size,size);
         ctx.fillStyle = 'rgba(0,0,0,0.1)';
         ctx.fillRect(0,0,size,10); ctx.fillRect(0,0,10,size);
      } else if(type === 'stripes') { // Caution
          ctx.fillStyle = c2;
          ctx.beginPath();
          for(let i=-size; i<size*2; i+=60) { ctx.moveTo(i,0); ctx.lineTo(i+30, size); ctx.lineTo(i+60, size); ctx.lineTo(i+30, 0); }
          ctx.fill();
      } else if(type === 'windows') { // Buildings
          ctx.fillStyle = c2; 
          for(let y=20; y<size; y+=60) {
             for(let x=20; x<size; x+=50) {
                 if(Math.random()>0.2) ctx.fillRect(x,y, 30, 40);
             }
          }
      } else if(type === 'bricks') { // Tunnel
           ctx.fillStyle = c2;
           for(let y=0; y<size; y+=30) {
               const off = (y/30)%2 === 0 ? 0 : 25;
               for(let x=0; x<size; x+=50) ctx.fillRect(x+off, y, 45, 25);
           }
      }
      const tex = new THREE.CanvasTexture(cvs);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    this.tex = {
      ground: createTex('#222', '#333', 'noise'),
      wood: createTex('#4e342e', '#211', 'planks'),
      metal: createTex('#90a4ae', '#cfd8dc', 'metal'),
      trainRed: createTex('#b71c1c', '#d32f2f', 'metal'),
      caution: createTex('#ffeb3b', '#212121', 'stripes'),
      building: createTex('#37474f', '#cfd8dc', 'windows'), // Dark grey with lights
      tunnel: createTex('#3e2723', '#221111', 'bricks')
    };
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87CEEB, 20, 120);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    this.camera.position.set(0, 5, 8); 
    this.camera.lookAt(0, 2, -10);
    
    // Lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);
    
    this.sun = new THREE.DirectionalLight(0xfffaed, 1.2);
    this.sun.position.set(30, 60, 20); 
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    // Expand shadow area
    this.sun.shadow.camera.top = 50; this.sun.shadow.camera.bottom = -50;
    this.sun.shadow.camera.left = -30; this.sun.shadow.camera.right = 30;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
  }

  _initAudio() { this.audio = new AudioManager(); }

  _initInput() {
    this.input = new InputManager(this.canvas);
    window.addEventListener("keydown", e => {
      if(this.state !== 'running') {
          if(this.state === 'paused' && e.key === 'Escape') this.resume();
          return;
      }
      switch(e.key) {
        case 'ArrowLeft': case 'a': this.input.left(); break;
        case 'ArrowRight': case 'd': this.input.right(); break;
        case 'ArrowUp': case ' ': case 'w': this.input.up(); break;
        case 'ArrowDown': case 's': this.input.down(); break;
        case 'Escape': this.pause(); break;
      }
    });
  }

  _initWorld() {
    this.world = new THREE.Group();
    this.scene.add(this.world);
    
    // Tracks & Environment
    this.trackGroup = new THREE.Group();
    this.world.add(this.trackGroup);

    // Reusable Materials
    this.mat = {
      ground: new THREE.MeshStandardMaterial({ map: this.tex.ground }),
      rail: new THREE.MeshStandardMaterial({ color: 0x666666, roughness:0.5 }),
      sleeper: new THREE.MeshStandardMaterial({ map: this.tex.wood }),
      coin: new THREE.MeshStandardMaterial({ color: 0xffd700, metalness:1.0, roughness:0.2 }),
      
      trainBody: new THREE.MeshStandardMaterial({ map: this.tex.trainRed, roughness:0.4 }),
      trainRoof: new THREE.MeshStandardMaterial({ color: 0x333333, roughness:0.8 }),
      
      ramp: new THREE.MeshStandardMaterial({ map:this.tex.metal, roughness:0.5 }),
      barrier: new THREE.MeshStandardMaterial({ map:this.tex.caution }),
      
      building: new THREE.MeshStandardMaterial({ map: this.tex.building }),
      tunnel: new THREE.MeshStandardMaterial({ map: this.tex.tunnel, side: THREE.DoubleSide }),
      
      // Characters
      skin: new THREE.MeshStandardMaterial({ color: 0xffccaa }),
      shirt: new THREE.MeshStandardMaterial({ color: 0xff4400 }),
      pants: new THREE.MeshStandardMaterial({ color: 0x1a237e }),
      guard: new THREE.MeshStandardMaterial({ color: 0x263238 }), 
    };

    this.playerRig = this._createCharacter(this.mat.shirt, this.mat.pants, false);
    this.scene.add(this.playerRig.root);

    this.chaserRig = this._createCharacter(this.mat.guard, this.mat.guard, true);
    this.scene.add(this.chaserRig.root);

    this.chunks = [];
    this.obstacles = [];
    this.coins = [];
    this.lanes = [-2.5, 0.0, 2.5];
    this.chunkLen = 40; // Longer chunks for buildings
  }

  _createCharacter(matTop, matBot, isChaser) {
    const root = new THREE.Group();
    const hip = new THREE.Group(); 
    root.add(hip);

    const s = isChaser ? 1.15 : 1.0; 

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5*s, 0.7, 0.35*s), matTop);
    body.position.y = 1.25;
    body.castShadow = true;
    hip.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.45), this.mat.skin);
    head.position.y = 1.85;
    head.castShadow = true;
    hip.add(head);

    // Hat
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42*s, 0.15, 0.55), matBot);
    cap.position.set(0, 2.1, 0.05);
    hip.add(cap);

    // Limbs
    const geoLimb = new THREE.BoxGeometry(0.18*s, 0.7, 0.18*s);
    const armL = new THREE.Mesh(geoLimb, matTop);
    armL.position.set(-0.35*s, 1.3, 0);
    armL.geometry.translate(0, -0.25, 0);
    hip.add(armL);
    const armR = armL.clone();
    armR.position.set(0.35*s, 1.3, 0);
    hip.add(armR);

    const legL = new THREE.Mesh(geoLimb, matBot);
    legL.position.set(-0.15*s, 0.8, 0);
    legL.geometry.translate(0, -0.3, 0);
    hip.add(legL);
    const legR = legL.clone();
    legR.position.set(0.15*s, 0.8, 0);
    hip.add(legR);

    return { root, hip, head, armL, armR, legL, legR };
  }

  // ---------------------------
  // GAME LOOP
  // ---------------------------
  async startRun() {
    this.audio.unlock();
    this.audio.startMusic();
    this._resetRun();
    this.state = "running";
  }

  async restart() { this.startRun(); }
  pause() { if(this.state==='running') this.state='paused'; }
  resume() { if(this.state==='paused') { this.state='running'; this._lastTime=performance.now(); } }
  quitToMenu() { this.state='menu'; this.audio.stopMusic(); }

  _resetRun() {
    this.world.position.set(0,0,0);
    
    // Clean up
    this.chunks.forEach(c => this.trackGroup.remove(c.group));
    this.chunks = [];
    this.obstacles.forEach(o => this.trackGroup.remove(o.mesh));
    this.obstacles = [];
    this.coins.forEach(c => this.trackGroup.remove(c.mesh));
    this.coins = [];

    // Reset Player
    this.p = {
      lane: 1, x: 0, y: 0, 
      vy: 0, groundH: 0,
      state: 'run',
      rollTimer: 0,
      invuln: 0,
      speed: 12,
      targetSpeed: 14
    };

    // Reset Visuals
    this.playerRig.root.position.set(0,0,0);
    this.playerRig.root.rotation.set(0,0,0);
    this.playerRig.root.visible = true;

    this.chaserRig.root.position.set(0,0,3);
    this.chaserRig.root.visible = true;
    this.chaserDist = 3.5;

    this.score = 0;
    this.distance = 0;
    this.coinsCol = 0;
    this.input.reset();

    // Spawn Start Chunks
    let z = 0;
    for(let i=0; i<6; i++) {
       this._spawnChunk(z, i>3); // Only buildings after first few
       if(i > 2) this._spawnPattern(z);
       z -= this.chunkLen;
    }
  }

  _tick(time) {
    requestAnimationFrame(t => this._tick(t));
    if(this.state === 'paused' || this.state === 'menu') return;

    const dt = Math.min((time - this._lastTime)/1000, 0.05);
    this._lastTime = time;

    this._updateGame(dt);
    this.renderer.render(this.scene, this.camera);
    if(this.onHud) this.onHud({ score: Math.floor(this.score), coins: this.coinsCol });
  }

  // ---------------------------
  // PHYSICS & UPDATE
  // ---------------------------
  _updateGame(dt) {
    // Speed progression
    if(this.p.speed < this.p.targetSpeed) this.p.speed += dt * 0.5;
    this.p.targetSpeed += dt * 0.05;
    if(this.p.targetSpeed > 40) this.p.targetSpeed = 40;

    // Move World (+Z direction)
    const move = this.p.speed * dt;
    this.world.position.z += move;
    
    if(this.state === 'running') {
        this.distance += move;
        this.score += move * 2;
    }

    // Infinite Generation
    const frontZ = this.world.position.z + this.chunks[0].z;
    if(frontZ > 40) { // Chunk passed camera
      const c = this.chunks.shift();
      this.trackGroup.remove(c.group);
      
      const lastZ = this.chunks[this.chunks.length-1].z;
      const newZ = lastZ - this.chunkLen;
      
      // Tunnel logic (10% chance)
      const isTunnel = Math.random() < 0.1;
      this._spawnChunk(newZ, true, isTunnel);
      if(!isTunnel) this._spawnPattern(newZ); // Don't spawn patterns inside tunnels (keep it simple)
    }
    
    // Cull Entities
    const cullZ = -this.world.position.z + 30;
    for(let i=this.obstacles.length-1; i>=0; i--) {
        if(this.obstacles[i].z > cullZ) {
             this.trackGroup.remove(this.obstacles[i].mesh);
             this.obstacles.splice(i,1);
        }
    }

    // Chaser Logic
    let targetDist = (this.p.invuln > 0) ? 1.5 : 4.5;
    if(this.state === 'caught') targetDist = 0.8;
    this.chaserDist += (targetDist - this.chaserDist) * dt * 3.0;
    this.chaserRig.root.position.z = this.chaserDist;
    this.chaserRig.root.position.x += (this.p.x - this.chaserRig.root.position.x) * 5 * dt;

    if(this.state === 'running') this._updatePlayer(dt);
    else if(this.state === 'caught') this._animateCatch(dt);
  }

  _updatePlayer(dt) {
    const p = this.p;
    if(p.invuln > 0) p.invuln -= dt;

    // Lane Changing
    if(this.input.l) { p.lane = Math.max(0, p.lane-1); this.input.l=false; this.audio.playSfx('swipe'); }
    if(this.input.r) { p.lane = Math.min(2, p.lane+1); this.input.r=false; this.audio.playSfx('swipe'); }
    
    const targetX = this.lanes[p.lane];
    p.x += (targetX - p.x) * 18 * dt;

    // --- GROUND PHYSICS ---
    const pRealZ = -this.world.position.z; 
    let groundY = 0;
    
    for(const o of this.obstacles) {
        if(!o.isSolid) continue;
        // X overlap check (Broad)
        if(Math.abs(o.x - targetX) < 1.0) { 
            
            // RAMP LOGIC
            // Ramp goes from Z (Start, Low) to Z-length (End, High).
            if(o.type === 'ramp') {
                // Determine if we are within the ramp's Z range
                // Ramp Start: o.z + 4 (Nearest to camera)
                // Ramp End: o.z - 4 (Farthest)
                const startZ = o.z + 4;
                const endZ = o.z - 4;
                
                if(pRealZ <= startZ && pRealZ >= endZ) {
                    // Normalize position 0..1 (0 at start, 1 at end)
                    const progress = (startZ - pRealZ) / 8.0; 
                    const h = progress * 3.5;
                    if(h > groundY) groundY = h;
                }
            }
            
            // TRAIN LOGIC
            else if(o.type === 'train') {
                const halfLen = o.d / 2;
                const startZ = o.z + halfLen;
                const endZ = o.z - halfLen;
                
                if(pRealZ <= startZ + 0.5 && pRealZ >= endZ - 0.5) {
                    // Only snap to top if we are already high enough (jumped or ran up ramp)
                    if(p.y >= 3.0) {
                        groundY = 3.5; 
                    }
                }
            }
        }
    }
    p.groundH = groundY;

    // JUMP
    if(this.input.j && p.y <= p.groundH + 0.2) {
        p.vy = 13;
        p.state = 'jump';
        this.input.j = false;
        this.audio.playSfx('jump');
    }

    // DUCK / ROLL
    if(this.input.d && p.state !== 'roll') {
        p.state = 'roll';
        p.rollTimer = 0.8;
        if(p.y > p.groundH + 1) p.vy = -20; // Fast drop
        this.input.d = false;
        this.audio.playSfx('roll');
    }

    // GRAVITY
    p.vy -= 40 * dt;
    p.y += p.vy * dt;

    // Landing
    if(p.y < p.groundH) {
        p.y = p.groundH;
        p.vy = 0;
        if(p.state === 'jump') p.state = 'run';
    }

    if(p.state === 'roll') {
        p.rollTimer -= dt;
        if(p.rollTimer <= 0) p.state = 'run';
    }

    // Visuals
    this.playerRig.root.position.set(p.x, p.y, 0);
    this.playerRig.root.rotation.z = (p.x - targetX) * -0.12;

    this._checkCollisions(pRealZ);

    // Camera
    const camY = 5 + p.y * 0.6;
    const camX = p.x * 0.4;
    this.camera.position.y += (camY - this.camera.position.y) * 5 * dt;
    this.camera.position.x += (camX - this.camera.position.x) * 5 * dt;

    this._animateChar(this.playerRig, p.state, dt, false);
    this._animateChar(this.chaserRig, 'run', dt, true);
  }

  _checkCollisions(pRealZ) {
    if(this.p.invuln > 0) {
        this.playerRig.root.visible = Math.floor(performance.now() / 100) % 2 === 0;
        return; 
    }
    this.playerRig.root.visible = true;

    const p = this.p;
    for(const o of this.obstacles) {
        // Broad phase
        if(Math.abs(o.z - pRealZ) > o.d/2 + 0.5) continue;
        if(Math.abs(o.x - p.x) > o.w/2 + 0.2) continue;

        let hit = false;
        
        if(o.isSolid) {
            // Check if we hit the FACE of the object (didn't land on top)
            if(p.y < o.h - 0.5) hit = true;
        } else {
            // Barrier Logic
            if(o.type === 'low' && p.y < 1.0) hit = true; // Tripped
            if(o.type === 'high' && p.y > 1.5 && p.state !== 'roll') hit = true; // Bonk head
        }

        if(hit) {
            if(this.chaserDist < 2.0) this._catchPlayer(); 
            else this._stumble();
            return;
        }
    }

    // Coins
    for(const c of this.coins) {
        if(c.collected) continue;
        if(Math.abs(c.z - pRealZ) < 1.2 && Math.abs(c.x - p.x) < 0.8 && Math.abs(p.y - c.y) < 1.5) {
            c.collected = true;
            c.mesh.visible = false;
            this.coinsCol++;
            this.score += 50;
            this.audio.playSfx('coin');
        }
    }
  }

  _stumble() {
      this.audio.playSfx('crash');
      this.p.invuln = 1.0; 
      // Recover fast: only minor speed drop
      this.p.speed *= 0.7; 
      this.p.vy = 5; 
  }

  _catchPlayer() {
      this.state = 'caught';
      this.p.speed = 0;
      this.audio.stopMusic();
      this.audio.playSfx('crash');
      
      this.camera.position.set(2, 3, 6);
      this.camera.lookAt(0, 1, 0);

      setTimeout(() => {
          this.state = 'gameover';
          const s = Math.floor(this.score);
          if(s > this.getHighScore()) this.setHighScore(s);
          if(this.onGameOver) this.onGameOver({ reason: "BUSTED!", score:s, coins:this.coinsCol, isNewHigh: (s>this.getHighScore()) });
      }, 1500);
  }

  // ---------------------------
  // ANIMATIONS
  // ---------------------------
  _animateChar(rig, state, dt, isChaser) {
    const t = performance.now() * (isChaser ? 0.012 : 0.015);
    
    // Reset
    rig.hip.rotation.set(0,0,0);
    rig.hip.position.y = 0;
    rig.head.position.y = 1.85;
    
    if(state === 'run') {
       rig.armL.rotation.x = Math.sin(t)*0.9; rig.armR.rotation.x = Math.cos(t)*0.9;
       rig.legL.rotation.x = Math.cos(t)*0.9; rig.legR.rotation.x = Math.sin(t)*0.9;
       rig.hip.position.y = Math.abs(Math.sin(t*2)) * 0.1;
    } 
    else if(state === 'jump') {
       rig.armL.rotation.x = -2.5; rig.armR.rotation.x = -2.5;
       rig.legL.rotation.x = 0.5; rig.legR.rotation.x = -0.5;
    } 
    else if(state === 'roll') {
       // Proper crouch/slide animation
       rig.hip.position.y = -0.4; // Lower body
       rig.hip.rotation.x = -0.4; // Lean forward slightly
       
       // Legs forward (slide)
       rig.legL.rotation.x = -1.2; 
       rig.legR.rotation.x = -1.2;
       
       // Arms balance
       rig.armL.rotation.x = -0.5; rig.armR.rotation.x = -0.5;
       
       // Head up
       rig.head.rotation.x = 0.4; 
    }
  }

  _animateCatch(dt) {
    const p = this.playerRig;
    p.armL.rotation.x = -2.8; p.armR.rotation.x = -2.8;
    p.head.rotation.y = Math.sin(performance.now()*0.02)*0.2;
    
    const c = this.chaserRig;
    c.root.position.z = 0.8; 
    c.root.position.x = this.playerRig.root.position.x;
    c.armL.rotation.x = -1.5; c.armR.rotation.x = -1.5;
  }

  // ---------------------------
  // WORLD GENERATION
  // ---------------------------
  _spawnChunk(z, hasBuildings, isTunnel) {
    const group = new THREE.Group();

    // Floor
    const g = new THREE.Mesh(new THREE.PlaneGeometry(18, this.chunkLen), this.mat.ground);
    g.rotation.x = -Math.PI/2;
    g.position.set(0, 0, z);
    g.receiveShadow = true;
    group.add(g);

    // Tracks
    this.lanes.forEach(lx => {
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, this.chunkLen), this.mat.rail);
        r1.position.set(lx-0.4, 0.05, z);
        group.add(r1);
        const r2 = r1.clone();
        r2.position.set(lx+0.4, 0.05, z);
        group.add(r2);
        
        for(let j=-this.chunkLen/2; j<this.chunkLen/2; j+=1.5) {
            const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.4), this.mat.sleeper);
            s.position.set(lx, 0.02, z + j);
            group.add(s);
        }
    });

    // Buildings
    if(hasBuildings && !isTunnel) {
        [-9, 9].forEach(bx => {
            const h = 10 + Math.random()*15;
            const b = new THREE.Mesh(new THREE.BoxGeometry(6, h, this.chunkLen), this.mat.building);
            b.position.set(bx, h/2, z);
            group.add(b);
        });
    }

    // Tunnel
    if(isTunnel) {
        const tunnelGeo = new THREE.CylinderGeometry(9, 9, this.chunkLen, 16, 1, true, 0, Math.PI);
        const tunnel = new THREE.Mesh(tunnelGeo, this.mat.tunnel);
        tunnel.rotation.y = Math.PI/2; // Orient along Z
        tunnel.rotation.z = Math.PI/2; // Rotate arch
        // Cylinder oriented along Y default. 
        // We want length along Z. -> Rot X 90?
        // Let's rely on Box for walls and simple Plane for roof if Cylinder is tricky.
        // Actually Cylinder is fine:
        // Cylinder vertical. Rot X=90 -> Horizontal along Z.
        tunnel.rotation.set(Math.PI/2, 0, 0); // Along Z
        // Open ended? CylinderGeometry(radiusTop, radiusBottom, height...)
        // Top/Bot open. 
        // We want Arch. ThetaStart 0, Length PI.
        // If Rot X 90, the "Side" is the arch.
        tunnel.position.set(0, 0, z);
        tunnel.scale.set(1, 1, 1); // Radius 9 covers lanes
        group.add(tunnel);
        
        // Dim lights inside tunnel
        const light = new THREE.PointLight(0xffaa00, 1.0, 20);
        light.position.set(0, 6, z);
        group.add(light);
    }
    
    this.trackGroup.add(group);
    this.chunks.push({ group, z });
  }

  _spawnPattern(z) {
      const type = Math.random();
      const lane = Math.floor(Math.random()*3);
      
      if(type < 0.25) { // Single Train + Coins
          this._spawnTrain(this.lanes[lane], z, 12); // Length 12
          this._spawnCoins(this.lanes[(lane+1)%3], z, 5, 0);
      } 
      else if(type < 0.45) { // Long Train (Jumpable)
          this._spawnTrain(this.lanes[lane], z, 24); // Length 24
          // Coins ON TOP of train
          this._spawnCoins(this.lanes[lane], z, 8, 3.8);
      }
      else if(type < 0.65) { // Ramp + Train
          // Ramp at z+5, Train at z-8
          this._spawnRamp(this.lanes[lane], z + 6); 
          this._spawnTrain(this.lanes[lane], z - 8, 12); 
      } 
      else { // Barriers
          const l2 = (lane + 1) % 3;
          this._spawnBarrier(this.lanes[lane], z + 5, Math.random()>0.5?'low':'high');
          this._spawnBarrier(this.lanes[l2], z - 5, 'low');
          this._spawnCoins(this.lanes[lane], z - 5, 3, 0);
      }
  }

  _spawnTrain(x, z, length) {
      const grp = new THREE.Group();
      
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.5, length), this.mat.trainBody);
      body.position.y = 1.75;
      body.castShadow = true;
      grp.add(body);
      
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, length+0.2), this.mat.trainRoof);
      roof.position.y = 3.6;
      grp.add(roof);

      // Lights
      const light = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.2), new THREE.MeshBasicMaterial({color:0xffffaa}));
      light.rotation.x = Math.PI/2;
      light.position.set(0.6, 0.8, length/2); // Front
      grp.add(light);
      
      const light2 = light.clone();
      light2.position.set(-0.6, 0.8, length/2);
      grp.add(light2);

      grp.position.set(x, 0, z);
      this.trackGroup.add(grp);
      this.obstacles.push({ mesh:grp, type:'train', x, z, w:2.3, h:3.5, d:length, isSolid:true });
  }

  _spawnRamp(x, z) {
      const grp = new THREE.Group();
      
      // Slope: Box rotated to form incline
      // Start (z+4) at y=0. End (z-4) at y=3.5.
      // Pivot at Start.
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 8.5), this.mat.ramp);
      ramp.position.z = -4.25; // Pivot offset
      
      const pivot = new THREE.Group();
      pivot.add(ramp);
      pivot.rotation.x = 0.45; // Slope Up
      
      // Place pivot at Start of ramp (Z + 4)
      pivot.position.z = 4;
      grp.add(pivot);

      // Support
      const supp = new THREE.Mesh(new THREE.BoxGeometry(2, 3.5, 0.5), this.mat.trainRoof);
      supp.position.set(0, 1.75, -4);
      grp.add(supp);

      grp.position.set(x, 0, z); // z is center of 8 unit ramp
      this.trackGroup.add(grp);
      this.obstacles.push({ mesh:grp, type:'ramp', x, z, w:2.2, h:3.5, d:8, isSolid:true });
  }

  _spawnBarrier(x, z, type) {
      let m;
      if(type==='high') {
          m = new THREE.Group();
          const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.3,3.5,0.3), this.mat.trainRoof);
          p1.position.set(-0.9, 1.75, 0);
          const p2 = p1.clone(); p2.position.set(0.9, 1.75, 0);
          const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.3), this.mat.barrier);
          top.position.y = 3.0;
          m.add(p1,p2,top);
      } else {
          m = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 0.3), this.mat.barrier);
          m.position.y = 0.6;
      }
      m.position.set(x, 0, z);
      m.castShadow = true;
      this.trackGroup.add(m);
      this.obstacles.push({ mesh:m, type, x, z, w:2, h:type==='high'?3.2:1.2, d:0.5, isSolid:false });
  }

  _spawnCoins(x, z, num, yOff) {
      const y = 1.2 + (yOff||0);
      for(let i=0; i<num; i++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,0.1,12), this.mat.coin);
          c.rotation.x = Math.PI/2;
          c.position.set(x, y, z - i*2.0);
          this.trackGroup.add(c);
          this.coins.push({ mesh:c, x, y, z: z-i*2.0, collected:false });
      }
  }
}

class InputManager {
    constructor(cvs) { this.reset(); this._touch(cvs); }
    reset() { this.l=false; this.r=false; this.j=false; this.d=false; }
    left() { this.l=true; } right() { this.r=true; }
    up() { this.j=true; } down() { this.d=true; }
    _touch(el) {
        let sx, sy;
        el.addEventListener('touchstart', e => { sx=e.touches[0].clientX; sy=e.touches[0].clientY; }, {passive:true});
        el.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - sx;
            const dy = e.changedTouches[0].clientY - sy;
            if(Math.abs(dx)>Math.abs(dy)) { if(Math.abs(dx)>30) dx>0?this.right():this.left(); }
            else { if(Math.abs(dy)>30) dy>0?this.down():this.up(); }
        }, {passive:true});
    }
}

class AudioManager {
    constructor() { this.ctx=null; this.vol=0.6; }
    unlock() { if(!this.ctx) this.ctx=new(window.AudioContext||window.webkitAudioContext)(); if(this.ctx.state==='suspended') this.ctx.resume(); }
    setVolume(v) { this.vol = v; }
    startMusic() {
        if(!this.ctx) return;
        this.stopMusic();
        this.int = setInterval(() => {
            if(this.ctx.state==='running') {
               this._tone(100,'square',0.1,0.15); 
               setTimeout(()=>this._tone(800,'triangle',0.05,0.05), 200); 
            }
        }, 400);
    }
    stopMusic() { clearInterval(this.int); }
    playSfx(t) {
        if(!this.ctx) return;
        if(t==='jump') this._tone(400,'sine',0.2,0.1);
        if(t==='roll') this._tone(200,'sine',0.2,0.1);
        if(t==='swipe') this._tone(600,'triangle',0.05,0.05);
        if(t==='coin') { this._tone(1200,'sine',0.1,0.1); setTimeout(()=>this._tone(1800,'sine',0.1,0.1),80); }
        if(t==='crash') this._tone(100,'sawtooth',0.5,0.3);
    }
    _tone(f,t,d,v) {
        const o=this.ctx.createOscillator(); const g=this.ctx.createGain();
        o.type=t; o.frequency.value=f;
        g.gain.setValueAtTime(v*this.vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime+d);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(); o.stop(this.ctx.currentTime+d);
    }
}