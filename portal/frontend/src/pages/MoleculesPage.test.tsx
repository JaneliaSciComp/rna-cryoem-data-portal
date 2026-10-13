import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch, renderApp } from '../test/renderApp';

const MOL9 = {
  id: 'Mol9_gRNAde', name: 'gRNAde', pdb_id: '10ZT', resolution_a: 2.9663,
  thumbnail_url: '/api/thumbnails/Mol9_gRNAde.png', n_models: 6, n_maps: 3, scanned_at: '2026-10-01T12:00:00Z'
};
const MOL23 = {
  id: 'Mol23_TrpHolo', name: 'TrpHolo', pdb_id: null, resolution_a: null,
  thumbnail_url: null, n_models: 0, n_maps: 0, scanned_at: '2026-10-01T12:00:00Z'
};

test('lists the molecules', async () => {
  mockFetch({ '/api/molecules': [MOL23, MOL9] });
  renderApp('/');

  const link = await screen.findByRole('link', { name: 'gRNAde' });
  expect(link).toHaveAttribute('href', '/molecules/Mol9_gRNAde');
  expect(screen.getByRole('link', { name: '10ZT' })).toHaveAttribute('href', 'https://www.rcsb.org/structure/10ZT');
  expect(screen.getByText('2.97 Å')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'gRNAde' })).toHaveAttribute('src', '/api/thumbnails/Mol9_gRNAde.png');
  expect(screen.getByLabelText('No thumbnail for TrpHolo')).toBeInTheDocument();
});

test('says when there are no molecules', async () => {
  mockFetch({ '/api/molecules': [] });
  renderApp('/');
  expect(await screen.findByText(/No molecules yet/)).toBeInTheDocument();
});

test('shows an error when the API fails', async () => {
  mockFetch({});
  renderApp('/');
  expect(await screen.findByText(/Couldn't load the molecules/)).toBeInTheDocument();
});

test('enlarges a thumbnail without opening the molecule', async () => {
  mockFetch({ '/api/molecules': [MOL23, MOL9] });
  renderApp('/');

  await userEvent.click(await screen.findByRole('button', { name: 'Enlarge thumbnail for gRNAde' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('img', { name: 'gRNAde' })).toHaveAttribute('src', '/api/thumbnails/Mol9_gRNAde.png');
  expect(screen.queryByText('Molecule not found.')).not.toBeInTheDocument();
  // A molecule without a thumbnail has nothing to enlarge.
  expect(screen.queryByRole('button', { name: 'Enlarge thumbnail for TrpHolo' })).not.toBeInTheDocument();
});

const molecule = (i: number) => ({ ...MOL23, id: `Mol${i}`, name: `Molecule ${String(i).padStart(2, '0')}` });

test('sorts by a column, keeping blanks last', async () => {
  mockFetch({ '/api/molecules': [MOL23, MOL9, { ...MOL9, id: 'Mol1', name: 'Alpha', resolution_a: 1.5 }] });
  renderApp('/');
  await screen.findByRole('link', { name: 'gRNAde' });

  // Numbers sort descending first.
  const sortByResolution = () =>
    userEvent.click(within(screen.getByRole('columnheader', { name: /Resolution/ })).getByRole('button'));
  const names = () => screen.getAllByRole('link', { name: /^(gRNAde|TrpHolo|Alpha)$/ }).map(a => a.textContent);
  await sortByResolution();
  expect(names()).toEqual(['gRNAde', 'Alpha', 'TrpHolo']);
  await sortByResolution();
  expect(names()).toEqual(['Alpha', 'gRNAde', 'TrpHolo']);
});

test('pages through the molecules', async () => {
  mockFetch({ '/api/molecules': Array.from({ length: 12 }, (_, i) => molecule(i + 1)) });
  renderApp('/');

  expect(await screen.findByRole('link', { name: 'Molecule 10' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Molecule 11' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
  expect(await screen.findByRole('link', { name: 'Molecule 11' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Molecule 01' })).not.toBeInTheDocument();
});
