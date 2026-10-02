import { useState, type ReactNode } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import FlightIcon from '@mui/icons-material/Flight';
import EmergencyIcon from '@mui/icons-material/LocalHospital';
import LocalHospitalIcon from '@mui/icons-material/MedicalServices';
import BadgeIcon from '@mui/icons-material/Badge';
import HistoryIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import TuneIcon from '@mui/icons-material/Tune';
import BusinessIcon from '@mui/icons-material/Business';
import MailOutlineIcon from '@mui/icons-material/Mail';
import WarningIcon from '@mui/icons-material/Warning';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import SettingsIcon from '@mui/icons-material/Settings';
import PsychologyIcon from '@mui/icons-material/Psychology';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import ScienceIcon from '@mui/icons-material/Science';
import MemoryIcon from '@mui/icons-material/Memory';
import HealingIcon from '@mui/icons-material/Healing';
import MedicationIcon from '@mui/icons-material/Medication';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import ChecklistIcon from '@mui/icons-material/Checklist';
import PublicIcon from '@mui/icons-material/Public';
import VaccinesIcon from '@mui/icons-material/Vaccines';

import { useAuth } from '../auth/auth-context';
import { PageTitleContext } from '../lib/page-title';
import logoHorizontal from '../assets/brand/logo-horizontal.png';

const DRAWER_WIDTH = 240;

/**
 * Las 8 secciones del Paso 3 del brief (login queda aparte, ya resuelto
 * por <ProtectedRoute>). Solo "Casos de asistencia" tiene datos reales
 * por ahora — el resto son pantallas placeholder, marcadas como
 * pendientes en la propia UI (ver *.page.tsx de cada una), no
 * fabricadas con datos falsos.
 */
const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Usuarios', path: '/travelers', icon: <PeopleIcon /> },
  // Pedido explícito del usuario: subir "Usuarios sin cobertura" para
  // que quede justo debajo de "Usuarios" — sigue gateado por
  // canManageConfig (cross-tenant por definición, ver
  // travelers-without-tenant.controller.ts), solo cambió de lugar.
  { label: 'Usuarios sin cobertura', path: '/travelers-without-coverage', icon: <PersonOffIcon />, requiresConfig: true },
  { label: 'Pólizas', path: '/partner-records', icon: <AssignmentIcon /> },
  { label: 'Viajes', path: '/trips', icon: <FlightIcon /> },
  { label: 'Casos de asistencia', path: '/cases', icon: <EmergencyIcon /> },
  { label: 'Centros médicos', path: '/medical-centers', icon: <LocalHospitalIcon /> },
  { label: 'Profesionales', path: '/professionals', icon: <BadgeIcon /> },
];

/** Pedido explícito del usuario: agrupar Catálogos/Parámetros, Correo SMTP, Parámetros de la App y Base de Conocimiento IA en un submenú "Configuración". */
const CONFIG_SECTION_ITEMS = [
  { label: 'Catálogos / Parámetros', path: '/catalogs-admin', icon: <TuneIcon /> },
  { label: 'Correo (SMTP)', path: '/smtp-settings', icon: <MailOutlineIcon /> },
  { label: 'Parámetros de la app', path: '/app-settings', icon: <SettingsIcon /> },
  { label: 'Base de conocimiento (IA)', path: '/knowledge-base', icon: <PsychologyIcon /> },
];

/** Pedido explícito del usuario: agrupar Auditoría de accesos y Consumo de IA en un submenú "Auditoría". */
const AUDIT_SECTION_ITEMS = [
  { label: 'Auditoría de accesos', path: '/audit', icon: <HistoryIcon /> },
  { label: 'Consumo de IA', path: '/ai-consumption', icon: <SmartToyIcon />, requiresConfig: true },
];

/**
 * Pedido explícito del usuario: acceso rápido a los catálogos que se
 * actualizan seguido (Enfermedades, Estudios, Tipos de Implantes,
 * Cirugías) sin tener que entrar a Catálogos/Parámetros y buscar el
 * dominio en el selector — cada link deep-linkea a esa misma pantalla
 * con ?domain= precargado (el path completo, con query, es lo que
 * NavSection compara contra location.pathname + location.search).
 */
const SYSTEM_TABLES_ITEMS = [
  { label: 'Enfermedades', path: '/catalogs-admin?domain=CONDITION_CATALOG', icon: <MonitorHeartIcon /> },
  { label: 'Medicamentos', path: '/catalogs-admin?domain=MEDICATION', icon: <MedicationIcon /> },
  { label: 'Alérgenos', path: '/catalogs-admin?domain=ALLERGEN', icon: <ReportProblemIcon /> },
  { label: 'Indicadores de estudios', path: '/catalogs-admin?domain=LAB_INDICATOR', icon: <ScienceIcon /> },
  { label: 'Tipos de implantes', path: '/catalogs-admin?domain=IMPLANT_TYPE', icon: <MemoryIcon /> },
  { label: 'Cirugías', path: '/catalogs-admin?domain=SURGERY_CATALOG', icon: <HealingIcon /> },
  { label: 'Tipos de tratamiento', path: '/catalogs-admin?domain=TREATMENT_TYPE', icon: <VaccinesIcon /> },
];

