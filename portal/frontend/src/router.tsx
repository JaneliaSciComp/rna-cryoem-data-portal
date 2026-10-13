import { AppBar, Container, Toolbar, Typography } from '@mui/material';
import { Link, Outlet, type RouterHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { parseMoleculeSearch } from './api';
import { MoleculePage } from './pages/MoleculePage';
import { MoleculesPage } from './pages/MoleculesPage';

function Layout() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Link style={{ color: 'inherit', textDecoration: 'none' }} to="/">
            <Typography variant="h6">RNA AI CryoEM Data Portal</Typography>
          </Link>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </>
  );
}

const rootRoute = createRootRoute({ component: Layout });
// The search, filters, sort, and page live in the URL, so a link shows the same results.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: parseMoleculeSearch,
  component: MoleculesPage
});
const moleculeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/molecules/$moleculeId',
  component: function MoleculeRoute() {
    const { moleculeId } = moleculeRoute.useParams();
    return <MoleculePage id={moleculeId} />;
  }
});

export const routeTree = rootRoute.addChildren([indexRoute, moleculeRoute]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
