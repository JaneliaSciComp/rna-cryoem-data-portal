import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { createAppRouter } from '../router';

// Renders the whole app at `path`, with the real routes.
export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

// Answers fetch(url) with routes[url] as JSON; anything else is a 404.
export function mockFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) =>
    url in routes
      ? new Response(JSON.stringify(routes[url]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response('', { status: 404 })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
