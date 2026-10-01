import { Box } from '@mui/material';
import { useState } from 'react';

// A molecule's thumbnail, or a grey placeholder when there's none or it fails to load.
export function Thumbnail({ src, alt, size = 72 }: { readonly src: string | null; readonly alt: string; readonly size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <Box
        aria-label={`No thumbnail for ${alt}`}
        role="img"
        sx={{ width: size, height: size, bgcolor: 'grey.200', borderRadius: 1 }}
      />
    );
  }
  return (
    <Box
      alt={alt}
      component="img"
      loading="lazy"
      onError={() => setFailed(true)}
      src={src}
      sx={{ width: size, height: size, objectFit: 'contain', bgcolor: 'common.white', borderRadius: 1 }}
    />
  );
}
