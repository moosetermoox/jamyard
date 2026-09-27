// Jamyard madlib banner — compact home-page strip. One composition keyed to useComposition().T
const { useComposition, animate, Easing, CompositionStage, useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakRadio } = window;

const GRAIN = "repeating-linear-gradient(92deg,rgba(110,75,40,0.10) 0 1px,transparent 1px 6px),repeating-linear-gradient(88deg,rgba(70,45,20,0.06) 0 2px,transparent 2px 14px)";
const DISPLAY = "'Bricolage Grotesque', sans-serif";
const INK = '#2A2620', PAPER = '#FDF9F0', GESSO = '#F2EEE5', RED = '#E5482B', YEL = '#FFC800', CYAN = '#1BA9C4', GREEN = '#22A05A', MAG = '#B0197E', ORANGE = '#F08C1E';
const BIRCH = '#E3C8A0', PINE = '#D2B285', OAK = '#C29A67', WALNUT = '#B08350', BASE = '#8F6438';
const CUT = 'polygon(2% 8%,98% 0,100% 90%,0 100%)';
const W = 1280, H = 440;
const WORD_SIZE = 38, BLOCK_SIZE = 32, ROW = BLOCK_SIZE + 26;

const MOTION = {
  enter: (T, start, d = 0.32) => animate({ from: 0, to: 1, start, end: start + d, ease: Easing.easeOutCubic })(T),
  fade:  (T, start, d = 0.4)  => animate({ from: 0, to: 1, start, end: start + d, ease: Easing.easeInOutCubic })(T),
};
const arrive = (p, r) => ({ opacity: p, transform: `translateY(${(1 - p) * -18}px) rotate(${r || 0}deg)` });
const settle = (T, at) => -4 * Math.sin(Math.PI * MOTION.fade(T, at, 0.45));
const wood = (hex) => ({ background: hex, backgroundImage: GRAIN, color: INK });
const paint = (hex, fg) => ({ background: hex, color: fg || INK });
const rot = (k) => (k % 2 ? 1.2 : -1.2);

// Every combination reads correctly in the frame sentence.
const WORDS = [
  [{ t: 'YARD', s: wood(WALNUT) }, { t: 'TOOLBOX', s: wood(OAK) }, { t: 'SWISS ARMY KNIFE', s: wood(PINE) }, { t: 'ONE-STOP SHOP', s: wood(BIRCH) }],
  [{ t: 'CONNECTING', s: paint(MAG, PAPER) }, { t: 'THINKING', s: paint(CYAN) }, { t: 'REVIEWING', s: paint(GREEN) }, { t: 'HAVING FUN', s: paint(ORANGE) }],
  [{ t: 'REMIX', s: wood(OAK) }, { t: 'CUSTOMIZE', s: wood(PINE) }, { t: 'ADAPT', s: wood(BIRCH) }, { t: 'BUILD ON', s: paint(YEL) }],
];
// Curated first landings (indices into WORDS); later spins are random.
const FIRST = [[0, 3, 0], [1, 2, 1], [2, 1, 2], [3, 0, 0], [0, 1, 3], [1, 3, 0]];

const SPIN = 2.2, IDLE_SPIN = 1.1, IDLE_LEAD = 1.5;
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
const reelEase = (t) => 1 - Math.pow(1 - t, 3.2);
const bump = (t, from, amt) => amt * Math.sin(Math.PI * Math.max(0, (t - from) / (1 - from)));

// Pure in time. First play: 2 laps + target. After that, a list of hops: idle spins (one reel at a time)
// plus hover spins. `abs` is time since the page loaded; D is one play's length.
function reelState(n, T, start, target, idle, seed, slot, gap, manual, abs, D) {
  const md = (x) => ((Math.round(x) % n) + n) % n;
  if (abs < start) return { pos: 0, shown: false, spinning: false, idx: target };
  if (abs < start + SPIN) {
    const t = (abs - start) / SPIN;
    return { pos: (2 * n + target) * reelEase(t) - bump(t, 0.82, 0.14), shown: true, spinning: true, first: true, t, to: target, idx: target };
  }
  const ev = [];
  if (idle) {
    const k = Math.floor((idle.A - IDLE_LEAD) / gap) + 1;
    let prev = -1;
    for (let j = 1; j <= k; j++) {
      let who = hash(seed, 7, j) % 3; if (who === prev) who = (who + 1 + (hash(seed, 9, j) % 2)) % 3; prev = who;
      if (who === slot) ev.push({ t: idle.base + IDLE_LEAD + (j - 1) * gap, step: 1 + (hash(seed, slot, j) % (n - 1)) });
    }
  }
  (manual || []).forEach((m) => ev.push(m));
  ev.sort((x, y) => x.t - y.t);
  let pos = 2 * n + target, busyUntil = -1;
  for (const e of ev) {
    if (e.t > abs) break;
    const t0 = Math.max(e.t, busyUntil); // never overlap two hops
    const t = Math.min(1, Math.max(0, (abs - t0) / IDLE_SPIN));
    busyUntil = t0 + IDLE_SPIN;
    if (t < 1) return { pos: pos + e.step * reelEase(t) - bump(t, 0.8, 0.08), shown: true, spinning: true, t, from: md(pos), to: md(pos + e.step), idx: md(pos + e.step) };
    pos += e.step;
  }
  return { pos, shown: true, spinning: false, idx: md(pos) };
}
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

