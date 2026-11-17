// 2D secondary structure of an RNA model: sequence, base pairs, and three SVG drawings of them.
// Ported from web/ss.js (with nucColor from web/viz_style.js) in JaneliaSciComp/rna_atlas_website.
// Changes from the source: typed; color-blind-safe base colors; proj2D takes the camera's rotation matrix, not a quaternion;
// the chain kept is the first one with nucleotides; waters and ligands are dropped and a modified
// nucleotide is "N"; the arc plot draws the sequence too; the reactivity and classification
// outputs are gone.

export type Vec3 = readonly [number, number, number];
// World-to-camera rotation as rows [right, up, toward the viewer].
export type Mat3 = readonly [Vec3, Vec3, Vec3];

// num is the residue number in the file; resSeq also carries any insertion code.
type Residue = { chain: string; resSeq: string; num: number; base: string; atoms: Record<string, Vec3> };
type Pair = { i: number; j: number; pk: boolean };

// Okabe-Ito colors (reddish purple, sky blue, vermillion, blue): of that palette's four-color sets
// this one stays furthest apart across protan, deutan and tritan vision, with the Watson-Crick
// partners (G-C, A-U) on the most distinct pairs. The atlas's colors merged C with G.
const NUC_COLORS: Record<string, string> = { A: '#CC79A7', C: '#56B4E9', G: '#D55E00', U: '#0072B2' };
export const nucColor = (base: string) => NUC_COLORS[base] ?? '#999';

const BACKBONE = '#cdd6dd';
const pairStroke = (pk: boolean, dash: string) =>
  pk ? `stroke="#e83e8c" stroke-width="1.5" stroke-dasharray="${dash}"` : 'stroke="#7b61ff" stroke-width="1.3"';

// Multi-level dot-bracket to pairs; pk marks a crossing (pseudoknot) bracket.
function ssPairs(dbn: string): Pair[] {
  const OPEN = '([{<';
  const CLOSE = ')]}>';
  const stacks: number[][] = [[], [], [], []];
  const pairs: Pair[] = [];
  for (let i = 0; i < dbn.length; i++) {
    const o = OPEN.indexOf(dbn[i]);
    if (o >= 0) {
      stacks[o].push(i);
      continue;
    }
    const c = CLOSE.indexOf(dbn[i]);
    if (c >= 0 && stacks[c].length) pairs.push({ i: stacks[c].pop()!, j: i, pk: c > 0 });
  }
  return pairs;
}

