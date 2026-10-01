import { Box, Dialog, ImageList, ImageListItem, ImageListItemBar, Typography } from '@mui/material';
import { useState } from 'react';
import type { MoleculeFile } from '../api';

// cryoSPARC plots or micrographs: a grid of the PNGs themselves, enlarged on click.
export function Gallery({ files, empty }: { readonly files: MoleculeFile[]; readonly empty: string }) {
  const [open, setOpen] = useState<MoleculeFile | null>(null);
  if (files.length === 0) {
    return <Typography color="text.secondary">{empty}</Typography>;
  }
  return (
    <>
      <ImageList cols={4} gap={8}>
        {files.map(f => (
          <ImageListItem key={f.id} onClick={() => setOpen(f)} sx={{ cursor: 'zoom-in' }}>
            <img alt={f.name} loading="lazy" src={f.url} style={{ objectFit: 'contain', background: 'white' }} />
            <ImageListItemBar position="below" subtitle={f.name} />
          </ImageListItem>
        ))}
      </ImageList>
      <Dialog maxWidth="lg" onClose={() => setOpen(null)} open={open !== null}>
        {open ? <Box alt={open.name} component="img" src={open.url} sx={{ maxWidth: '100%', display: 'block' }} /> : null}
      </Dialog>
    </>
  );
}
