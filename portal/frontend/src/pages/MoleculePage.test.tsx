import { screen, within } from '@testing-library/react';
import { mockFetch, renderApp } from '../test/renderApp';

vi.mock('../molecule/loadMolstar', async importOriginal => ({
  ...(await importOriginal<typeof import('../molecule/loadMolstar')>()),
  loadMolstar: async () => ({ create: async () => ({ loadStructureUrl: async () => {}, dispose: () => {} }) })
}));

const f = (id: number, path: string, kind: string, source: string, size = 1000) => ({
  id, path, kind, source, size, name: path.split('/').pop(), url: `/api/files/${id}`
});

const MOL9 = {
  id: 'Mol9_gRNAde', name: 'gRNAde', pdb_id: '10ZT', resolution_a: 2.97,
  thumbnail_url: null, scanned_at: '2026-10-01T12:00:00Z',
  files: [
    f(1, 'Mol9_gRNAde/AlphaFold/model_0.cif', 'model', 'predicted'),
    f(2, 'Mol9_gRNAde/PDB_deposit/10ZT.pdb', 'model', 'deposited'),
    f(3, 'Mol9_gRNAde/CryoEM/Maps/volume_map.mrc', 'map', 'experimental', 296_400_000),
    f(4, 'Mol9_gRNAde/CryoEM/Maps/J300_fsc.png', 'plot', 'experimental'),
    f(5, 'Mol9_gRNAde/CryoEM/Micrographs/m1.png', 'micrograph', 'experimental'),
    f(6, 'Mol9_gRNAde/PDB_deposit/validation.pdf', 'report', 'deposited')
  ]
};

test('shows the molecule', async () => {
  mockFetch({ '/api/molecules/Mol9_gRNAde': MOL9 });
  renderApp('/molecules/Mol9_gRNAde');

  expect(await screen.findByRole('heading', { name: 'gRNAde' })).toBeInTheDocument();
  // The picker opens on the deposited model.
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Deposited: 10ZT.pdb');

  const mapRow = screen.getByRole('row', { name: /volume_map\.mrc/ });
  expect(within(mapRow).getByText('296.4 MB')).toBeInTheDocument();
  expect(within(mapRow).getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/api/files/3');
  expect(within(mapRow).getByRole('link', { name: 'Open in Neuroglancer' }).getAttribute('href')).toMatch(/^\/neuroglancer\/#!/);

  expect(screen.getByRole('img', { name: 'J300_fsc.png' })).toHaveAttribute('src', '/api/files/4');
  expect(screen.getByRole('img', { name: 'm1.png' })).toHaveAttribute('src', '/api/files/5');
  expect(screen.getByRole('link', { name: 'validation.pdf' })).toHaveAttribute('href', '/api/files/6');
});

test('shows a message when there are no models', async () => {
  mockFetch({ '/api/molecules/Mol5_Plots': { ...MOL9, id: 'Mol5_Plots', name: 'Plots', files: [MOL9.files[3]] } });
  renderApp('/molecules/Mol5_Plots');
  expect(await screen.findByText('No atomic models found.')).toBeInTheDocument();
  expect(screen.getByText('No maps found.')).toBeInTheDocument();
});

test('says when the molecule does not exist', async () => {
  mockFetch({});
  renderApp('/molecules/Nope');
  expect(await screen.findByText('Molecule not found.')).toBeInTheDocument();
});