// Arc plot: the sequence on a line, cw pixels per nucleotide, an arc over each base pair.
// nums[i] is nucleotide i's number in the file.
export function arcDiagram(dbn: string, seq: string, cw: number, nums: readonly number[]): string {
  const n = seq.length;
  if (!n) return '';
  const arcs = ssPairs(dbn.slice(0, n)).map(p => ({ p, h: Math.min(120, 6 + (p.j - p.i) * cw * 0.55) }));
  const base = Math.max(12, ...arcs.map(x => x.h)) + 6;
  const W = n * cw;
  const H = base + 16;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-size="${Math.min(cw, 11)}" font-family="monospace"><line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="${BACKBONE}"/>`;
  for (const { p, h } of arcs) {
    const xi = p.i * cw + cw / 2;
    const xj = p.j * cw + cw / 2;
    s += `<path d="M${xi.toFixed(1)} ${base} Q ${((xi + xj) / 2).toFixed(1)} ${(base - 2 * h).toFixed(1)} ${xj.toFixed(1)} ${base}" fill="none" ${pairStroke(p.pk, '5 3')} opacity="0.78"><title>${nums[p.i]}–${nums[p.j]}${p.pk ? ' (pseudoknot)' : ''}</title></path>`;
  }
  for (let i = 0; i < n; i++) {
    s += `<text x="${(i * cw + cw / 2).toFixed(1)}" y="${base + 12}" text-anchor="middle" fill="${nucColor(seq[i])}">${seq[i]}</text>`;
  }
  return s + '</svg>';
}

// forna-style layout: spring-embed the nucleotide graph (backbone + base pairs).
function ssLayout(n: number, pairs: Pair[]): { x: number; y: number }[] {
  const L = 16;
  const pos = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 6.2832;
    return { x: (Math.cos(a) * L * n) / 6.2832, y: (Math.sin(a) * L * n) / 6.2832 };
  });
  const iters = n > 400 ? 260 : 420;
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const spring = (a: number, b: number, str: number) => {
    const dx = pos[b].x - pos[a].x;
    const dy = pos[b].y - pos[a].y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = (d - L) * str;
    fx[a] += (dx / d) * f;
    fy[a] += (dy / d) * f;
    fx[b] -= (dx / d) * f;
    fy[b] -= (dy / d) * f;
  };
  for (let it = 0; it < iters; it++) {
    const cool = 1 - (it / iters) * 0.8;
    fx.fill(0);
    fy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const d2 = dx * dx + dy * dy || 0.01;
        if (d2 < 9000) {
          const r = 150 / d2;
          fx[i] += dx * r;
          fy[i] += dy * r;
          fx[j] -= dx * r;
          fy[j] -= dy * r;
        }
      }
    }
    for (let i = 0; i < n - 1; i++) spring(i, i + 1, 0.22);
    for (const p of pairs) spring(p.i, p.j, 0.28);
    for (let i = 0; i < n; i++) {
      pos[i].x += Math.max(-8, Math.min(8, fx[i])) * cool;
      pos[i].y += Math.max(-8, Math.min(8, fy[i])) * cool;
    }
  }
  return pos;
}

// Shared drawing for the two node diagrams: points fitted to a box, backbone, pairs, circles.
// labels[i] is the nucleotide's number in the file and its letter. The backbone breaks where the
// numbers skip: those residues are not in the model.
function nodeDiagram(pts: { x: number; y: number }[], lines: [number, number, boolean][], labels: [number, string][], box: number, pad: number, maxR: number): string {
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minx = Math.min(...xs);
  const miny = Math.min(...ys);
  const sc = Math.min((box - 2 * pad) / (Math.max(...xs) - minx || 1), (box - 2 * pad) / (Math.max(...ys) - miny || 1));
  const X = (i: number) => (pad + (pts[i].x - minx) * sc).toFixed(1);
  const Y = (i: number) => (pad + (pts[i].y - miny) * sc).toFixed(1);
  const r = Math.max(2.3, Math.min(maxR, sc * maxR));
  let s = `<svg width="100%" viewBox="0 0 ${box} ${box}" preserveAspectRatio="xMidYMid meet" font-size="7">`;
  s += `<path d="${pts.map((_, i) => `${i > 0 && labels[i][0] - labels[i - 1][0] <= 1 ? 'L' : 'M'}${X(i)} ${Y(i)}`).join(' ')}" fill="none" stroke="${BACKBONE}" stroke-width="1.4"/>`;
  for (const [a, b, pk] of lines) s += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" ${pairStroke(pk, '4 2')}/>`;
  pts.forEach((_, i) => {
    const [num, ch] = labels[i];
    s += `<circle cx="${X(i)}" cy="${Y(i)}" r="${r.toFixed(1)}" fill="${nucColor(ch)}" stroke="#fff" stroke-width="0.5"><title>${num} ${ch}</title></circle>`;
    if (r >= maxR - 1) s += `<text x="${X(i)}" y="${(Number(Y(i)) + 2.3).toFixed(1)}" text-anchor="middle" fill="#fff">${ch}</text>`;
  });
  return s + '</svg>';
}

// Abstract 2D layout, nodes colored by base. Slow for long sequences: memoize the result.
export function forna2D(dbn: string, seq: string, box: number, nums: readonly number[]): string {
  const n = seq.length;
  if (n < 2) return '';
  if (n > 900) return arcDiagram(dbn, seq, 6, nums);
  const pairs = ssPairs(dbn.slice(0, n));
  return nodeDiagram(ssLayout(n, pairs), pairs.map(p => [p.i, p.j, p.pk]), [...seq].map((ch, i) => [nums[i], ch]), box, 12, 7);
}

