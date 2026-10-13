import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { createAppRouter } from '../router';

// Renders the whole app at `path`, with the real routes.
export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

// Answers fetch(url) with routes[url] as JSON, or else routes[url without its query string];
// anything else is a 404.
export function mockFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const key = url in routes ? url : url.split('?')[0];
    return key in routes
      ? new Response(JSON.stringify(routes[key]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
