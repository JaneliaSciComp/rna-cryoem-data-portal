// A model small enough to check by hand, as PDB or mmCIF text.
export type Atom = [resSeq: number, resName: string, atom: string, x: number, y: number, z: number, chain?: string];

// A two-pair hairpin, GGAAAACC: G1-C8 and G2-C7 face each other 10 Å apart along x, with their
// Watson-Crick atoms 2 Å apart; the loop sits further up y. Only the atoms the parser keeps.
const g = (n: number, y: number): Atom[] => [[n, 'G', "C1'", 0, y, 0], [n, 'G', 'N1', 4, y, 0], [n, 'G', 'N2', 4, y, 1], [n, 'G', 'O6', 4, y, -1]];
const c = (n: number, y: number): Atom[] => [[n, 'C', "C1'", 10, y, 0], [n, 'C', 'N3', 6, y, 0], [n, 'C', 'O2', 6, y, 1], [n, 'C', 'N4', 6, y, -1]];
const a = (n: number, x: number): Atom[] => [[n, 'A', "C1'", x, 12, 0]];
export const HAIRPIN: Atom[] = [...g(1, 0), ...g(2, 5), ...a(3, 0), ...a(4, 3), ...a(5, 7), ...a(6, 10), ...c(7, 5), ...c(8, 0)];

export const pdb = (atoms: Atom[]) =>
  atoms
    .map(([seq, res, name, x, y, z, chain = 'A'], i) =>
      `ATOM  ${String(i + 1).padStart(5)} ${name.padEnd(4)} ${res.padStart(3)} ${chain}${String(seq).padStart(4)}    ${[x, y, z].map(v => v.toFixed(3).padStart(8)).join('')}`
    )
    .join('\n');

export const cif = (atoms: Atom[]) =>
  [
    'data_test', 'loop_', '_atom_site.group_PDB', '_atom_site.label_atom_id', '_atom_site.label_comp_id',
    '_atom_site.label_asym_id', '_atom_site.auth_seq_id', '_atom_site.Cartn_x', '_atom_site.Cartn_y', '_atom_site.Cartn_z',
    ...atoms.map(([seq, res, name, x, y, z, chain = 'A']) => `ATOM "${name}" ${res} ${chain} ${seq} ${x} ${y} ${z}`),
    '#'
  ].join('\n');
