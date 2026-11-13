import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { Fragment, type ReactNode } from 'react';

// Where every fact the portal shows comes from. Keep in step with the backend's classify.py,
// parsers.py, and sheet.py, and the microscope setup in MoleculePage.tsx.

type Fact = [shown: ReactNode, source: ReactNode, detail: ReactNode];

function FactTable({ head, rows }: { readonly head: [string, string, string]; readonly rows: Fact[] }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {head.map(h => (
              <TableCell key={h} sx={{ fontWeight: 600 }}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((cells, i) => (
            <TableRow key={i} sx={{ bgcolor: i % 2 === 0 ? 'action.hover' : 'transparent', '& td': { borderBottom: 'none', verticalAlign: 'top', overflowWrap: 'anywhere' } }}>
              {cells.map((c, j) => (
                <TableCell key={j} sx={j === 0 ? { fontWeight: 600, color: 'text.secondary' } : undefined}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

// Break long dotted paths after the dots, not mid-word.
const c = (s: string) => (
  <code>
    {s.split('.').map((part, i) => (
      <Fragment key={i}>
        {i > 0 && <>.<wbr /></>}
        {part}
      </Fragment>
    ))}
  </code>
);

const FILES: Fact[] = [
  ['Model', <>{c('.pdb')}, {c('.cif')}</>, 'Shown in the 3D viewer and the file list.'],
  ['Map', <>{c('.mrc')}, {c('.map')}</>, 'Listed for download and Neuroglancer.'],
  ['Micrograph', <>{c('.png')} in a {c('Micrographs')} folder</>, 'Shown in the gallery.'],
  ['Plot', <>any other {c('.png')}</>, 'Shown in the gallery.'],
  ['Report', c('.pdf'), 'Listed for download.'],
  ['cryoSPARC log', <>{c('.log')}, or {c('cryosparc_*.json')}</>, 'Read for the processing facts below.']
];

const SOURCES: Fact[] = [
  ['Deposited', <>a folder whose name starts with {c('PDB')}</>, 'Also where the PDB ID is read from.'],
  ['Predicted', <>an {c('AlphaFold')} folder</>, ''],
  ['Experimental', <>a {c('CryoEM')} folder</>, ''],
  ['Other', 'anywhere else in the molecule folder', '']
];

const MOLECULE: Fact[] = [
  ['Molecule ID', 'Top-level folder name', <>One molecule per folder in the data root, e.g. {c('Mol9_gRNAde')}.</>],
  ['Molecule name', 'Top-level folder name', <>Without its {c('Mol<N>_')} prefix: {c('gRNAde')}.</>],
  [
    'PDB ID',
    'Deposited model file',
    <>
      {c('.pdb')}: the {c('HEADER')} record, columns 63–66. {c('.cif')}: {c('_entry.id')}. Else a four-character ID in the
      file name, such as {c('10ZT.pdb')}.
    </>
  ],
  ['Thumbnail', 'First model file', 'Rendered from a deposited model, else predicted, else any other.'],
  ['Last changed', 'The scan', 'When the scan last found the folder’s files changed.']
];

const fsc = (key: string) => <>{c(`output_result_groups[type=volume].latest_summary_stats.fsc_info_best.${key}`)}, best across volumes</>;

const CRYOSPARC: Fact[] = [
  ['Masked resolution (FSC 0.143)', fsc('radwn_final_A'), <>cryoSPARC v5. In v4 logs: {c('radwn_tightmask_A')}.</>],
  ['No mask resolution (FSC 0.143)', fsc('radwn_nomask_A'), ''],
  ['Masked FSC 0.5', fsc('radwn_autotight_noisesub_05_A'), <>cryoSPARC v5. In v4 logs: {c('radwn_tightmask_05_A')}.</>],
  ['No mask FSC 0.5', fsc('radwn_nomask_05_A'), ''],
  ['Final particles', <>{c('num_items')} of the output group named {c('particles')}</>, ''],
  ['Point-group', c('params_spec.refine_symmetry.value'), <>Else cryoSPARC’s default, {c('params_base.refine_symmetry.value')}.</>]
];

const SHEET: Fact[] = [
  ['Data collection date', c('Date'), ''],
  ['Scientist', c('Scientist'), ''],
  ['Microscope', c('Microscope'), 'Also a column on the main molecules page.'],
  ['Voltage (keV)', c('kV'), ''],
  ['Cs (mm)', c('Cs (mm)'), ''],
  ['AC', c('AC'), ''],
  ['Magnification', c('Magnification'), ''],
  ['Pixel size at detector (Å/pixel)', c('Pixel Size (Å)'), ''],
  ['Total electron exposure (e⁻/Å²)', c('Total Dose'), ''],
  ['Exposure rate (e⁻/pixel/sec)', c('Dose Rate'), ''],
  ['Defocus range (μm)', c('Defocus Range'), ''],
  ['Energy filter slit width (eV)', c('Energy Slit'), ''],
  ['Micrographs collected', c('Movies'), 'Also the Movies column on the main molecules page.']
];

const SETUP: Fact[] = [
  ['Camera', 'Falcon 4i', 'Krios3 and Krios4.'],
  ['Automation software', 'SerialEM', 'Krios3 and Krios4.']
];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Stack spacing={1.5}>
      <Typography component="h2" variant="h6">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

export function AboutPage() {
  return (
    <Stack spacing={4} sx={{ maxWidth: 1100 }}>
      <Stack spacing={1}>
        <Typography component="h1" variant="h4">
          About the data
        </Typography>
        <Typography>
          A scheduled scan reads the team’s Google Drive folder and data collection sheet. The portal shows only what the
          scan finds there: it has no other source of metadata.
        </Typography>
      </Stack>

      <Section title="Files">
        <Typography>
          Each top-level folder in the Drive is one molecule. The scan catalogs files by extension, anywhere inside it;
          other files are skipped, as are hidden ones.
        </Typography>
        <FactTable head={['Kind', 'Files', 'Used for']} rows={FILES} />
        <Typography>The folders a file sits in, below the molecule folder, give its source:</Typography>
        <FactTable head={['Source', 'File is in', 'Note']} rows={SOURCES} />
      </Section>

      <Section title="Molecule">
        <FactTable head={['Shown as', 'From', 'How']} rows={MOLECULE} />
      </Section>

      <Section title="Processing (cryoSPARC)">
        <Typography>
          Read from the molecule’s cryoSPARC job log, exported as JSON. If a molecule has more than one log, only the
          first by path is read.
        </Typography>
        <FactTable head={['Shown as', 'Field in the log', 'Note']} rows={CRYOSPARC} />
      </Section>

      <Section title="Data collection and processing metadata">
        <Typography>
          Read from the team’s data collection sheet, one row per grid. A row belongs to the molecule whose folder name
          is in its {c('Grid Name')} column. A molecule with more than one row shows none of them until the extras are
          removed.
        </Typography>
        <FactTable head={['Shown as', 'Sheet column', 'Note']} rows={SHEET} />
        <Typography>Not in the sheet: set in the portal by the microscope the sheet names.</Typography>
        <FactTable head={['Shown as', 'Value', 'Microscopes']} rows={SETUP} />
      </Section>
    </Stack>
  );
}
