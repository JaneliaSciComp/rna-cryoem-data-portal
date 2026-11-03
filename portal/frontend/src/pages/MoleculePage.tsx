import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Alert, Box, Button, CircularProgress, Link as MuiLink, List, ListItem, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { type MoleculeDetail, NotFound, moleculeQuery } from '../api';
import { formatBytes, formatCount, formatResolution } from '../format';
import { Gallery } from '../molecule/Gallery';
import { MetadataDrawer } from '../molecule/MetadataDrawer';
import { type MetadataRow, MetadataTable } from '../molecule/MetadataTable';
import { SOURCE_LABEL, groupFiles } from '../molecule/groupFiles';
import { formatFor } from '../molecule/loadMolstar';
import { MolstarViewer } from '../molecule/MolstarViewer';
import { canOpenInNeuroglancer, neuroglancerUrl } from '../molecule/neuroglancer';

function Section({ title, area, children }: { readonly title: string; readonly area?: string; readonly children: ReactNode }) {
  return (
    <Paper sx={{ p: 2, gridArea: area }} variant="outlined">
      <Typography component="h2" gutterBottom variant="h6">
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

// "unmasked / masked", or null when cryoSPARC gave neither.
function fscPair(nomask: number | null, masked: number | null): string | null {
  return nomask === null && masked === null ? null : `${formatResolution(nomask)} / ${formatResolution(masked)}`;
}

// The "Data collection and Processing" table in the standard cryo-EM layout, row for row, plus
// four rows it leaves out: date and scientist first, Cs and AC after the voltage. Most values come
// from the molecule's row in the data collection sheet; a row the sheet has no column for yet
// shows a dash. More than one sheet row is a mistake in the sheet: say so rather than pick one.
function Collection({ m }: { readonly m: MoleculeDetail }) {
  const rows = m.collections;
  const sheet = rows.length === 1 ? rows[0] : {};
  const col = (label: ReactNode, column?: string): MetadataRow => ({ label, value: column && sheet[column] });
  return (
    <Stack spacing={2}>
      {rows.length === 0 ? <Typography color="text.secondary">Not in the data collection sheet.</Typography> : null}
      {rows.length > 1 ? (
        <Alert severity="warning">
          The data collection sheet has {rows.length} rows for this molecule. Remove the extras to show its parameters.
        </Alert>
      ) : null}
      <MetadataTable
        rows={[
          col('Data collection date', 'Date'),
          col('Scientist', 'Scientist'),
          col('Microscope', 'Microscope'),
          col('Voltage (keV)', 'kV'),
          col('Cs (mm)', 'Cs (mm)'),
          col('AC', 'AC'),
          col('Camera'),
          col('Magnification', 'Magnification'),
          col('Pixel size at detector (Å/pixel)', 'Pixel Size (Å)'),
          col('Total electron exposure (e⁻/Å²)', 'Total Dose'),
          col('Exposure rate (e⁻/pixel/sec)', 'Dose Rate'),
          col('Number of frames collected during exposure'),
          col('Defocus range (μm)', 'Defocus Range'),
          col('Automation software'),
          col('Energy filter slit width (if used)'),
          col('Micrographs collected (no.)', 'Movies'),
          col('Micrographs used (no.)'),
          col('Total extracted particles (no.)'),
          col('Refined particles (no.)'),
          // From cryoSPARC, like the point group and resolutions below.
          { label: 'Final particles (no.)', value: m.particle_count === null ? null : formatCount(m.particle_count) },
          { label: 'Point-group', value: m.point_group },
          { label: 'Resolution (global)', heading: true },
          { label: 'FSC 0.5 (unmasked/masked)', indent: true, value: fscPair(m.nomask_fsc05_a, m.fsc05_a) },
          { label: 'FSC 0.143 (unmasked/masked)', indent: true, value: fscPair(m.nomask_resolution_a, m.resolution_a) },
          col('Resolution range (local, Å)'),
          col('Resolution range due to anisotropy (Å)'),
          col(
            <>
              Map sharpening <i>B</i> factor (Å²)
            </>
          ),
          col('Map sharpening methods')
        ]}
      />
    </Stack>
  );
}

export function MoleculePage({ id }: { readonly id: string }) {
  const { data: m, isPending, error } = useQuery(moleculeQuery(id));
  const [modelId, setModelId] = useState<number | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  // From 1250px up the data collection table sits beside the structure and maps; narrower, it moves
  // into a drawer so they get the full width.
  const wide = useMediaQuery('(min-width: 1250px)');
  // Widening hides the drawer; without this it would pop back open on narrowing again.
  useEffect(() => {
    if (wide) setMetadataOpen(false);
  }, [wide]);

  if (isPending) {
    return <CircularProgress />;
  }
  if (error) {
    return error instanceof NotFound ? (
      <Stack spacing={1}>
        <Typography>Molecule not found.</Typography>
        <Link to="/">All molecules</Link>
      </Stack>
    ) : (
      <Alert severity="error">Couldn't load this molecule: {error.message}</Alert>
    );
  }

  const g = groupFiles(m.files);
  const model = g.models.find(f => f.id === modelId) ?? g.models[0];

  return (
    <Stack spacing={3}>
      <Box>
        <Link to="/">← All molecules</Link>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography component="h1" variant="h4">
              {m.name}
            </Typography>
            <Typography color="text.secondary">
              {m.id}
              {m.pdb_id ? (
                <>
                  {' · PDB '}
                  <MuiLink href={`https://www.rcsb.org/structure/${m.pdb_id}`} rel="noreferrer" target="_blank">
                    {m.pdb_id}
                  </MuiLink>
                </>
              ) : null}
            </Typography>
          </Box>
          {wide ? null : (
            <Button onClick={() => setMetadataOpen(true)} size="small" startIcon={<InfoOutlinedIcon />} variant="contained">
              Data collection and processing
            </Button>
          )}
        </Box>
      </Box>

      {/* Wide, the structure and maps take the left two thirds beside the data collection table, the
          1fr maps row soaking up the table's extra height so no gap opens under the structure. */}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateAreas: wide ? '"structure collection" "maps collection"' : '"structure" "maps"',
          gridTemplateColumns: wide ? 'minmax(0, 2fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
          gridTemplateRows: wide ? 'auto 1fr' : undefined
        }}
      >
        <Section area="structure" title="Structure">
          {model ? (
            <Stack spacing={2}>
              <TextField label="Model" onChange={e => setModelId(Number(e.target.value))} select size="small" value={model.id}>
                {g.models.map(f => (
                  <MenuItem key={f.id} value={f.id}>
                    {SOURCE_LABEL[f.source]}: {f.name}
                  </MenuItem>
                ))}
              </TextField>
              <MolstarViewer format={formatFor(model.name)} url={model.url} />
            </Stack>
          ) : (
            <Typography color="text.secondary">No atomic models found.</Typography>
          )}
        </Section>

        {wide ? (
          <Section area="collection" title="Data collection and processing">
            <Collection m={m} />
          </Section>
        ) : null}

        <Section area="maps" title="Maps">
          {g.maps.length === 0 ? (
            <Typography color="text.secondary">No maps found.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {g.maps.map(f => (
                  <TableRow key={f.id}>
                    {/* The name takes the spare width and truncates as it narrows (maxWidth 0 lets auto layout
                        squeeze it); the other cells fit their content and never wrap. */}
                    <TableCell sx={{ width: '100%', maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                      {f.name}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{SOURCE_LABEL[f.source]}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatBytes(f.size)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Stack direction="row" justifyContent="flex-end" spacing={1}>
                        <Button href={f.url} size="small">
                          Download
                        </Button>
                        {canOpenInNeuroglancer(f.path) ? (
                          <Button href={neuroglancerUrl(window.location.origin, f.path)} size="small" target="_blank" variant="contained">
                            Open in Neuroglancer
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </Box>

      <Section title="cryoSPARC plots">
        <Gallery empty="No plots found." files={g.plots} />
      </Section>

      <Section title="Micrographs">
        <Gallery empty="No micrographs found." files={g.micrographs} />
      </Section>

      <Section title="Reports">
        {g.reports.length === 0 ? (
          <Typography color="text.secondary">No reports found.</Typography>
        ) : (
          <List dense>
            {g.reports.map(f => (
              <ListItem key={f.id}>
                <MuiLink href={f.url} rel="noreferrer" target="_blank">
                  {f.name}
                </MuiLink>
              </ListItem>
            ))}
          </List>
        )}
      </Section>

      <MetadataDrawer eyebrow="Data collection and processing" onClose={() => setMetadataOpen(false)} open={metadataOpen && !wide} title={m.name}>
        <Collection m={m} />
      </MetadataDrawer>
    </Stack>
  );
}
