import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  TextField,
  Typography,
} from '@mui/material';

import { publicApiClient } from '../../lib/public-api-client';
import { SharedProfileView, type SharedProfileData } from '../../components/shared-profile-view';
import { ShareWindowHeader } from '../../components/share-window-header';

interface SharePayload extends SharedProfileData {
  expiresAt: string;
  canSubmitNote: boolean;
  language?: string;
}

/**
 * Mismo bug que shared-profile-view.tsx: el título/aviso de arriba de
 * la ficha compartida estaban fijos en español, sin importar el
 * idioma elegido al generar el link. Bug real reportado en vivo:
 * "el boton no lo traducio" — el formulario de "Dejar nota de la
 * atención" (que había quedado deliberadamente afuera del primer
 * arreglo, pensando que era secundario) también tiene que respetar el
 * idioma, porque es lo primero que ve el médico después de leer la
 * ficha.
 */
const BANNER_STRINGS: Record<string, { title: string; expiresNotice: (date: string) => string; invalidLink: string }> = {
  es: {
    title: 'Historial de Salud compartido',
    expiresNotice: (date) => `Este link vence el ${date}. Toda visualización queda registrada.`,
    invalidLink: 'Este link no es válido o ya venció. Pedile al viajero que te comparta uno nuevo desde la app.',
  },
  en: {
    title: 'Shared Health Record',
    expiresNotice: (date) => `This link expires on ${date}. Every view is logged.`,
    invalidLink: 'This link is invalid or has expired. Ask the traveler to share a new one from the app.',
  },
  pt: {
    title: 'Histórico de Saúde compartilhado',
    expiresNotice: (date) => `Este link expira em ${date}. Toda visualização fica registrada.`,
    invalidLink: 'Este link é inválido ou já expirou. Peça ao viajante para compartilhar um novo pelo aplicativo.',
  },
  fr: {
    title: 'Dossier de santé partagé',
    expiresNotice: (date) => `Ce lien expire le ${date}. Chaque consultation est enregistrée.`,
    invalidLink: "Ce lien n'est pas valide ou a expiré. Demandez au voyageur de vous en partager un nouveau depuis l'application.",
  },
};

const NOTE_STRINGS: Record<string, Record<string, string>> = {
  es: {
    leaveNote: 'Dejar nota de la atención',
    name: 'Tu nombre',
    email: 'Email (opcional)',
    specialty: 'Especialidad (opcional)',
    institution: 'Institución (opcional)',
    recommendations: 'Recomendaciones',
    treatment: 'Tratamiento',
    notes: 'Notas',
    cancel: 'Cancelar',
    save: 'Guardar nota',
    saveError: 'No se pudo guardar la nota.',
    savedPendingLogin: 'Nota guardada. Para que quede asociada a tu nombre en el Historial de Salud, iniciá sesión o registrate.',
    haveAccount: 'Ya tengo cuenta',
    register: 'Registrarme',
    loginEmail: 'Email',
    loginPassword: 'Contraseña',
    loginAndClaim: 'Ingresar y reclamar nota',
    forgotPassword: '¿Olvidaste tu contraseña?',
    loginError: 'Email o contraseña incorrectos.',
    claimed: 'Nota reclamada correctamente.',
    claimedCertified: 'Como tu identidad ya está verificada, quedó certificada directamente en el Historial de Salud.',
    claimedPending: 'Quedó pendiente de confirmación del viajero (nivel de confianza todavía no verificado).',
  },
  en: {
    leaveNote: 'Leave a visit note',
    name: 'Your name',
    email: 'Email (optional)',
    specialty: 'Specialty (optional)',
    institution: 'Institution (optional)',
    recommendations: 'Recommendations',
    treatment: 'Treatment',
    notes: 'Notes',
    cancel: 'Cancel',
    save: 'Save note',
    saveError: 'Could not save the note.',
    savedPendingLogin: 'Note saved. To have it linked to your name in the Health Record, log in or register.',
    haveAccount: 'I already have an account',
    register: 'Register',
    loginEmail: 'Email',
    loginPassword: 'Password',
    loginAndClaim: 'Log in and claim note',
    forgotPassword: 'Forgot your password?',
    loginError: 'Incorrect email or password.',
    claimed: 'Note claimed successfully.',
    claimedCertified: 'Since your identity is already verified, it was certified directly in the Health Record.',
    claimedPending: "Pending the traveler's confirmation (trust level not yet verified).",
  },
  pt: {
    leaveNote: 'Deixar nota do atendimento',
    name: 'Seu nome',
    email: 'Email (opcional)',
    specialty: 'Especialidade (opcional)',
    institution: 'Instituição (opcional)',
    recommendations: 'Recomendações',
    treatment: 'Tratamento',
    notes: 'Notas',
    cancel: 'Cancelar',
    save: 'Salvar nota',
    saveError: 'Não foi possível salvar a nota.',
    savedPendingLogin: 'Nota salva. Para que fique associada ao seu nome no Histórico de Saúde, faça login ou registre-se.',
    haveAccount: 'Já tenho conta',
    register: 'Registrar-me',
    loginEmail: 'Email',
    loginPassword: 'Senha',
    loginAndClaim: 'Entrar e reivindicar nota',
    forgotPassword: 'Esqueceu sua senha?',
    loginError: 'Email ou senha incorretos.',
    claimed: 'Nota reivindicada com sucesso.',
    claimedCertified: 'Como sua identidade já está verificada, ficou certificada diretamente no Histórico de Saúde.',
    claimedPending: 'Ficou pendente de confirmação do viajante (nível de confiança ainda não verificado).',
  },
  fr: {
    leaveNote: 'Laisser une note de consultation',
    name: 'Votre nom',
    email: 'Email (facultatif)',
    specialty: 'Spécialité (facultatif)',
    institution: 'Institution (facultatif)',
    recommendations: 'Recommandations',
    treatment: 'Traitement',
    notes: 'Notes',
    cancel: 'Annuler',
    save: 'Enregistrer la note',
    saveError: "Impossible d'enregistrer la note.",
    savedPendingLogin: 'Note enregistrée. Pour l\'associer à votre nom dans le dossier de santé, connectez-vous ou inscrivez-vous.',
    haveAccount: "J'ai déjà un compte",
    register: "S'inscrire",
    loginEmail: 'Email',
    loginPassword: 'Mot de passe',
    loginAndClaim: 'Se connecter et associer la note',
    forgotPassword: 'Mot de passe oublié ?',
    loginError: 'Email ou mot de passe incorrect.',
    claimed: 'Note associée avec succès.',
    claimedCertified: 'Comme votre identité est déjà vérifiée, elle a été certifiée directement dans le dossier de santé.',
    claimedPending: "En attente de la confirmation du voyageur (niveau de confiance pas encore vérifié).",
  },
};

