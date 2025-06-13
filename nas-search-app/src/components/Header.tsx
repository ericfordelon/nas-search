'use client';

import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SearchIcon from '@mui/icons-material/Search';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import BarChartIcon from '@mui/icons-material/BarChart';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

function Header() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          NAS Search
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            color="inherit" 
            component={Link} 
            href="/search"
            startIcon={<SearchIcon />}
            variant={isActive('/search') || isActive('/') ? 'outlined' : 'text'}
          >
            Search
          </Button>
          <Button 
            color="inherit" 
            component={Link} 
            href="/browse"
            startIcon={<PhotoLibraryIcon />}
            variant={isActive('/browse') ? 'outlined' : 'text'}
          >
            Browse
          </Button>
          <Button 
            color="inherit" 
            component={Link} 
            href="/stats"
            startIcon={<BarChartIcon />}
            variant={isActive('/stats') ? 'outlined' : 'text'}
          >
            Stats
          </Button>
          <Button 
            color="inherit" 
            component={Link} 
            href="/admin"
            startIcon={<AdminPanelSettingsIcon />}
            variant={isActive('/admin') ? 'outlined' : 'text'}
          >
            Admin
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;