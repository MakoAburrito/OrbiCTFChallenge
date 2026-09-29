// Sky comets: TOP-edge lanes -> DOWN-LEFT, varied speeds, ALWAYS fade before exit.
(() => {
  const CFG = {
    SPRITE_URLS: [
      'Images/path58-9-6.png',
      'Images/path59-5-2.png',
    ],

    // motion/look
    angleDeg: [130, 150],          // down-left
    speedPxPerS: [240, 520],       // CSS px/s (random per comet)
    scale: [0.2, 0.7],
    spawnEveryMs: [700, 1400],
    blend: 'screen',
    anchorX: 0.85, anchorY: 0.50,  // where the bright head sits in the PNG

    // fade config (distance-based)
    fadeTailPx: 1000,               // last N CSS px will fade to 0 (raise for longer fade)
    fadePower: 3,                // 1=linear, >1 ease-in, <1 ease-out

    // layout/system
    margin: 80, maxActive: 14, maxDpr: 2, enableOnTouch: true, zIndex: -2,

    // TOP-edge lanes (X positions)
    lanes: 8,
    topXRange: [0.45, 1.05],       // fraction of viewport width used at the top
    minLaneGapPx: 420,             // along-lane spacing (CSS px)
    laneJitterPx: 18               // small X jitter within lane
  };

  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  const cv = document.getElementById('sky-comets');
  if (!cv) return;
  const ctx = cv.getContext('2d', { alpha: true });
  let dpr = Math.max(1, Math.min(CFG.maxDpr, window.devicePixelRatio || 1));

  Object.assign(cv.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh',
    pointerEvents: 'none', zIndex: String(CFG.zIndex)
  });

  const size = () => { cv.width = Math.floor(innerWidth*dpr); cv.height = Math.floor(innerHeight*dpr); };
  size();
  addEventListener('resize', () => {
    dpr = Math.max(1, Math.min(CFG.maxDpr, window.devicePixelRatio || 1));
    size();
    recomputeTopLanes();
  }, { passive: true });

  const randIn = (a,b)=> a + Math.random()*(b-a);
  const pick   = (arr)=> arr[(Math.random()*arr.length)|0];

  function preload(urls){
    return Promise.all(urls.map(src => new Promise((res, rej) => {
      const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src;
    })));
  }

  // ---------- TOP lanes along X ----------
  const topLanes = { x: [], nextFreeAt: [] }; // lane centers (X), cooldowns

  function recomputeTopLanes(){
    topLanes.x.length = 0; topLanes.nextFreeAt.length = 0;
    const [x0, x1] = CFG.topXRange;
    for (let i = 0; i < CFG.lanes; i++){
      const f = (i + 0.5) / CFG.lanes;
      const xFrac = x0 + (x1 - x0) * f;
      topLanes.x[i] = xFrac * cv.width;
      topLanes.nextFreeAt[i] = 0;
    }
  }
  recomputeTopLanes();

  // ---------- Comet ----------
  class Comet {
    init(img, laneIdx, speedCss, angleRad){
      this.img = img;
      this.laneIdx = laneIdx;
      this.scale = randIn(CFG.scale[0], CFG.scale[1]);

      // velocity (canvas px/s)
      this.speedCss = speedCss;                    // keep CSS speed for fade math
      const spd = speedCss * dpr;
      this.vx = Math.cos(angleRad) * spd;
      this.vy = Math.sin(angleRad) * spd;
      if (this.vx > 0) this.vx = -Math.abs(this.vx); // force left
      if (this.vy < 0) this.vy =  Math.abs(this.vy); // force down

      // start at top edge
      const m = CFG.margin * dpr;
      const jitterX = (Math.random()*2 - 1) * CFG.laneJitterPx * dpr;
      this.x = topLanes.x[laneIdx] + jitterX;
      this.y = -m;

      this.alpha = 1;
      this.alive = true;
    }

    // remaining distance (CSS px) to the exit boundary along this trajectory
    remainingDistanceCss(){
      const vwCss = cv.width  / dpr;
      const vhCss = cv.height / dpr;
      const xCss  = this.x / dpr;
      const yCss  = this.y / dpr;
      const vxCss = this.vx / dpr; // negative
      const vyCss = this.vy / dpr; // positive
      // time (s) to hit left or bottom + margin
      const tLeft   = (xCss + CFG.margin) / Math.max(1e-6, Math.abs(vxCss));
      const tBottom = ((vhCss + CFG.margin) - yCss) / Math.max(1e-6, Math.abs(vyCss));
      const tExit   = Math.min(tLeft, tBottom);
      return tExit * this.speedCss; // distance along path (CSS px)
    }

    step(dt){
      // fade based on remaining distance
      const rem = this.remainingDistanceCss();            // CSS px
      const a = Math.max(0, Math.min(1, rem / CFG.fadeTailPx));
      this.alpha = Math.pow(a, CFG.fadePower);            // ease-in fade

      // move
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // kill once fully faded or off-screen
      const m = CFG.margin * dpr;
      if (this.alpha <= 0 || this.x < -m || this.y > cv.height + m) this.alive = false;
    }

    draw(ctx){
      const w = this.img.width  * this.scale * dpr;
      const h = this.img.height * this.scale * dpr;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalCompositeOperation = CFG.blend;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = this.alpha;
      // keep PNG’s baked diagonal (no rotation)
      ctx.drawImage(this.img, -CFG.anchorX*w, -CFG.anchorY*h, w, h);
      ctx.restore();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Pool, spawn, loop ----------
  const pool=[], active=[];
  const getComet = ()=> pool.pop() || new Comet();
  let IMGS=[], nextSpawnAt=0;

  const scheduleNext = (now)=>{ const [a,b]=CFG.spawnEveryMs; nextSpawnAt = now + randIn(a,b); };

  function trySpawn(now){
    if (!IMGS.length || active.length >= CFG.maxActive) return false;

    const angleRad = randIn(CFG.angleDeg[0], CFG.angleDeg[1]) * Math.PI/180;
    const speedCss = randIn(CFG.speedPxPerS[0], CFG.speedPxPerS[1]); // varies per comet

    // cooldown so heads don't overlap in the same lane
    const gapTimeMs = (CFG.minLaneGapPx / Math.max(60, speedCss)) * 1000;

    const free = [];
    for (let i=0;i<CFG.lanes;i++) if (now >= topLanes.nextFreeAt[i]) free.push(i);
    if (!free.length) return false;

    const li = pick(free);
    const comet = getComet();
    comet.init(pick(IMGS), li, speedCss, angleRad);
    active.push(comet);

    topLanes.nextFreeAt[li] = now + gapTimeMs;
    return true;
  }

  let last = performance.now();
  preload(CFG.SPRITE_URLS).then(imgs => { IMGS = imgs; scheduleNext(last); requestAnimationFrame(tick); });

  function tick(now){
    const dt = Math.min(0.05, (now - last) / 1000); last = now;

    if (now >= nextSpawnAt){
      const spawned = trySpawn(now);
      scheduleNext(now + (spawned ? 0 : 200)); // if no lane free, retry soon
    }

    for (let i=active.length-1; i>=0; i--){
      const c = active[i]; c.step(dt);
      if (!c.alive){ active.splice(i,1); pool.push(c); }
    }

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cv.width,cv.height);
    for (let i=0;i<active.length;i++) active[i].draw(ctx);

    requestAnimationFrame(tick);
  }

  // quick knobs from console
  window.SkyComets = {
    setTopRange(x0,x1){ CFG.topXRange=[x0,x1]; recomputeTopLanes(); },
    setLanes(n){ CFG.lanes = n|0; recomputeTopLanes(); },
    setGap(px){ CFG.minLaneGapPx = px; },
    setSpeed(min,max){ CFG.speedPxPerS=[min,max]; },
    setSpawn(min,max){ CFG.spawnEveryMs=[min,max]; },
    setFade(px,power=CFG.fadePower){ CFG.fadeTailPx=px; CFG.fadePower=power; },
  };
})();
