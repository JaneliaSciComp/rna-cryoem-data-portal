import type { MoleculeFile } from '../api';
import { groupFiles } from './groupFiles';

const file = (id: number, path: string, kind: MoleculeFile['kind'], source: MoleculeFile['source']): MoleculeFile => ({
  id, path, kind, source, name: path.split('/').pop()!, size: 1, url: `/api/files/${id}`
});

test('groups by kind, deposited first, then by path', () => {
  const g = groupFiles([
    file(1, 'M/AlphaFold/model_1.cif', 'model', 'predicted'),
    file(2, 'M/AlphaFold/model_0.cif', 'model', 'predicted'),
    file(3, 'M/PDB_deposit/10ZT.pdb', 'model', 'deposited'),
    file(4, 'M/CryoEM/Maps/map.mrc', 'map', 'experimental'),
    file(5, 'M/PDB_deposit/emd.map', 'map', 'deposited'),
    file(6, 'M/CryoEM/Maps/fsc.png', 'plot', 'experimental'),
    file(7, 'M/CryoEM/Micrographs/m.png', 'micrograph', 'experimental'),
    file(8, 'M/PDB_deposit/report.pdf', 'report', 'deposited'),
    file(9, 'M/CryoEM/Maps/job.log', 'log', 'experimental')
  ]);
  expect(g.models.map(f => f.id)).toEqual([3, 2, 1]);
  expect(g.maps.map(f => f.id)).toEqual([5, 4]);
  expect(g.plots.map(f => f.id)).toEqual([6]);
  expect(g.micrographs.map(f => f.id)).toEqual([7]);
  expect(g.reports.map(f => f.id)).toEqual([8]);
});
