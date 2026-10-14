import { screen, waitFor, within } from '@testing-library/react';
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
const page = (molecules: object[], found = molecules.length, facets = {}) => ({ found, molecules, facets });
// The URLs the page fetched molecules from, as their query strings.
const searches = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls.map(([url]) => url as string).filter(url => url.startsWith('/api/molecules')).map(url => url.split('?')[1]);

test('lists the molecules', async () => {
  mockFetch({ '/api/molecules': page([MOL23, MOL9]) });
  renderApp('/');

  const link = await screen.findByRole('link', { name: 'gRNAde' });
  expect(link).toHaveAttribute('href', '/molecules/Mol9_gRNAde');
  expect(screen.getByRole('link', { name: '10ZT' })).toHaveAttribute('href', 'https://www.rcsb.org/structure/10ZT');
  expect(screen.getByText('2.97 Å')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'gRNAde' })).toHaveAttribute('src', '/api/thumbnails/Mol9_gRNAde.png');
  expect(screen.getByLabelText('No thumbnail for TrpHolo')).toBeInTheDocument();
});

test('says when there are no molecules', async () => {
  mockFetch({ '/api/molecules': page([]) });
  renderApp('/');
  expect(await screen.findByText(/No molecules yet/)).toBeInTheDocument();
});

test('shows an error when the API fails', async () => {
  mockFetch({});
  renderApp('/');
  expect(await screen.findByText(/Couldn't load the molecules/)).toBeInTheDocument();
});

test('enlarges a thumbnail without opening the molecule', async () => {
  mockFetch({ '/api/molecules': page([MOL23, MOL9]) });
  renderApp('/');

  await userEvent.click(await screen.findByRole('button', { name: 'Enlarge thumbnail for gRNAde' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('img', { name: 'gRNAde' })).toHaveAttribute('src', '/api/thumbnails/Mol9_gRNAde.png');
  expect(screen.queryByText('Molecule not found.')).not.toBeInTheDocument();
  // A molecule without a thumbnail has nothing to enlarge.
  expect(screen.queryByRole('button', { name: 'Enlarge thumbnail for TrpHolo' })).not.toBeInTheDocument();
});

test('asks the API to sort by a column', async () => {
  const fetchMock = mockFetch({ '/api/molecules': page([MOL23, MOL9]) });
  renderApp('/');
  await screen.findByRole('link', { name: 'gRNAde' });
  expect(searches(fetchMock)).toEqual(['page=1&per_page=10']);

  const sortByResolution = () =>
    userEvent.click(within(screen.getByRole('columnheader', { name: /Resolution/ })).getByRole('button'));
  // Numbers sort descending first.
  await sortByResolution();
  await sortByResolution();
  await waitFor(() =>
    expect(searches(fetchMock).slice(1)).toEqual([
      'sort=resolution_a&order=desc&page=1&per_page=10',
      'sort=resolution_a&order=asc&page=1&per_page=10'
    ])
  );
});

test('pages through the molecules', async () => {
  const molecule = (i: number) => ({ ...MOL23, id: `Mol${i}`, name: `Molecule ${i}` });
  mockFetch({
    '/api/molecules?page=1&per_page=10': page([molecule(1)], 12),
    '/api/molecules?page=2&per_page=10': page([molecule(11)], 12)
  });
  renderApp('/');

  expect(await screen.findByRole('link', { name: 'Molecule 1' })).toBeInTheDocument();
  expect(screen.getByText('1-10 of 12')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
  expect(await screen.findByRole('link', { name: 'Molecule 11' })).toBeInTheDocument();
});

test('searches and filters, showing facet counts', async () => {
  const fetchMock = mockFetch({
    '/api/molecules': page([MOL23, MOL9], 2, { kinds: { model: 1, map: 1 } }),
    '/api/molecules?q=holo&page=1&per_page=10': page([]),
    '/api/molecules?q=holo&kind=map&page=1&per_page=10': page([])
  });
  const router = renderApp('/');
  await screen.findByRole('link', { name: 'gRNAde' });
  expect(screen.getByRole('checkbox', { name: 'Maps (1)' })).not.toBeChecked();

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'holo');
  expect(await screen.findByText('No molecules match these filters.')).toBeInTheDocument();
  // Debounced: one search for the whole word.
  expect(searches(fetchMock)).toEqual(['page=1&per_page=10', 'q=holo&page=1&per_page=10']);

  await userEvent.click(screen.getByRole('checkbox', { name: 'Maps (0)' }));
  await waitFor(() => expect(searches(fetchMock)).toContain('q=holo&kind=map&page=1&per_page=10'));
  expect(screen.getByRole('checkbox', { name: 'Maps (0)' })).toBeChecked();
  expect(router.state.location.search).toEqual({ q: 'holo', kind: ['map'] });
});

test('filters by resolution', async () => {
  const fetchMock = mockFetch({ '/api/molecules': page([MOL9]) });
  const router = renderApp('/');
  await screen.findByRole('link', { name: 'gRNAde' });

  await userEvent.type(screen.getByRole('spinbutton', { name: 'Max resolution' }), '3.5');
  await waitFor(() => expect(searches(fetchMock)).toContain('max_resolution=3.5&page=1&per_page=10'));
  expect(router.state.location.search).toEqual({ max_resolution: 3.5 });
});

test('shows the results a shared link describes', async () => {
  const fetchMock = mockFetch({ '/api/molecules': page([MOL9], 12) });
  renderApp('/?q=grna&kind=map&max_resolution=3&sort=resolution_a&order=desc&page=2');

  await screen.findByRole('link', { name: 'gRNAde' });
  expect(searches(fetchMock)).toEqual(['q=grna&kind=map&max_resolution=3&sort=resolution_a&order=desc&page=2&per_page=10']);
  expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('grna');
  expect(screen.getByRole('checkbox', { name: /Maps/ })).toBeChecked();
  expect(screen.getByRole('spinbutton', { name: 'Max resolution' })).toHaveValue(3);
  expect(screen.getByText('11-12 of 12')).toBeInTheDocument();
});