// 3x3 symmetric eigendecomposition (Jacobi). Eigenvectors, largest eigenvalue first.
function jacobiEig3(A: number[][]): number[][] {
  const a = A.map(row => row.slice());
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) {
    let p = 0;
    let q = 1;
    let mx = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > mx) {
      mx = Math.abs(a[0][2]);
      q = 2;
    }
    if (Math.abs(a[1][2]) > mx) {
      mx = Math.abs(a[1][2]);
      p = 1;
      q = 2;
    }
    if (mx < 1e-10) break;
    const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    for (let k = 0; k < 3; k++) {
      const kp = a[k][p];
      const kq = a[k][q];
      a[k][p] = c * kp - s * kq;
      a[k][q] = s * kp + c * kq;
    }
    for (let k = 0; k < 3; k++) {
      const pk = a[p][k];
      const qk = a[q][k];
      a[p][k] = c * pk - s * qk;
      a[q][k] = s * pk + c * qk;
    }
    for (let k = 0; k < 3; k++) {
      const kp = V[k][p];
      const kq = V[k][q];
      V[k][p] = c * kp - s * kq;
      V[k][q] = s * kp + c * kq;
    }
  }
  const vals = [a[0][0], a[1][1], a[2][2]];
  return [0, 1, 2].sort((i, j) => vals[j] - vals[i]).map(i => [V[0][i], V[1][i], V[2][i]]);
}

export type Projection = {
  pts: Vec3[];
  // Each point's index in the sequence: a residue with no C1' has no point.
  idx: number[];
  // Each point's residue number in the file.
  nums: number[];
  center: Vec3;
  // The two principal axes, for a view with no camera.
  e1: number[];
  e2: number[];
};

// The C1' atoms, their centroid and principal axes. Parse once per model; proj2D then only
// re-projects as the camera moves.
export function projParse(text: string): Projection | null {
  const pts: Vec3[] = [];
  const idx: number[] = [];
  const nums: number[] = [];
  ssParseResidues(text).forEach((r, i) => {
    if (r.atoms["C1'"]) {
      pts.push(r.atoms["C1'"]);
      idx.push(i);
      nums.push(r.num);
    }
  });
  const n = pts.length;
  if (n < 3) return null;
  const center = [0, 1, 2].map(k => pts.reduce((sum, p) => sum + p[k], 0) / n) as unknown as Vec3;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r][c] += (p[r] - center[r]) * (p[c] - center[c]);
  }
  const [e1, e2] = jacobiEig3(cov);
  return { pts, idx, nums, center, e1, e2 };
}

// The model's C1' atoms flattened as the 3D viewer's camera sees them (rot from viewRotation), or
// onto their best-fit plane when rot is null. SVG y grows downward, so the camera's up is flipped.
export function proj2D(parsed: Projection | null, dbn: string, seq: string, box: number, rot: Mat3 | null): string {
  if (!parsed) return '';
  const { pts, idx, nums, center, e1, e2 } = parsed;
  const along = (p: Vec3, axis: readonly number[]) => (p[0] - center[0]) * axis[0] + (p[1] - center[1]) * axis[1] + (p[2] - center[2]) * axis[2];
  const flat = pts.map(p => (rot ? { x: along(p, rot[0]), y: -along(p, rot[1]) } : { x: along(p, e1), y: along(p, e2) }));
  const pointOf = new Map(idx.map((seqIndex, i) => [seqIndex, i]));
  const lines: [number, number, boolean][] = [];
  for (const p of ssPairs(dbn)) {
    const a = pointOf.get(p.i);
    const b = pointOf.get(p.j);
    if (a !== undefined && b !== undefined) lines.push([a, b, p.pk]);
  }
  return nodeDiagram(flat, lines, idx.map((seqIndex, i) => [nums[i], seq[seqIndex] ?? 'N']), box, 14, 6);
}

// The camera's world-to-camera rotation, from where it is, what it looks at, and its up vector.
export function viewRotation(position: ArrayLike<number>, target: ArrayLike<number>, up: ArrayLike<number>): Mat3 {
  const cross = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (v: Vec3): Vec3 => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  };
  const forward = unit([target[0] - position[0], target[1] - position[1], target[2] - position[2]]);
  const right = unit(cross(forward, up));
  return [right, cross(right, forward), [-forward[0], -forward[1], -forward[2]]];
}

