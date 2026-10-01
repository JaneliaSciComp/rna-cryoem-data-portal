import { Alert, Box } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { type MolstarInstance, type StructureFormat, loadMolstar } from './loadMolstar';

// Interactive 3D view of one model. Adapted from ai-cryoet's MolstarViewer.tsx (branch
// worktree-nucleosome-templates): a new Mol* instance per model, disposed on change or unmount.
export function MolstarViewer({ url, format }: { readonly url: string; readonly format: StructureFormat }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    let instance: MolstarInstance | undefined;
    let cancelled = false;
    (async () => {
      try {
        const factory = await loadMolstar();
        if (cancelled || !ref.current) {
          return;
        }
        instance = await factory.create(ref.current);
        if (cancelled) {
          instance.dispose();
          instance = undefined;
          return;
        }
        await instance.loadStructureUrl(url, format);
      } catch (err) {
        console.warn('Mol* viewer failed', err);
        instance?.dispose();
        instance = undefined;
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      instance?.dispose();
    };
  }, [url, format]);

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {/* Stays mounted while hidden, so ref.current exists when a new url is tried. */}
      <Box ref={ref} sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', maxHeight: 600, display: failed ? 'none' : 'block' }} />
      {failed ? <Alert severity="warning">Couldn't load this model in the 3D viewer.</Alert> : null}
    </Box>
  );
}