function Block({ text, s, style }) {
  return (
    <span style={Object.assign({
      display: 'inline-block', fontFamily: DISPLAY, fontWeight: 800, fontSize: BLOCK_SIZE, letterSpacing: '0.04em', lineHeight: 1, textAlign: 'center',
      padding: '12px 20px 14px', whiteSpace: 'nowrap', clipPath: CUT, boxSizing: 'border-box',
    }, s, style)}>{text}</span>
  );
}

const HOVER_DELAY = 90; // ms: long enough to ignore a cursor passing through, short enough to feel instant
function Reel({ T, words, slotAt, start, target, idle, seed, slot, gap, baseBoards, manual, abs, D, onPoke, wiggleAt }) {
  const hoverT = React.useRef(null);
  const n = words.length;
  const st = reelState(n, T, start, target, idle, seed, slot, gap, manual, abs, D);
  const slotOpacity = idle ? 0 : MOTION.fade(T, slotAt) * (1 - MOTION.fade(T, start - 0.12, 0.12));
  const longest = words.reduce((a, b) => (b.t.length > a.t.length ? b : a)).t;
  const lift = idle ? 0 : settle(T, start + SPIN - 0.05);
  const wt = wiggleAt != null ? abs - wiggleAt : -1;
  const wig = wt >= 0 && wt < 0.7 ? 3.5 * Math.sin(wt * Math.PI * 2 * 3) * (1 - wt / 0.7) : 0;
  const measRefs = React.useRef([]);
  const [widths, setWidths] = React.useState(null);
  React.useLayoutEffect(() => {
    const m = () => setWidths(measRefs.current.map((el) => (el ? el.offsetWidth : 0)));
    m();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(m);
  }, []);
  let winW = null;
  if (widths) {
    const maxW = Math.max(...widths);
    if (!st.shown) winW = maxW;
    else if (!st.spinning) winW = widths[st.idx];
    else if (st.first) winW = maxW + (widths[st.to] - maxW) * smooth((st.t - 0.7) / 0.3);
    else winW = widths[st.from] + (widths[st.to] - widths[st.from]) * smooth(st.t);
  }
  const j0 = Math.floor(st.pos);
  const rows = [];
  for (let j = j0 - 1; j <= j0 + 2; j++) rows.push({ j, w: words[((j % n) + n) % n] });
  return (
    <span
      onMouseEnter={onPoke ? () => { clearTimeout(hoverT.current); hoverT.current = setTimeout(() => !st.spinning && st.shown && onPoke(slot, n), HOVER_DELAY); } : undefined}
      onMouseLeave={() => clearTimeout(hoverT.current)}
      onClick={onPoke ? () => !st.spinning && st.shown && onPoke(slot, n) : undefined}
      style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', cursor: onPoke ? 'pointer' : 'default', transform: `translateY(${lift}px) rotate(${wig}deg)` }}>
      <span style={{ position: 'absolute', left: -9999, top: 0, visibility: 'hidden', display: 'flex', gap: 4 }}>
        {words.map((w, k) => <span key={k} ref={(el) => (measRefs.current[k] = el)} style={{ display: 'inline-block' }}><Block text={w.t} /></span>)}
      </span>
      <span style={{ position: 'relative', display: 'block', width: winW == null ? 'auto' : winW, height: ROW }}>
        {winW == null ? <Block text={longest} style={{ visibility: 'hidden' }} /> : null}
        <span style={{ position: 'absolute', inset: 0, border: '3px dashed rgba(110,75,40,0.35)', opacity: slotOpacity }}></span>
        {st.shown ? (
          <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', filter: 'drop-shadow(4px 6px 0 rgba(80,60,30,0.14))' }}>
            {rows.map(({ j, w }) => (
              <span key={j} style={{ position: 'absolute', left: '50%', width: 0, top: 0, height: ROW, display: 'flex', justifyContent: 'center', transform: `translateY(${(j - st.pos) * (ROW + 18)}px)` }}>
                <Block text={w.t} s={w.s} style={{ transform: `rotate(${rot(j)}deg)` }} />
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {baseBoards ? (
        <React.Fragment>
          <span style={{ display: 'block', width: '60%', height: 7, background: WALNUT, backgroundImage: GRAIN, marginTop: -3, opacity: st.shown ? 1 : 0 }}></span>
          <span style={{ display: 'block', width: '110%', height: 7, background: BASE, backgroundImage: GRAIN, opacity: st.shown ? 1 : 0 }}></span>
        </React.Fragment>
      ) : null}
    </span>
  );
}

function Words({ T, at, children, style }) {
  const p = MOTION.fade(T, at);
  return <span style={Object.assign({ fontFamily: DISPLAY, fontWeight: 800, fontSize: WORD_SIZE, lineHeight: 1.1, letterSpacing: '-0.01em', color: INK, opacity: p, transform: `translateY(${(1 - p) * 8}px)`, whiteSpace: 'nowrap' }, style)}>{children}</span>;
}

const TOTAL = () => { try { return JSON.parse(window.OM_SCENES).reduce((a, s) => a + s.dur, 0); } catch (e) { return 7.5; } };
const newSeed = () => Math.floor(Math.random() * 1e6);

const LiveCtx = React.createContext(null);
function Piece({ tweaks }) {
  const live = React.useContext(LiveCtx);
  const { T, CUES } = live || useComposition(); // live is fixed per mount, so hook order is stable
  const D = TOTAL();
  const gap = parseFloat(tweaks.spinGap) || 6;
  const lastT = React.useRef(T);
  const [plays, setPlays] = React.useState(0);
  const [seed, setSeed] = React.useState(newSeed);
  const prevT = lastT.current;
  lastT.current = T;
  const wrapped = T < 0.3 && prevT > D - 0.6;
  const restarted = T < 0.05 && prevT > 0.5 && !wrapped;
  React.useEffect(() => {
    if (wrapped && tweaks.idleLoop) setPlays((p) => p + 1);
    if (restarted || (wrapped && !tweaks.idleLoop)) { setPlays(0); setSeed(newSeed()); }
  }, [wrapped, restarted]);
  React.useEffect(() => { if (!tweaks.idleLoop) setPlays(0); }, [tweaks.idleLoop]);

  const idleOn = tweaks.idleLoop && plays > 0;
  const abs = plays * D + T;
  const idle = idleOn ? { A: (plays - 1) * D + T, base: D } : null;
  const [manual, setManual] = React.useState([[], [], []]);
  React.useEffect(() => { if (restarted || (wrapped && !tweaks.idleLoop)) setManual([[], [], []]); }, [restarted, wrapped]);
  const onPoke = tweaks.hover === false ? null : (slot, n) => setManual((m) => m.map((l, k) => (k === slot ? [...l, { t: abs, step: 1 + Math.floor(Math.random() * (n - 1)) }] : l)));
  const at = (t) => (idleOn ? -10 : t);
  const target = FIRST[seed % FIRST.length];
  const s0 = CUES.Spin;
  const starts = [s0, s0 + 0.45, s0 + 0.9];
  const reel = (k, slotAt) => (
    <Reel T={T} words={WORDS[k]} slotAt={slotAt} start={starts[k]} target={target[k]} idle={idle} seed={seed} slot={k} gap={gap} baseBoards={tweaks.baseBoards} manual={manual[k]} abs={abs} D={D} onPoke={onPoke} wiggleAt={tweaks.wiggle && tweaks.wiggle.slot === k ? tweaks.wiggle.at : null} />
  );
  const pJam = MOTION.enter(T, at(CUES.Wordmark + 0.1)), pYard = MOTION.enter(T, at(CUES.Wordmark + 0.35));
  const wm = (bg, fg, r, p, grain) => ({
    fontFamily: DISPLAY, fontWeight: 800, fontSize: 32, color: fg, background: bg, backgroundImage: grain ? GRAIN : 'none',
    padding: '8px 16px 10px', display: 'inline-block', boxShadow: '0 3px 5px rgba(50,35,15,0.30)', ...arrive(p, r),
  });
  const line = { display: 'flex', alignItems: 'center', gap: 16, minHeight: 84 };
  const S = CUES.Sentence;
  const stack = tweaks.layout === 'stack';
  const mark = tweaks.wordmark === 'text'
    ? <Words T={T} at={at(CUES.Wordmark + 0.1)}>JAMYARD</Words>
    : <span data-mark="" style={{ display: 'inline-flex', gap: 7, alignItems: 'flex-end', opacity: tweaks.hideMark ? 0 : 1 }}>
        <span style={wm(BIRCH, INK, -2, pJam, true)}>JAM</span>
        <span style={wm(RED, PAPER, 1.5, pYard, false)}>YARD</span>
      </span>;
  const period = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {reel(1, at(S + 0.1))}
      <Words T={T} at={at(S + 0.1)}>.</Words>
    </span>
  );
  const tline = { display: 'flex', alignItems: 'center', gap: 16, minHeight: 48 };
  return (
    <div data-screen-label={`t=${Math.floor(T)}s`} style={{ position: 'absolute', inset: 0, background: GESSO, fontFamily: DISPLAY, color: INK, overflow: 'hidden', display: 'flex', alignItems: 'center', padding: stack ? '0 40px' : '0 72px' }}>
      {stack ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={line}>{mark}<Words T={T} at={at(CUES.Wordmark + 0.7)}>is a</Words></div>
          <div style={line}>{reel(0, at(S))}</div>
          <div style={tline}><Words T={T} at={at(S + 0.1)}>of whole-class activities</Words></div>
          <div style={line}><Words T={T} at={at(S + 0.1)}>for</Words>{period}</div>
          <div style={line}><Words T={T} at={at(S + 0.2)}>Use them,</Words>{reel(2, at(S + 0.2))}</div>
          <div style={tline}><Words T={T} at={at(S + 0.2)}>them, or create your own.</Words></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={line}>{mark}<Words T={T} at={at(CUES.Wordmark + 0.7)}>is a</Words>{reel(0, at(S))}</div>
          <div style={line}><Words T={T} at={at(S + 0.1)}>of whole-class activities for</Words>{period}</div>
          <div style={line}>
            <Words T={T} at={at(S + 0.2)}>Use them,</Words>
            {reel(2, at(S + 0.2))}
            <Words T={T} at={at(S + 0.2)}>them, or create your own.</Words>
          </div>
        </div>
      )}
    </div>
  );
}

function MadlibBanner() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CompositionStage width={W} height={H} bg={GESSO} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK}>
        <Piece tweaks={t} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="After the first play" />
        <TweakToggle label="Keep the sentence; re-spin one blank at a time" value={t.idleLoop} onChange={(v) => setTweak('idleLoop', v)} />
        <TweakRadio label="Time between spins" value={t.spinGap} options={['4s', '6s', '9s']} onChange={(v) => setTweak('spinGap', v)} />
        <TweakSection label="Look" />
        <TweakRadio label="Leading JAMYARD" value={t.wordmark} options={['blocks', 'text']} onChange={(v) => setTweak('wordmark', v)} />
        <TweakToggle label="Plinth + base under each block" value={t.baseBoards} onChange={(v) => setTweak('baseBoards', v)} />
        <TweakSection label="Editor" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </div>
  );
}
window.MadlibBanner = MadlibBanner;

