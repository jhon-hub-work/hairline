/**
 * Camera: a video camera on a tripod head. A rounded body with a lens barrel
 * and collar, an eyepiece behind and a small screen flipped out on one side,
 * on a pan column over three splayed legs, with a pan handle trailing behind.
 * The pointer aims it, as if the camera stood in front of the screen: pan and
 * tilt each ride a spring. The silhouette of each part is computed at every
 * pose, the hull of two rounded sections. The reach is clamped so the lens
 * always faces the viewer. At rest it is turned off to the right, the lens
 * edge bright. The slider is the pan reach, in degrees; tilt reaches 0.4 of it.
 *
 * The pattern: a continuous aim. Two springs, a clamped reach, a hit test that
 * reads only the pointer, and a paint order fixed by separating planes.
 */
const { Cam, circ, facing, fillet, fit, hull, poly, prism, proj, rad, rrect, spring, stepS, disposer, mk, pointer, put, register, solid } = HL;

const ZH = 38, PIV = [0, 0, ZH + 6], YB = 10.5;               // head height, pivot, body centre above the pivot
const LB = [-16, 20], WD = 8.5, HB = 9;                        // body: rear and front along the aim, half width, half height
const LENS = [[20, 6.2], [29, 6.2], [33, 7.4]];                // barrel and collar: [distance along the aim, radius]
const AZ0 = 45, REST = [20, 6], RF = 33, LEGS = [55, 170, 290];
const ax = (p, q, s) => [p[0] + q[0] * s, p[1] + q[1] * s, p[2] + q[2] * s];
const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