/** Pedido explícito del usuario: mismo criterio colapsable que Configuración/Auditoría. */
const ADMIN_SECTION_ITEMS = [
  { label: 'Empresas', path: '/tenants', icon: <BusinessIcon />, requiresConfig: true },
  { label: 'Planes de asistencia', path: '/assistance-plans', icon: <CardMembershipIcon />, requiresConfig: true },
  { label: 'Operadores', path: '/operators', icon: <SupervisorAccountIcon />, requiresOperators: true },
  { label: 'Preguntas del asistente (Estructurado)', path: '/interview-questions', icon: <ChecklistIcon />, requiresConfig: true },
  { label: 'Info de destinos (salud/seguridad)', path: '/destination-health-info', icon: <PublicIcon />, requiresConfig: true },
  { label: 'Prestadores (prepagas)', path: '/healthcare-providers', icon: <LocalPharmacyIcon />, requiresConfig: true },
  { label: 'Obras sociales', path: '/healthcare-social-security', icon: <VolunteerActivismIcon />, requiresConfig: true },
  { label: 'Consentimientos (pruebas)', path: '/test-consents', icon: <WarningIcon color="warning" />, requiresConfig: true },
];

interface NavSectionItem {
  label: string;
  path: string;
  icon: ReactNode;
  requiresConfig?: boolean;
  requiresOperators?: boolean;
}

/**
 * Submenú colapsable — arranca abierto si la ruta activa es una de sus
 * hijas (para no esconder dónde estás parado), cerrado en cualquier
 * otro caso. `currentPath` se compara contra pathname+search para que
 * los links con query string (Tablas Sistema) también puedan marcarse
 * como seleccionados.
 */
function NavSection({
  label,
  icon,
  items,
  currentPath,
  canManageConfig,
  canManageOperators,
}: {
  label: string;
  icon: ReactNode;
  items: NavSectionItem[];
  currentPath: string;
  canManageConfig: boolean | undefined;
  canManageOperators: boolean | undefined;
}) {
  const visibleItems = items.filter(
    (item) => (!item.requiresConfig || canManageConfig) && (!item.requiresOperators || canManageOperators),
  );
  const [open, setOpen] = useState(() => visibleItems.some((item) => item.path === currentPath));

  if (visibleItems.length === 0) return null;

  return (
    <>
      <ListItemButton onClick={() => setOpen((v) => !v)}>
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText primary={label} />
        {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {visibleItems.map((item) => (
            <ListItemButton
              key={item.path}
              component={RouterLink}
              to={item.path}
              selected={currentPath === item.path}
              sx={{ pl: 4 }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Collapse>
    </>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(true);
  const [pageTitle, setPageTitle] = useState<ReactNode>(null);
  const location = useLocation();
  const { logout, claims } = useAuth();

  const showAdminSection = claims?.canManageConfig || claims?.canManageOperators;
  // NavSection compara path completo (con query) para que Tablas
  // Sistema (?domain=...) también pueda marcarse como seleccionado.
  const fullPath = location.pathname + location.search;

  const drawerContent = (
    <List>
      {NAV_ITEMS.filter((item) => !item.requiresConfig || claims?.canManageConfig).map((item) => (
        <ListItemButton
          key={item.path}
          component={RouterLink}
          to={item.path}
          selected={location.pathname === item.path}
        >
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} />
        </ListItemButton>
      ))}

      {showAdminSection && (
        <>
          <Divider sx={{ my: 1 }} />
          <NavSection
            label="Tablas Sistema"
            icon={<TuneIcon />}
            items={SYSTEM_TABLES_ITEMS}
            currentPath={fullPath}
            canManageConfig={claims?.canManageConfig}
            canManageOperators={claims?.canManageOperators}
          />
          <NavSection
            label="Administración"
            icon={<BusinessIcon />}
            items={ADMIN_SECTION_ITEMS}
            currentPath={fullPath}
            canManageConfig={claims?.canManageConfig}
            canManageOperators={claims?.canManageOperators}
          />
        </>
      )}

      <Divider sx={{ my: 1 }} />
      <NavSection
        label="Configuración"
        icon={<SettingsIcon />}
        items={CONFIG_SECTION_ITEMS}
        currentPath={fullPath}
        canManageConfig={claims?.canManageConfig}
        canManageOperators={claims?.canManageOperators}
      />
      <NavSection
        label="Auditoría"
        icon={<HistoryIcon />}
        items={AUDIT_SECTION_ITEMS}
        currentPath={fullPath}
        canManageConfig={claims?.canManageConfig}
        canManageOperators={claims?.canManageOperators}
      />

      <Divider sx={{ my: 1 }} />
      <ListItemButton onClick={() => logout()}>
        <ListItemIcon>
          <LogoutIcon />
        </ListItemIcon>
        <ListItemText primary="Cerrar sesión" />
      </ListItemButton>
    </List>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          transition: (theme) =>
            theme.transitions.create(['width', 'margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          ...(open && {
            width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
            marginLeft: { sm: `${DRAWER_WIDTH}px` },
            transition: (theme) =>
              theme.transitions.create(['width', 'margin'], {
                easing: theme.transitions.easing.easeOut,
                duration: theme.transitions.duration.enteringScreen,
              }),
          }),
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setOpen(!open)}
            >
              <MenuIcon />
            </IconButton>
            {pageTitle && (
              <Typography
                variant="h6"
                component="h1"
                noWrap
                sx={{ color: '#fff', fontWeight: 500 }}
              >
                {pageTitle}
              </Typography>
            )}
          </Box>
          {claims?.email && (
            <Box sx={{ fontSize: 14, opacity: 0.9, flexShrink: 0 }}>{claims.email}</Box>
          )}
        </Toolbar>
      </AppBar>

      <Drawer
        variant="persistent"
        anchor="left"
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          width: open ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          transition: (theme) => theme.transitions.create('width'),
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box component="img" src={logoHorizontal} alt="MedTravelApp" sx={{ height: 36, maxWidth: '85%' }} />
        </Toolbar>
        <Divider />
        {drawerContent}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          minWidth: 0,
          transition: (theme) => theme.transitions.create('margin'),
        }}
      >
        <Toolbar />
        <PageTitleContext.Provider value={setPageTitle}>
          <Outlet />
        </PageTitleContext.Provider>
      </Box>
    </Box>
  );
}
