import { Alert, Avatar, Box, Card, CardContent, Chip, Grid, Typography } from '@mui/material';

import { labelFor, useCatalog } from '../lib/catalog-hooks';

export interface SharedProfileData {
  person: {
    firstName: string;
    lastName: string;
    birthDate: string | null;
    genderId: string | null;
    countryResidenceId: string | null;
    photoPath: string | null;
  } | null;
  membership: Array<{
    tenantName: string | null;
    planName: string | null;
    policyNumber: string;
    validFrom: string;
    validUntil: string;
    statusAuthority: string;
  }>;
  allergies: Array<{
    allergenName: string;
    severity: string | null;
    severityId: string | null;
    reactionType: string | null;
  }>;
  conditions: Array<{
    conditionName: string;
    icd10Code: string | null;
    travelRestrictions: string | null;
    diagnosedAt: string | null;
    statusCode: string | null;
  }>;
  medications: Array<{
    genericName: string;
    brandName: string | null;
    doseAmount: string | null;
    startedAt: string | null;
  }>;
  surgeries: Array<{ procedureName: string; performedAt: string; indication: string | null }>;
  implants: Array<{ deviceName: string; implantedAt: string | null; notes: string | null }>;
  treatments: Array<{ treatmentName: string; statusCode: string | null; startedAt: string | null; notes: string | null }>;
  vitals: { weightKg: string | null; heightCm: string | null; bmi: string | null; bloodTypeId: string | null } | null;
  emergencyContacts: Array<{
    firstName: string;
    lastName: string;
    phone: string | null;
    relationship: string | null;
    relationshipId: string | null;
  }>;
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
 * Bug real reportado en vivo: el link de compartir se genera en el
 * idioma elegido (los NOMBRES de alergias/condiciones/medicamentos se
 * traducen una vez con IA al crearlo, ver MeSharesController), pero
 * esta vista tenía todos sus títulos/labels fijos en español, así que
 * la pantalla igual se veía "toda en español" — acá se resuelve con un
 * diccionario chico, no con IA (es texto de UI fijo, no contenido
 * clínico). label_pt/label_fr de los catálogos casi no tienen datos
 * cargados todavía, así que género/grupo sanguíneo en esos dos idiomas
 * cae de vuelta al español (ver labelFor en catalog-hooks.ts).
 */
type SupportedLanguage = 'es' | 'en' | 'pt' | 'fr';

const DATE_LOCALE: Record<SupportedLanguage, string> = {
  es: 'es-AR', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR',
};

const UI_STRINGS: Record<SupportedLanguage, Record<string, string>> = {
  es: {
    noData: 'Sin datos disponibles.',
    ageSuffix: 'años',
    ageUnknown: 'Edad no informada',
    bloodType: 'Grupo sanguíneo',
    weight: 'Peso',
    height: 'Altura',
    bmi: 'IMC',
    membershipTitle: 'Membresía de asistencia al viajero',
    noMembership: 'Sin cobertura de asistencia registrada.',
    unknownCompany: 'Empresa sin identificar',
    policy: 'Póliza',
    validity: 'Vigencia',
    to: 'al',
    statusPartnerApi: 'Validada por la empresa',
    statusLocalRecord: 'Registro local',
    statusMemberDeclared: 'Declarada por el viajero (sin validar)',
    allergiesTitle: 'Alergias',
    noAllergies: 'Sin alergias registradas.',
    chronicTitle: 'Enfermedades Crónicas',
    noChronic: 'Sin enfermedades crónicas registradas.',
    since: 'desde',
    conditionDate: 'Fecha',
    travelRestrictions: 'Restricciones de viaje',
    implantsTitle: 'Implantes y Dispositivos',
    noImplants: 'Sin implantes ni dispositivos registrados.',
    treatmentsTitle: 'Tratamientos',
    noTreatments: 'Sin tratamientos registrados.',
    treatmentSince: 'desde',
    medicationsTitle: 'Medicamentos actuales',
    noMedications: 'Sin medicamentos registrados.',
    surgeriesTitle: 'Cirugías',
    noSurgeries: 'Sin cirugías registradas.',
    conditionsTitle: 'Enfermedades',
    noConditions: 'Sin otras enfermedades registradas.',
    contactsTitle: 'Contactos de emergencia',
    noContacts: 'Sin contactos de emergencia registrados.',
  },
  en: {
    noData: 'No data available.',
    ageSuffix: 'years old',
    ageUnknown: 'Age not provided',
    bloodType: 'Blood type',
    weight: 'Weight',
    height: 'Height',
    bmi: 'BMI',
    membershipTitle: 'Travel assistance membership',
    noMembership: 'No assistance coverage on record.',
    unknownCompany: 'Unidentified company',
    policy: 'Policy',
    validity: 'Valid',
    to: 'to',
    statusPartnerApi: 'Verified by the company',
    statusLocalRecord: 'Local record',
    statusMemberDeclared: 'Self-reported by traveler (unverified)',
    allergiesTitle: 'Allergies',
    noAllergies: 'No allergies on record.',
    chronicTitle: 'Chronic Conditions',
    noChronic: 'No chronic conditions on record.',
    since: 'since',
    conditionDate: 'Date',
    travelRestrictions: 'Travel restrictions',
    implantsTitle: 'Implants and Devices',
    noImplants: 'No implants or devices on record.',
    treatmentsTitle: 'Treatments',
    noTreatments: 'No treatments on record.',
    treatmentSince: 'since',
    medicationsTitle: 'Current medications',
    noMedications: 'No medications on record.',
    surgeriesTitle: 'Surgeries',
    noSurgeries: 'No surgeries on record.',
    conditionsTitle: 'Conditions',
    noConditions: 'No other conditions on record.',
    contactsTitle: 'Emergency contacts',
    noContacts: 'No emergency contacts on record.',
  },
  pt: {
    noData: 'Sem dados disponíveis.',
    ageSuffix: 'anos',
    ageUnknown: 'Idade não informada',
    bloodType: 'Tipo sanguíneo',
    weight: 'Peso',
    height: 'Altura',
    bmi: 'IMC',
    membershipTitle: 'Associação de assistência ao viajante',
    noMembership: 'Sem cobertura de assistência registrada.',
    unknownCompany: 'Empresa não identificada',
    policy: 'Apólice',
    validity: 'Vigência',
    to: 'até',
    statusPartnerApi: 'Validada pela empresa',
    statusLocalRecord: 'Registro local',
    statusMemberDeclared: 'Declarada pelo viajante (não validada)',
    allergiesTitle: 'Alergias',
    noAllergies: 'Sem alergias registradas.',
    chronicTitle: 'Doenças Crônicas',
    noChronic: 'Sem doenças crônicas registradas.',
    since: 'desde',
    conditionDate: 'Data',
    travelRestrictions: 'Restrições de viagem',
    implantsTitle: 'Implantes e Dispositivos',
    noImplants: 'Sem implantes ou dispositivos registrados.',
    treatmentsTitle: 'Tratamentos',
    noTreatments: 'Sem tratamentos registrados.',
    treatmentSince: 'desde',
    medicationsTitle: 'Medicamentos atuais',
    noMedications: 'Sem medicamentos registrados.',
    surgeriesTitle: 'Cirurgias',
    noSurgeries: 'Sem cirurgias registradas.',
    conditionsTitle: 'Doenças',
    noConditions: 'Sem outras doenças registradas.',
    contactsTitle: 'Contatos de emergência',
    noContacts: 'Sem contatos de emergência registrados.',
  },
  fr: {
    noData: 'Aucune donnée disponible.',
    ageSuffix: 'ans',
    ageUnknown: 'Âge non renseigné',
    bloodType: 'Groupe sanguin',
    weight: 'Poids',
    height: 'Taille',
    bmi: 'IMC',
    membershipTitle: "Adhésion d'assistance voyage",
    noMembership: "Aucune couverture d'assistance enregistrée.",
    unknownCompany: 'Entreprise non identifiée',
    policy: 'Police',
    validity: 'Validité',
    to: 'au',
    statusPartnerApi: "Validée par l'entreprise",
    statusLocalRecord: 'Enregistrement local',
    statusMemberDeclared: 'Déclarée par le voyageur (non validée)',
    allergiesTitle: 'Allergies',
    noAllergies: 'Aucune allergie enregistrée.',
    chronicTitle: 'Maladies Chroniques',
    noChronic: 'Aucune maladie chronique enregistrée.',
    since: 'depuis',
    conditionDate: 'Date',
    travelRestrictions: 'Restrictions de voyage',
    implantsTitle: 'Implants et Dispositifs',
    noImplants: 'Aucun implant ni dispositif enregistré.',
    treatmentsTitle: 'Traitements',
    noTreatments: 'Aucun traitement enregistré.',
    treatmentSince: 'depuis',
    medicationsTitle: 'Médicaments actuels',
    noMedications: 'Aucun médicament enregistré.',
    surgeriesTitle: 'Chirurgies',
    noSurgeries: 'Aucune chirurgie enregistrée.',
    conditionsTitle: 'Maladies',
    noConditions: 'Aucune autre maladie enregistrée.',
    contactsTitle: "Contacts d'urgence",
    noContacts: "Aucun contact d'urgence enregistré.",
  },
};

const STATUS_AUTHORITY_KEY: Record<string, string> = {
  PARTNER_API: 'statusPartnerApi',
  LOCAL_RECORD: 'statusLocalRecord',
  MEMBER_DECLARED: 'statusMemberDeclared',
};

/**
 * Mismo componente de presentación para las DOS entradas de "compartir
 * historia clínica" (portal público /public/shares/:token y la
 * previsualización interna /share-preview/:personId) — el pedido
 * explícito del usuario fue que el operador vea "exactamente la misma
 * vista" que el médico, así que esto no se duplica entre las dos
 * páginas, solo cambia de dónde viene el fetch. `language` no se pasa
 * desde share-preview.page.tsx (queda 'es' por defecto ahí, que es lo
 * correcto para el operador) — solo public-share.page.tsx lo pasa,
 * tomado de la respuesta de /public/shares/:token.
 */
export function SharedProfileView({
  data,
  photoUrl,
  language = 'es',
}: {
  data: SharedProfileData;
  /** URL ya resuelta (objectURL de un fetch autenticado/con token) — este componente nunca decide de dónde sale, cada página lo trae con su propio cliente (JWT vs token público). */
  photoUrl?: string | null;
  language?: string;
}) {
  const lang: SupportedLanguage = (['es', 'en', 'pt', 'fr'] as const).includes(language as SupportedLanguage)
    ? (language as SupportedLanguage)
    : 'es';
  const t = (key: string) => UI_STRINGS[lang][key] ?? UI_STRINGS.es[key];
  const dateLocale = DATE_LOCALE[lang];

  const { person, membership, allergies, conditions, medications, surgeries, implants, treatments, vitals, emergencyContacts } = data;
  const genderCatalog = useCatalog('GENDER');
  const bloodTypeCatalog = useCatalog('BLOOD_TYPE');
  const severityCatalog = useCatalog('REACTION_SEVERITY');
  const relationshipCatalog = useCatalog('RELATIONSHIP_TYPE');

  if (!person) {
    return <Alert severity="warning">{t('noData')}</Alert>;
  }

  const age = calculateAge(person.birthDate);
  const chronicConditions = conditions.filter((c) => c.statusCode === 'CHRONIC');
  const otherConditions = conditions.filter((c) => c.statusCode !== 'CHRONIC');

  return (
    <Box>
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Avatar src={photoUrl ?? undefined} sx={{ width: 56, height: 56 }}>
            {person.firstName.charAt(0)}
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 200 }}>
            <Typography variant="h6">
              {person.firstName} {person.lastName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {age !== null ? `${age} ${t('ageSuffix')}` : t('ageUnknown')}
              {person.genderId ? ` · ${labelFor(genderCatalog.data, person.genderId, lang)}` : ''}
            </Typography>
          </Box>
          {/* Pedido explícito del usuario: grupo sanguíneo es de importancia en una urgencia — va destacado, arriba, no escondido en un historial de mediciones. */}
          {vitals?.bloodTypeId && (
            <Chip color="error" label={`${t('bloodType')}: ${labelFor(bloodTypeCatalog.data, vitals.bloodTypeId, lang)}`} />
          )}
          {vitals?.weightKg && <Chip variant="outlined" label={`${t('weight')}: ${vitals.weightKg} kg`} />}
          {vitals?.heightCm && <Chip variant="outlined" label={`${t('height')}: ${vitals.heightCm} cm`} />}
          {vitals?.bmi && <Chip variant="outlined" label={`${t('bmi')}: ${vitals.bmi}`} />}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('membershipTitle')}</Typography>
          {membership.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noMembership')}</Typography>
          ) : (
            membership.map((m, i) => (
              <Box key={i} sx={{ mb: i < membership.length - 1 ? 1.5 : 0 }}>
                <Typography variant="body2">
                  <strong>{m.tenantName ?? t('unknownCompany')}</strong>
                  {m.planName ? ` — ${m.planName}` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {t('policy')} {m.policyNumber} · {t('validity')} {new Date(m.validFrom).toLocaleDateString(dateLocale)} {t('to')}{' '}
                  {new Date(m.validUntil).toLocaleDateString(dateLocale)}
                  {' · '}
                  {t(STATUS_AUTHORITY_KEY[m.statusAuthority] ?? '') || m.statusAuthority}
                </Typography>
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('allergiesTitle')}</Typography>
          {allergies.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noAllergies')}</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {allergies.map((a, i) => (
                <Chip
                  key={i}
                  color={a.severity === 'SEVERE' || a.severity === 'CRITICAL' ? 'error' : 'default'}
                  label={`${a.allergenName}${a.severityId ? ` (${labelFor(severityCatalog.data, a.severityId, lang)})` : ''}`}
                />
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('chronicTitle')}</Typography>
          {chronicConditions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noChronic')}</Typography>
          ) : (
            chronicConditions.map((c, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <strong>{c.conditionName}</strong> {c.icd10Code ? `(${c.icd10Code})` : ''}
                  {c.diagnosedAt ? ` — ${t('conditionDate')}: ${new Date(c.diagnosedAt).toLocaleDateString(dateLocale, { timeZone: 'UTC' })}` : ''}
                </Typography>
                {c.travelRestrictions && (
                  <Typography variant="caption" color="error">{t('travelRestrictions')}: {c.travelRestrictions}</Typography>
                )}
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('implantsTitle')}</Typography>
          {implants.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noImplants')}</Typography>
          ) : (
            implants.map((d, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <strong>{d.deviceName}</strong>
                  {d.implantedAt ? ` — ${new Date(d.implantedAt).toLocaleDateString(dateLocale, { timeZone: 'UTC' })}` : ''}
                </Typography>
                {d.notes && (
                  <Typography variant="caption" color="text.secondary">{d.notes}</Typography>
                )}
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pedido explícito del usuario: diálisis/quimioterapia/etc. es
          un TRATAMIENTO, no una enfermedad — dato crítico para un
          médico de emergencia, tiene su propia sección igual que
          Implantes. */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('treatmentsTitle')}</Typography>
          {treatments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noTreatments')}</Typography>
          ) : (
            treatments.map((tr, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <strong>{tr.treatmentName}</strong>
                  {tr.startedAt ? ` — ${t('treatmentSince')} ${new Date(tr.startedAt).toLocaleDateString(dateLocale, { timeZone: 'UTC' })}` : ''}
                </Typography>
                {tr.notes && (
                  <Typography variant="caption" color="text.secondary">{tr.notes}</Typography>
                )}
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('medicationsTitle')}</Typography>
          {medications.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noMedications')}</Typography>
          ) : (
            <Grid container spacing={1}>
              {medications.map((m, i) => (
                <Grid key={i} size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2">
                    {m.genericName}{m.brandName ? ` (${m.brandName})` : ''}
                    {m.doseAmount ? ` — ${m.doseAmount}` : ''}
                    {m.startedAt ? ` · ${t('since')} ${new Date(m.startedAt).toLocaleDateString(dateLocale, { timeZone: 'UTC' })}` : ''}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('surgeriesTitle')}</Typography>
          {surgeries.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noSurgeries')}</Typography>
          ) : (
            surgeries.map((s, i) => (
              <Box key={i} sx={{ mb: i < surgeries.length - 1 ? 1 : 0 }}>
                <Typography variant="body2">
                  <strong>{s.procedureName}</strong> — {new Date(s.performedAt).toLocaleDateString(dateLocale, { timeZone: 'UTC' })}
                </Typography>
                {s.indication && (
                  <Typography variant="caption" color="text.secondary">{s.indication}</Typography>
                )}
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('conditionsTitle')}</Typography>
          {otherConditions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noConditions')}</Typography>
          ) : (
            otherConditions.map((c, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <strong>{c.conditionName}</strong> {c.icd10Code ? `(${c.icd10Code})` : ''}
                  {c.diagnosedAt ? ` — ${t('conditionDate')}: ${new Date(c.diagnosedAt).toLocaleDateString(dateLocale, { timeZone: 'UTC' })}` : ''}
                </Typography>
                {c.travelRestrictions && (
                  <Typography variant="caption" color="error">{t('travelRestrictions')}: {c.travelRestrictions}</Typography>
                )}
              </Box>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>{t('contactsTitle')}</Typography>
          {emergencyContacts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noContacts')}</Typography>
          ) : (
            emergencyContacts.map((c, i) => (
              <Typography key={i} variant="body2">
                {c.firstName} {c.lastName}{c.relationshipId ? ` (${labelFor(relationshipCatalog.data, c.relationshipId, lang)})` : ''}
                {c.phone ? ` — ${c.phone}` : ''}
              </Typography>
            ))
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