// Where the camera goes when the view is dragged by dx degrees right and dy degrees down: it
// orbits its target the opposite way, so the front of the model follows the drag.
export function orbit(position: ArrayLike<number>, target: ArrayLike<number>, up: ArrayLike<number>, dx: number, dy: number): { position: Vec3; up: Vec3 } {
  // Rodrigues' rotation of v about the unit axis by deg degrees.
  const turn = (v: Vec3, axis: Vec3, deg: number): Vec3 => {
    const cos = Math.cos((deg * Math.PI) / 180);
    const sin = Math.sin((deg * Math.PI) / 180);
    const dot = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
    const cross = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
    return [0, 1, 2].map(k => v[k] * cos + cross[k] * sin + axis[k] * dot * (1 - cos)) as unknown as Vec3;
  };
  const [right, trueUp] = viewRotation(position, target, up);
  // Around the camera's up for the sideways part, then around its right, which that first turn
  // has moved, for the vertical part.
  const about = (v: Vec3) => turn(turn(v, trueUp, -dx), turn(right, trueUp, -dx), -dy);
  const offset = about([position[0] - target[0], position[1] - target[1], position[2] - target[2]]);
  return { position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]], up: about(trueUp) };
}

// ---------- secondary structure from the 3D model ----------
// Only canonical Watson-Crick and wobble pairs: complementary bases (A-U, G-C, G-U) whose C1'
// atoms are 8-12.5 Å apart and that have at least two Watson-Crick-edge atom pairs within 3.4 Å.
const HB2 = 3.4 * 3.4;
const PAIR_HB: Record<string, [string, string][]> = {
  'A|U': [['N1', 'N3'], ['N6', 'O4']],
  'G|C': [['N1', 'N3'], ['N2', 'O2'], ['O6', 'N4']],
  'G|U': [['N1', 'O2'], ['O6', 'N3']]
};
const NEED: Record<string, string[]> = { A: ['N1', 'N6'], U: ['N3', 'O4', 'O2'], G: ['N1', 'N2', 'O6'], C: ['N3', 'N4', 'O2'] };
const BASEMAP: Record<string, string> = {
  RA: 'A', RG: 'G', RC: 'C', RU: 'U', ADE: 'A', GUA: 'G', CYT: 'C', URA: 'U',
  DA: 'A', DG: 'G', DC: 'C', DU: 'U', DT: 'U', A: 'A', G: 'G', C: 'C', U: 'U', T: 'U'
};

function hbList(bi: string, bj: string): [string, string][] | null {
  return PAIR_HB[`${bi}|${bj}`] ?? PAIR_HB[`${bj}|${bi}`]?.map(([x, y]): [string, string] => [y, x]) ?? null;
}

const crosses = ([a, b]: number[], [c, d]: number[]) => (a < c && c < b && b < d) || (c < a && a < d && d < b);

// Pairs to multi-level dot-bracket: a pair that crosses one already placed goes a level up. A
// pair that would need a fifth level is left out, since ssPairs would pair it with the wrong partner.
function toDbn(n: number, pairs: number[][]): string {
  const OPEN = '([{<';
  const CLOSE = ')]}>';
  const dbn = new Array<string>(n).fill('.');
  const levels: number[][][] = [];
  for (const pair of pairs.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    let lvl = 0;
    while (levels[lvl]?.some(placed => crosses(pair, placed))) lvl++;
    if (lvl >= OPEN.length) continue;
    (levels[lvl] ??= []).push(pair);
    dbn[pair[0]] = OPEN[lvl];
    dbn[pair[1]] = CLOSE[lvl];
  }
  return dbn.join('');
}

