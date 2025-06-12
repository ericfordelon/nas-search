import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import BarChartIcon from '@mui/icons-material/BarChart';

function Header() {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

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
            to="/search"
            startIcon={<SearchIcon />}
            variant={isActive('/search') || isActive('/') ? 'outlined' : 'text'}
          >
            Search
          </Button>
          <Button 
            color="inherit" 
            component={Link} 
            to="/browse"
            startIcon={<PhotoLibraryIcon />}
            variant={isActive('/browse') ? 'outlined' : 'text'}
          >
            Browse
          </Button>
          <Button 
            color="inherit" 
            component={Link} 
            to="/stats"
            startIcon={<BarChartIcon />}
            variant={isActive('/stats') ? 'outlined' : 'text'}
          >
            Stats
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;