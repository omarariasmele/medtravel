import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
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

import { useAuth } from '../auth/auth-context';

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
  { label: 'Viajes', path: '/trips', icon: <FlightIcon /> },
  { label: 'Casos de asistencia', path: '/cases', icon: <EmergencyIcon /> },
  { label: 'Centros médicos', path: '/medical-centers', icon: <LocalHospitalIcon /> },
  { label: 'Profesionales', path: '/professionals', icon: <BadgeIcon /> },
  { label: 'Auditoría de accesos', path: '/audit', icon: <HistoryIcon /> },
];

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { logout } = useAuth();

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
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            MedTravelApp — Panel de operadores
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH },
        }}
      >
        <Toolbar />
        {drawerContent}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
        open
      >
        <Toolbar />
        {drawerContent}
      </Drawer>

      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` } }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
