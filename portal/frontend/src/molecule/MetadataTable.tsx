import {
  Box, Table, TableBody, TableCell, TableRow
} from '@mui/material';
import type { ReactNode } from 'react';

// Striped label/value table, copied from ai-cryoet's MetadataSection.
export function MetadataTable({ rows }: { readonly rows: [string, ReactNode][] }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Table size="small">
        <TableBody>
          {rows.map(([label, value], i) => (
            <TableRow key={label} sx={{ bgcolor: i % 2 === 0 ? 'action.hover' : 'transparent', '& td, & th': { borderBottom: 'none' } }}>
              <TableCell component="th" scope="row" sx={{ width: '45%', color: 'text.secondary', fontWeight: 600, verticalAlign: 'top' }}>
                {label}
              </TableCell>
              <TableCell sx={{ verticalAlign: 'top', color: value === '' ? 'text.disabled' : undefined }}>
                {value === '' ? '—' : value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
