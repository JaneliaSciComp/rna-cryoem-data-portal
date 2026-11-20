import { Box, Button, CircularProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { getText } from '../api';
import type { MolstarInstance } from './loadMolstar';
import { type Mat3, arcDiagram, deriveSS, forna2D, nucColor, proj2D, projParse } from './ss';

type View = 'proj' | 'layout' | 'arc';

const CAPTION: Record<View, string> = {
  proj: 'Flattened from the 3D view. Drag either to rotate both.',
  layout: 'Abstract layout, not the 3D shape.',
  arc: 'Sequence on a line, with an arc per base pair.'
};

// The sequence and 2D secondary structure of one model, read from the model file itself. molstar
// is the 3D viewer showing the same model; the "3D projection" view follows its camera, and
// dragging that view turns the camera.
export function SecondaryStructure({ url, molstar }: { readonly url: string; readonly molstar: MolstarInstance | null }) {
  const { data: text, isError } = useQuery({
    queryKey: ['model-text', url],
    queryFn: () => getText(url),
    staleTime: Infinity
  });
  const [view, setView] = useState<View>('proj');
  const [fontSize, setFontSize] = useState(13);
  const [rot, setRot] = useState<Mat3 | null>(null);

  const ss = useMemo(() => (text === undefined ? null : { ...deriveSS(text), proj: projParse(text) }), [text]);
  // A model with too few C1' atoms to project gets the abstract layout.
  const shown: View = view === 'proj' && ss?.proj === null ? 'layout' : view;

  // Redraw at most once per frame however often the camera reports.
  useEffect(() => {
    if (!molstar || shown !== 'proj') return;
    let frame = 0;
    let latest: Mat3;
    const off = molstar.onCamera(next => {
      latest = next;
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        setRot(latest);
      });
    });
    return () => {
      off();
      cancelAnimationFrame(frame);
      setRot(null);
    };
  }, [molstar, shown]);

  // The layout is slow, so it is computed on first use and kept for the model.
  const layout = useRef<{ ss: typeof ss; svg: string } | null>(null);
  const svg = useMemo(() => {
    if (!ss) return '';
    if (shown === 'arc') return arcDiagram(ss.dbn, ss.seq, fontSize, ss.nums);
    if (shown === 'proj') return proj2D(ss.proj, ss.dbn, ss.seq, 500, rot);
    if (layout.current?.ss !== ss) layout.current = { ss, svg: forna2D(ss.dbn, ss.seq, 500, ss.nums) };
    return layout.current.svg;
  }, [ss, shown, rot, fontSize]);

  // Dragging the projection turns the 3D camera; the camera follow above then redraws this.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const draggable = shown === 'proj' && molstar !== null;
  const dragHandlers = draggable && {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      // Keeps the moves coming when the pointer leaves the box.
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY };
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      // Half a degree per pixel, as on rna-atlas.org.
      molstar.rotateCamera((e.clientX - drag.current.x) * 0.5, (e.clientY - drag.current.y) * 0.5);
      drag.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: () => (drag.current = null),
    onPointerCancel: () => (drag.current = null)
  };

  if (isError) {
    return <Typography color="text.secondary">Couldn't read this model's sequence.</Typography>;
  }
  if (!ss) {
    // The 3D viewer's shape, so the two loaders sit level.
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', aspectRatio: '1 / 1', maxHeight: 600 }}>
        <CircularProgress aria-label="Loading 2D view" />
      </Box>
    );
  }
  if (ss.n === 0) {
    return <Typography color="text.secondary">No RNA chain found in this model.</Typography>;
  }

  return (
    <Stack spacing={1}>
      <Stack alignItems="center" direction="row" flexWrap="wrap" justifyContent="space-between" useFlexGap spacing={1}>
        <ToggleButtonGroup aria-label="2D view" exclusive onChange={(_, next: View | null) => next && setView(next)} size="small" value={view}>
          <ToggleButton value="proj">3D projection</ToggleButton>
          <ToggleButton value="layout">2D layout</ToggleButton>
          <ToggleButton value="arc">Arc</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={0.5}>
          <Button aria-label="Smaller text" disabled={fontSize <= 9} onClick={() => setFontSize(s => s - 2)} size="small" sx={{ minWidth: 0 }}>
            A−
          </Button>
          <Button aria-label="Larger text" disabled={fontSize >= 21} onClick={() => setFontSize(s => s + 2)} size="small" sx={{ minWidth: 0 }}>
            A+
          </Button>
        </Stack>
      </Stack>
      <Box aria-label="Sequence" sx={{ fontFamily: 'monospace', fontSize, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-all' }}>
        {[...ss.seq].map((base, i) => (
          <span key={i} style={{ color: nucColor(base) }} title={`${ss.nums[i]} ${base}`}>
            {base}
          </span>
        ))}
      </Box>
      {/* The SVG is built from the parsed model: only numbers and the letters A, C, G, U, N reach it. */}
      <Box aria-label="Secondary structure" dangerouslySetInnerHTML={{ __html: svg }} role="img"
        sx={{ overflowX: 'auto', ...(draggable && { cursor: 'grab', touchAction: 'none', userSelect: 'none' }) }}
        {...dragHandlers}
      />
      <Typography color="text.secondary" variant="caption">
        {CAPTION[shown]} {ss.n} nucleotides, one chain; unmodeled residues are left out. Solid blue: base pairs. Dashed pink: pseudoknot
        pairs. Pairs are inferred from the model's geometry, so some may be missing or wrong.
      </Typography>
    </Stack>
  );
}
