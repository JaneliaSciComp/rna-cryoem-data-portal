import { render, screen, waitFor } from '@testing-library/react';
import { loadMolstar } from './loadMolstar';
import { MolstarViewer } from './MolstarViewer';

vi.mock('./loadMolstar', async importOriginal => ({
  ...(await importOriginal<typeof import('./loadMolstar')>()),
  loadMolstar: vi.fn()
}));

test('loads the structure in its format', async () => {
  const instance = { loadStructureUrl: vi.fn(async () => {}), dispose: vi.fn() };
  vi.mocked(loadMolstar).mockResolvedValue({ create: async () => instance });

  const { unmount } = render(<MolstarViewer format="mmcif" url="/api/files/2" />);

  await waitFor(() => expect(instance.loadStructureUrl).toHaveBeenCalledWith('/api/files/2', 'mmcif'));
  unmount();
  expect(instance.dispose).toHaveBeenCalled();
});

test('shows an error when the structure fails to load', async () => {
  vi.mocked(loadMolstar).mockResolvedValue({
    create: async () => ({ loadStructureUrl: async () => Promise.reject(new Error('bad file')), dispose: vi.fn() })
  });
  render(<MolstarViewer format="pdb" url="/api/files/1" />);
  expect(await screen.findByText(/Couldn't load this model/)).toBeInTheDocument();
});
