import { Alert, Typography } from '@mui/material';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <>
      <Typography variant="h4" gutterBottom>
        {title}
      </Typography>
      <Alert severity="info">
        Esta sección todavía no está implementada. Se agregará en una
        próxima etapa.
      </Alert>
    </>
  );
}
