import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';

import { apiClient } from '../../lib/api-client';

interface Member {
  id: string;
  personId: string;
  tenantId: string;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface ConsentPurpose {
  id: string;
  code: string;
  nameEs: string;
}

interface MemberDataConsent {
  id: string;
  memberId: string;
  tenantId: string;
  purposeId: string;
  granted: boolean;
  validUntil?: string;
}

/**
 * ⚠️ SOLO PARA PRUEBAS — VER TEMPORAL-test-consent-bypass.sql ⚠️
 *
 * Por diseño, solo el propio viajero puede otorgar su consentimiento
 * (core.member_data_consents_insert/update exigen person_id = quien
 * está logueado). Esta pantalla existe porque probar Coberturas o la
 * historia clínica fuera de un caso requeriría loguearse como cada
 * viajero de prueba una por una vía /me/* — esto lo acelera para un
 * superadmin, con un bypass temporal en la RLS documentado y reversible
 * en el mismo archivo SQL. Borrar esta pantalla (y revertir el bypass)
 * antes de producción.
 */
export function TestConsentsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ['identity', 'members'],
    queryFn: async () => {
      const { data } = await apiClient.get<Member[]>('/identity/members');
      return data;
    },
  });

  const tenantsQuery = useQuery({
    queryKey: ['identity', 'tenants'],
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant[]>('/identity/tenants');
      return data;
    },
  });

  const purposesQuery = useQuery({
    queryKey: ['params', 'consent-purposes'],
    queryFn: async () => {
      const { data } = await apiClient.get<ConsentPurpose[]>('/params/admin/consent-purposes');
      return data;
    },
  });

  const personQueries = useQueries({
    queries: (membersQuery.data ?? []).map((m) => ({
      queryKey: ['identity', 'persons', m.personId],
      queryFn: async () => {
        const { data } = await apiClient.get<Person>(`/identity/persons/${m.personId}`);
        return data;
      },
    })),
  });

  const personByMemberId = new Map(
    (membersQuery.data ?? []).map((m, i) => [m.id, personQueries[i]?.data]),
  );
  const tenantNameById = new Map((tenantsQuery.data ?? []).map((t) => [t.id, t.name]));

  const [selectedMemberId, setSelectedMemberId] = useState('');

  const consentsQuery = useQuery({
    queryKey: ['identity', 'member-data-consents', selectedMemberId],
    queryFn: async () => {
      const { data } = await apiClient.get<MemberDataConsent[]>(
        '/identity/member-data-consents',
        { params: { memberId: selectedMemberId } },
      );
      return data;
    },
    enabled: !!selectedMemberId,
  });

  const consentByPurposeId = new Map(
    (consentsQuery.data ?? []).map((c) => [c.purposeId, c]),
  );

  const toggleMutation = useMutation({
    mutationFn: async ({ purpose, grant }: { purpose: ConsentPurpose; grant: boolean }) => {
      const existing = consentByPurposeId.get(purpose.id);
      const selectedMember = membersQuery.data?.find((m) => m.id === selectedMemberId);
      if (existing) {
        await apiClient.patch(`/identity/member-data-consents/${existing.id}`, {
          granted: grant,
        });
      } else {
        await apiClient.post('/identity/member-data-consents', {
          memberId: selectedMemberId,
          tenantId: selectedMember?.tenantId,
          purposeId: purpose.id,
          granted: grant,
          grantedAt: new Date().toISOString(),
          consentTextVersion: 'TEST-1.0',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['identity', 'member-data-consents', selectedMemberId],
      });
      setError(null);
    },
    onError: () => setError('No se pudo actualizar el consentimiento.'),
  });

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <WarningIcon color="warning" />
        <Typography variant="h4">Consentimientos (solo pruebas)</Typography>
      </Box>
      <Alert severity="warning" sx={{ mb: 3 }}>
        Pantalla temporal para acelerar pruebas — le permite a un superadmin
        otorgar/revocar consentimiento en nombre de un viajero de prueba, algo
        que en producción solo puede hacer el propio viajero. Esto requiere un
        bypass de RLS documentado en <code>TEMPORAL-test-consent-bypass.sql</code>,
        que hay que revertir (y borrar esta pantalla) antes de ir a producción.
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TextField
        select
        label="Viajero de prueba"
        fullWidth
        sx={{ mb: 3, maxWidth: 400 }}
        value={selectedMemberId}
        onChange={(e) => setSelectedMemberId(e.target.value)}
      >
        {(membersQuery.data ?? []).map((m) => {
          const person = personByMemberId.get(m.id);
          const label = person ? `${person.firstName} ${person.lastName}` : m.id;
          return (
            <MenuItem key={m.id} value={m.id}>
              {label} — {tenantNameById.get(m.tenantId) ?? '—'}
            </MenuItem>
          );
        })}
      </TextField>

      {!selectedMemberId && (
        <Alert severity="info">Elegí un viajero para ver/editar sus consentimientos.</Alert>
      )}

      {selectedMemberId && (
        <>
          {(purposesQuery.isLoading || consentsQuery.isLoading) && <CircularProgress size={24} />}
          {purposesQuery.data && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Propósito</TableCell>
                    <TableCell>Código</TableCell>
                    <TableCell>Otorgado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {purposesQuery.data.map((p) => {
                    const consent = consentByPurposeId.get(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{p.nameEs}</TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" label={p.code} />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={!!consent?.granted}
                            disabled={toggleMutation.isPending}
                            onChange={(e) =>
                              toggleMutation.mutate({ purpose: p, grant: e.target.checked })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </>
  );
}
