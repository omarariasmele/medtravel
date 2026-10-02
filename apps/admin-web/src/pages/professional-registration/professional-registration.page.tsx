import { useEffect, useState } from 'react';
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
import { apiErrorMessage } from '../../lib/api-error';

// Mismo storage que professional-portal.page.tsx — a propósito NUNCA
// el localStorage de apiClient (ver api-client.ts/setTokens): ese es
// la sesión del PANEL DE OPERADORES. Un profesional que se registra
// nunca debe terminar "logueado" ahí — antes esto guardaba el token
// del médico con setTokens(), así que si después entraba a cualquier
// ruta del panel (aunque sea por error), <ProtectedRoute> lo dejaba
// pasar y le mostraba el Dashboard/sidebar completo (vacíos porque
// professional-scope.middleware.ts bloquea los datos, pero igual
// mostraba la interfaz que el usuario pidió explícitamente que un
// médico NUNCA vea).
const PROFESSIONAL_TOKEN_KEY = 'medtravel_professional_token';

/**
 * Alta pública de médico/institución — llega acá desde el link de
 * "Reclamar esta nota" en la página de share público (claimToken en la
 * query string), o directamente si alguien quiere registrarse sin
 * haber dejado una nota antes. Nunca requiere sesión previa (por
 * definición, un profesional nuevo no tiene cuenta todavía) — usa
 * publicApiClient, no apiClient.
 */
/** preferred_lang es un CHAR(5) libre en core.users, no un FK a catálogo — alcanza con las opciones más comunes acá. */
const LANGUAGE_OPTIONS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
];

export function ProfessionalRegistrationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const claimToken = searchParams.get('claimToken');
  // Pedido explícito del usuario: no volver a pedir lo que el médico ya
  // tipeó en "Dejar nota de la atención" — public-share.page.tsx manda
  // estos mismos datos como query params al tocar "Registrarme".
  const prefillName = searchParams.get('name') ?? '';
  const prefillEmail = searchParams.get('email') ?? '';
  const prefillSpecialty = searchParams.get('specialty') ?? '';
  const prefillInstitution = searchParams.get('institution') ?? '';
  const [prefillFirstName, ...prefillLastNameParts] = prefillName.trim().split(/\s+/);

  const [firstName, setFirstName] = useState(prefillName ? prefillFirstName : '');
  const [lastName, setLastName] = useState(prefillLastNameParts.join(' '));
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [docTypeId, setDocTypeId] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [countryId, setCountryId] = useState('');
  const [genderId, setGenderId] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [city, setCity] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [institution, setInstitution] = useState(prefillInstitution);
  const [isInstitution, setIsInstitution] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredLang, setPreferredLang] = useState('es');
  const [claimResult, setClaimResult] = useState<{ certified: boolean } | null>(null);

  const docTypeCatalog = useCatalog('DOCUMENT_TYPE');
  const countryCatalog = useCatalog('COUNTRY');
  const genderCatalog = useCatalog('GENDER');
  const specialtyCatalog = useCatalog('MEDICAL_SPECIALTY');

  // La especialidad que el médico tipeó en la nota es texto libre — acá
  // se intenta matchear contra el catálogo (best-effort, una sola vez
  // que carga, sin distinguir acentos porque nadie tipea tildes en un
  // campo libre de forma consistente); si no matchea nada, el select
  // queda vacío pero el resto de lo precargado (nombre/email/
  // institución) sigue sirviendo igual.
  useEffect(() => {
    if (!prefillSpecialty || specialtyId || !specialtyCatalog.data) return;
    const strip = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const normalized = strip(prefillSpecialty);
    const match = specialtyCatalog.data.find((s) => {
      const label = strip(s.labelEs);
      return label === normalized || label.includes(normalized) || normalized.includes(label);
    });
    if (match) setSpecialtyId(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialtyCatalog.data]);

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
        specialtyId: specialtyId || undefined,
        phone: phone || undefined,
        preferredLang,
      });

      const { data: loginData } = await publicApiClient.post('/auth/login', {
        email,
        password,
      });
      sessionStorage.setItem(PROFESSIONAL_TOKEN_KEY, loginData.accessToken);

      if (claimToken) {
        const { data: claimData } = await publicApiClient.post(
          '/clinical/professionals-registration/claim-note',
          { claimToken },
          { headers: { Authorization: `Bearer ${loginData.accessToken}` } },
        );
        setClaimResult({ certified: claimData.certified });
      } else {
        navigate('/professional-portal');
      }
    },
  });

  if (claimResult) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Alert severity="success" sx={{ mb: 2 }}>
          Cuenta creada y nota reclamada correctamente.{' '}
          {claimResult.certified
            ? 'Como tu identidad ya está verificada, quedó certificada directamente en el Historial de Salud.'
            : 'Quedó pendiente de confirmación del viajero (nivel de confianza todavía no verificado).'}
        </Alert>
        <Button variant="contained" onClick={() => navigate('/professional-portal')}>
          Ver mis atenciones
        </Button>
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
          {apiErrorMessage(
            registerMutation.error,
            'No se pudo completar el registro. Verificá los datos (puede que el email o documento ya estén registrados).',
          )}
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
          <TextField
            label="Contraseña"
            type="password"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={password.length > 0 && password.length < 8}
            helperText={
              password.length > 0 && password.length < 8
                ? `Le faltan ${8 - password.length} caracteres`
                : 'Mínimo 8 caracteres'
            }
          />
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
        <Grid size={{ xs: 6 }}>
          <TextField select label="Especialidad (opcional)" fullWidth margin="normal" value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
            {(specialtyCatalog.data ?? []).map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.labelEs}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <TextField select label="Idioma" fullWidth margin="normal" value={preferredLang} onChange={(e) => setPreferredLang(e.target.value)}>
            {LANGUAGE_OPTIONS.map((o) => (
              <MenuItem key={o.code} value={o.code}>{o.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField label="Celular (opcional)" fullWidth margin="normal" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
            !firstName || !lastName || !email || password.length < 8 || !docTypeId || !docNumber || !countryId ||
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
