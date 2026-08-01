import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  FormControlLabel,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';

import { publicApiClient } from '../../lib/public-api-client';
import { useCatalog } from '../../lib/catalog-hooks';
import { setTokens } from '../../lib/api-client';

/**
 * Alta pública de médico/institución — llega acá desde el link de
 * "Reclamar esta nota" en la página de share público (claimToken en la
 * query string), o directamente si alguien quiere registrarse sin
 * haber dejado una nota antes. Nunca requiere sesión previa (por
 * definición, un profesional nuevo no tiene cuenta todavía) — usa
 * publicApiClient, no apiClient.
 */
export function ProfessionalRegistrationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const claimToken = searchParams.get('claimToken');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [docTypeId, setDocTypeId] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [countryId, setCountryId] = useState('');
  const [genderId, setGenderId] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [city, setCity] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [institution, setInstitution] = useState('');
  const [isInstitution, setIsInstitution] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [claimResult, setClaimResult] = useState<{ certified: boolean } | null>(null);

  const docTypeCatalog = useCatalog('DOCUMENT_TYPE');
  const countryCatalog = useCatalog('COUNTRY');
  const genderCatalog = useCatalog('GENDER');

  const registerMutation = useMutation({
    mutationFn: async () => {
      await publicApiClient.post('/clinical/professionals-registration', {
        firstName,
        lastName,
        email,
        password,
        docTypeId,
        docNumber,
        countryId,
        genderId: genderId || undefined,
        stateProvince: stateProvince || undefined,
        city: city || undefined,
        licenseNumber: licenseNumber || undefined,
        institution: institution || undefined,
        isInstitution,
        taxId: isInstitution && taxId ? taxId : undefined,
      });

      const { data: loginData } = await publicApiClient.post('/auth/login', {
        email,
        password,
      });
      setTokens(loginData.accessToken, loginData.refreshToken);

      if (claimToken) {
        const { data: claimData } = await publicApiClient.post(
          '/clinical/professionals-registration/claim-note',
          { claimToken },
          { headers: { Authorization: `Bearer ${loginData.accessToken}` } },
        );
        setClaimResult({ certified: claimData.certified });
      } else {
        navigate('/');
      }
    },
  });

  if (claimResult) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="success">
          Cuenta creada y nota reclamada correctamente.{' '}
          {claimResult.certified
            ? 'Como tu identidad ya está verificada, quedó certificada directamente en la historia clínica.'
            : 'Quedó pendiente de confirmación del viajero (nivel de confianza todavía no verificado).'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 6 }}>
      <Typography variant="h5" gutterBottom>
        Registro de médico / institución
      </Typography>
      {claimToken && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Al completar el registro vas a reclamar automáticamente la nota que dejaste.
        </Alert>
      )}
      {registerMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          No se pudo completar el registro. Verificá los datos (puede que el email o documento ya estén registrados).
        </Alert>
      )}

      <Grid container spacing={1}>
        <Grid size={{ xs: 6 }}>
          <TextField label="Nombre" fullWidth margin="normal" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Apellido" fullWidth margin="normal" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField label="Email" type="email" fullWidth margin="normal" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField label="Contraseña" type="password" fullWidth margin="normal" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField select label="Tipo de documento" fullWidth margin="normal" value={docTypeId} onChange={(e) => setDocTypeId(e.target.value)}>
            {(docTypeCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="N° de documento" fullWidth margin="normal" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField select label="País" fullWidth margin="normal" value={countryId} onChange={(e) => setCountryId(e.target.value)}>
            {(countryCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField select label="Sexo" fullWidth margin="normal" value={genderId} onChange={(e) => setGenderId(e.target.value)}>
            {(genderCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Provincia / Estado" fullWidth margin="normal" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField label="Localidad" fullWidth margin="normal" value={city} onChange={(e) => setCity(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField label="N° de matrícula" fullWidth margin="normal" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField label="Institución (opcional)" fullWidth margin="normal" value={institution} onChange={(e) => setInstitution(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <FormControlLabel
            control={<Checkbox checked={isInstitution} onChange={(e) => setIsInstitution(e.target.checked)} />}
            label="Me registro en representación de una institución"
          />
        </Grid>
        {isInstitution && (
          <Grid size={{ xs: 12 }}>
            <TextField label="CUIT / dato impositivo de la institución" fullWidth margin="normal" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </Grid>
        )}
      </Grid>

      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          fullWidth
          disabled={
            !firstName || !lastName || !email || !password || !docTypeId || !docNumber || !countryId ||
            registerMutation.isPending
          }
          onClick={() => registerMutation.mutate()}
        >
          {registerMutation.isPending ? <CircularProgress size={20} /> : 'Registrarme'}
        </Button>
      </Box>
    </Container>
  );
}
