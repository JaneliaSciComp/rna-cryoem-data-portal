import {
  Alert, Box, Button, CircularProgress, Link as MuiLink, List, ListItem, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableRow, TextField, Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { NotFound, moleculeQuery } from '../api';
import { formatBytes, formatResolution } from '../format';
import { Gallery } from '../molecule/Gallery';
import { SOURCE_LABEL, groupFiles } from '../molecule/groupFiles';
import { formatFor } from '../molecule/loadMolstar';
import { MolstarViewer } from '../molecule/MolstarViewer';
import { canOpenInNeuroglancer, neuroglancerUrl } from '../molecule/neuroglancer';

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Typography component="h2" gutterBottom variant="h6">
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

export function MoleculePage({ id }: { readonly id: string }) {
  const { data: m, isPending, error } = useQuery(moleculeQuery(id));
  const [modelId, setModelId] = useState<number | null>(null);

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
          {` · ${formatResolution(m.resolution_a)}`}
        </Typography>
      </Box>

      <Section title="Structure">
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

      <Section title="Maps">
        {g.maps.length === 0 ? (
          <Typography color="text.secondary">No maps found.</Typography>
        ) : (
          <Table size="small">
            <TableBody>
              {g.maps.map(f => (
                <TableRow key={f.id}>
                  <TableCell>{f.name}</TableCell>
                  <TableCell>{SOURCE_LABEL[f.source]}</TableCell>
                  <TableCell>{formatBytes(f.size)}</TableCell>
                  <TableCell align="right">
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
    </Stack>
  );
}
