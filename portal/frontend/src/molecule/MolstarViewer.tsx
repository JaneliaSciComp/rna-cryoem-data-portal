import { Alert, Box, CircularProgress } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { type MolstarInstance, type StructureFormat, loadMolstar } from './loadMolstar';

// Interactive 3D view of one model. Adapted from ai-cryoet's MolstarViewer.tsx (branch
// worktree-nucleosome-templates): a new Mol* instance per model, disposed on change or unmount.
// onInstance gets the instance once its model is loaded, and null when that instance goes away.
export function MolstarViewer({
  url,
  format,
  onInstance
}: {
  readonly url: string;
  readonly format: StructureFormat;
  readonly onInstance?: (instance: MolstarInstance | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Mol* itself, then the model file: the box is blank for seconds on a first visit.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFailed(false);
    setLoading(true);
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
        if (!cancelled) {
          setLoading(false);
          onInstance?.(instance);
        }
      } catch (err) {
        console.warn('Mol* viewer failed', err);
        instance?.dispose();
        instance = undefined;
        if (!cancelled) {
          setLoading(false);
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      onInstance?.(null);
      instance?.dispose();
    };
  }, [url, format, onInstance]);

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {/* Stays mounted while hidden, so ref.current exists when a new url is tried. */}
      <Box ref={ref} sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', maxHeight: 600, display: failed ? 'none' : 'block' }} />
      {loading ? (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading 3D view" />
        </Box>
      ) : null}
      {failed ? <Alert severity="warning">Couldn't load this model in the 3D viewer.</Alert> : null}
    </Box>
  );
}
