import { Box, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { type MoleculeFile, getText } from '../api';

// Every record of a FASTA file: its header line without the ">", and its sequence lines joined,
// without ";" comment lines, spaces, or the "*" some tools end a sequence with. Letters before any
// header line make a record with an empty header; a header with no sequence makes none.
// shortcut: gap "-" and lowercase characters are kept as written, change when aligned FASTA shows up.
export function parseFasta(text: string): { header: string; sequence: string }[] {
  const records: { header: string; sequence: string }[] = [];
  for (const line of text.split('\n').map(l => l.trim())) {
    if (line.startsWith('>')) {
      records.push({ header: line.slice(1).trim(), sequence: '' });
    } else if (line && !line.startsWith(';')) {
      if (records.length === 0) records.push({ header: '', sequence: '' });
      records[records.length - 1].sequence += line.replace(/\s/g, '').replace(/\*$/, '');
    }
  }
  return records.filter(r => r.sequence);
}

function Titled({ count, children }: { readonly count?: number; readonly children: ReactNode }) {
  return (
    <Box>
      <Typography component="h3" gutterBottom variant="subtitle1">
        Full sequence (FASTA){count === undefined ? '' : ` · ${count} nt`}
      </Typography>
      {children}
    </Box>
  );
}

// The sequences in one FASTA file, as plain text, each under a heading that gives its length.
export function FastaSequence({ file }: { readonly file: MoleculeFile }) {
  const { data: text, isPending, isError } = useQuery({
    queryKey: ['fasta-text', file.url],
    queryFn: () => getText(file.url),
    staleTime: Infinity
  });
  const note = (message: string) => (
    <Titled>
      <Typography color="text.secondary">{message}</Typography>
    </Titled>
  );
  if (isError) {
    return note(`Couldn't read ${file.name}.`);
  }
  if (isPending) {
    return note(`Loading ${file.name}…`);
  }
  const records = parseFasta(text);
  if (records.length === 0) {
    return note(`No sequence in ${file.name}.`);
  }
  return (
    <>
      {records.map((r, i) => (
        <Titled count={r.sequence.length} key={i}>
          <Box sx={{ fontFamily: 'monospace', fontSize: 13, overflowWrap: 'anywhere' }}>{r.sequence}</Box>
        </Titled>
      ))}
    </>
  );
}
