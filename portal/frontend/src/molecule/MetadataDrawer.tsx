import CloseIcon from '@mui/icons-material/Close';
import {
  Box, Divider, Drawer, IconButton, Stack,
  Table, TableBody, TableCell, TableRow, Typography
} from '@mui/material';
import type { ReactNode } from 'react';

// Right-anchored drawer for an entity's metadata, copied from ai-cryoet's MetadataDrawer (single
// pane only): a small eyebrow label, the entity name as the heading, and a close button.
export function MetadataDrawer({
  open, onClose, eyebrow, title, children
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <Drawer anchor="right" onClose={onClose} open={open} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 460 } } } }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Typography color="text.secondary" sx={{ letterSpacing: 1, fontWeight: 700 }} variant="overline">
            {eyebrow}
          </Typography>
          <IconButton aria-label="Close metadata" edge="end" onClick={onClose} sx={{ mt: -1 }}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography component="h2" sx={{ mt: 0.5 }} variant="h6">
          {title}
        </Typography>
      </Box>
      <Divider />
      <Box sx={{ overflowY: 'auto', px: 3, py: 2 }}>
        <Stack spacing={1.5}>{children}</Stack>
      </Box>
    </Drawer>
  );
}

// Striped label/value table for the drawer, copied from ai-cryoet's MetadataSection.
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
