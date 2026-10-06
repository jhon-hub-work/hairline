/**
 * Timeline: a video editor's tray with three tracks of clips, thin rounded
 * blocks of every length, and a playhead standing in the ruler at the back. The
 * clip under the pointer lifts out of its track; the clips beside it on the
 * same track lift less, staggered outwards on the 700ms lift curve. At rest the
 * clip under the playhead is raised a little, bright. The slider is the spread,
 * in clips.
 *
 * The pattern: discrete items in rows, as Riffle's, with a lift that falls off
 * along the row. A hit test on each lane's static footprint, nearest clip first.
 */
const {
  Cam, clamp, facing, fit, poly, prism, proj, rings, rrect, seg, unproj,
  tdone, tset, tval, tween, disposer, mk, pointer, put, register, solid,
} = HL;

const LP = 17, CW = 11, X0 = -6, X1 = 156, Y0 = -16, Y1 = 3 * LP + 4, TD = 5, PX = 62, PZ = 28;
const CH = [4.4, 4.4, 3.4], LIFT = 11, STEP = 45, NB = 0.6;
/** Each track's clips as [start, length], left to right: uneven lengths, uneven gaps. */
const TRACKS = [
  [[4, 34], [42, 20], [68, 44], [118, 26]],
  [[10, 22], [36, 52], [94, 15], [113, 31]],
  [[0, 26], [31, 15], [52, 30], [87, 37], [129, 20]],
];
const REST = [1, 1];

/** The share of the full lift a clip takes, d clips along the track from the one lifted: 0.6 next door, nothing past `span` more. */
const falloff = (d, span) => (d === 0 ? 1 : clamp(NB * (1 - (d - 1) / span), 0, NB));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let span = value, act = null;

  const C = Cam(45, 0.5, 1.95);
  fit(C, [[X0, Y0, -TD], [X1, Y1, -TD], [X1, Y0, -TD], [X0, Y1, -TD], [PX, -9, PZ + 4], [X0 + 4, 0, LIFT + CH[0]]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [tr, ti] = rings(X0, Y0, X1, Y1, 5, 1.6);
  put(solid(g), prism(P, front, tr, ti, -TD, 0));
  // the lanes the clips sit in, the ruler's ticks, and the playhead's line across the tracks
  const lane = (t) => mk("path", { d: poly(rrect(X0 + 3, t * LP + 0.8, X1 - 3, (t + 1) * LP - 0.8, 3, 3).map((q) => P(q.u, q.v, 0))), class: "nf lo" }, g);
  for (let t = 0; t < 3; t++) lane(t);
  let tk = "";
  for (let x = X0 + 6, n = 0; x < X1 - 4; x += 7.2, n++) tk += seg(P(x, -5.5, 0), P(x, n % 4 ? -8 : -11, 0));
  mk("path", { d: tk, class: "nf lo" }, g);
  mk("path", { d: seg(P(PX, -3, 0), P(PX, Y1 - 3, 0)), class: "nf lo" }, g);
  // the playhead: a thin post standing in the ruler, with a small cap
  mk("path", { d: seg(P(PX, -8.5, 0), P(PX, -8.5, PZ)), class: "nf sil" }, g);
  const [pr, pi] = rings(PX - 3.6, -12, PX + 3.6, -5, 1.8, 0.8);
  put(solid(g), prism(P, front, pr, pi, PZ, PZ + 4));

  // clips, track by track from the back, left to right: back to front
  const clips = [];
  TRACKS.forEach((row, t) => row.forEach(([s, w], k) => {
    const y0 = t * LP + (LP - CW) / 2, [ring, inner] = rings(s, y0, s + w, y0 + CW, 2.6, 1.1), el = solid(g);
    const trim = mk("path", { class: "nf lo" }, el.g);
    clips.push({ t, k, s, w, y0, ring, inner, el, trim, z: tween(0), drawn: NaN });
  }));
  const at = (t, k) => clips.find((c) => c.t === t && c.k === k);

  function draw(c, z) {
    if (z === c.drawn) return;
    c.drawn = z;
    put(c.el, prism(P, front, c.ring, c.inner, z, z + CH[c.t]));
    const h = z + CH[c.t], a = c.y0 + 3, b = c.y0 + CW - 3;
    c.trim.setAttribute("d", seg(P(c.s + 3.4, a, h), P(c.s + 3.4, b, h)) + seg(P(c.s + c.w - 3.4, a, h), P(c.s + c.w - 3.4, b, h)));
  }

  /** Lift each clip aims at, with clip `a` of its track lifted by `depth` of the full lift. */
  const target = (c, a, depth) => (a && c.t === a.t ? LIFT * depth * falloff(Math.abs(c.k - a.k), span) : 0);
  function light(a) { clips.forEach((c) => c.el.sil.classList.toggle("hi", c === a)); }

  const rest = at(...REST);
  for (const c of clips) { c.z = tween(target(c, rest, 0.35)); draw(c, tval(c.z, 0)); }
  light(rest);
  read.textContent = "rest";

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const c of clips) { draw(c, tval(c.z, now)); if (!tdone(c.z, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);

  /** Aims every clip at `a` lifted (null puts the rest clip back), the stagger spreading out from `from`. */
  function aim(a, from) {
    const now = performance.now(), to = a || rest;
    for (const c of clips) tset(c.z, target(c, to, a ? 1 : 0.35), now, (Math.abs(c.k - from.k) + Math.abs(c.t - from.t)) * STEP);
    light(to);
    read.textContent = a ? `clip ${a.t + 1}·${a.k + 1}` : "rest";
    B.wake();
  }

  /** The clip a screen point picks: tested on the lane's resting footprint, the nearest clip in the lane, so a lift cannot move the pick. */
  function hit(p) {
    const [x, y] = unproj(C, p[0], p[1], CH[0]);
    if (x < X0 || x > X1 || y < 0 || y > 3 * LP) return null;
    const t = Math.min(2, Math.floor(y / LP));
    let best = null, bd = Infinity;
    for (const c of clips) if (c.t === t) { const d = Math.max(c.s - x, 0, x - c.s - c.w); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  bag.add(pointer(stage, {
    move: (p) => { const a = hit(p); if (a !== act) { aim(a, a || act || rest); act = a; } },
    leave: () => { if (act) { aim(null, act); act = null; } },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { span = v; if (act) aim(act, act); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "timeline",
  means: "A video timeline of three tracks: the clip under the pointer lifts out, and its neighbours on the track follow, less each step.",
  rules: [1, 2, 8, 10],
  range: [1, 2, 3.5],
  mount,
});
