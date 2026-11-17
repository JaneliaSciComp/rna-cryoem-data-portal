import { render, screen, waitFor } from '@testing-library/react';
import { loadMolstar } from './loadMolstar';
import { MolstarViewer } from './MolstarViewer';

vi.mock('./loadMolstar', async importOriginal => ({
  ...(await importOriginal<typeof import('./loadMolstar')>()),
  loadMolstar: vi.fn()
}));

test('loads the structure in its format', async () => {
  const instance = { loadStructureUrl: vi.fn(async () => {}), onCamera: () => () => {}, rotateCamera: () => {}, dispose: vi.fn() };
  const onInstance = vi.fn();
  vi.mocked(loadMolstar).mockResolvedValue({ create: async () => instance });

  const { unmount } = render(<MolstarViewer format="mmcif" onInstance={onInstance} url="/api/files/2" />);

  await waitFor(() => expect(instance.loadStructureUrl).toHaveBeenCalledWith('/api/files/2', 'mmcif'));
  // The instance is handed out once its model is loaded, and taken back before it is disposed.
  await waitFor(() => expect(onInstance).toHaveBeenLastCalledWith(instance));
  unmount();
  expect(onInstance).toHaveBeenLastCalledWith(null);
  expect(instance.dispose).toHaveBeenCalled();
});

test('shows an error when the structure fails to load', async () => {
  vi.mocked(loadMolstar).mockResolvedValue({
    create: async () => ({ loadStructureUrl: async () => Promise.reject(new Error('bad file')), onCamera: () => () => {}, rotateCamera: () => {}, dispose: vi.fn() })
  });
  render(<MolstarViewer format="pdb" url="/api/files/1" />);
  expect(await screen.findByText(/Couldn't load this model/)).toBeInTheDocument();
});
