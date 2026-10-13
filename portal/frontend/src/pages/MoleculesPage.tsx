import { Alert, alpha, Box, ButtonBase, CircularProgress, Dialog, Link as MuiLink, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { MaterialReactTable, type MRT_ColumnDef, useMaterialReactTable } from 'material-react-table';
import { useMemo, useState } from 'react';
import { type MoleculeSummary, moleculesQuery } from '../api';
import { formatResolution } from '../format';
import { Thumbnail } from '../Thumbnail';

// Clips a value that's wider than its column to an ellipsis.
const ellipsisSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

export function MoleculesPage() {
  return (
    <>
      <Typography component="h1" gutterBottom variant="h4">
        All molecules
      </Typography>
      <MoleculesTable />
    </>
  );
}

function MoleculesTable() {
  const { data, isPending, error } = useQuery(moleculesQuery());
  const navigate = useNavigate();
  const [enlarged, setEnlarged] = useState<MoleculeSummary | null>(null);

  const columns = useMemo<MRT_ColumnDef<MoleculeSummary>[]>(
    () => [
      {
        id: 'thumbnail',
        header: '',
        columnDefType: 'display',
        size: 100,
        // A fixed-size image: growing or resizing it only pads the cell.
        grow: 0,
        enableResizing: false,
        Cell: ({ row: { original: m } }) =>
          m.thumbnail_url ? (
            // Its own click target: enlarges the thumbnail instead of opening the molecule.
            <ButtonBase
              aria-label={`Enlarge thumbnail for ${m.name}`}
              onClick={e => {
                e.stopPropagation();
                setEnlarged(m);
              }}
              sx={{ borderRadius: 1, cursor: 'zoom-in' }}
            >
              <Thumbnail alt={m.name} src={m.thumbnail_url} />
            </ButtonBase>
          ) : (
            <Thumbnail alt={m.name} src={null} />
          )
      },
      {
        accessorKey: 'name',
        header: 'Molecule',
        size: 180,
        // Takes most of the spare width on wide screens.
        grow: 3,
        Cell: ({ row: { original: m } }) => (
          // The tooltip shows the full name and id when the column is too narrow for them.
          <Tooltip title={`${m.name} (${m.id})`}>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={ellipsisSx}>
                <Link params={{ moleculeId: m.id }} to="/molecules/$moleculeId">
                  {m.name}
                </Link>
              </Box>
              <Typography color="text.secondary" noWrap variant="body2">
                {m.id}
              </Typography>
            </Box>
          </Tooltip>
        )
      },
      {
        // undefined, not null, so sortUndefined can keep the blanks at the bottom.
        accessorFn: m => m.pdb_id ?? undefined,
        id: 'pdb_id',
        header: 'PDB ID',
        size: 110,
        sortUndefined: 'last',
        Cell: ({ row: { original: m } }) =>
          m.pdb_id ? (
            <MuiLink href={`https://www.rcsb.org/structure/${m.pdb_id}`} onClick={e => e.stopPropagation()} rel="noreferrer" target="_blank">
              {m.pdb_id}
            </MuiLink>
          ) : (
            '—'
          )
      },
      {
        accessorFn: m => m.resolution_a ?? undefined,
        id: 'resolution_a',
        header: 'Resolution',
        size: 130,
        sortUndefined: 'last',
        Cell: ({ row: { original: m } }) => formatResolution(m.resolution_a)
      },
      { accessorKey: 'n_models', header: 'Models', size: 110 },
      { accessorKey: 'n_maps', header: 'Maps', size: 100 },
      {
        // ISO timestamps sort correctly as strings.
        accessorKey: 'scanned_at',
        header: 'Last changed',
        size: 150,
        Cell: ({ row: { original: m } }) => new Date(m.scanned_at).toLocaleDateString()
      }
    ],
    []
  );

  const table = useMaterialReactTable({
    columns,
    data: data ?? [],
    getRowId: m => m.id,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableGlobalFilter: false,
    enableDensityToggle: false,
    enableToolbarInternalActions: false,
    // Each column starts at its `size`, which is also its minimum width, and the columns share
    // any spare width by their `grow` weights. Narrower windows scroll the table sideways.
    layoutMode: 'grid',
    defaultColumn: { grow: 1 },
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    // The line that follows the cursor during a resize is primary.main by default; grey is quieter.
    mrtTheme: theme => ({ draggingBorderColor: theme.palette.grey[300] }),
    positionPagination: 'top',
    enableBottomToolbar: false,
    muiTopToolbarProps: {
      sx: { bgcolor: t => alpha(t.palette.primary.main, 0.12), borderBottom: 1, borderColor: 'divider' }
    },
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    muiTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate({ to: '/molecules/$moleculeId', params: { moleculeId: row.original.id } }),
      sx: { cursor: 'pointer' }
    }),
    muiTablePaperProps: { elevation: 0, sx: { border: 1, borderColor: 'divider', borderRadius: 2 } }
  });

  if (isPending) {
    return <CircularProgress />;
  }
  if (error) {
    return <Alert severity="error">Couldn't load the molecules: {error.message}</Alert>;
  }
  if (data.length === 0) {
    return <Typography>No molecules yet: the scanner hasn't found any folders in the Drive.</Typography>;
  }
  return (
    <>
      <MaterialReactTable table={table} />
      <Dialog onClose={() => setEnlarged(null)} open={enlarged !== null}>
        {enlarged?.thumbnail_url ? (
          <Box alt={enlarged.name} component="img" src={enlarged.thumbnail_url} sx={{ display: 'block', maxWidth: '100%' }} />
        ) : null}
      </Dialog>
    </>
  );
}
