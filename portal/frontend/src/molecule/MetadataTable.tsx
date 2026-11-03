import {
  Box, Table, TableBody, TableCell, TableRow
} from '@mui/material';
import type { ReactNode } from 'react';

// `heading`: a label with no value of its own, over the `indent`ed rows that follow it.
export type MetadataRow = { label: ReactNode; value?: string | null; heading?: boolean; indent?: boolean };

// Striped label/value table, copied from ai-cryoet's MetadataSection. Missing values show a dash,
// so every row stays visible.
export function MetadataTable({ rows }: { readonly rows: MetadataRow[] }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Table size="small">
        <TableBody>
          {rows.map(({ label, value, heading, indent }, i) => {
            const empty = !heading && !value;
            return (
              <TableRow key={i} sx={{ bgcolor: i % 2 === 0 ? 'action.hover' : 'transparent', '& td, & th': { borderBottom: 'none' } }}>
                <TableCell
                  colSpan={heading ? 2 : 1}
                  component="th"
                  scope="row"
                  sx={{ width: '45%', pl: indent ? 4 : undefined, color: 'text.secondary', fontWeight: 600, verticalAlign: 'top' }}
                >
                  {label}
                </TableCell>
                {heading ? null : (
                  <TableCell sx={{ verticalAlign: 'top', color: empty ? 'text.disabled' : undefined }}>{empty ? '—' : value}</TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
