import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { Link, Outlet, type RouterHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { parseMoleculeSearch } from './api';
import { Footer } from './Footer';
import { AboutPage } from './pages/AboutPage';
import { MoleculePage } from './pages/MoleculePage';
import { MoleculesPage } from './pages/MoleculesPage';

function Layout() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Link style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }} to="/">
            <Box alt="" component="img" src="/logo-white.png" sx={{ height: 32 }} />
            <Typography variant="h6">RNA AI CryoEM Data Portal</Typography>
          </Link>
          <Box sx={{ flexGrow: 1 }} />
          <Button color="inherit" component={Link} to="/about">
            About
          </Button>
        </Toolbar>
      </AppBar>
      {/* Wider than MUI's 1200px lg default, so the molecule table has room beside its filters. */}
      <Container
        maxWidth={false}
        sx={theme => ({
          py: 3,
          [theme.breakpoints.up('xl')]: { maxWidth: theme.breakpoints.values.xl },
          [theme.breakpoints.up(1920)]: { maxWidth: 1920 },
          [theme.breakpoints.up(2560)]: { maxWidth: 2560 }
        })}
      >
        <Outlet />
      </Container>
      <Footer />
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

const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/about', component: AboutPage });

export const routeTree = rootRoute.addChildren([indexRoute, moleculeRoute, aboutRoute]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
