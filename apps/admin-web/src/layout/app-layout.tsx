import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Toolbar,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import ShieldIcon from '@mui/icons-material/Shield';
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
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';

import { useAuth } from '../auth/auth-context';
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
  { label: 'Usuarios / viajeros', path: '/travelers', icon: <PeopleIcon /> },
  { label: 'Coberturas', path: '/coverages', icon: <ShieldIcon /> },
  { label: 'Pólizas', path: '/partner-records', icon: <AssignmentIcon /> },
  { label: 'Planes de asistencia', path: '/assistance-plans', icon: <CardMembershipIcon /> },
  { label: 'Viajes', path: '/trips', icon: <FlightIcon /> },
  { label: 'Casos de asistencia', path: '/cases', icon: <EmergencyIcon /> },
  { label: 'Centros médicos', path: '/medical-centers', icon: <LocalHospitalIcon /> },
  { label: 'Profesionales', path: '/professionals', icon: <BadgeIcon /> },
  { label: 'Auditoría de accesos', path: '/audit', icon: <HistoryIcon /> },
];

export function AppLayout() {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  const { logout, claims } = useAuth();

  const showAdminSection = claims?.canManageConfig || claims?.canManageOperators;

  const drawerContent = (
    <List>
      {NAV_ITEMS.map((item) => (
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
          <ListSubheader>Administración</ListSubheader>
          {claims?.canManageConfig && (
            <ListItemButton
              component={RouterLink}
              to="/tenants"
              selected={location.pathname === '/tenants'}
            >
              <ListItemIcon>
                <BusinessIcon />
              </ListItemIcon>
              <ListItemText primary="Empresas" />
            </ListItemButton>
          )}
          {claims?.canManageOperators && (
            <ListItemButton
              component={RouterLink}
              to="/operators"
              selected={location.pathname === '/operators'}
            >
              <ListItemIcon>
                <SupervisorAccountIcon />
              </ListItemIcon>
              <ListItemText primary="Operadores" />
            </ListItemButton>
          )}
          {claims?.canManageConfig && (
            <ListItemButton
              component={RouterLink}
              to="/catalogs-admin"
              selected={location.pathname === '/catalogs-admin'}
            >
              <ListItemIcon>
                <TuneIcon />
              </ListItemIcon>
              <ListItemText primary="Catálogos / Parámetros" />
            </ListItemButton>
          )}
          {claims?.canManageConfig && (
            <ListItemButton
              component={RouterLink}
              to="/ai-consumption"
              selected={location.pathname === '/ai-consumption'}
            >
              <ListItemIcon>
                <SmartToyIcon />
              </ListItemIcon>
              <ListItemText primary="Consumo de IA" />
            </ListItemButton>
          )}
          {claims?.canManageConfig && (
            <ListItemButton
              component={RouterLink}
              to="/smtp-settings"
              selected={location.pathname === '/smtp-settings'}
            >
              <ListItemIcon>
                <MailOutlineIcon />
              </ListItemIcon>
              <ListItemText primary="Correo (SMTP)" />
            </ListItemButton>
          )}
          {claims?.canManageConfig && (
            <ListItemButton
              component={RouterLink}
              to="/travelers-without-coverage"
              selected={location.pathname === '/travelers-without-coverage'}
            >
              <ListItemIcon>
                <PersonOffIcon />
              </ListItemIcon>
              <ListItemText primary="Usuarios sin cobertura" />
            </ListItemButton>
          )}
          {claims?.canManageConfig && (
            <ListItemButton
              component={RouterLink}
              to="/healthcare-providers"
              selected={location.pathname === '/healthcare-providers'}
            >
              <ListItemIcon>
                <LocalPharmacyIcon />
              </ListItemIcon>
              <ListItemText primary="Prestadores (prepagas)" />
            </ListItemButton>
          )}
          {claims?.canManageConfig && (
            <ListItemButton
              component={RouterLink}
              to="/healthcare-social-security"
              selected={location.pathname === '/healthcare-social-security'}
            >
              <ListItemIcon>
                <VolunteerActivismIcon />
              </ListItemIcon>
              <ListItemText primary="Obras sociales" />
            </ListItemButton>
          )}
          {claims?.canManageConfig && (
            <ListItemButton
              component={RouterLink}
              to="/test-consents"
              selected={location.pathname === '/test-consents'}
            >
              <ListItemIcon>
                <WarningIcon color="warning" />
              </ListItemIcon>
              <ListItemText primary="Consentimientos (pruebas)" />
            </ListItemButton>
          )}
        </>
      )}

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
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setOpen(!open)}
          >
            <MenuIcon />
          </IconButton>
          {claims?.email && (
            <Box sx={{ fontSize: 14, opacity: 0.9 }}>{claims.email}</Box>
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
        <Outlet />
      </Box>
    </Box>
  );
}
