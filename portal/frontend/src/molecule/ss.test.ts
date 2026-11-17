import { Mat4, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { arcDiagram, deriveSS, forna2D, orbit, proj2D, projParse, viewRotation } from './ss';
import { HAIRPIN, type Atom, cif, pdb } from '../test/hairpin';

// [cx, cy] of each nucleotide circle, in sequence order.
const circles = (svg: string) => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
// Turns -0 into 0, which toEqual tells apart.
const plain = (m: readonly (readonly number[])[]) => m.map(row => row.map(v => v + 0));
const count = (svg: string, tag: string) => svg.split(`<${tag} `).length - 1;

test('derives the sequence and base pairs from a PDB model', () => {
  expect(deriveSS(pdb(HAIRPIN))).toMatchObject({ seq: 'GGAAAACC', dbn: '((....))', n: 8 });
});

test('derives the same from mmCIF', () => {
  expect(deriveSS(cif(HAIRPIN))).toMatchObject({ seq: 'GGAAAACC', dbn: '((....))', n: 8 });
});

test('keeps only the first chain', () => {
  expect(deriveSS(pdb([...HAIRPIN, [1, 'U', "C1'", 50, 50, 50, 'B']])).seq).toBe('GGAAAACC');
});

test('drops waters and ligands, and shows a modified nucleotide as N', () => {
  const extra: Atom[] = [[9, 'PSU', "C1'", 20, 0, 0], [10, 'HOH', 'O', 30, 0, 0], [11, 'TRP', 'CA', 40, 0, 0]];
  expect(deriveSS(pdb([...HAIRPIN, ...extra])).seq).toBe('GGAAAACCN');
});

test('gives an empty result for text with no atoms', () => {
  expect(deriveSS('not a structure')).toMatchObject({ seq: '', dbn: '', n: 0 });
});

test('viewRotation is the identity for a camera on +z looking at the origin', () => {
  expect(plain(viewRotation([0, 0, 10], [0, 0, 0], [0, 1, 0]))).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});

test('viewRotation puts world -z on screen right for a camera on +x', () => {
  const [right, up] = plain(viewRotation([10, 0, 0], [0, 0, 0], [0, 1, 0]));
  expect(right).toEqual([0, 0, -1]);
  expect(up).toEqual([0, 1, 0]);
});

test('viewRotation matches the rotation in the view matrix Mol* renders with', () => {
  const [position, target, up] = [Vec3.create(30, -12, 7), Vec3.create(1, 2, 3), Vec3.create(0.2, 0.9, -0.3)];
  // Mol* matrices are column-major: row r of the rotation is elements r, r + 4, r + 8.
  const view = Mat4.lookAt(Mat4(), position, target, up);
  const rot = viewRotation(position, target, up);
  rot.forEach((row, r) => row.forEach((v, c) => expect(v).toBeCloseTo(view[r + 4 * c], 6)));
});

test('proj2D draws the model as the camera sees it', () => {
  const { seq, dbn } = deriveSS(pdb(HAIRPIN));
  const parsed = projParse(pdb(HAIRPIN));
  const front = circles(proj2D(parsed, dbn, seq, 300, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]));
  expect(front).toHaveLength(8);
  // G1 and C8 sit level, C8 to the right; G2 is above G1 (SVG y grows downward).
  expect(front[7][1]).toBe(front[0][1]);
  expect(front[7][0]).toBeGreaterThan(front[0][0]);
  expect(front[1][1]).toBeLessThan(front[0][1]);

  // Rolled a quarter turn (camera x = world y), G2 is level with G1 and to its right.
  const rolled = circles(proj2D(parsed, dbn, seq, 300, [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]));
  expect(rolled[1][1]).toBe(rolled[0][1]);
  expect(rolled[1][0]).toBeGreaterThan(rolled[0][0]);
});

test('proj2D draws the base pairs and falls back to a best-fit plane without a camera', () => {
  const { seq, dbn } = deriveSS(pdb(HAIRPIN));
  const svg = proj2D(projParse(pdb(HAIRPIN)), dbn, seq, 300, null);
  expect(circles(svg)).toHaveLength(8);
  expect(count(svg, 'line')).toBe(2);
});

test('forna2D lays out every nucleotide and pair', () => {
  const svg = forna2D('((....))', 'GGAAAACC', 300, [1, 2, 3, 4, 5, 6, 7, 8]);
  expect(circles(svg)).toHaveLength(8);
  expect(count(svg, 'line')).toBe(2);
});

test('arcDiagram draws the sequence on a line with an arc per pair, pseudoknots dashed', () => {
  const svg = arcDiagram('(([..))]', 'GGAAAACC', 12, [1, 2, 3, 4, 5, 6, 7, 8]);
  expect(count(svg, 'path')).toBe(3);
  expect(count(svg, 'text')).toBe(8);
  expect(svg.split('stroke-dasharray').length - 1).toBe(1);
});

