/**
 * Clapper: a film slate standing upright, a rounded plate with a fixed bar
 * across its top, ruled rows below, and a striped clapstick hinged on its
 * top-left. The pointer's distance to the plate, which never moves, sets how
 * far the stick is open, on one spring that is nearly undamped, as a light
 * hinged stick is: leaving, it drops, hits the plate and rebounds. At rest it
 * is just open, and bright. The slider is the widest it opens, in degrees.
 *
 * The pattern: a continuous field with one part, as the padlock's shackle:
 * one spring, read from the pointer's distance to a fixed point.
 */
const {
  Cam, clamp, fillet, fit, hull, poly, proj, rad, seg, spring, stepS,
  disposer, mk, place, pointer, put, register, solid,
} = HL;

const W = 66, H = 44, D = 4, B = 1.3, TS = 8, STRIPE = [10, 23, 36, 49]; // plate width, height, thickness, crease inset; stick thickness
const PIV = [TS / 2, H + TS / 2];                                       // the hinge: the stick's rounded left end turns about it
const REST = 10, TOP = 84, R0 = 60, R1 = 210, SC = 2.75;

/** A point of the face (x, z) turned th degrees about the hinge. */
function rot(p, th) {
  const c = Math.cos(rad(th)), s = Math.sin(rad(th)), dx = p[0] - PIV[0], dz = p[1] - PIV[1];
  return [PIV[0] + dx * c - dz * s, PIV[1] + dx * s + dz * c];
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let top = value, over = false, near = 0;

  // The stick's outline at 0°, and its crease inset: its left end a half round about the hinge.
  const stick = fillet([[0, H], [W, H], [W, H + TS], [0, H + TS]], [3.9, 1.2, 1.2, 3.9], 6);
  const inset = fillet([[B, H + B], [W - B, H + B], [W - B, H + TS - B], [B, H + TS - B]], [2.4, 0.5, 0.5, 2.4], 6);
  const bands = STRIPE.map((a) => [[a, H + 1.1], [a + 6, H + 1.1], [a + 11, H + TS - 1.1], [a + 5, H + TS - 1.1]]);
  // the fixed bar's stripes lean the other way, so the closed slate makes chevrons
  const bar = STRIPE.map((a) => [[a - 2 + 5, H - TS + 1.1], [a - 2 + 11, H - TS + 1.1], [a - 2 + 6, H - 1.1], [a - 2, H - 1.1]]);

  // The camera is fitted to the plate and the stick at 0° and at its widest.
  const C = Cam(45, 0.5, SC);
  const ext = [[0, 0, 0], [W, 0, 0], [0, D, 0], [W, D, 0]];
  for (const th of [0, TOP]) for (const p of stick) { const q = rot(p, th); ext.push([q[0], 0, q[1]], [q[0], D, q[1]]); }
  fit(C, ext, 200, 160);
  const P = proj(C);
  const on = (p, th, y) => { const q = rot(p, th); return P(q[0], y, q[1]); };

  // The plate, which never moves: a rounded face stood out along y, and what is ruled on it.
  const g = mk("g", {}, svg);
  const face = fillet([[0, 0], [W, 0], [W, H], [0, H]], [6, 6, 1.2, 1.2], 8);
  const edge = fillet([[B, B], [W - B, B], [W - B, H - B], [B, H - B]], [6 - B, 6 - B, 0.5, 0.5], 8);
  put(solid(g), {
    sil: poly(hull(face.map((p) => P(p[0], 0, p[1])).concat(face.map((p) => P(p[0], D, p[1]))))),
    crease: poly(edge.map((p) => P(p[0], D, p[1]))),
  });
  const f = (x, z) => P(x, D, z), row = (z, x0, x1) => seg(f(x0, z), f(x1, z)), col = (x, z0, z1) => seg(f(x, z0), f(x, z1));
  mk("path", {
    d: row(H - TS, 3, W - 3) + bar.map((b) => poly(b.map((p) => f(p[0], p[1])))).join("") + row(29, 5, W - 5) + row(21, 5, W - 5) + row(13, 5, W - 5) + row(4.5, 5, 26) +
      col(38, 21, 29) + col(22, 13, 21) + col(44, 13, 21),
    class: "nf lo",
  }, g);

  const arm = solid(g), stripes = mk("path", { class: "nf lo" }, g);
  arm.sil.classList.add("hi");
  const pin = mk("circle", { r: 1.25, class: "dot m" }, g);
  place(pin, f(PIV[0], PIV[1]));

  let drawn = NaN;
  function draw(th) {
    if (th === drawn) return;
    drawn = th;
    put(arm, {
      sil: poly(hull(stick.map((p) => on(p, th, 0)).concat(stick.map((p) => on(p, th, D))))),
      crease: poly(inset.map((p) => on(p, th, D))),
    });
    stripes.setAttribute("d", bands.map((b) => poly(b.map((p) => on(p, th, D)))).join(""));
  }

  // Nearly undamped, so a stick let go reaches the plate and rebounds from it.
  const sp = spring(REST, { k: 220, c: 10.4, eps: 0.05 });
  const loop = register(stage, (dt) => { const m = stepS(sp, dt); draw(clamp(sp.x, 0, TOP)); return m; });
  bag.add(loop.unregister);
  draw(REST);

  // Read from the target, never the pose on screen.
  function aim() {
    sp.t = over ? REST + (top - REST) * near : REST;
    read.textContent = over ? "open " + Math.round(sp.t) + "°" : "rest";
    loop.wake();
  }

  const c0 = P(W / 2, D / 2, H / 2);
  bag.add(pointer(stage, {
    move: (p) => { over = true; near = clamp((R1 - Math.hypot(p[0] - c0[0], p[1] - c0[1])) / (R1 - R0), 0, 1); aim(); },
    leave: () => { over = false; aim(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { top = v; aim(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "clapper",
  means: "A film slate: its striped clapstick lifts as the pointer comes near, and claps shut when it leaves.",
  rules: [1, 3, 5, 8],
  range: [20, 40, 65],
  mount,
});
