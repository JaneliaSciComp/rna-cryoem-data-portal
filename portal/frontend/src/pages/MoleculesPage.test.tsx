import { screen } from '@testing-library/react';
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
