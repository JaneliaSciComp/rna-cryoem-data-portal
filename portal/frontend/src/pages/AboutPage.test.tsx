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