// Numbered as deposited files are: starting at 282, with residues 286-295 not modeled.
const GAPPED: Atom[] = HAIRPIN.map(([seq, ...rest]) => [seq <= 4 ? seq + 281 : seq + 291, ...rest]);
const titles = (svg: string) => [...svg.matchAll(/<title>([^<]*)<\/title>/g)].map(m => m[1]);
const subpaths = (svg: string) => svg.match(/<path d="([^"]*)"/)![1].split('M').length - 1;

test('numbers nucleotides as the file does', () => {
  const ss = deriveSS(pdb(GAPPED));
  expect(ss.nums).toEqual([282, 283, 284, 285, 296, 297, 298, 299]);
  expect(deriveSS(cif(GAPPED)).nums).toEqual(ss.nums);
  expect(titles(proj2D(projParse(pdb(GAPPED)), ss.dbn, ss.seq, 300, null))).toEqual(['282 G', '283 G', '284 A', '285 A', '296 A', '297 A', '298 C', '299 C']);
  expect(titles(forna2D(ss.dbn, ss.seq, 300, ss.nums))[4]).toBe('296 A');
  expect(titles(arcDiagram(ss.dbn, ss.seq, 12, ss.nums))).toEqual(['283–298', '282–299']);
});

test('breaks the backbone where residues are not modeled', () => {
  const ss = deriveSS(pdb(GAPPED));
  expect(subpaths(proj2D(projParse(pdb(GAPPED)), ss.dbn, ss.seq, 300, null))).toBe(2);
  expect(subpaths(forna2D(ss.dbn, ss.seq, 300, ss.nums))).toBe(2);
  expect(subpaths(forna2D('((....))', 'GGAAAACC', 300, [1, 2, 3, 4, 5, 6, 7, 8]))).toBe(1);
});

// The view rotation after dragging by (dx, dy) degrees from a camera on +z, rounded.
const dragged = (dx: number, dy: number) => {
  const { position, up } = orbit([0, 0, 10], [0, 0, 0], [0, 1, 0], dx, dy);
  return viewRotation(position, [0, 0, 0], up).map(row => row.map(v => Math.round(v) + 0));
};

test('orbit turns the front of the model toward the drag', () => {
  // The point facing the viewer is on world +z. Dragged a quarter turn right it is at screen
  // right; dragged a quarter turn down it is at screen bottom (the camera's up is then world -z).
  expect(dragged(90, 0).slice(0, 2)).toEqual([[0, 0, 1], [0, 1, 0]]);
  expect(dragged(0, 90).slice(0, 2)).toEqual([[1, 0, 0], [0, 0, -1]]);
});

test('orbit keeps the camera at the same distance from a target off the origin', () => {
  const { position } = orbit([1, 2, 13], [1, 2, 3], [0, 1, 0], 37, -52);
  expect(Math.hypot(position[0] - 1, position[1] - 2, position[2] - 3)).toBeCloseTo(10, 6);
});

test('keeps mmCIF residues apart by insertion code', () => {
  const text = [
    'data_test', 'loop_', '_atom_site.group_PDB', '_atom_site.label_atom_id', '_atom_site.label_comp_id',
    '_atom_site.label_asym_id', '_atom_site.auth_seq_id', '_atom_site.pdbx_PDB_ins_code', '_atom_site.Cartn_x', '_atom_site.Cartn_y', '_atom_site.Cartn_z',
    `ATOM "C1'" G A 17 ? 0 0 0`, `ATOM "C1'" A A 17 A 5 0 0`, `ATOM "C1'" C A 18 ? 10 0 0`, '#'
  ].join('\n');
  expect(deriveSS(text)).toMatchObject({ seq: 'GAC', nums: [17, 17, 18] });
});

test('leaves out pairs that would need a fifth bracket level instead of miswiring them', () => {
  // Five G-C pairs, each far from the others, with every pair crossing every other.
  const g = (n: number, y: number): Atom[] => [[n, 'G', "C1'", 0, y, 0], [n, 'G', 'N1', 4, y, 0], [n, 'G', 'N2', 4, y, 1], [n, 'G', 'O6', 4, y, -1]];
  const c = (n: number, y: number): Atom[] => [[n, 'C', "C1'", 10, y, 0], [n, 'C', 'N3', 6, y, 0], [n, 'C', 'O2', 6, y, 1], [n, 'C', 'N4', 6, y, -1]];
  const atoms = [0, 1, 2, 3, 4].flatMap(k => g(k + 1, k * 20)).concat([0, 1, 2, 3, 4].flatMap(k => c(k + 6, k * 20)));
  expect(deriveSS(pdb(atoms))).toMatchObject({ seq: 'GGGGGCCCCC', dbn: '([{<.)]}>.' });
});
