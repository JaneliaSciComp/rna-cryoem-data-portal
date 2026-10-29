import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  alpha,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  Dialog,
  Drawer,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputAdornment,
  Link as MuiLink,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  type MRT_SortingState,
  MRT_TablePagination,
  type MRT_Updater,
  useMaterialReactTable
} from 'material-react-table';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type Kind, type MoleculeSearch, type MoleculeSummary, moleculesQuery } from '../api';
import { formatCount, formatResolution } from '../format';
import { Thumbnail } from '../Thumbnail';

const KINDS: [Kind, string][] = [
  ['model', 'Models'],
  ['map', 'Maps'],
  ['micrograph', 'Micrographs'],
  ['plot', 'Plots'],
  ['report', 'Reports'],
  ['log', 'Logs']
];
const PER_PAGE = 10;
// The filter sidebar and the table; one column on small screens, where the sidebar is a drawer.
const COLUMNS = { xs: 'minmax(0, 1fr)', md: '240px minmax(0, 1fr)' };
const route = getRouteApi('/');

// Clips a value that's wider than its column to an ellipsis.
const ellipsisSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

export function MoleculesPage() {
  return <MoleculesTable />;
}

// `value`, once it has stopped changing for `ms`.
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

// A number box for the filter sidebar. A placeholder, not a label: a label overlaps the
// number field's arrows.
function NumberFilter(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  unit?: string;
}) {
  const { label, placeholder, value, onChange, step, unit } = props;
  return (
    <TextField
      fullWidth
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      size="small"
      slotProps={{
        htmlInput: { 'aria-label': label, min: 0, step },
        input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined
      }}
      type="number"
      value={value}
    />
  );
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
const apply = <T,>(updater: MRT_Updater<T>, old: T) => (updater instanceof Function ? updater(old) : updater);

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Accordion
      defaultExpanded
      disableGutters
      elevation={0}
      square
      sx={{ '&:before': { display: 'none' }, border: 1, borderColor: 'divider', borderRadius: 1 }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography fontWeight="bold" variant="subtitle2">
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

// The URL holds the search, filters, sort, and page; typing edits a local copy of the text
// fields, which reaches the URL once it pauses.
// ponytail: the text fields read the URL only on load, so a link to `/` from this page leaves
// them showing the old text. Sync them from the URL if that link starts to matter.
function MoleculesTable() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/' });
  const setSearch = (patch: MoleculeSearch) => navigate({ search: prev => ({ ...prev, ...patch }), replace: true });
  // A new search starts on its first page.
  const filter = (patch: MoleculeSearch) => setSearch({ ...patch, page: undefined });

  const [q, setQ] = useState(search.q ?? '');
  const [maxResolution, setMaxResolution] = useState(search.max_resolution?.toString() ?? '');
  const [maxNomask, setMaxNomask] = useState(search.max_nomask_resolution?.toString() ?? '');
  const [minParticles, setMinParticles] = useState(search.min_particles?.toString() ?? '');
  const typed = {
    q: useDebounced(q.trim(), 300) || undefined,
    max_resolution: Number(useDebounced(maxResolution, 300)) || undefined,
    max_nomask_resolution: Number(useDebounced(maxNomask, 300)) || undefined,
    // The API takes whole particles.
    min_particles: Math.trunc(Number(useDebounced(minParticles, 300))) || undefined
  };
  // Only the boxes whose pause just ended: another box's value can be stale, still inside its
  // own debounce after a chip or Clear all emptied it, and would put its filter back.
  const prevTyped = useRef(typed);
  useEffect(() => {
    const keys = (Object.keys(typed) as (keyof typeof typed)[]).filter(k => typed[k] !== prevTyped.current[k]);
    prevTyped.current = typed;
    if (keys.some(k => typed[k] !== search[k])) {
      filter(Object.fromEntries(keys.map(k => [k, typed[k]])));
    }
  }, [typed.q, typed.max_resolution, typed.max_nomask_resolution, typed.min_particles]);

  const kinds = search.kind ?? [];
  // One chip per filter. Clearing a number filter empties its box too, which reaches the URL
  // after the debounce; the filter call drops it from the URL now.
  const chips = [
    ...KINDS.filter(([value]) => kinds.includes(value)).map(([value, label]) => ({
      label: `Has ${label.toLowerCase()}`,
      clear: () => filter({ kind: toggle(kinds, value) })
    })),
    ...(search.max_resolution
      ? [{ label: `Masked resolution ≤ ${search.max_resolution} Å`, clear: () => {
            setMaxResolution('');
            filter({ max_resolution: undefined });
          } }]
      : []),
    ...(search.max_nomask_resolution
      ? [{ label: `No mask resolution ≤ ${search.max_nomask_resolution} Å`, clear: () => {
            setMaxNomask('');
            filter({ max_nomask_resolution: undefined });
          } }]
      : []),
    ...(search.min_particles
      ? [{ label: `Particles ≥ ${formatCount(search.min_particles)}`, clear: () => {
            setMinParticles('');
            filter({ min_particles: undefined });
          } }]
      : [])
  ];
  const clearAll = () => {
    setMaxResolution('');
    setMaxNomask('');
    setMinParticles('');
    filter({ kind: undefined, max_resolution: undefined, max_nomask_resolution: undefined, min_particles: undefined });
  };
  const nFilters = chips.length;
  const filtered = Boolean(search.q || nFilters);
  const sorting: MRT_SortingState = search.sort ? [{ id: search.sort, desc: search.order === 'desc' }] : [];
  const pagination: MRT_PaginationState = { pageIndex: (search.page ?? 1) - 1, pageSize: search.per_page ?? PER_PAGE };

  const { data, isPending, isFetching, error } = useQuery(
    moleculesQuery({
      q: search.q,
      kind: search.kind,
      max_resolution: search.max_resolution,
      max_nomask_resolution: search.max_nomask_resolution,
      min_particles: search.min_particles,
      sort: search.sort,
      order: search.sort && (search.order ?? 'asc'),
      page: pagination.pageIndex + 1,
      per_page: pagination.pageSize
    })
  );
  const [enlarged, setEnlarged] = useState<MoleculeSummary | null>(null);
  // On small screens the sidebar collapses into a button that opens this drawer.
  const [filtersOpen, setFiltersOpen] = useState(false);

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
        accessorKey: 'pdb_id',
        header: 'PDB ID',
        size: 110,
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
        accessorKey: 'resolution_a',
        header: 'Masked resolution',
        size: 130,
        Cell: ({ row: { original: m } }) => formatResolution(m.resolution_a)
      },
      {
        accessorKey: 'nomask_resolution_a',
        header: 'No mask resolution',
        size: 130,
        Cell: ({ row: { original: m } }) => formatResolution(m.nomask_resolution_a)
      },
      {
        accessorKey: 'particle_count',
        header: 'Particles',
        size: 120,
        Cell: ({ row: { original: m } }) => formatCount(m.particle_count)
      },
      { accessorKey: 'n_models', header: 'Models', size: 110 },
      { accessorKey: 'n_maps', header: 'Maps', size: 100 },
      {
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
    data: data?.molecules ?? [],
    getRowId: m => m.id,
    // The API sorts and pages: the table shows one page of results.
    manualPagination: true,
    manualSorting: true,
    rowCount: data?.found ?? 0,
    onPaginationChange: updater => {
      const next = apply(updater, pagination);
      setSearch({ page: next.pageIndex + 1, per_page: next.pageSize === PER_PAGE ? undefined : next.pageSize });
    },
    onSortingChange: updater => {
      const [next] = apply(updater, sorting);
      setSearch({ sort: next?.id as MoleculeSearch['sort'], order: next && (next.desc ? 'desc' : 'asc') });
    },
    state: { pagination, sorting, isLoading: isPending, showProgressBars: isFetching && !isPending },
    localization: {
      noRecordsToDisplay: filtered
        ? 'No molecules match these filters.'
        : "No molecules yet: the scanner hasn't found any folders in the Drive."
    },
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
    enableBottomToolbar: false,
    renderTopToolbar: ({ table }) => (
      <Box
        sx={{
          p: 1.5,
          bgcolor: t => alpha(t.palette.primary.main, 0.12),
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap'
        }}
      >
        <TextField
          onChange={e => setQ(e.target.value)}
          placeholder="Search name, folder, or PDB ID"
          size="small"
          slotProps={{
            htmlInput: { 'aria-label': 'Search' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }
          }}
          sx={{ flex: 1, minWidth: { xs: '100%', sm: 300 }, maxWidth: 480, bgcolor: 'background.paper' }}
          type="search"
          value={q}
        />
        {/* On narrow screens the row wraps, and the pagination drops below the search. */}
        <Box sx={{ ml: 'auto' }}>
          <MRT_TablePagination table={table} />
        </Box>
      </Box>
    ),
    muiTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate({ to: '/molecules/$moleculeId', params: { moleculeId: row.original.id } }),
      sx: { cursor: 'pointer' }
    }),
    muiTablePaperProps: { elevation: 0, sx: { border: 1, borderColor: 'divider', borderRadius: 2 } }
  });

  const filterPanel = (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <FilterSection title="Has files">
        <FormGroup aria-label="Has files">
          {KINDS.map(([value, label]) => (
            <FormControlLabel
              control={<Checkbox checked={kinds.includes(value)} onChange={() => filter({ kind: toggle(kinds, value) })} size="small" />}
              key={value}
              label={`${label} (${data?.facets.kinds?.[value] ?? 0})`}
            />
          ))}
        </FormGroup>
      </FilterSection>
      <FilterSection title="Masked resolution">
        <NumberFilter label="Max masked resolution" onChange={setMaxResolution} placeholder="Max resolution" step={0.1} unit="Å" value={maxResolution} />
      </FilterSection>
      <FilterSection title="No mask resolution">
        <NumberFilter label="Max no mask resolution" onChange={setMaxNomask} placeholder="Max resolution" step={0.1} unit="Å" value={maxNomask} />
      </FilterSection>
      <FilterSection title="Particles">
        <NumberFilter label="Min particles" onChange={setMinParticles} placeholder="Min particles" step={1000} value={minParticles} />
      </FilterSection>
    </Box>
  );

  return (
    <>
      {/* The same columns as the sidebar and table below. */}
      <Box sx={{ display: 'grid', columnGap: 3, rowGap: 1, gridTemplateColumns: COLUMNS, alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography component="h1" variant="h4">
            All molecules
          </Typography>
          <Button
            onClick={() => setFiltersOpen(true)}
            startIcon={<FilterListIcon />}
            sx={{ display: { xs: 'inline-flex', md: 'none' }, flexShrink: 0 }}
            variant="outlined"
          >
            Filters{nFilters > 0 ? ` (${nFilters})` : ''}
          </Button>
        </Box>
        {/* Beside the title on wide screens, so the table starts as high as it did before. */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ minHeight: '1.6em' }} variant="h6">
            {data ? `${formatCount(data.found)} out of ${formatCount(data.total)} total molecules match the selected filters` : null}
          </Typography>
          <Stack alignItems="center" direction="row" flexWrap="wrap" spacing={1} useFlexGap>
            <Typography color="text.secondary" variant="body2">
              Filtered by:
            </Typography>
            {chips.length > 0 ? (
              <>
                {chips.map(c => (
                  <Chip key={c.label} label={c.label} onDelete={c.clear} size="small" />
                ))}
                <Chip color="primary" label="Clear all" onClick={clearAll} size="small" />
              </>
            ) : (
              <Typography color="text.secondary" fontStyle="italic" variant="body2">
                No filters selected
              </Typography>
            )}
          </Stack>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: COLUMNS, alignItems: 'start' }}>
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>{filterPanel}</Box>
        {error ? <Alert severity="error">Couldn't load the molecules: {error.message}</Alert> : <MaterialReactTable table={table} />}
        <Dialog onClose={() => setEnlarged(null)} open={enlarged !== null}>
          {enlarged?.thumbnail_url ? (
            <Box alt={enlarged.name} component="img" src={enlarged.thumbnail_url} sx={{ display: 'block', maxWidth: '100%' }} />
          ) : null}
        </Dialog>
      </Box>
      <Drawer anchor="left" onClose={() => setFiltersOpen(false)} open={filtersOpen} sx={{ display: { md: 'none' } }}>
        <Box sx={{ width: 320, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <IconButton aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          {filterPanel}
        </Box>
      </Drawer>
    </>
  );
}
