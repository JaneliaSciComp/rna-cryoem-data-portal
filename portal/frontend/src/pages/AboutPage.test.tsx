import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch, renderApp } from '../test/renderApp';

afterEach(() => vi.unstubAllGlobals());

test('the header links to the about page', async () => {
  mockFetch({});
  renderApp('/molecules/x');
  await userEvent.click(await screen.findByRole('link', { name: 'About' }));
  expect(await screen.findByRole('heading', { name: 'About the data' })).toBeInTheDocument();
  expect(screen.getByText('Pixel Size (Å)')).toBeInTheDocument();
});

test('the footer links to GitHub and AI@HHMI', async () => {
  mockFetch({});
  renderApp('/about');
  // No VITE_APP_VERSION in tests, so the version is plain text.
  expect(await screen.findByRole('link', { name: 'GitHub repository' })).toHaveAttribute('href', 'https://github.com/JaneliaSciComp/rna-cryoem-data-portal');
  expect(screen.getByRole('link', { name: 'AI@HHMI' })).toHaveAttribute('href', 'https://www.hhmi.org/research/janelia/AI');
  expect(screen.getByText('dev')).toBeInTheDocument();
});
