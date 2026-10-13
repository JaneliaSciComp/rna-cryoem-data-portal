import { NotFound, moleculesQuery, moleculesUrl, parseMoleculeSearch } from './api';
import { redirectToLogin } from './session';

vi.mock('./session', () => ({ redirectToLogin: vi.fn() }));

const run = () => (moleculesQuery().queryFn as () => Promise<unknown>)();

test('returns the molecules', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
  await expect(run()).resolves.toEqual([]);
});

test('builds the search URL, repeating list params and dropping blanks', () => {
  expect(moleculesUrl({})).toBe('/api/molecules');
  expect(moleculesUrl({ q: '', kind: ['map', 'model'], max_resolution: 3.5, page: 2 })).toBe(
    '/api/molecules?kind=map&kind=model&max_resolution=3.5&page=2'
  );
});

test('keeps only the valid parts of a search from the URL', () => {
  expect(parseMoleculeSearch({ q: 10, kind: 'map', max_resolution: 3.5, sort: 'name', order: 'desc', page: 2, per_page: 50 })).toEqual({
    q: '10', kind: ['map'], max_resolution: 3.5, sort: 'name', order: 'desc', page: 2, per_page: 50
  });
  expect(parseMoleculeSearch({ q: '', kind: ['map', 'nope'], max_resolution: 0, sort: 'path', order: 'up', page: 1.5, per_page: 251 })).toEqual({
    kind: ['map']
  });
});

test('throws NotFound on 404', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  await expect(run()).rejects.toBeInstanceOf(NotFound);
});

test('redirects to login when the session expired', async () => {
  // edge_auth answers with a redirect to the login page; fetch follows it and gets HTML.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      redirected: true,
      url: 'https://d1.cloudfront.net/login.html?next=%2Fapi%2Fmolecules',
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      }
    }))
  );
  await expect(run()).rejects.toThrow('signed out');
  expect(redirectToLogin).toHaveBeenCalled();
});
