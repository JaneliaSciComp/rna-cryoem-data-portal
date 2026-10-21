import { keepPreviousData, queryOptions } from '@tanstack/react-query';
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

// GET /api/molecules: one page of the molecules that match the search.
export type MoleculePage = {
  found: number;
  molecules: MoleculeSummary[];
  // Matches per value among this search's results.
  facets: { kinds?: Partial<Record<Kind, number>> };
};

export type SortKey = 'name' | 'pdb_id' | 'resolution_a' | 'n_models' | 'n_maps' | 'scanned_at';

export type MoleculeSearch = {
  q?: string;
  // Every listed kind must be present.
  kind?: Kind[];
  max_resolution?: number;
  sort?: SortKey;
  order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
};

const KINDS: readonly Kind[] = ['model', 'map', 'plot', 'micrograph', 'report', 'log'];
const SORT_KEYS: readonly SortKey[] = ['name', 'pdb_id', 'resolution_a', 'n_models', 'n_maps', 'scanned_at'];
const positive = (v: unknown) => (Number(v) > 0 && Number.isFinite(Number(v)) ? Number(v) : undefined);
const positiveInt = (v: unknown) => (Number.isInteger(positive(v)) ? Number(v) : undefined);

// A search from the page URL, which anyone can edit or share: unknown values are dropped, so
// the API only sees searches it accepts.
export function parseMoleculeSearch(raw: Record<string, unknown>): MoleculeSearch {
  const kind = [raw.kind].flat().filter((k): k is Kind => KINDS.includes(k as Kind));
  const perPage = positiveInt(raw.per_page);
  return {
    // The router parses `?q=10` as a number.
    q: raw.q === undefined || raw.q === '' ? undefined : String(raw.q),
    kind: kind.length ? kind : undefined,
    max_resolution: positive(raw.max_resolution),
    sort: SORT_KEYS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : undefined,
    order: raw.order === 'asc' || raw.order === 'desc' ? raw.order : undefined,
    page: positiveInt(raw.page),
    per_page: perPage && perPage <= 250 ? perPage : undefined
  };
}

export function moleculesUrl(search: MoleculeSearch) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v !== undefined && v !== '') {
        params.append(key, String(v));
      }
    }
  }
  const query = params.toString();
  return query ? `/api/molecules?${query}` : '/api/molecules';
}

export type MoleculeFile = {
  id: number;
  name: string;
  path: string;
  kind: Kind;
  source: Source;
  size: number;
  url: string;
};

export type MoleculeDetail = Omit<MoleculeSummary, 'n_models' | 'n_maps'> & {
  nomask_resolution_a: number | null;
  particle_count: number | null;
  files: MoleculeFile[];
};

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

export const moleculesQuery = (search: MoleculeSearch = {}) =>
  queryOptions({
    queryKey: ['molecules', search],
    queryFn: () => getJson<MoleculePage>(moleculesUrl(search)),
    // Keeps the current page on screen while the next one loads, instead of a spinner.
    placeholderData: keepPreviousData
  });

export const moleculeQuery = (id: string) =>
  queryOptions({
    queryKey: ['molecule', id],
    queryFn: () => getJson<MoleculeDetail>(`/api/molecules/${encodeURIComponent(id)}`),
    retry: (failures, error) => !(error instanceof NotFound) && failures < 2
  });
