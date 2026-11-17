// The only module that touches Mol*. Copied from ai-cryoet's
// frontend/src/components/structuralTemplates/loadMolstar.ts (branch worktree-nucleosome-templates),
// with mmCIF support. The dynamic imports keep the ~5 MB library out of the table page's bundle.
import { type Mat3, orbit, viewRotation } from './ss';

export type StructureFormat = 'pdb' | 'mmcif';

export type MolstarInstance = {
  loadStructureUrl(url: string, format: StructureFormat): Promise<void>;
  // Calls back with the camera's rotation now and after every redraw, until the returned function is called.
  onCamera(cb: (rot: Mat3) => void): () => void;
  // Turns the view by dx degrees right and dy degrees down, as a drag on it would.
  rotateCamera(dx: number, dy: number): void;
  dispose(): void;
};

export type MolstarFactory = {
  create(el: HTMLElement): Promise<MolstarInstance>;
};

export function formatFor(name: string): StructureFormat {
  return name.toLowerCase().endsWith('.cif') ? 'mmcif' : 'pdb';
}

export async function loadMolstar(): Promise<MolstarFactory> {
  await import('molstar/build/viewer/molstar.css');
  const { Viewer } = await import('molstar/lib/apps/viewer/app');
  return {
    async create(el) {
      const viewer = await Viewer.create(el, {
        layoutIsExpanded: false,
        layoutShowControls: false,
        layoutShowSequence: false,
        layoutShowLog: false,
        layoutShowLeftPanel: false,
        viewportShowExpand: false,
        viewportShowSelectionMode: false,
        viewportShowAnimation: false,
        viewportShowControls: false,
        viewportShowSettings: false,
        viewportShowTrajectoryControls: false
      });
      return {
        loadStructureUrl: async (url, format) => {
          await viewer.loadStructureFromUrl(url, format, false);
        },
        onCamera: cb => {
          const canvas = viewer.plugin.canvas3d;
          const sub = canvas?.didDraw.subscribe(() => cb(viewRotation(canvas.camera.position, canvas.camera.target, canvas.camera.up)));
          return () => sub?.unsubscribe();
        },
        rotateCamera: (dx, dy) => {
          const canvas = viewer.plugin.canvas3d;
          if (!canvas) return;
          const { camera } = canvas;
          const next = orbit(camera.position, camera.target, camera.up, dx, dy);
          type V = typeof camera.position;
          camera.setState({ position: [...next.position] as unknown as V, up: [...next.up] as unknown as V }, 0);
          canvas.requestDraw();
        },
        dispose: () => viewer.dispose()
      };
    }
  };
}
