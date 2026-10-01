import { Alert, CircularProgress, Link as MuiLink, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { moleculesQuery } from '../api';
import { formatResolution } from '../format';
import { Thumbnail } from '../Thumbnail';

export function MoleculesPage() {
  const { data, isPending, error } = useQuery(moleculesQuery());
  const navigate = useNavigate();

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
    <Table>
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell>Molecule</TableCell>
          <TableCell>PDB ID</TableCell>
          <TableCell>Resolution</TableCell>
          <TableCell align="right">Models</TableCell>
          <TableCell align="right">Maps</TableCell>
          <TableCell>Last changed</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {data.map(m => (
          <TableRow
            hover
            key={m.id}
            onClick={() => navigate({ to: '/molecules/$moleculeId', params: { moleculeId: m.id } })}
            sx={{ cursor: 'pointer' }}
          >
            <TableCell>
              <Thumbnail alt={m.name} src={m.thumbnail_url} />
            </TableCell>
            <TableCell>
              <Link params={{ moleculeId: m.id }} to="/molecules/$moleculeId">
                {m.name}
              </Link>
              <Typography color="text.secondary" variant="body2">
                {m.id}
              </Typography>
            </TableCell>
            <TableCell>
              {m.pdb_id ? (
                <MuiLink href={`https://www.rcsb.org/structure/${m.pdb_id}`} onClick={e => e.stopPropagation()} rel="noreferrer" target="_blank">
                  {m.pdb_id}
                </MuiLink>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell>{formatResolution(m.resolution_a)}</TableCell>
            <TableCell align="right">{m.n_models}</TableCell>
            <TableCell align="right">{m.n_maps}</TableCell>
            <TableCell>{new Date(m.scanned_at).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
