import { Box, IconButton, Link, Stack, Typography } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';

// The image tag, set by infra/portal/scripts/push-images.sh through the nginx Dockerfile.
// Unset in dev and local builds.
const version = import.meta.env.VITE_APP_VERSION;
const repo = 'https://github.com/JaneliaSciComp/rna-cryoem-data-portal';

export function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        px: { xs: 2, md: 4 },
        py: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2
      }}
    >
      <Stack alignItems="center" direction="row" spacing={1}>
        <Typography variant="body2">
          {version ? (
            <Link color="inherit" href={`${repo}/commit/${version}`} rel="noopener noreferrer" target="_blank" underline="hover">
              {version}
            </Link>
          ) : (
            'dev'
          )}
        </Typography>
        <IconButton
          aria-label="GitHub repository"
          component="a"
          href={repo}
          rel="noopener noreferrer"
          size="small"
          sx={{ color: 'inherit' }}
          target="_blank"
        >
          <GitHubIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography variant="body2">
        <Link color="inherit" href="https://www.hhmi.org/research/janelia/AI" rel="noopener noreferrer" target="_blank" underline="hover">
          AI@HHMI
        </Link>
      </Typography>
    </Box>
  );
}
