// The only module that touches Mol*. Copied from ai-cryoet's
// frontend/src/components/structuralTemplates/loadMolstar.ts (branch worktree-nucleosome-templates),
// with mmCIF support. The dynamic imports keep the ~5 MB library out of the table page's bundle.
export type StructureFormat = 'pdb' | 'mmcif';

export type MolstarInstance = {
  loadStructureUrl(url: string, format: StructureFormat): Promise<void>;
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
        dispose: () => viewer.dispose()
      };
    }
  };
}