// ATOM records (PDB) or the _atom_site loop (mmCIF) of the first model, as the ordered nucleotides
// of the first chain that has any, keeping only C1' and the Watson-Crick-edge atoms.
function ssParseResidues(text: string): Residue[] {
  const residues: Residue[] = [];
  let cur: Residue | undefined;
  const add = (chain: string, resSeq: string, resName: string, atomName: string, x: number, y: number, z: number) => {
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return;
    const an = atomName.replace(/["'*]/g, "'");
    if (!cur || cur.chain !== chain || cur.resSeq !== resSeq) {
      // Always an integer, never file text: it is written into the SVG.
      const num = parseInt(resSeq, 10);
      cur = { chain, resSeq, num: Number.isNaN(num) ? residues.length + 1 : num, base: BASEMAP[resName.trim().toUpperCase()] ?? 'N', atoms: {} };
      residues.push(cur);
    }
    if (an === "C1'" || NEED[cur.base]?.includes(an)) cur.atoms[an] = [x, y, z];
  };
  if (text.startsWith('data_') || text.includes('_atom_site.')) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== 'loop_') continue;
      const tags: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith('_')) tags.push(lines[j++].trim());
      if (!tags[0]?.startsWith('_atom_site.')) {
        i = j - 1;
        continue;
      }
      const col = (...names: string[]) => names.map(name => tags.indexOf(`_atom_site.${name}`)).find(k => k >= 0) ?? -1;
      const cAtom = col('label_atom_id', 'auth_atom_id');
      const cComp = col('label_comp_id', 'auth_comp_id');
      const cAsym = col('label_asym_id', 'auth_asym_id');
      const cSeq = col('auth_seq_id', 'label_seq_id');
      const cIns = col('pdbx_PDB_ins_code');
      const cModel = col('pdbx_PDB_model_num');
      const [cx, cy, cz] = [col('Cartn_x'), col('Cartn_y'), col('Cartn_z')];
      let firstModel: string | undefined;
      for (; j < lines.length; j++) {
        const t = lines[j].trim();
        if (t === '' || t === '#' || t === 'loop_' || t.startsWith('_') || t.startsWith('data_')) break;
        const f = t.split(/\s+/);
        if (f.length < tags.length) continue;
        if (cModel >= 0 && f[cModel] !== (firstModel ??= f[cModel])) continue;
        const ins = f[cIns];
        add(f[cAsym], f[cSeq] + (ins && ins !== '.' && ins !== '?' ? ins : ''), f[cComp], (f[cAtom] ?? '').replace(/^['"]|['"]$/g, ''), parseFloat(f[cx]), parseFloat(f[cy]), parseFloat(f[cz]));
      }
      i = j - 1;
    }
  } else {
    for (const l of text.split('\n')) {
      if (l.startsWith('ENDMDL')) break;
      if (!(l.startsWith('ATOM') || l.startsWith('HETATM'))) continue;
      add(l.slice(21, 22).trim() || 'A', l.slice(22, 27).trim(), l.slice(17, 20), l.slice(12, 16).trim(),
        parseFloat(l.slice(30, 38)), parseFloat(l.slice(38, 46)), parseFloat(l.slice(46, 54)));
    }
  }
  // A residue with an unknown name is a nucleotide only if it has a C1': that drops waters,
  // ligands and protein.
  const nucleotides = residues.filter(r => r.base !== 'N' || r.atoms["C1'"]);
  return nucleotides.filter(r => r.chain === nucleotides[0].chain);
}

const dist2 = (p: Vec3, q: Vec3) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

// Model text (PDB or mmCIF) to its one-letter sequence, dot-bracket and residue numbers; n is 0
// when it has no nucleotides.
export function deriveSS(text: string): { seq: string; dbn: string; nums: number[]; n: number } {
  const res = ssParseResidues(text);
  const n = res.length;
  const cand: number[][] = [];
  for (let i = 0; i < n; i++) {
    const ci = res[i].atoms;
    if (!ci["C1'"]) continue;
    for (let j = i + 4; j < n; j++) {
      const cj = res[j].atoms;
      const hl = hbList(res[i].base, res[j].base);
      if (!cj["C1'"] || !hl) continue;
      const dd = dist2(ci["C1'"], cj["C1'"]);
      if (dd < 64 || dd > 156) continue;
      const nb = hl.filter(([ai, aj]) => ci[ai] && cj[aj] && dist2(ci[ai], cj[aj]) <= HB2).length;
      if (nb >= 2) cand.push([-nb, dd, i, j]);
    }
  }
  // Each base pairs once: most H-bonds first, then closest.
  cand.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  const used = new Set<number>();
  const pairs: number[][] = [];
  for (const [, , i, j] of cand) {
    if (!used.has(i) && !used.has(j)) {
      used.add(i).add(j);
      pairs.push([i, j]);
    }
  }
  return { seq: res.map(r => r.base).join(''), dbn: toDbn(n, pairs), nums: res.map(r => r.num), n };
}
