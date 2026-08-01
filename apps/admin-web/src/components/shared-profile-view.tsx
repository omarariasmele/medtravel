import { Alert, Box, Card, CardContent, Chip, Grid, Typography } from '@mui/material';

import { labelFor, useCatalog } from '../lib/catalog-hooks';

export interface SharedProfileData {
  person: {
    firstName: string;
    lastName: string;
    birthDate: string | null;
    genderId: string | null;
    countryResidenceId: string | null;
  } | null;
  membership: Array<{
    tenantName: string | null;
    planName: string | null;
    policyNumber: string;
    validFrom: string;
    validUntil: string;
    statusAuthority: string;
  }>;
  allergies: Array<{ allergenName: string; severity: string | null; reactionType: string | null }>;
  conditions: Array<{ conditionName: string; icd10Code: string | null; travelRestrictions: string | null }>;
  medications: Array<{ genericName: string; brandName: string | null; doseAmount: string | null }>;
  emergencyContacts: Array<{ firstName: string; lastName: string; phone: string | null; relationship: string | null }>;
}

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * Mismo componente de presentación para las DOS entradas de "compartir
 * historia clínica" (portal público /public/shares/:token y la
 * previsualización interna /share-preview/:personId) — el pedido
 * explícito del usuario fue que el operador vea "exactamente la misma
 * vista" que el médico, así que esto no se duplica entre las dos
 * páginas, solo cambia de dónde viene el fetch.
 */
const STATUS_AUTHORITY_LABEL: Record<string, string> = {
  PARTNER_API: 'Validada por la empresa',
  LOCAL_RECORD: 'Registro local',
  MEMBER_DECLARED: 'Declarada por el viajero (sin validar)',
};

export function SharedProfileView({ data }: { data: SharedProfileData }) {
  const { person, membership, allergies, conditions, medications, emergencyContacts } = data;
  const genderCatalog = useCatalog('GENDER');

  if (!person) {
    return <Alert severity="warning">Sin datos disponibles.</Alert>;
  }

  const age = calculateAge(person.birthDate);

  return (
    <Box>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {person.firstName} {person.lastName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {age !== null ? `${age} años` : 'Edad no informada'}
            {person.genderId ? ` · ${labelFor(genderCatalog.data, person.genderId)}` : ''}
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Membresía de asistencia al viajero</Typography>
          {membership.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Sin cobertura de asistencia registrada.</Typography>
          ) : (
            membership.map((m, i) => (
              <Box key={i} sx={{ mb: i < membership.length - 1 ? 1.5 : 0 }}>
                <Typography variant="body2">
                  <strong>{m.tenantName ?? 'Empresa sin identificar'}</strong>
                  {m.planName ? ` — ${m.planName}` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  Póliza {m.policyNumber} · Vigencia {new Date(m.validFrom).toLocaleDateString('es-AR')} al{' '}
                  {new Date(m.validUntil).toLocaleDateString('es-AR')}
                  {' · '}
                  {STATUS_AUTHORITY_LABEL[m.statusAuthority] ?? m.statusAuthority}
                </Typography>
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Alergias</Typography>
          {allergies.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Sin alergias registradas.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {allergies.map((a, i) => (
                <Chip
                  key={i}
                  color={a.severity === 'SEVERE' || a.severity === 'CRITICAL' ? 'error' : 'default'}
                  label={`${a.allergenName}${a.severity ? ` (${a.severity})` : ''}`}
                />
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Condiciones</Typography>
          {conditions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Sin condiciones registradas.</Typography>
          ) : (
            conditions.map((c, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Typography variant="body2"><strong>{c.conditionName}</strong> {c.icd10Code ? `(${c.icd10Code})` : ''}</Typography>
                {c.travelRestrictions && (
                  <Typography variant="caption" color="error">Restricciones de viaje: {c.travelRestrictions}</Typography>
                )}
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Medicamentos actuales</Typography>
          {medications.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Sin medicamentos registrados.</Typography>
          ) : (
            <Grid container spacing={1}>
              {medications.map((m, i) => (
                <Grid key={i} size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    {m.genericName}{m.brandName ? ` (${m.brandName})` : ''}
                    {m.doseAmount ? ` — ${m.doseAmount}` : ''}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Contactos de emergencia</Typography>
          {emergencyContacts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Sin contactos de emergencia registrados.</Typography>
          ) : (
            emergencyContacts.map((c, i) => (
              <Typography key={i} variant="body2">
                {c.firstName} {c.lastName}{c.relationship ? ` (${c.relationship})` : ''}
                {c.phone ? ` — ${c.phone}` : ''}
              </Typography>
            ))
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