// Chrome-free version for a real page: own rAF clock, scales to its container width.
function LiveMadlib({ tweaks, maxScale, hideMark }) {
  const scenes = React.useMemo(() => { try { return JSON.parse(window.OM_SCENES); } catch (e) { return []; } }, []);
  const CUES = React.useMemo(() => { const c = {}; let a = 0; scenes.forEach((s) => { c[s.name] = a; a += s.dur; }); return c; }, [scenes]);
  const D = scenes.reduce((a, s) => a + s.dur, 0) || 7.5;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [T, setT] = React.useState(reduced ? D - 0.01 : 0);
  const elapsed = React.useRef(0);
  const [wiggle, setWiggle] = React.useState(null);
  React.useEffect(() => {
    if (reduced) return;
    let raf, t0 = null;
    const tick = (now) => { if (t0 == null) t0 = now; elapsed.current = (now - t0) / 1000; setT(elapsed.current % D); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [D]);
  const box = React.useRef(null);
  const [w, setW] = React.useState(W);
  React.useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  // First time the cursor comes near the sentence (after the opening spin), the middle block wiggles once.
  React.useEffect(() => {
    if (reduced) return;
    const onMove = (e) => {
      if (!box.current || elapsed.current < D) return;
      const r = box.current.getBoundingClientRect();
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right), dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      if (Math.hypot(dx, dy) < 120) { setWiggle({ slot: 1, at: elapsed.current }); window.removeEventListener('pointermove', onMove); }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [D]);
  const stack = w < 760;
  const CW = stack ? 640 : W, CH = stack ? 640 : H;
  const k = Math.min(maxScale || 1.2, w / CW);
  return (
    <div ref={box} style={{ width: '100%', height: CH * k, position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: CW, height: CH, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        <LiveCtx.Provider value={{ T, CUES }}>
          <Piece tweaks={Object.assign({ idleLoop: true, spinGap: '6s', wordmark: 'blocks', baseBoards: false }, tweaks, { layout: stack ? 'stack' : 'wide', wiggle, hideMark: !!hideMark })} />
        </LiveCtx.Provider>
      </div>
    </div>
  );
}
window.LiveMadlib = LiveMadlib;
