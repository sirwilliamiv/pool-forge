/* Addy · the Inbox Admin assistant character.
   One navy blob, crescent eyes, gooey morphs. SVG face + two canvas effect layers.
   Motion grammar sampled frame-by-frame from the Grok bot icon study:
   snappy 100-180ms morphs, collapse-through-a-droplet transitions, lively holds.
   Zero dependencies. See personification-map.md for the state vocabulary. */

(function (global) {
  'use strict';

  const NAVY = '#1e2a4a';
  const PAPER = '#FAFAF7';
  const BLUE = '#2563eb';
  // jewel tones: richer than pastel, calmer than neon
  const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6'];
  const N = 64;            // points per body outline
  const R = 46;            // base body radius in svg units (viewBox 200)
  const TAU = Math.PI * 2;

  /* ---------- easing ---------- */
  const ease = {
    linear: t => t,
    inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    outBack: t => { const c = 1.70158 + 1; return 1 + c * Math.pow(t - 1, 3) + (c - 1) * Math.pow(t - 1, 2); },
    outElastic: t => t === 0 ? 0 : t === 1 ? 1 :
      Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
  };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- metallic color helpers ---------- */
  const _rgbCache = {};
  function rgbOf(hex) {
    if (!_rgbCache[hex]) _rgbCache[hex] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return _rgbCache[hex];
  }
  // k > 0 tints toward white, k < 0 shades toward black
  function mixc(hex, k) {
    const [r, g, b] = rgbOf(hex);
    const to = k > 0 ? 255 : 0, f = Math.abs(k);
    return `rgb(${Math.round(lerp(r, to, f))},${Math.round(lerp(g, to, f))},${Math.round(lerp(b, to, f))})`;
  }
  // brushed-metal gradient along a stroke, with a specular band at pos (0..1)
  function metalGrad(ctx, x1, y1, x2, y2, color, pos) {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    const p = clamp(pos, 0.12, 0.88);
    g.addColorStop(0, mixc(color, -0.3));
    g.addColorStop(clamp(p - 0.26, 0.01, 0.98), color);
    g.addColorStop(p, mixc(color, 0.55));
    g.addColorStop(clamp(p + 0.26, p + 0.01, 0.99), color);
    g.addColorStop(1, mixc(color, -0.22));
    return g;
  }

  /* ---------- body shapes: each returns N points, unit radius ---------- */
  function ring(fn) {
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (i / N) * TAU;
      pts.push(fn(a));
    }
    return pts;
  }
  function roundedPoly(sides, roundness, rot) {
    return ring(a => {
      const m = ((a - rot) % (TAU / sides) + TAU / sides) % (TAU / sides);
      const rp = Math.cos(Math.PI / sides) / Math.cos(m - Math.PI / sides);
      const r = lerp(rp, 1, roundness);
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  }
  const SHAPES = {
    circle: () => ring(a => ({ x: Math.cos(a), y: Math.sin(a) })),
    egg: () => ring(a => {
      let x = Math.cos(a), y = Math.sin(a) * 1.14;
      if (y < 0) x *= 1 - 0.28 * (-y / 1.14);
      return { x, y: y + 0.06 };
    }),
    hex: () => roundedPoly(6, 0.3, Math.PI / 6),
    tri: () => roundedPoly(3, 0.42, -Math.PI / 2),
    drop: (angle) => ring(a => {
      const spike = Math.pow(Math.max(0, Math.cos(a - angle)), 9) * 0.95;
      const r = 0.92 + spike;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }),
    // the universal transition droplet: compact, slight tail down
    gather: () => ring(a => {
      const spike = Math.pow(Math.max(0, Math.sin(a)), 5) * 0.4;
      const r = 0.88 + spike;
      return { x: Math.cos(a) * r * 0.94, y: Math.sin(a) * r };
    }),
    // exclamation bar: tapered like the glyph, wide top, narrow bottom
    bar: () => ring(a => {
      const c = Math.cos(a), s = Math.sin(a), p = 2 / 4.5;
      const y = 0.9 * Math.sign(s) * Math.pow(Math.abs(s), p);
      const w = 0.31 - 0.1 * (y / 0.9);
      return { x: Math.sign(c) * Math.pow(Math.abs(c), p) * w, y };
    }),
  };

  function pathFrom(pts, scale) {
    // closed Catmull-Rom loop rendered as cubic beziers
    const n = pts.length;
    const P = i => pts[(i + n) % n];
    let d = `M ${P(0).x * scale} ${P(0).y * scale}`;
    for (let i = 0; i < n; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x * scale} ${c1y * scale} ${c2x * scale} ${c2y * scale} ${p2.x * scale} ${p2.y * scale}`;
    }
    return d + ' Z';
  }

  /* ---------- eye poses ----------
     open: 0 closed sliver .. 1 wide oval | curve: -1 frown arc .. 1 happy arc
     dy: droop offset | ring: hollow ring alpha */
  const EYE = {
    neutral:   { open: 0.14, curve: 0.55, dy: 0, ring: 0 },
    happy:     { open: 0.10, curve: 1.0,  dy: 0, ring: 0 },
    alert:     { open: 0.95, curve: 0,    dy: 0, ring: 0 },
    focus:     { open: 0.45, curve: 0,    dy: 1, ring: 0 },
    squint:    { open: 0.07, curve: 0.25, dy: 1, ring: 0 },
    suspicious:{ open: 0.10, curve: -0.7, dy: 1, ring: 0 },
    sleepy:    { open: 0.05, curve: -0.15,dy: 5, ring: 0 },
    closed:    { open: 0.02, curve: 0.3,  dy: 2, ring: 0 },
    rings:     { open: 0.5,  curve: 0,    dy: 0, ring: 1 },
  };

  /* =================================================================== */

  class Addy {
    constructor(stage, opts = {}) {
      this.stage = stage;
      this.size = opts.size || 150;                    // css px of the svg box
      this.state = 'idle';
      this.energy = 1;
      this.amp = 0;                                    // live voice amplitude 0..1
      this.t = 0;
      this.gen = 0;
      this._tweens = [];
      this._loop = null;
      this.particles = [];
      this.ringsFx = [];
      this.ticks = [];
      this.trail = [];
      this.ribbons = [];
      this.ribbonOn = 0;                               // 0..1 fade
      this._ribbonGen = 0;
      this.arcT = 0;                                   // speaking bezel ring, 0..1
      this.listenFx = false;
      this._lastRing = 0;

      // kinematics
      const home = opts.home || { x: stage.clientWidth - 120, y: stage.clientHeight - 120 };
      this.home = { ...home };
      this.pos = { ...home };
      this.vel = { x: 0, y: 0 };
      this.target = { ...home };
      this.springK = 0;                                // 0 = parked
      this.rot = 0; this.sx = 1; this.sy = 1; this.scl = 1;
      this.gaze = { x: 0, y: 0 };
      this.faceAlpha = 1;
      this.auxT = 0;                                   // thinking dots 0..1
      this.auxDotT = 0;                                // "!" bottom dot 0..1
      this.badgeT = 0;
      this.pulse = { l: 0, m: 1, r: 0 };
      this.bodyPulse = 1;
      this.wrapDx = 0; this.wrapDy = 0;
      this.dropAngle = 0;
      this._dropLive = false;

      this.pts = SHAPES.circle();
      this.eyeL = { ...EYE.neutral }; this.eyeR = { ...EYE.neutral };
      this._nextBlink = 2 + Math.random() * 3;

      // cursor awareness: in idle he watches the pointer
      this.cursor = null; this._cursorAt = -10;
      this._onMouse = (e) => {
        const r = this.stage.getBoundingClientRect();
        this.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
        this._cursorAt = this.t;
      };
      window.addEventListener('mousemove', this._onMouse, { passive: true });

      this._buildDom();
      this._raf = null;
      this._last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this._tick(dt);
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
      this.set('idle');
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      window.removeEventListener('mousemove', this._onMouse);
      this.wrap.remove(); this.cvB.remove(); this.cvF.remove();
    }

    /* ---------- dom ---------- */
    _buildDom() {
      const mk = (z) => {
        const cv = document.createElement('canvas');
        Object.assign(cv.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: z });
        this.stage.appendChild(cv);
        return cv;
      };
      this.cvB = mk(50); this.ctxB = this.cvB.getContext('2d');   // behind the body
      this.cvF = mk(60); this.ctxF = this.cvF.getContext('2d');   // in front of the body
      this._resize(); new ResizeObserver(() => this._resize()).observe(this.stage);

      const wrap = document.createElement('div');
      Object.assign(wrap.style, { position: 'absolute', left: 0, top: 0, width: this.size + 'px', height: this.size + 'px', pointerEvents: 'none', zIndex: 55, willChange: 'transform' });
      const U = 'addy' + (Addy._uid = (Addy._uid || 0) + 1);   // per-instance defs ids
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '-100 -100 200 200');
      svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
      svg.style.overflow = 'visible';
      svg.innerHTML = `
        <defs>
          <filter id="${U}-goo" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/>
            <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" result="g"/>
            <feComposite in="SourceGraphic" in2="g" operator="atop"/>
          </filter>
          <radialGradient id="${U}-sheen" cx="0.42" cy="0.36" r="0.85">
            <stop offset="0" stop-color="#454e5c"/>
            <stop offset="0.5" stop-color="#2b313c"/>
            <stop offset="0.78" stop-color="#1d222c"/>
            <stop offset="1" stop-color="#14181f"/>
          </radialGradient>
          <radialGradient id="${U}-vig" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="rgba(0,0,0,0)"/>
            <stop offset="0.7" stop-color="rgba(0,0,0,0)"/>
            <stop offset="0.88" stop-color="rgba(0,0,0,0.42)"/>
            <stop offset="1" stop-color="rgba(0,0,0,0.5)"/>
          </radialGradient>
          <radialGradient id="${U}-badge" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stop-color="#6b96f8"/>
            <stop offset="0.6" stop-color="${BLUE}"/>
            <stop offset="1" stop-color="#1d4ed8"/>
          </radialGradient>
          <clipPath id="${U}-clip"><path class="clipP"/></clipPath>
          <radialGradient id="${U}-smokeA" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="rgba(6,8,12,0.6)"/><stop offset="0.55" stop-color="rgba(6,8,12,0.35)"/><stop offset="1" stop-color="rgba(6,8,12,0)"/>
          </radialGradient>
          <radialGradient id="${U}-smokeB" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="rgba(29,48,80,0.5)"/><stop offset="1" stop-color="rgba(29,48,80,0)"/>
          </radialGradient>
          <radialGradient id="${U}-smokeC" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="rgba(74,52,22,0.42)"/><stop offset="1" stop-color="rgba(74,52,22,0)"/>
          </radialGradient>
          <radialGradient id="${U}-smokeD" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="rgba(150,162,180,0.2)"/><stop offset="1" stop-color="rgba(150,162,180,0)"/>
          </radialGradient>
          <linearGradient id="${U}-eyeRim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="rgba(140,190,255,0.6)"/>
            <stop offset="0.5" stop-color="rgba(255,255,255,0.2)"/>
            <stop offset="1" stop-color="rgba(255,160,110,0.5)"/>
          </linearGradient>
          <radialGradient id="${U}-shadow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="rgba(0,0,0,0.26)"/><stop offset="0.6" stop-color="rgba(0,0,0,0.12)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/>
          </radialGradient>
          <filter id="${U}-eyeShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.6" stdDeviation="1.3" flood-color="rgba(0,0,0,0.45)"/>
          </filter>
        </defs>
        <g class="root">
          <ellipse class="shadow" cx="0" cy="60" rx="52" ry="14" fill="url(#${U}-shadow)"/>
          <g filter="url(#${U}-goo)">
            <circle class="auxL" r="0" fill="url(#${U}-sheen)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
            <circle class="auxR" r="0" fill="url(#${U}-sheen)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
            <circle class="auxDot" r="0" fill="url(#${U}-sheen)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
            <path class="body" fill="url(#${U}-sheen)"/>
          </g>
          <g class="inner" clip-path="url(#${U}-clip)">
            <ellipse class="smokeA" rx="58" ry="46" fill="url(#${U}-smokeA)"/>
            <ellipse class="smokeB" rx="42" ry="46" fill="url(#${U}-smokeB)"/>
            <ellipse class="smokeC" rx="36" ry="28" fill="url(#${U}-smokeC)"/>
            <ellipse class="smokeD" rx="34" ry="40" fill="url(#${U}-smokeD)"/>
            <ellipse class="smokeE" rx="40" ry="30" fill="url(#${U}-smokeD)"/>
            <path class="vig" fill="url(#${U}-vig)"/>
          </g>
          <g class="rim" stroke-linecap="round" fill="none">
            <path class="fringeWarmS" stroke="#ff9040" stroke-width="7" opacity="0.22" pathLength="100" stroke-dasharray="26 74"/>
            <path class="fringeWarm" stroke="#ff9040" stroke-width="2.8" opacity="0.7" pathLength="100" stroke-dasharray="26 74"/>
            <path class="fringeRed" stroke="#ff4d5e" stroke-width="2" opacity="0.5" pathLength="100" stroke-dasharray="20 80"/>
            <path class="fringeCoolS" stroke="#57a8ff" stroke-width="6.8" opacity="0.2" pathLength="100" stroke-dasharray="24 76"/>
            <path class="fringeCool" stroke="#57a8ff" stroke-width="2.5" opacity="0.65" pathLength="100" stroke-dasharray="24 76"/>
            <path class="rimBand" stroke="rgba(255,255,255,0.16)" stroke-width="9" pathLength="100"/>
            <path class="rimBase" stroke="rgba(255,255,255,0.5)" stroke-width="4.2" pathLength="100"/>
            <path class="rimBright" stroke="#ffffff" stroke-width="2.8" opacity="0.95" pathLength="100" stroke-dasharray="24 26 18 32"/>
          </g>
          <g class="face" filter="url(#${U}-eyeShadow)">
            <g class="eyeL"><path class="arc" fill="${PAPER}" stroke="url(#${U}-eyeRim)" stroke-width="1.1"/>
              <ellipse class="oval" fill="${PAPER}" stroke="url(#${U}-eyeRim)" stroke-width="1.1"/><circle class="ring" r="8.5" stroke="${PAPER}" stroke-width="5" fill="none" opacity="0"/></g>
            <g class="eyeR"><path class="arc" fill="${PAPER}" stroke="url(#${U}-eyeRim)" stroke-width="1.1"/>
              <ellipse class="oval" fill="${PAPER}" stroke="url(#${U}-eyeRim)" stroke-width="1.1"/><circle class="ring" r="8.5" stroke="${PAPER}" stroke-width="5" fill="none" opacity="0"/></g>
          </g>
          <g class="badgeG" opacity="0"><circle r="11" cx="34" cy="-36" fill="url(#${U}-badge)" stroke="${PAPER}" stroke-width="4"/></g>
        </g>`;
      wrap.appendChild(svg);
      this.stage.appendChild(wrap);
      this.wrap = wrap;
      const q = s => svg.querySelector(s);
      this.el = {
        root: q('.root'), body: q('.body'), face: q('.face'),
        auxL: q('.auxL'), auxR: q('.auxR'), auxDot: q('.auxDot'), badge: q('.badgeG'),
        eyeL: q('.eyeL'), eyeR: q('.eyeR'),
        clipP: q('.clipP'), vig: q('.vig'), inner: q('.inner'), rim: q('.rim'), shadow: q('.shadow'),
        rimBase: q('.rimBase'), rimBright: q('.rimBright'),
        fringeWarm: q('.fringeWarm'), fringeCool: q('.fringeCool'), fringeRed: q('.fringeRed'),
        fringeWarmS: q('.fringeWarmS'), fringeCoolS: q('.fringeCoolS'), rimBand: q('.rimBand'),
        smokeA: q('.smokeA'), smokeB: q('.smokeB'), smokeC: q('.smokeC'),
        smokeD: q('.smokeD'), smokeE: q('.smokeE'),
      };
    }

    _resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const [cv, ctx] of [[this.cvB, this.ctxB], [this.cvF, this.ctxF]]) {
        cv.width = this.stage.clientWidth * dpr;
        cv.height = this.stage.clientHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    /* ---------- tween core ---------- */
    tw(dur, fn, e = ease.inOut) {
      return new Promise(res => this._tweens.push({ t: 0, dur, fn, e, res }));
    }
    _advanceTweens(dt) {
      for (let i = this._tweens.length - 1; i >= 0; i--) {
        const tw = this._tweens[i];
        tw.t += dt;
        const p = clamp(tw.t / tw.dur, 0, 1);
        tw.fn(tw.e(p));
        if (p >= 1) { this._tweens.splice(i, 1); tw.res(); }
      }
    }
    _sleep(s) { return this.tw(s, () => {}, ease.linear); }

    morphTo(shapeName, dur = 0.18, e = ease.outBack) {
      const from = this.pts.map(p => ({ ...p }));
      const to = shapeName === 'drop' ? SHAPES.drop(this.dropAngle) : SHAPES[shapeName]();
      this._dropLive = shapeName === 'drop';
      return this.tw(dur, p => {
        const tgt = this._dropLive ? SHAPES.drop(this.dropAngle) : to;
        this.pts = from.map((f, i) => ({ x: lerp(f.x, tgt[i].x, p), y: lerp(f.y, tgt[i].y, p) }));
      }, e);
    }
    eyesTo(name, dur = 0.16, which = 'both') {
      const tgt = EYE[name];
      const go = (eye) => {
        const from = { ...eye };
        return this.tw(dur, p => {
          for (const k of ['open', 'curve', 'dy', 'ring']) eye[k] = lerp(from[k], tgt[k], p);
        });
      };
      const ps = [];
      if (which !== 'right') ps.push(go(this.eyeL));
      if (which !== 'left') ps.push(go(this.eyeR));
      return Promise.all(ps);
    }
    async squashStretch() {
      await this.tw(0.08, p => { this.sx = lerp(1, 1.14, p); this.sy = lerp(1, 0.8, p); }, ease.out);
      this.tw(0.38, p => { this.sx = lerp(1.14, 1, p); this.sy = lerp(0.8, 1, p); }, ease.outElastic);
    }
    // collapse into the droplet, then pop out as a new shape (the video's universal transition)
    async reform(shape, opts = {}) {
      const g = this.gen;
      this.morphTo('gather', 0.11, ease.in);
      await this.tw(0.11, p => {
        this.scl = lerp(this.scl, 0.55, p); this.sx = lerp(this.sx, 1, p); this.sy = lerp(this.sy, 1, p);
        this.rot = lerp(this.rot, 0, p);
      }, ease.in);
      if (this.gen !== g) return;
      this.morphTo(shape, 0.17, ease.outBack);
      await this.tw(0.17, p => { this.scl = lerp(0.55, opts.scl ?? 1, p); this.rot = lerp(0, opts.rot ?? 0, p); }, ease.outBack);
    }
    // the eyes take a quick lap around the face (spin flourish when re-forming)
    async _rollEyes() {
      const g = this.gen;
      await this.tw(0.55, p => {
        const a = -Math.PI / 2 + p * TAU;
        this.gaze.x = Math.cos(a) * 13 * Math.sin(p * Math.PI);
        this.gaze.y = Math.sin(a) * 9 * Math.sin(p * Math.PI);
      }, ease.inOut);
      if (this.gen !== g) return;
      this.tw(0.15, p => { this.gaze.x = lerp(this.gaze.x, 0, p); this.gaze.y = lerp(this.gaze.y, 0, p); });
    }

    /* ---------- state machine ---------- */
    async set(name, opts = {}) {
      const g = ++this.gen;
      this._wasSmall = this.scl < 0.6;
      this.state = name;
      this._loop = null;
      this.listenFx = false;
      this.bodyPulse = 1; this.badgePulse = 1;
      this._recallSwarm();
      const speed = this.energy < 0.35 ? 1.25 : 1;   // tired = slower everything

      const alive = () => this.gen === g;
      const enter = this['_st_' + name];
      if (enter) await enter.call(this, { g, alive, speed, ...opts });
    }

    _park() { this.springK = 0; }
    _goHome(k = 10) { this.target = { ...this.home }; this.springK = k; }

    _resetCommon() {
      this.tw(0.15, p => { this.badgeT = lerp(this.badgeT, 0, p); });
      this.tw(0.15, p => { this.auxT = lerp(this.auxT, 0, p); this.auxDotT = lerp(this.auxDotT, 0, p); });
      this.ribbonFade(0);
      this.wrapDx = 0; this.wrapDy = 0;
      this.rot = ((this.rot % 360) + 540) % 360 - 180;   // shortest way back after tumbles
      // retract the pointing arm and release any element highlight
      const a = this.arm, h = this.hl;
      if (a) { const s = a.on; this.tw(0.18, p => { a.on = s * (1 - p); if (p >= 1 && this.arm === a) this.arm = null; }, ease.in); }
      if (h) { const s = h.on; this.tw(0.22, p => { h.on = s * (1 - p); if (p >= 1 && this.hl === h) this.hl = null; }); }
    }
    ribbonFade(to) {
      const tok = ++this._ribbonGen;
      if (to > 0 && this.ribbons.length === 0) {
        const cols = [...PALETTE].sort(() => Math.random() - 0.5);
        for (let j = 0; j < 5; j++) {
          this.ribbons.push({
            tilt: Math.random() * Math.PI, speed: (2.2 + Math.random() * 1.6) * (j % 2 ? 1 : -1),
            phase: Math.random() * TAU, len: 1.1 + Math.random() * 1.5, color: cols[j % cols.length],
          });
        }
      }
      const from = this.ribbonOn;
      this.tw(0.4, p => {
        if (this._ribbonGen !== tok) return;   // a newer fade owns the ribbons now
        this.ribbonOn = lerp(from, to, p);
        if (to === 0 && p >= 1) this.ribbons.length = 0;
      });
    }

    async _st_idle(a) {
      this._resetCommon();
      this._goHome();
      const fromSmall = this._wasSmall;
      if (fromSmall) {
        this.morphTo('circle', 0.16, ease.outBack);
        await this.tw(0.16, p => { this.scl = lerp(this.scl, 1, p); this.rot = lerp(this.rot, 0, p); this.sx = this.sy = 1; }, ease.outBack);
        if (!a.alive()) return;
        this.tw(0.1, p => { this.faceAlpha = lerp(this.faceAlpha, 1, p); });
        this._rollEyes();                                // spin flourish on re-forming
      } else {
        await this.squashStretch();
        if (!a.alive()) return;
        this.morphTo('circle', 0.18 * a.speed);
        this.tw(0.18, p => { this.faceAlpha = lerp(this.faceAlpha, 1, p); this.scl = lerp(this.scl, 1, p); this.rot = lerp(this.rot, 0, p); });
      }
      this.eyesTo(this.energy < 0.35 ? 'sleepy' : 'neutral', 0.25);
      let glanceT = 2;
      this._loop = (dt) => {
        const breathe = this.energy < 0.35 ? 1.4 : 2.2;
        this.sy = 1 + Math.sin(this.t * breathe) * 0.011;
        this.sx = 1 - Math.sin(this.t * breathe) * 0.008;
        if (this.cursor && this.t - this._cursorAt < 4) {
          // watch the pointer: gaze eases toward it, stronger when it is farther away
          const dx = this.cursor.x - this.pos.x, dy = this.cursor.y - this.pos.y;
          const dist = Math.hypot(dx, dy) || 1;
          const mag = 0.45 + 0.55 * Math.min(1, dist / 320);
          const gx = (dx / dist) * 13 * mag, gy = (dy / dist) * 9 * mag;
          const k = Math.min(1, dt * 9);
          this.gaze.x += (gx - this.gaze.x) * k;
          this.gaze.y += (gy - this.gaze.y) * k;
          glanceT = 1.2;
        } else {
          glanceT -= dt;
          if (glanceT < 0) {
            glanceT = 2 + Math.random() * 2.8;
            const gx = (Math.random() - 0.5) * 18;
            const gy = (Math.random() - 0.5) * 8 - 2;
            this.tw(0.28, p => { this.gaze.x = lerp(this.gaze.x, gx, p); this.gaze.y = lerp(this.gaze.y, gy, p); });
          }
        }
        this.energy = clamp(this.energy + dt * 0.01, 0, 1);
      };
    }

    async _st_listening(a) {
      this._resetCommon();
      this._goHome();
      await this.squashStretch();
      if (!a.alive()) return;
      this.morphTo('egg', 0.18);
      this.eyesTo('alert', 0.16);
      this.tw(0.2, p => { this.faceAlpha = 1; this.scl = lerp(this.scl, 1, p); this.rot = lerp(this.rot, -7, p); this.gaze.x = lerp(this.gaze.x, -5, p); this.gaze.y = lerp(this.gaze.y, 3, p); });
      this.listenFx = true;
      this._loop = () => {
        const k = 1 + this.amp * 0.09;
        this.sy = k + Math.sin(this.t * 3) * 0.012;
        this.sx = 2 - k;
      };
    }

    async _st_speaking(a) {
      this._resetCommon();
      this._goHome();
      await this.squashStretch();
      if (!a.alive()) return;
      this.morphTo('circle', 0.16);
      this.eyesTo('happy', 0.16);
      this.tw(0.2, p => { this.faceAlpha = 1; this.scl = lerp(this.scl, 1, p); this.rot = lerp(this.rot, 0, p); this.gaze.x = lerp(this.gaze.x, 0, p); this.gaze.y = lerp(this.gaze.y, 0, p); });
      this._loop = () => {
        const talk = this.amp * (0.5 + 0.5 * Math.sin(this.t * 16));
        this.sy = 1 + talk * 0.07;
        this.sx = 1 - talk * 0.04;
        this.wrapDy = Math.sin(this.t * 8) * this.amp * 2;
      };
    }

    async _st_thinking(a) {
      this._resetCommon();
      this._goHome();
      this.tw(0.07, p => { this.faceAlpha = lerp(this.faceAlpha, 0, p); });
      await this.tw(0.13, p => { this.scl = lerp(this.scl, 0.3, p); this.rot = lerp(this.rot, 0, p); this.sx = this.sy = 1; }, ease.in);
      if (!a.alive()) return;
      this.morphTo('circle', 0.1, ease.out);
      this.tw(0.16, p => { this.auxT = p; }, ease.outBack);
      // darkness wave travels left -> middle -> right, like a typing indicator
      this._loop = () => {
        const ph = (this.t * 2.1) % 3;
        const bump = i => { const d = Math.min(Math.abs(ph - i), 3 - Math.abs(ph - i)); return Math.max(0, 1 - d * 1.5); };
        this.pulse.l = bump(0); this.pulse.m = bump(1); this.pulse.r = bump(2);
      };
    }

    async _st_working(a) {
      this._resetCommon();
      this._goHome();
      await this.squashStretch();
      if (!a.alive()) return;
      this.morphTo('circle', 0.16);
      this.tw(0.18, p => { this.faceAlpha = 1; this.scl = lerp(this.scl, 1, p); });
      this.eyesTo('focus', 0.16);
      this.ribbonFade(1);
      this._loop = (dt) => {
        this.rot = Math.sin(this.t * 2) * 5;
        this.sy = 1 + Math.sin(this.t * 4) * 0.015;
        this.energy = clamp(this.energy - dt * 0.04, 0, 1);
        this.gaze.x = Math.sin(this.t * 1.5) * 4;
      };
    }

    async _st_success(a) {
      this._resetCommon();
      this.energy = clamp(this.energy + 0.04, 0, 1);
      this._goHome();
      // collapse into the droplet
      this.tw(0.07, p => { this.faceAlpha = lerp(this.faceAlpha, 0, p); });
      this.morphTo('gather', 0.12, ease.in);
      await this.tw(0.12, p => { this.scl = lerp(this.scl, 0.55, p); this.sx = this.sy = 1; this.rot = lerp(this.rot, 0, p); }, ease.in);
      if (!a.alive()) return;
      // shoot up into a tilted "!"
      this.morphTo('bar', 0.16, ease.outBack);
      this.tw(0.16, p => { this.scl = lerp(0.55, 0.95, p); this.rot = lerp(0, 12, p); this.wrapDy = lerp(0, -18, p); });
      await this.tw(0.16, p => { this.auxDotT = p; }, ease.outBack);
      if (!a.alive()) return;
      // lively hold: decaying pendulum jiggle, like the source
      const t0 = this.t;
      this._loop = () => {
        const e = Math.exp(-(this.t - t0) * 1.1);
        this.rot = 12 + Math.sin((this.t - t0) * 9) * 7 * e + Math.sin(this.t * 2.3) * 1.5;
        this.sy = 1 + Math.sin((this.t - t0) * 9 + 1) * 0.05 * e;
        this.wrapDy = -18 - Math.abs(Math.sin((this.t - t0) * 4.5)) * 4 * e;
      };
      await this._sleep(1.15);
      if (!a.alive()) return;
      this._loop = null;
      // collapse out, pop back to the face
      this.tw(0.09, p => { this.auxDotT = lerp(this.auxDotT, 0, p); });
      this.morphTo('gather', 0.11, ease.in);
      await this.tw(0.11, p => { this.scl = lerp(this.scl, 0.55, p); this.rot = lerp(this.rot, 0, p); this.wrapDy = lerp(this.wrapDy, 0, p); }, ease.in);
      if (!a.alive()) return;
      this.morphTo('circle', 0.16, ease.outBack);
      this.tw(0.16, p => { this.scl = lerp(0.55, 1, p); }, ease.outBack);
      this.tw(0.1, p => { this.faceAlpha = p; });
      this.eyesTo('happy', 0.16);
      await this._sleep(0.7);
      if (a.alive()) this.set('idle');
    }

    async _st_confused(a) {
      this._resetCommon();
      this._goHome();
      this.tw(0.07, p => { this.faceAlpha = lerp(this.faceAlpha, 0, p); });
      await this.reform('hex');
      if (!a.alive()) return;
      this.tw(0.1, p => { this.faceAlpha = p; });
      const goL = this.eyeL, goR = this.eyeR, fl = { ...goL }, fr = { ...goR };
      this.tw(0.2, p => {
        goL.open = lerp(fl.open, 0.12, p); goL.curve = lerp(fl.curve, 0.8, p);
        goR.open = lerp(fr.open, 0.12, p); goR.curve = lerp(fr.curve, -0.8, p);
      });
      // shake then slow tilt-over
      await this.tw(0.35, p => { this.rot = Math.sin(p * Math.PI * 5) * 6; }, ease.linear);
      if (!a.alive()) return;
      this.tw(1.1, p => { this.rot = lerp(0, 24, p); }, ease.inOut);
      this._loop = () => { this.wrapDy = Math.sin(this.t * 1.5) * 1.5; };
    }

    async _st_notify(a) {
      this._resetCommon();
      this._goHome();
      await this.squashStretch();
      if (!a.alive()) return;
      this.morphTo('circle', 0.16);
      this.tw(0.16, p => { this.faceAlpha = 1; this.scl = lerp(this.scl, 1, p); this.rot = lerp(this.rot, 0, p); });
      this.eyesTo('rings', 0.2);
      await this.tw(0.25, p => { this.badgeT = p; }, ease.outBack);
      this._loop = () => {
        this.sy = 1 + Math.sin(this.t * 3) * 0.02;
        this.badgePulse = 1 + Math.max(0, Math.sin(this.t * 4)) * 0.12;
      };
    }

    async _st_celebrate(a) {
      this._resetCommon();
      this._goHome();
      this.tw(0.07, p => { this.faceAlpha = lerp(this.faceAlpha, 0, p); });
      await this.reform('circle');            // stays the round face, just a joy-pop through the droplet
      if (!a.alive()) return;
      this.tw(0.1, p => { this.faceAlpha = p; });
      this.eyesTo('happy', 0.16, 'left');
      this.eyesTo('closed', 0.16, 'right');   // wink
      this.ribbonFade(1);
      this._burstTicks();
      let spins = 0;
      const tumble = async () => {
        while (a.alive() && this.state === 'celebrate') {
          await this.tw(0.85, p => { this.rot = spins * 360 + ease.inOut(p) * 360; this.wrapDy = -Math.sin(p * Math.PI) * 22; }, ease.linear);
          spins++;
          if (spins === 2) this._burstTicks();
          await this._sleep(0.12);
        }
      };
      tumble();
      this._loop = () => {};
    }

    async _st_tired(a) {
      this._resetCommon();
      this._goHome();
      this.morphTo('circle', 0.4);
      this.tw(0.4, p => { this.faceAlpha = 1; this.rot = lerp(this.rot, 0, p); this.scl = lerp(this.scl, 0.96, p); });
      this.eyesTo('sleepy', 0.6);
      let blinkT = 2;
      this._loop = (dt) => {
        this.sy = 1 + Math.sin(this.t * 1.3) * 0.03;
        this.sx = 1 - Math.sin(this.t * 1.3) * 0.015;
        this.wrapDy = 4 + Math.sin(this.t * 1.3) * 2;
        this.energy = clamp(this.energy + dt * 0.02, 0, 1);
        blinkT -= dt;
        if (blinkT < 0) { blinkT = 2.5 + Math.random() * 2; this._slowBlink(); }
      };
    }

    async _st_dormant(a) {
      this._resetCommon();
      this.tw(0.1, p => { this.faceAlpha = lerp(this.faceAlpha, 0, p); });
      await this.tw(0.28, p => { this.scl = lerp(this.scl, 0.16, p); this.rot = 0; this.sx = this.sy = 1; }, ease.in);
      if (!a.alive()) return;
      this.morphTo('circle', 0.1, ease.out);
      const ox = this.pos.x, oy = this.pos.y;
      this._loop = (dt) => {
        this.springK = 6;
        this.target.x = ox + Math.sin(this.t * 0.6) * 26;
        this.target.y = oy + Math.sin(this.t * 0.9) * 14;
        this.energy = clamp(this.energy + dt * 0.08, 0, 1);
      };
    }

    async _st_wake(a) {
      this._resetCommon();
      this._goHome(8);
      this.morphTo('circle', 0.16, ease.outBack);
      await this.tw(0.18, p => { this.scl = lerp(this.scl, 1, p); }, ease.outBack);
      if (!a.alive()) return;
      // yawn stretch through egg
      this.morphTo('egg', 0.2);
      await this.tw(0.22, p => { this.sy = lerp(1, 1.18, p); this.sx = lerp(1, 0.9, p); }, ease.out);
      if (!a.alive()) return;
      await this.tw(0.35, p => { this.sy = lerp(1.18, 1, p); this.sx = lerp(0.9, 1, p); }, ease.outElastic);
      if (!a.alive()) return;
      this.morphTo('circle', 0.16);
      this.tw(0.12, p => { this.faceAlpha = p; });
      await this.eyesTo('closed', 0.1); await this.eyesTo('neutral', 0.14);
      await this.eyesTo('closed', 0.1); await this.eyesTo('neutral', 0.14);
      if (a.alive()) this.set('idle');
    }

    /* ---------- spatial actions ---------- */
    _stagePoint(t) {
      if (t instanceof Element) {
        const r = t.getBoundingClientRect(), s = this.stage.getBoundingClientRect();
        return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
      }
      return t;
    }

    async zoomTo(dest, opts = {}) {
      const g = ++this.gen;
      this.state = 'zoomies'; this._loop = null; this.listenFx = false; this._resetCommon(); this._recallSwarm();
      const p = this._stagePoint(dest);
      this.tw(0.08, q => { this.faceAlpha = lerp(this.faceAlpha, 0, q); });
      await this.tw(0.15, q => { this.scl = lerp(this.scl, 0.22, q); this.sx = this.sy = 1; this.rot = lerp(this.rot, 0, q); }, ease.in);
      if (this.gen !== g) return;
      this.morphTo('circle', 0.08, ease.out);
      // curved dash with comet tail
      const from = { ...this.pos };
      const mid = { x: (from.x + p.x) / 2 + (Math.random() - 0.5) * 260, y: (from.y + p.y) / 2 - 120 - Math.random() * 80 };
      this._park();
      this.comet = true;
      await this.tw(0.6, q => {
        const a = lerp(from.x, mid.x, q), b = lerp(mid.x, p.x, q);
        const c = lerp(from.y, mid.y, q), d = lerp(mid.y, p.y, q);
        this.pos.x = lerp(a, b, q); this.pos.y = lerp(c, d, q);
      }, ease.inOut);
      this.comet = false;
      if (this.gen !== g) return;
      this.home = { ...p };
      await this.tw(0.18, q => { this.scl = lerp(0.22, 1, q); }, ease.outBack);
      if (this.gen !== g) return;
      this.tw(0.1, q => { this.faceAlpha = q; });
      if (!opts.noIdle) this.set('idle');
    }

    async pointAt(target) {
      const g = ++this.gen;
      this.state = 'pointing'; this._loop = null; this.listenFx = false; this._resetCommon(); this._recallSwarm();
      const isEl = target instanceof Element;
      const p = this._stagePoint(target);
      let rect;
      if (isEl) {
        const r = target.getBoundingClientRect(), s = this.stage.getBoundingClientRect();
        rect = { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
      } else {
        rect = { x: p.x - 26, y: p.y - 18, w: 52, h: 36 };
      }
      this.tw(0.2, q => { this.rot = lerp(this.rot, 0, q); });
      // stand beside the target: pick the side with room
      const off = 115;
      const leftSide = rect.x + rect.w / 2 > this.stage.clientWidth - 240;
      const spot = { x: leftSide ? rect.x - off : rect.x + rect.w + off, y: p.y - 6 };
      // dash over, stays his round self
      this._park();
      const from = { ...this.pos };
      this.comet = true;
      this.tw(0.1, q => { this.faceAlpha = lerp(this.faceAlpha, 0, q); this.scl = lerp(this.scl, 0.5, q); });
      await this.tw(0.4, q => {
        this.pos.x = lerp(from.x, spot.x, q); this.pos.y = lerp(from.y, spot.y, q) - Math.sin(q * Math.PI) * 60;
      }, ease.inOut);
      this.comet = false;
      if (this.gen !== g) return;
      this.home = { ...spot };
      this.morphTo('circle', 0.16);
      this.tw(0.18, q => { this.scl = lerp(0.5, 0.92, q); this.faceAlpha = q; });
      this.eyesTo('alert', 0.14);
      const ga = Math.atan2(p.y - spot.y, p.x - spot.x);
      this.tw(0.15, q => { this.gaze.x = lerp(this.gaze.x, Math.cos(ga) * 10, q); this.gaze.y = lerp(this.gaze.y, Math.sin(ga) * 7, q); });
      await this._sleep(0.12);
      if (this.gen !== g) return;
      // an arm grows out of his head and points at the near edge of the element
      const tip = {
        x: leftSide ? rect.x + 4 : rect.x + rect.w - 4,   // the edge facing him
        y: clamp(spot.y, rect.y + 10, rect.y + rect.h - 10),
      };
      if (!isEl) { tip.x = p.x - Math.cos(ga) * 14; tip.y = p.y - Math.sin(ga) * 14; }
      const arm = this.arm = { on: 0, tap: 0, tip, side: leftSide ? -1 : 1 };
      await this.tw(0.34, q => { arm.on = q; }, ease.outBack);
      if (this.gen !== g) return;
      // touch: the element lights up with his own glass border
      const hl = this.hl = { rect, on: 0 };
      this.tw(0.28, q => { hl.on = q; });
      for (let i = 0; i < 2; i++) {
        await this.tw(0.2, q => { arm.tap = Math.sin(q * Math.PI); }, ease.inOut);
        if (this.gen !== g) return;
      }
      this._loop = () => {
        arm.sway = Math.sin(this.t * 2.2) * 1;
        this.sy = 1 + Math.sin(this.t * 2.4) * 0.012;
      };
    }

    async swarm(targets, opts = {}) {
      const g = ++this.gen;
      this.state = 'swarm'; this._loop = null; this.listenFx = false; this._resetCommon(); this._recallSwarm();
      const pts = targets.map(t => this._stagePoint(t));
      this.energy = clamp(this.energy - pts.length * 0.002, 0, 1);
      this._goHome();
      this.tw(0.2, q => { this.rot = lerp(this.rot, 0, q); });
      this.morphTo('circle', 0.16);
      this.tw(0.15, q => { this.faceAlpha = lerp(this.faceAlpha, 1, q); });
      // crouch small, then fire
      await this.tw(0.16, q => { this.scl = lerp(this.scl, 0.72, q); this.sy = lerp(this.sy, 0.85, q); this.sx = lerp(this.sx, 1.1, q); });
      if (this.gen !== g) return;
      this.eyesTo('alert', 0.14);
      pts.forEach((p, i) => {
        setTimeout(() => {
          if (this.gen !== g) return;
          this.particles.push({
            x: this.pos.x, y: this.pos.y, vx: (Math.random() - 0.5) * 900, vy: -450 - Math.random() * 350,
            tx: p.x, ty: p.y - 16, phase: Math.random() * TAU, mode: 'fly', arrived: false,
          });
          // recoil pop
          this.sy = 0.8; this.tw(0.18, q2 => { this.sy = lerp(0.8, 0.85, q2); }, ease.out);
        }, i * (opts.stagger ?? 45));
      });
      const centroid = pts.reduce((a2, p) => ({ x: a2.x + p.x / pts.length, y: a2.y + p.y / pts.length }), { x: 0, y: 0 });
      const ga = Math.atan2(centroid.y - this.pos.y, centroid.x - this.pos.x);
      this._loop = () => {
        this.gaze.x = Math.cos(ga) * 8 + Math.sin(this.t * 2) * 2;
        this.gaze.y = Math.sin(ga) * 6;
      };
      if (opts.hold) { await this._sleep(opts.hold); if (this.gen === g) this.recall(); }
    }

    async recall() {
      if (!this.particles.length) { this.set('idle'); return; }
      const g = ++this.gen;
      this.state = 'recall';
      this.particles.forEach((pt, i) => setTimeout(() => { pt.mode = 'return'; }, i * 25));
      this._loop = (dt) => { this.scl += (0.72 - this.scl) * dt * 5; };   // settle between gulp pops
      const wait = () => new Promise(res => {
        const chk = () => this.particles.length === 0 || this.gen !== g ? res() : setTimeout(chk, 60);
        chk();
      });
      await wait();
      if (this.gen !== g) return;
      await this.tw(0.2, q => { this.scl = lerp(this.scl, 1, q); }, ease.outBack);
      if (this.gen !== g) return;
      this.eyesTo('happy', 0.16);
      await this._sleep(0.6);
      if (this.gen === g) this.set('idle');
    }
    _recallSwarm() { this.particles.forEach(p => { p.mode = 'return'; }); }

    /* ---------- small fx ---------- */
    _ping(x, y, color = BLUE) { this.ringsFx.push({ x, y, r: 6, a: 0.55, color }); }
    _burstTicks() {
      // little flat-color dashes that hang around the body and fizzle, like the source
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * TAU, d = this.size * (0.35 + Math.random() * 0.4);
        this.ticks.push({
          x: this.pos.x + Math.cos(a) * d, y: this.pos.y + Math.sin(a) * d,
          vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 30,
          ang: Math.random() * TAU, len: 8 + Math.random() * 9,
          color: PALETTE[i % PALETTE.length], life: 1,
        });
      }
    }
    async _slowBlink() {
      const l = { ...this.eyeL }, r = { ...this.eyeR };
      await this.tw(0.3, p => { this.eyeL.open = lerp(l.open, 0.02, p); this.eyeR.open = lerp(r.open, 0.02, p); });
      await this.tw(0.4, p => { this.eyeL.open = lerp(0.02, l.open, p); this.eyeR.open = lerp(0.02, r.open, p); });
    }

    /* ---------- per-frame ---------- */
    _tick(dt) {
      this.t += dt;
      this._advanceTweens(dt);
      if (this._loop) this._loop(dt);

      // speaking energizes his own refractive rim: dispersion and speculars race, voice sets the pace
      this.arcT += ((this.state === 'speaking' ? 1 : 0) - this.arcT) * Math.min(1, dt * 6);
      const sk = this.arcT * (1 + this.amp * 1.6);
      this.rimW = ((this.rimW || 0) + dt * (2.6 + sk * 10)) % 100;
      this.rimC = (((this.rimC ?? 38) - dt * (2.1 + sk * 8)) % 100 + 100) % 100;
      this.rimSpin = ((this.rimSpin || 0) + dt * sk * 12) % 100;

      // quick blink in lively states
      if (['idle', 'listening', 'speaking', 'notify'].includes(this.state)) {
        this._nextBlink -= dt;
        if (this._nextBlink < 0 && this.eyeL.open < 0.5) {
          this._nextBlink = 2.5 + Math.random() * 3.5;
          const l = this.eyeL.open, r = this.eyeR.open;
          this.tw(0.06, p => { this.eyeL.open = lerp(l, 0.02, p); this.eyeR.open = lerp(r, 0.02, p); })
            .then(() => this.tw(0.08, p => { this.eyeL.open = lerp(0.02, l, p); this.eyeR.open = lerp(0.02, r, p); }));
        }
      }

      // position spring
      if (this.springK > 0) {
        this.vel.x += (this.target.x - this.pos.x) * this.springK * dt * 6;
        this.vel.y += (this.target.y - this.pos.y) * this.springK * dt * 6;
        const damp = Math.pow(0.0018, dt);
        this.vel.x *= damp; this.vel.y *= damp;
        this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt;
      }

      this._render(dt);
      this._drawFx(dt);
    }

    _render() {
      this.wrap.style.transform =
        `translate(${this.pos.x - this.size / 2 + this.wrapDx}px, ${this.pos.y - this.size / 2 + this.wrapDy}px)`;
      this.el.root.setAttribute('transform',
        `rotate(${this.rot}) scale(${this.scl * this.sx} ${this.scl * this.sy})`);

      const d = pathFrom(this.pts, R * this.bodyPulse);
      if (d !== this._lastD) {                   // only touch the glass layers when the outline moves
        this._lastD = d;
        this.el.body.setAttribute('d', d);
        this.el.clipP.setAttribute('d', d);
        this.el.vig.setAttribute('d', d);
        for (const el of [this.el.rimBase, this.el.rimBand, this.el.rimBright, this.el.fringeWarm, this.el.fringeWarmS,
                          this.el.fringeCool, this.el.fringeCoolS, this.el.fringeRed]) {
          el.setAttribute('d', d);
        }
      }
      // dispersion fringes creep around the rim; speaking makes them race and glow
      const wOff = this.rimW, cOff = this.rimC;
      this.el.fringeWarm.setAttribute('stroke-dashoffset', wOff);
      this.el.fringeWarmS.setAttribute('stroke-dashoffset', wOff);
      this.el.fringeRed.setAttribute('stroke-dashoffset', (wOff + 1.6) % 100);
      this.el.fringeCool.setAttribute('stroke-dashoffset', cOff);
      this.el.fringeCoolS.setAttribute('stroke-dashoffset', cOff);
      this.el.rimBright.setAttribute('stroke-dashoffset', (62 + Math.sin(this.t * 0.5) * 4 + this.rimSpin) % 100);
      const boost = this.arcT * (0.5 + this.amp * 0.5);
      this.el.fringeWarm.setAttribute('opacity', 0.7 + boost * 0.3);
      this.el.fringeCool.setAttribute('opacity', 0.65 + boost * 0.35);
      this.el.fringeRed.setAttribute('opacity', 0.5 + boost * 0.3);
      this.el.rimBase.setAttribute('stroke', `rgba(255,255,255,${0.5 + boost * 0.25})`);
      this.el.rimBright.setAttribute('stroke-width', 2.8 + boost * 1.6);
      // smoky refraction blobs drift inside the glass
      this.el.smokeA.setAttribute('transform', `translate(${-10 + Math.sin(this.t * 0.4) * 9} ${10 + Math.cos(this.t * 0.31) * 7})`);
      this.el.smokeB.setAttribute('transform', `translate(${20 + Math.sin(this.t * 0.27 + 2) * 10} ${-12 + Math.sin(this.t * 0.36) * 8}) rotate(${this.t * 4})`);
      this.el.smokeC.setAttribute('transform', `translate(${-18 + Math.sin(this.t * 0.33 + 4) * 8} ${-16 + Math.cos(this.t * 0.24) * 9}) rotate(${-this.t * 3})`);
      this.el.smokeD.setAttribute('transform', `translate(${-24 + Math.sin(this.t * 0.22 + 1) * 7} ${-6 + Math.cos(this.t * 0.29) * 8}) rotate(${this.t * 2.5})`);
      this.el.smokeE.setAttribute('transform', `translate(${24 + Math.sin(this.t * 0.31 + 3) * 8} ${18 + Math.cos(this.t * 0.26 + 1) * 7})`);
      // hide the puck shadow when he shrinks to a dot
      this.el.shadow.setAttribute('opacity', 0.15 * clamp((this.scl - 0.3) / 0.7, 0, 1) * this.faceAlpha);

      // thinking dots: darkness wave, side dots lighter like the source
      const thinking = this.state === 'thinking';
      const spread = 145 * this.auxT;
      this.el.auxL.setAttribute('cx', -spread); this.el.auxR.setAttribute('cx', spread);
      this.el.auxL.setAttribute('r', this.auxT * 42 * (thinking ? 1 + this.pulse.l * 0.12 : 1));
      this.el.auxR.setAttribute('r', this.auxT * 42 * (thinking ? 1 + this.pulse.r * 0.12 : 1));
      this.el.auxL.setAttribute('opacity', thinking ? 0.35 + 0.65 * this.pulse.l : 1);
      this.el.auxR.setAttribute('opacity', thinking ? 0.35 + 0.65 * this.pulse.r : 1);
      const mid = thinking ? 0.45 + 0.55 * this.pulse.m : 1;
      this.el.body.setAttribute('opacity', mid);
      this.el.inner.setAttribute('opacity', mid * this.scl > 0.45 ? mid : mid * 0.5);
      this.el.rim.setAttribute('opacity', mid);
      if (thinking) this.bodyPulse = 1 + this.pulse.m * 0.12;

      // "!" dot
      this.el.auxDot.setAttribute('cy', 74);
      this.el.auxDot.setAttribute('r', this.auxDotT * 13);

      // badge
      this.el.badge.setAttribute('opacity', this.badgeT);
      this.el.badge.setAttribute('transform', `scale(${this.badgeT * this.badgePulse})`);

      // face
      this.el.face.setAttribute('opacity', this.faceAlpha);
      this.el.face.setAttribute('transform', `translate(${this.gaze.x} ${this.gaze.y})`);
      this._renderEye(this.el.eyeL, this.eyeL, -17);
      this._renderEye(this.el.eyeR, this.eyeR, 17);
    }

    _renderEye(g, s, x) {
      const droop = clamp((0.45 - this.energy) / 0.45, 0, 1) * 3;
      g.setAttribute('transform', `translate(${x} ${-7 + s.dy + droop})`);
      const arc = g.querySelector('.arc'), oval = g.querySelector('.oval'), ringEl = g.querySelector('.ring');
      const arcA = clamp((0.34 - s.open) / 0.14, 0, 1) * (1 - s.ring);
      const ovalA = clamp((s.open - 0.22) / 0.14, 0, 1) * (1 - s.ring);
      arc.setAttribute('opacity', arcA);
      oval.setAttribute('opacity', ovalA);
      ringEl.setAttribute('opacity', s.ring);
      if (arcA > 0) {
        // crescent with sharp tapered tips: outer curve + inner curve, filled
        const w = 10.5;
        const peak = -s.curve * 16 - s.open * 3;
        const th = 5.2 + s.open * 10;
        arc.setAttribute('d', `M ${-w} 0 Q 0 ${peak} ${w} 0 Q 0 ${peak + th} ${-w} 0 Z`);
      }
      if (ovalA > 0) {
        oval.setAttribute('rx', 8);
        oval.setAttribute('ry', 3 + s.open * 10.5);
      }
    }

    /* ---------- canvas fx ---------- */
    _drawFx(dt) {
      const ctxB = this.ctxB, ctxF = this.ctxF, W = this.stage.clientWidth, H = this.stage.clientHeight;
      ctxB.clearRect(0, 0, W, H);
      ctxF.clearRect(0, 0, W, H);
      const cx = this.pos.x + this.wrapDx, cy = this.pos.y + this.wrapDy;

      // comet tail: short braided multicolor bundle hugging the dot (behind the body)
      if (this.comet) this.trail.push({ x: cx, y: cy });
      else if (this.trail.length) this.trail.splice(0, 2);
      if (this.trail.length > 16) this.trail.splice(0, this.trail.length - 16);
      if (this.trail.length > 2) {
        ctxB.lineCap = 'round';
        const t0 = this.trail[0], t1 = this.trail[this.trail.length - 1];
        for (let b = 0; b < 3; b++) {
          // metallic: dark tail rising to a bright head where the dot is
          const g = ctxB.createLinearGradient(t0.x, t0.y, t1.x, t1.y);
          g.addColorStop(0, mixc(PALETTE[b * 2], -0.35));
          g.addColorStop(0.65, PALETTE[b * 2]);
          g.addColorStop(1, mixc(PALETTE[b * 2], 0.5));
          ctxB.strokeStyle = g;
          ctxB.beginPath();
          for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            const nx = this.trail[Math.min(i + 1, this.trail.length - 1)];
            let px = -(nx.y - p.y), py = nx.x - p.x;
            const m = Math.hypot(px, py) || 1; px /= m; py /= m;
            const off = Math.sin(this.t * 25 + i * 0.9 + b * 2.1) * 2.4 + (b - 1) * 2.8;
            const X = p.x + px * off, Y = p.y + py * off;
            i === 0 ? ctxB.moveTo(X, Y) : ctxB.lineTo(X, Y);
          }
          ctxB.lineWidth = 3.2;
          ctxB.stroke();
        }
      }

      // orbit ribbons: flat opaque pastel arcs, front and back of the body, fizzle out by shrinking
      if (this.ribbonOn > 0.01 && this.ribbons.length) {
        const RX = this.size * 0.37, RY = this.size * 0.14;
        const S = 16;
        for (const r of this.ribbons) {
          const L = r.len * clamp(this.ribbonOn * 1.15, 0, 1);
          const head = r.phase + this.t * r.speed;
          const cosT = Math.cos(r.tilt), sinT = Math.sin(r.tilt);
          // build the ribbon as continuous runs split only at the front/back boundary,
          // each run stroked once: clean flat ribbon, no fuzz
          let run = [], runCtx = null;
          const sheenPos = 0.5 + 0.38 * Math.sin(this.t * 2.4 + r.tilt * 3);
          const flush = () => {
            if (run.length > 1 && runCtx) {
              const a0 = run[0], a1 = run[run.length - 1];
              runCtx.lineCap = 'round'; runCtx.lineJoin = 'round';
              runCtx.strokeStyle = metalGrad(runCtx, a0.x, a0.y, a1.x, a1.y, r.color, sheenPos);
              runCtx.lineWidth = 4.2;
              runCtx.beginPath();
              runCtx.moveTo(run[0].x, run[0].y);
              for (let k = 1; k < run.length; k++) runCtx.lineTo(run[k].x, run[k].y);
              runCtx.stroke();
            }
            run = [];
          };
          for (let s = 0; s <= S; s++) {
            const a = head - (s / S) * L;
            const ex = Math.cos(a) * RX, ey = Math.sin(a) * RY;
            const x = cx + ex * cosT - ey * sinT;
            const y = cy + (ex * sinT + ey * cosT) * 0.9;
            const ctx = Math.sin(a) < 0 ? ctxB : ctxF;
            if (ctx !== runCtx) { const last = run[run.length - 1]; flush(); if (last) run.push(last); runCtx = ctx; }
            run.push({ x, y });
          }
          flush();
        }
      }

      // listening rings (behind the body)
      if (this.listenFx && this.t - this._lastRing > 0.8 / (0.4 + this.amp)) {
        this._lastRing = this.t;
        this._ping(cx, cy, BLUE);
      }
      for (let i = this.ringsFx.length - 1; i >= 0; i--) {
        const r = this.ringsFx[i];
        r.r += dt * 120; r.a -= dt * 0.9;
        if (r.a <= 0) { this.ringsFx.splice(i, 1); continue; }
        ctxB.strokeStyle = `rgba(37,99,235,${r.a})`;
        ctxB.lineWidth = 2.5;
        ctxB.beginPath(); ctxB.arc(r.x, r.y, r.r, 0, TAU); ctxB.stroke();
      }

      // swarm pins (front)
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        const tx = p.mode === 'return' ? cx : p.tx;
        const ty = p.mode === 'return' ? cy : p.ty;
        p.vx += (tx - p.x) * 90 * dt; p.vy += (ty - p.y) * 90 * dt;
        const damp = Math.pow(p.mode === 'return' ? 0.01 : 0.002, dt);
        p.vx *= damp; p.vy *= damp;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const dist = Math.hypot(tx - p.x, ty - p.y);
        if (p.mode === 'fly' && dist < 7 && !p.arrived) { p.arrived = true; this._ping(p.tx, p.ty + 16); }
        if (p.mode === 'return' && dist < 16) {
          this.particles.splice(i, 1);
          this.scl = Math.min(this.scl + 0.05, 1.15);   // gulp pop, recall loop decays it back
          continue;
        }
        const wob = p.arrived ? Math.sin(this.t * 6 + p.phase) * 2 : 0;
        const px2 = p.x, py2 = p.y + wob;
        ctxF.fillStyle = NAVY;
        ctxF.beginPath(); ctxF.arc(px2, py2, 5.5, 0, TAU); ctxF.fill();
        const aa = Math.atan2((p.ty + 16) - py2, p.tx - px2);
        ctxF.beginPath();
        ctxF.moveTo(px2 + Math.cos(aa + 1.35) * 5, py2 + Math.sin(aa + 1.35) * 5);
        ctxF.lineTo(px2 + Math.cos(aa) * 12, py2 + Math.sin(aa) * 12);
        ctxF.lineTo(px2 + Math.cos(aa - 1.35) * 5, py2 + Math.sin(aa - 1.35) * 5);
        ctxF.closePath(); ctxF.fill();
        // paper eyes on each pin so every piece stays "him"
        ctxF.fillStyle = PAPER;
        ctxF.beginPath(); ctxF.arc(px2 + Math.cos(aa - 0.6) * 2.4, py2 + Math.sin(aa - 0.6) * 2.4, 1.1, 0, TAU); ctxF.fill();
        ctxF.beginPath(); ctxF.arc(px2 + Math.cos(aa + 0.6) * 2.4, py2 + Math.sin(aa + 0.6) * 2.4, 1.1, 0, TAU); ctxF.fill();
        // metallic glint
        ctxF.fillStyle = 'rgba(255,255,255,0.4)';
        ctxF.beginPath(); ctxF.arc(px2 - 2, py2 - 2.2, 1.2, 0, TAU); ctxF.fill();
      }

      // pointing arm: slim tapered limb growing from the top of his head
      if (this.arm && this.arm.on > 0.01) {
        const a = this.arm;
        const br = R * (this.size / 200) * this.scl;
        const shoulder = { x: cx + a.side * br * 0.3, y: cy - br * 0.82 };
        const tipNow = {
          x: lerp(shoulder.x, a.tip.x, a.on) + (a.tap || 0) * a.side * 6,
          y: lerp(shoulder.y, a.tip.y, a.on) + (a.sway || 0),
        };
        const mx = (shoulder.x + tipNow.x) / 2, my = (shoulder.y + tipNow.y) / 2;
        const len = Math.hypot(tipNow.x - shoulder.x, tipNow.y - shoulder.y);
        const ctrl = { x: mx, y: my - 14 - len * 0.16 };
        const S2 = 14;
        ctxF.lineCap = 'round';
        let prev = shoulder;
        for (let s = 1; s <= S2; s++) {
          const q = s / S2;
          const x = (1 - q) * (1 - q) * shoulder.x + 2 * (1 - q) * q * ctrl.x + q * q * tipNow.x;
          const y = (1 - q) * (1 - q) * shoulder.y + 2 * (1 - q) * q * ctrl.y + q * q * tipNow.y;
          ctxF.strokeStyle = '#232a36';
          ctxF.lineWidth = lerp(7, 3, q) * this.scl / 0.92;
          ctxF.beginPath(); ctxF.moveTo(prev.x, prev.y); ctxF.lineTo(x, y); ctxF.stroke();
          prev = { x, y };
        }
        // rounded fingertip with a glass glint
        ctxF.fillStyle = '#232a36';
        ctxF.beginPath(); ctxF.arc(tipNow.x, tipNow.y, 4 * this.scl / 0.92, 0, TAU); ctxF.fill();
        ctxF.fillStyle = 'rgba(255,255,255,0.55)';
        ctxF.beginPath(); ctxF.arc(tipNow.x - 1.3, tipNow.y - 1.5, 1.2, 0, TAU); ctxF.fill();
      }

      // touched element lights up with his own glass border
      if (this.hl && this.hl.on > 0.01) {
        const h = this.hl, r = h.rect, pad = 5, rad = 10;
        const x = r.x - pad, y = r.y - pad, w = r.w + pad * 2, hh = r.h + pad * 2;
        const per = 2 * (w + hh) - 8 * rad + TAU * rad;
        this.hlPhase = (this.hlPhase || 0) + dt * 55;
        const box = () => { ctxF.beginPath(); ctxF.roundRect(x, y, w, hh, rad); };
        ctxF.lineCap = 'round';
        ctxF.setLineDash([]);
        ctxF.globalAlpha = h.on * 0.22; ctxF.strokeStyle = '#ffffff'; ctxF.lineWidth = 6; box(); ctxF.stroke();
        ctxF.globalAlpha = h.on * 0.85; ctxF.lineWidth = 1.8; box(); ctxF.stroke();
        // his dispersion, creeping around the border
        ctxF.globalAlpha = h.on * 0.8;
        ctxF.strokeStyle = '#ff9040'; ctxF.lineWidth = 2.4;
        ctxF.setLineDash([per * 0.16, per * 0.84]); ctxF.lineDashOffset = -this.hlPhase;
        box(); ctxF.stroke();
        ctxF.strokeStyle = '#57a8ff'; ctxF.lineWidth = 2.2;
        ctxF.setLineDash([per * 0.13, per * 0.87]); ctxF.lineDashOffset = this.hlPhase * 0.8 + per * 0.5;
        box(); ctxF.stroke();
        ctxF.setLineDash([]);
        ctxF.globalAlpha = 1;
      }

      // celebration ticks: flat dashes that drift a little and fizzle
      for (let i = this.ticks.length - 1; i >= 0; i--) {
        const c = this.ticks[i];
        c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.pow(0.2, dt); c.vy *= Math.pow(0.2, dt);
        c.life -= dt * 1.4;
        if (c.life <= 0) { this.ticks.splice(i, 1); continue; }
        const l = c.len * c.life;
        const x1 = c.x - Math.cos(c.ang) * l / 2, y1 = c.y - Math.sin(c.ang) * l / 2;
        const x2 = c.x + Math.cos(c.ang) * l / 2, y2 = c.y + Math.sin(c.ang) * l / 2;
        ctxF.lineCap = 'round';
        ctxF.strokeStyle = metalGrad(ctxF, x1, y1, x2, y2, c.color, 0.5);
        ctxF.lineWidth = c.w || 4.2;
        ctxF.beginPath(); ctxF.moveTo(x1, y1); ctxF.lineTo(x2, y2); ctxF.stroke();
      }
    }
  }

  global.Addy = Addy;
})(typeof window !== 'undefined' ? window : globalThis);

// Vendored from inbox-buddy `addy.js` (commit 9a44cee), where the character is
// called Addy. Kept as one file and otherwise unmodified, so it can still be
// diffed against its origin: the rename lives in the wrapper, not in here.
export const Addy = (typeof window !== 'undefined' ? window : globalThis).Addy;
export default Addy;
