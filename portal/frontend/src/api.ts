import { queryOptions } from '@tanstack/react-query';
import { redirectToLogin } from './session';

export type Kind = 'model' | 'map' | 'plot' | 'micrograph' | 'report' | 'log';
export type Source = 'deposited' | 'predicted' | 'experimental' | 'other';

export type MoleculeSummary = {
  id: string;
  name: string;
  pdb_id: string | null;
  resolution_a: number | null;
  thumbnail_url: string | null;
  n_models: number;
  n_maps: number;
  scanned_at: string;
};

export type MoleculeFile = {
  id: number;
  name: string;
  path: string;
  kind: Kind;
  source: Source;
  size: number;
  url: string;
};

export type MoleculeDetail = Omit<MoleculeSummary, 'n_models' | 'n_maps'> & { files: MoleculeFile[] };

export class NotFound extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (response.redirected && new URL(response.url).pathname === '/login.html') {
    redirectToLogin();
    throw new Error('signed out');
  }
  if (response.status === 404) {
    throw new NotFound(url);
  }
  if (!response.ok) {
    throw new Error(`${response.status} from ${url}`);
  }
  return (await response.json()) as T;
}

export const moleculesQuery = () =>
  queryOptions({ queryKey: ['molecules'], queryFn: () => getJson<MoleculeSummary[]>('/api/molecules') });

export const moleculeQuery = (id: string) =>
  queryOptions({
    queryKey: ['molecule', id],
    queryFn: () => getJson<MoleculeDetail>(`/api/molecules/${encodeURIComponent(id)}`),
    retry: (failures, error) => !(error instanceof NotFound) && failures < 2
  });
