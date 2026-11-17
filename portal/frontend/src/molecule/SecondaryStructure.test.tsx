import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HAIRPIN, pdb } from '../test/hairpin';
import type { MolstarInstance } from './loadMolstar';
import { SecondaryStructure } from './SecondaryStructure';
import { type Mat3, forna2D } from './ss';
import { redirectToLogin } from '../session';

vi.mock('../session', () => ({ redirectToLogin: vi.fn() }));
vi.mock('./ss', async importOriginal => {
  const actual = await importOriginal<typeof import('./ss')>();
  return { ...actual, forna2D: vi.fn(actual.forna2D) };
});

afterEach(() => vi.unstubAllGlobals());

function renderPanel(text: string, molstar: MolstarInstance | null = null) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(text)));
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SecondaryStructure molstar={molstar} url="/api/files/2" />
    </QueryClientProvider>
  );
}

const diagram = () => screen.getByRole('img', { name: 'Secondary structure' });
const circleYs = () => [...diagram().querySelectorAll('circle')].map(el => el.getAttribute('cy'));

test('shows the sequence and a diagram of the model', async () => {
  renderPanel(pdb(HAIRPIN));
  expect(await screen.findByLabelText('Sequence')).toHaveTextContent('GGAAAACC');
  expect(diagram().querySelectorAll('circle')).toHaveLength(8);
  expect(fetch).toHaveBeenCalledWith('/api/files/2', expect.anything());
});

test('redraws the projection as the 3D camera moves, and stops listening on unmount', async () => {
  let move: (rot: Mat3) => void = () => {};
  const off = vi.fn();
  const molstar: MolstarInstance = {
    loadStructureUrl: async () => {},
    onCamera: cb => {
      move = cb;
      return off;
    },
    rotateCamera: () => {},
    dispose: () => {}
  };
  const { unmount } = renderPanel(pdb(HAIRPIN), molstar);
  await screen.findByLabelText('Sequence');

  // Head on, G2 sits above G1; rolled a quarter turn, they are level.
  act(() => move([[1, 0, 0], [0, 1, 0], [0, 0, 1]]));
  await waitFor(() => expect(Number(circleYs()[1])).toBeLessThan(Number(circleYs()[0])));
  act(() => move([[0, 1, 0], [-1, 0, 0], [0, 0, 1]]));
  await waitFor(() => expect(circleYs()[1]).toBe(circleYs()[0]));

  unmount();
  expect(off).toHaveBeenCalled();
});

test('dragging the projection rotates the 3D camera, half a degree per pixel', async () => {
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture = () => {};
  const rotateCamera = vi.fn();
  renderPanel(pdb(HAIRPIN), { loadStructureUrl: async () => {}, onCamera: () => () => {}, rotateCamera, dispose: () => {} });
  await screen.findByLabelText('Sequence');

  fireEvent.pointerMove(diagram(), { clientX: 100, clientY: 100 });
  expect(rotateCamera).not.toHaveBeenCalled();
  fireEvent.pointerDown(diagram(), { clientX: 100, clientY: 100 });
  fireEvent.pointerMove(diagram(), { clientX: 120, clientY: 90 });
  expect(rotateCamera).toHaveBeenLastCalledWith(10, -5);
  fireEvent.pointerUp(diagram());
  fireEvent.pointerMove(diagram(), { clientX: 200, clientY: 200 });
  expect(rotateCamera).toHaveBeenCalledTimes(1);

  // The static views do not rotate anything.
  await userEvent.click(screen.getByRole('button', { name: 'Arc' }));
  fireEvent.pointerDown(diagram(), { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(diagram(), { clientX: 50, clientY: 50 });
  expect(rotateCamera).toHaveBeenCalledTimes(1);
});

test('labels each nucleotide with its number in the file', async () => {
  renderPanel(pdb(HAIRPIN.map(([seq, ...rest]) => [seq + 281, ...rest])));
  expect((await screen.findByLabelText('Sequence')).querySelector('span')).toHaveAttribute('title', '282 G');
});

test('switches to the arc plot', async () => {
  renderPanel(pdb(HAIRPIN));
  await screen.findByLabelText('Sequence');
  await userEvent.click(screen.getByRole('button', { name: 'Arc' }));
  expect(diagram().querySelectorAll('circle')).toHaveLength(0);
  expect(diagram().querySelectorAll('path')).toHaveLength(2);
});

test('changes the sequence font size', async () => {
  renderPanel(pdb(HAIRPIN));
  const before = parseFloat(getComputedStyle(await screen.findByLabelText('Sequence')).fontSize);
  await userEvent.click(screen.getByRole('button', { name: 'Larger text' }));
  expect(parseFloat(getComputedStyle(screen.getByLabelText('Sequence')).fontSize)).toBeGreaterThan(before);
});

test('says when the model has no RNA', async () => {
  renderPanel('REMARK nothing here');
  expect(await screen.findByText('No RNA chain found in this model.')).toBeInTheDocument();
});

test('redirects to login when the session expired instead of reading the login page as a model', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, redirected: true, url: 'https://d1.cloudfront.net/login.html?next=%2F', text: async () => '<html>' })));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SecondaryStructure molstar={null} url="/api/files/2" />
    </QueryClientProvider>
  );
  await waitFor(() => expect(redirectToLogin).toHaveBeenCalled());
  expect(screen.queryByText('No RNA chain found in this model.')).not.toBeInTheDocument();
});

test('lays the 2D view out once per model, not per font size or view change', async () => {
  vi.mocked(forna2D).mockClear();
  renderPanel(pdb(HAIRPIN));
  await screen.findByLabelText('Sequence');
  await userEvent.click(screen.getByRole('button', { name: '2D layout' }));
  await userEvent.click(screen.getByRole('button', { name: 'Larger text' }));
  await userEvent.click(screen.getByRole('button', { name: 'Arc' }));
  await userEvent.click(screen.getByRole('button', { name: '2D layout' }));
  expect(forna2D).toHaveBeenCalledTimes(1);
});

test('shows the layout, not a draggable projection, when the model cannot be projected', async () => {
  Element.prototype.setPointerCapture = () => {};
  const rotateCamera = vi.fn();
  // Two C1' atoms: too few for a best-fit plane.
  renderPanel(pdb([[1, 'G', "C1'", 0, 0, 0], [2, 'C', "C1'", 10, 0, 0]]), { loadStructureUrl: async () => {}, onCamera: () => () => {}, rotateCamera, dispose: () => {} });
  await screen.findByLabelText('Sequence');
  expect(screen.getByText(/Abstract layout/)).toBeInTheDocument();
  fireEvent.pointerDown(diagram(), { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(diagram(), { clientX: 50, clientY: 50 });
  expect(rotateCamera).not.toHaveBeenCalled();
});