/** An aim's frame: h and e on the ground, a the camera's axis, u its up. */
function frame(th, ph) {
  const t = rad(th), f = rad(ph), c = Math.cos(f), s = Math.sin(f);
  const h = [Math.cos(t), Math.sin(t), 0], e = [-Math.sin(t), Math.cos(t), 0];
  return { h, e, a: [h[0] * c, h[1] * c, s], u: [-h[0] * s, -h[1] * s, c] };
}
/** A point of the camera: s along its axis, x to its side, y up from the body's centre. */
const at = (F, s, x, y) => ax(ax(ax(PIV, F.a, s), F.e, x), F.u, y + YB);
/** A circle of radius r about the axis at s, and a ring of a section's samples at s. */
const disc = (F, s, r, n, y0 = 0) => Array.from({ length: n }, (_, i) => at(F, s, r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n) + y0));
const sec = (F, s, ring) => ring.map((q) => at(F, s, q.u, q.v));
const flat = (c, r, n) => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n), c[2]]);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = value, over = null;
  const outer = rrect(-WD, -HB, WD, HB, 4, 4), inner = rrect(-WD + 1.6, -HB + 1.6, WD - 1.6, HB - 1.6, 2.4, 4);
  const plate = (w, h, i) => fillet([[i, -h / 2 + i], [w - i, -h / 2 + i], [w - i, h / 2 - i], [i, h / 2 - i]], [2.2 - i / 2, 2.2 - i / 2, 2.2 - i / 2, 2.2 - i / 2], 3);
  const LS = 19, HS = 12, SCR = plate(LS, HS, 0), DSP = plate(LS, HS, 2);

  // Fitted to the widest pan and tilt, and rest, so nothing leaves the frame.
  const C = Cam(45, 0.5, 3), pts = [[-RF, -RF, 0], [RF, RF, 0], [RF, -RF, 0], [-RF, RF, 0]];
  for (const [th, ph] of [[AZ0 - 65, -29], [AZ0 - 65, 29], [AZ0 + 65, -29], [AZ0 + 65, 29], [AZ0, 29], REST]) {
    const F = frame(th, ph);
    pts.push(...disc(F, 33, 7.4, 8), ...sec(F, LB[0] - 6, outer), ...sec(F, LB[1], outer), at(F, -4, -40, 0), ...[-1, 1].map((s) => at(F, 10, s * (WD + 20), 0)));
  }
  fit(C, pts, 200, 166);
  const P = proj(C), front = facing(C), Pv = (q) => P(q[0], q[1], q[2]);
  // the direction toward the camera, from the projection itself
  const o = P(0, 0, 0), cx = P(1, 0, 0), cy = P(0, 1, 0), cz = P(0, 0, 1);
  const r1 = [cx[0] - o[0], cy[0] - o[0], cz[0] - o[0]], r2 = [cx[1] - o[1], cy[1] - o[1], cz[1] - o[1]];
  const cr = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
  const vl = Math.hypot(...cr) * Math.sign(cr[2]), VD = cr.map((x) => x / vl);

  // Static, far leg first: the three legs, the head plate and the pan column.
  const g = mk("g", {}, svg);
  LEGS.map((d) => [d, rad(d)]).sort((p, q) => Math.cos(p[1]) + Math.sin(p[1]) - Math.cos(q[1]) - Math.sin(q[1])).forEach(([, t]) => {
    const top = [3 * Math.cos(t), 3 * Math.sin(t), ZH - 3], foot = [RF * Math.cos(t), RF * Math.sin(t), 0];
    mk("path", { d: poly(hull(flat(top, 2.4, 14).concat(flat(foot, 1.5, 14)).map(Pv))), class: "sil" }, g);
  });
  const handle = mk("path", { class: "sil" }, g);
  put(solid(g), prism(P, front, circ(10, 32), circ(8.6, 32), ZH - 5, ZH));
  put(solid(g), prism(P, front, circ(4.6, 20), circ(3.6, 20), ZH, PIV[2]));

  // Turning with the aim: the pan handle, the eyepiece, the body, the lens, and the screen, which paints before or after.
  const eye = mk("path", { class: "sil" }, g);
  const bodyG = mk("g", {}, g), slab = mk("path", { class: "sil" }, bodyG), body = solid(bodyG);
  const lensG = mk("g", {}, g), barrel = mk("path", { class: "sil" }, lensG), collar = mk("path", { class: "sil" }, lensG);
  const glass = mk("path", { class: "nf lo" }, lensG), rim = mk("path", { class: "nf hi" }, lensG);
  const scrG = mk("g", {}, g), scrB = mk("path", { class: "lo" }, scrG), scrF = mk("path", { class: "sil" }, scrG), scrD = mk("path", { class: "nf lo" }, scrG);
  let near = null;

  let drawn = "";
  function draw(th, ph) {
    const key = th.toFixed(3) + "," + ph.toFixed(3);
    if (key === drawn) return;
    drawn = key;
    const F = frame(th, ph), root = ax(PIV, [0, 0, 1], -3), hd = [-F.h[0] * Math.cos(rad(38)), -F.h[1] * Math.cos(rad(38)), -Math.sin(rad(38))];
    const end = ax(root, hd, 30), grip = ax(root, hd, 17);
    handle.setAttribute("d", poly(hull(flat(root, 1.1, 10).concat(flat(grip, 1.1, 10), flat(end, 2.1, 10)).map(Pv))));
    eye.setAttribute("d", poly(hull(disc(F, LB[0] + 1, 3.1, 14, 3).concat(disc(F, LB[0] - 5, 3.1, 14, 3)).map(Pv))));
    slab.setAttribute("d", poly(hull(sec(F, -12, rrect(-7.5, -YB, 7.5, -YB + 3, 1.5, 2)).concat(sec(F, 13, rrect(-7.5, -YB, 7.5, -YB + 3, 1.5, 2))).map(Pv))));
    put(body, { sil: poly(hull(sec(F, LB[0], outer).concat(sec(F, LB[1], outer)).map(Pv))), crease: poly(sec(F, LB[1], inner).map(Pv)) });
    barrel.setAttribute("d", poly(hull(disc(F, LENS[0][0], LENS[0][1], 20).concat(disc(F, LENS[1][0], LENS[1][1], 20)).map(Pv))));
    collar.setAttribute("d", poly(hull(disc(F, LENS[1][0], LENS[2][1], 24).concat(disc(F, LENS[2][0], LENS[2][1], 24)).map(Pv))));
    glass.setAttribute("d", poly(disc(F, LENS[2][0] - 1.4, 4.7, 20).map(Pv)));
    rim.setAttribute("d", poly(disc(F, LENS[2][0], LENS[2][1], 24).map(Pv)));
    // the screen: hinged on the side wall near the front, opened a little past a right angle
    const th2 = rad(104), d = ax([0, 0, 0], F.a, -Math.cos(th2)), dd = ax(d, F.e, Math.sin(th2)), hinge = at(F, 10, WD, 0.5);
    const nrm = [dd[1] * F.u[2] - dd[2] * F.u[1], dd[2] * F.u[0] - dd[0] * F.u[2], dd[0] * F.u[1] - dd[1] * F.u[0]];
    const sh = -Math.sign(dot3(nrm, VD)) * 1.8, onScr = (pl, k) => poly(pl.map((p) => Pv(ax(ax(ax(hinge, dd, p[0]), F.u, p[1]), nrm, k))));
    scrB.setAttribute("d", onScr(SCR, sh));
    scrF.setAttribute("d", onScr(SCR, 0));
    scrD.setAttribute("d", onScr(DSP, 0));
    // on the camera's far side the screen paints before the body, on its near side after the lens
    const n = dot3(F.e, VD) > 0;
    if (n !== near) { near = n; if (n) lensG.after(scrG); else bodyG.before(scrG); }
  }

  const az = spring(REST[0], { eps: 0.01 }), el = spring(REST[1], { eps: 0.01 });
  const B = register(stage, (dt) => {
    const a = stepS(az, dt), b = stepS(el, dt);
    draw(az.x, el.x);
    return a || b;
  });
  bag.add(B.unregister);

  // The aim reads only the pointer's offset from the pan column on screen, never what is drawn: nothing can flicker.
  const hub = P(PIV[0], PIV[1], PIV[2]);
  function retarget() {
    if (over) {
      az.t = AZ0 - reach * Math.tanh((over[0] - hub[0]) / 110);
      el.t = REST[1] + 0.4 * reach * Math.tanh((hub[1] - over[1]) / 80);
      read.textContent = `pan ${Math.round(AZ0 - az.t)}° · tilt ${Math.round(el.t)}°`;
    } else { az.t = REST[0]; el.t = REST[1]; read.textContent = "rest"; }
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => { over = p; retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { reach = v; if (over) retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "camera",
  means: "A video camera on a tripod: its lens turns and tips toward the pointer, on a spring.",
  rules: [3, 5, 8, 9],
  range: [25, 45, 65],
  mount,
});
