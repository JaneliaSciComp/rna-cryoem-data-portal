import type { Kind, MoleculeFile, Source } from '../api';

export const SOURCE_LABEL: Record<Source, string> = {
  deposited: 'Deposited',
  predicted: 'AlphaFold',
  experimental: 'cryoSPARC',
  other: 'Other'
};

const SOURCE_ORDER: Source[] = ['deposited', 'predicted', 'experimental', 'other'];

export function groupFiles(files: MoleculeFile[]) {
  const of = (kind: Kind) =>
    files
      .filter(f => f.kind === kind)
      .sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) || a.path.localeCompare(b.path));
  return { models: of('model'), maps: of('map'), plots: of('plot'), micrographs: of('micrograph'), reports: of('report') };
}
