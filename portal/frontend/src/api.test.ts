import { NotFound, moleculesQuery } from './api';
import { redirectToLogin } from './session';

vi.mock('./session', () => ({ redirectToLogin: vi.fn() }));

const run = () => (moleculesQuery().queryFn as () => Promise<unknown>)();

test('returns the molecules', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
  await expect(run()).resolves.toEqual([]);
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
