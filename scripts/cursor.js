(() => {
  const CFG = {
    // Colors (edit to your brand)
    headColor: '#dcf8ffff',   // near the dot
    tailColor: '#fff7daff',   // at the far tip
    glowColor: 'rgba(255, 142, 37, 0.85)',

    headRadius: 15,         // dot size (px, CSS units)
    maxTailWidth: 26,       // wedge width at the head (px)
    tailMinWidth: 1.5,      // width at the very end (px)
    widthPower: 1.0,        // >1 makes it narrow faster toward the tip
    catchup: 0.25,
    segSpacingPx: 10,       // resample spacing (px)
    tailPoints: 48,         // number of evenly spaced points to keep
    maxDpr: 2,
    enableOnTouch: false
  };

  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (prefersReduced || (isTouch && !CFG.enableOnTouch)) return;

  const cvs = document.getElementById('comet-cursor');
  const ctx = cvs.getContext('2d');
  let dpr = Math.max(1, Math.min(CFG.maxDpr, devicePixelRatio || 1));
  let spacing = CFG.segSpacingPx * dpr;

  Object.assign(cvs.style, {
    position: 'fixed', inset: 0, width: '100vw', height: '100vh',
    pointerEvents: 'none', zIndex: 9999
  });

  const size = () => { cvs.width = Math.floor(innerWidth*dpr); cvs.height = Math.floor(innerHeight*dpr); };
  size();
  addEventListener('resize', () => {
    dpr = Math.max(1, Math.min(CFG.maxDpr, devicePixelRatio || 1));
    spacing = CFG.segSpacingPx * dpr;
    size();
  }, { passive: true });

  let tx=-9999, ty=-9999, x=tx, y=ty, lastMoveT=performance.now();
  const pts = []; // head at index 0 (evenly spaced)

  addEventListener('mousemove', e => {
    const r = cvs.getBoundingClientRect();
    tx = (e.clientX - r.left) * dpr;
    ty = (e.clientY - r.top)  * dpr;
    if (x === -9999) { x = tx; y = ty; }
    lastMoveT = performance.now();
  }, { passive: true });

  // Parse a CSS color to rgba string with custom alpha
  const colorWithA = (css, a=1) => {
    const el = document.createElement('span'); el.style.color = css; document.body.appendChild(el);
    const m = getComputedStyle(el).color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    document.body.removeChild(el);
    const [r,g,b] = m ? [m[1],m[2],m[3]] : [255,255,255];
    return (alpha)=>`rgba(${r},${g},${b},${alpha})`;
  };
  const headRGBA = colorWithA(CFG.headColor);
  const tailRGBA = colorWithA(CFG.tailColor);

  function insertHead(nx, ny) {
    if (!pts.length) { pts.unshift([nx, ny]); return; }
    let [hx, hy] = pts[0];
    let dx = nx - hx, dy = ny - hy;
    let dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return;
    const steps = Math.floor(dist / spacing);
    for (let i = 1; i <= steps; i++) {
      const t = (i * spacing) / dist;
      pts.unshift([hx + dx*t, hy + dy*t]);
    }
    pts.unshift([nx, ny]);
    while (pts.length > CFG.tailPoints) pts.pop();
  }

  // Build a ribbon polygon along the trail, width(t) varies head→tail
  function buildRibbon(points) {
    const n = points.length;
    if (n < 2) return null;

    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const p0 = points[Math.max(0, i-1)];
      const p1 = points[i];
      const p2 = points[Math.min(n-1, i+1)];
      // tangent
      let tx = p2[0]-p0[0], ty = p2[1]-p0[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      // outward normal
      const nx = -ty, ny = tx;

      const t = 1 - i/(n-1); // head→1, tail→0
      // tapered width curve
      const w = (CFG.tailMinWidth + (CFG.maxTailWidth - CFG.tailMinWidth) * Math.pow(t, CFG.widthPower)) * dpr;
      left.push([ p1[0] - nx*w*0.5, p1[1] - ny*w*0.5 ]);
      right.push([ p1[0] + nx*w*0.5, p1[1] + ny*w*0.5 ]);
    }
    return { left, right };
  }

  function tick(now) {
    // move comet
    x += (tx - x) * CFG.catchup;
    y += (ty - y) * CFG.catchup;

    insertHead(x, y);
    if (now - lastMoveT > 120 && pts.length) pts.pop();

    // clear
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cvs.width,cvs.height);

    // draw ribbon (filled polygon with gradient)
    const rib = buildRibbon(pts);
    if (rib) {
      const head = pts[0], tail = pts[pts.length-1];
      const grad = ctx.createLinearGradient(head[0], head[1], tail[0], tail[1]);
      grad.addColorStop(0, headRGBA(1));
      grad.addColorStop(1, tailRGBA(1));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(rib.left[0][0], rib.left[0][1]);
      for (let i=1;i<rib.left.length;i++) ctx.lineTo(rib.left[i][0], rib.left[i][1]);
      for (let i=rib.right.length-1;i>=0;i--) ctx.lineTo(rib.right[i][0], rib.right[i][1]);
      ctx.closePath();
      ctx.fill();

      // soft edge anti-alias: a faint stroke around the ribbon
      ctx.strokeStyle = tailRGBA(0.15);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // glow & core
    const r = CFG.headRadius * dpr;
    ctx.shadowColor = CFG.glowColor;
    ctx.shadowBlur = r * 1.4;
    ctx.fillStyle = headRGBA(1);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // quick console helpers
  window.CometCursor = {
    setColors(head, tail){ CFG.headColor=head; CFG.tailColor=tail; },
    setWidths(max, min=CFG.tailMinWidth){ CFG.maxTailWidth=max; CFG.tailMinWidth=min; },
  };
})();