/**
 * Portal público — a esto llega el médico/institución escaneando el QR
 * o abriendo el link que le compartió el viajero desde la app. Sin
 * cuenta, sin login: usa publicApiClient (nunca apiClient, ver
 * public-api-client.ts) para que un 401/404 legítimo del backend no
 * dispare el interceptor de refresh/redirect a /login.
 */
export function PublicSharePage() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const [noteOpen, setNoteOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [claimedResult, setClaimedResult] = useState<{ certified: boolean } | null>(null);
  const [accessorName, setAccessorName] = useState('');
  const [accessorEmail, setAccessorEmail] = useState('');
  const [accessorSpecialty, setAccessorSpecialty] = useState('');
  const [accessorInstitution, setAccessorInstitution] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [treatment, setTreatment] = useState('');
  const [notes, setNotes] = useState('');
  const [claimToken, setClaimToken] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['public-share', token],
    queryFn: async () => {
      const { data } = await publicApiClient.get<SharePayload>(`/public/shares/${token}`);
      return data;
    },
    retry: false,
  });

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data?.person?.photoPath || !token) {
      setPhotoUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    publicApiClient
      .get(`/public/shares/${token}/photo`, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        setPhotoUrl(objectUrl);
      })
      .catch(() => setPhotoUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, query.data?.person?.photoPath]);

  const submitNote = useMutation({
    mutationFn: async () => {
      const { data } = await publicApiClient.post(`/public/shares/${token}/notes`, {
        accessorName,
        accessorEmail: accessorEmail || undefined,
        accessorSpecialty: accessorSpecialty || undefined,
        accessorInstitution: accessorInstitution || undefined,
        recommendations: recommendations || undefined,
        treatment: treatment || undefined,
        notes: notes || undefined,
      });
      return data as { id: string; claimToken: string };
    },
    onSuccess: (data) => {
      setClaimToken(data.claimToken);
      setNoteOpen(false);
    },
  });

  const loginAndClaim = useMutation({
    mutationFn: async () => {
      const { data: loginData } = await publicApiClient.post('/auth/login', {
        email: loginEmail,
        password: loginPassword,
      });
      const { data: claimData } = await publicApiClient.post(
        '/clinical/professionals-registration/claim-note',
        { claimToken },
        { headers: { Authorization: `Bearer ${loginData.accessToken}` } },
      );
      return { certified: claimData.certified as boolean };
    },
    onSuccess: (data) => {
      setClaimedResult(data);
      setLoginOpen(false);
    },
  });

  if (query.isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <ShareWindowHeader />
        <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
          <CircularProgress />
        </Container>
      </Box>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <ShareWindowHeader />
        <Container maxWidth="sm">
          <Alert severity="error">{BANNER_STRINGS.es.invalidLink}</Alert>
        </Container>
      </Box>
    );
  }

  const lang = query.data.language ?? 'es';
  const banner = BANNER_STRINGS[lang] ?? BANNER_STRINGS.es;
  const n = (key: string) => NOTE_STRINGS[lang]?.[key] ?? NOTE_STRINGS.es[key];
  const dateLocale = { es: 'es-AR', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR' }[lang] ?? 'es-AR';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <ShareWindowHeader />
      <Container maxWidth="md" sx={{ pb: 6, px: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" gutterBottom>
        {banner.title}
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        {banner.expiresNotice(new Date(query.data.expiresAt).toLocaleString(dateLocale))}
      </Alert>

      <SharedProfileView data={query.data} photoUrl={photoUrl} language={query.data.language} />

      {query.data.canSubmitNote && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            {claimedResult ? (
              <Alert severity="success">
                {n('claimed')}{' '}
                {claimedResult.certified ? n('claimedCertified') : n('claimedPending')}
              </Alert>
            ) : claimToken ? (
              <Box>
                <Alert severity="success" sx={{ mb: 2 }}>
                  {n('savedPendingLogin')}
                </Alert>
                {loginAndClaim.isError && (
                  <Alert severity="error" sx={{ mb: 2 }}>{n('loginError')}</Alert>
                )}
                {!loginOpen ? (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={() => setLoginOpen(true)}>
                      {n('haveAccount')}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        // Pedido explícito del usuario: no pedirle de nuevo
                        // lo que ya escribió en "Dejar nota de la atención"
                        // — professional-registration.page.tsx precarga
                        // estos mismos valores desde la query string.
                        const params = new URLSearchParams({ claimToken: claimToken! });
                        if (accessorName) params.set('name', accessorName);
                        if (accessorEmail) params.set('email', accessorEmail);
                        if (accessorSpecialty) params.set('specialty', accessorSpecialty);
                        if (accessorInstitution) params.set('institution', accessorInstitution);
                        navigate(`/professional-registration?${params.toString()}`);
                      }}
                    >
                      {n('register')}
                    </Button>
                  </Box>
                ) : (
                  <Box>
                    <TextField
                      label={n('loginEmail')}
                      type="email"
                      fullWidth
                      margin="normal"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                    <TextField
                      label={n('loginPassword')}
                      type="password"
                      fullWidth
                      margin="normal"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button onClick={() => setLoginOpen(false)}>{n('cancel')}</Button>
                      <Button
                        variant="contained"
                        disabled={!loginEmail || !loginPassword || loginAndClaim.isPending}
                        onClick={() => loginAndClaim.mutate()}
                      >
                        {n('loginAndClaim')}
                      </Button>
                      <Button
                        size="small"
                        component="a"
                        href="/forgot-password"
                        target="_blank"
                        rel="noopener"
                        sx={{ ml: 'auto' }}
                      >
                        {n('forgotPassword')}
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            ) : !noteOpen ? (
              <Button variant="contained" onClick={() => setNoteOpen(true)}>
                {n('leaveNote')}
              </Button>
            ) : (
              <Box>
                <Typography variant="subtitle1" gutterBottom>{n('leaveNote')}</Typography>
                {submitNote.isError && (
                  <Alert severity="error" sx={{ mb: 2 }}>{n('saveError')}</Alert>
                )}
                <TextField
                  label={n('name')}
                  fullWidth
                  margin="normal"
                  value={accessorName}
                  onChange={(e) => setAccessorName(e.target.value)}
                />
                <TextField
                  label={n('email')}
                  fullWidth
                  margin="normal"
                  value={accessorEmail}
                  onChange={(e) => setAccessorEmail(e.target.value)}
                />
                <TextField
                  label={n('specialty')}
                  fullWidth
                  margin="normal"
                  value={accessorSpecialty}
                  onChange={(e) => setAccessorSpecialty(e.target.value)}
                />
                <TextField
                  label={n('institution')}
                  fullWidth
                  margin="normal"
                  value={accessorInstitution}
                  onChange={(e) => setAccessorInstitution(e.target.value)}
                />
                <TextField
                  label={n('recommendations')}
                  fullWidth
                  multiline
                  minRows={2}
                  margin="normal"
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                />
                <TextField
                  label={n('treatment')}
                  fullWidth
                  multiline
                  minRows={2}
                  margin="normal"
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                />
                <TextField
                  label={n('notes')}
                  fullWidth
                  multiline
                  minRows={2}
                  margin="normal"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button onClick={() => setNoteOpen(false)}>{n('cancel')}</Button>
                  <Button
                    variant="contained"
                    disabled={!accessorName || submitNote.isPending}
                    onClick={() => submitNote.mutate()}
                  >
                    {n('save')}
                  </Button>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
      </Container>
    </Box>
  );
}
