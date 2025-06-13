'use client';

import React, { useState, useEffect } from 'react';
import {
  Paper,
  InputBase,
  IconButton,
  Box,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';

interface Filters {
  file_type: string;
  content_type: string;
  camera_make: string;
  date_from: string;
  date_to: string;
  sort: string;
  [key: string]: string;
}

interface SearchBarProps {
  onSearch: (query: string) => void;
  onFiltersChange: (filters: Filters) => void;
  initialQuery?: string;
  initialFilters?: Partial<Filters>;
}

function SearchBar({ onSearch, onFiltersChange, initialQuery = '', initialFilters = {} }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    file_type: '',
    content_type: '',
    camera_make: '',
    date_from: '',
    date_to: '',
    sort: 'created_date desc',
    ...initialFilters
  });

  // Sync with parent filters when they change (e.g., from facet clicks)
  useEffect(() => {
    setFilters(prev => {
      const merged: Filters = { ...prev };
      // Merge initialFilters while ensuring all values are strings
      Object.entries(initialFilters).forEach(([key, value]) => {
        merged[key as keyof Filters] = value || '';
      });
      return merged;
    });
  }, [initialFilters]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    onSearch(query);
  };

  const handleFilterChange = (field: string, value: string) => {
    const newFilters = {
      ...filters,
      [field]: value
    };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const clearedFilters: Filters = {
      file_type: '',
      content_type: '',
      camera_make: '',
      date_from: '',
      date_to: '',
      sort: 'created_date desc'
    };
    setFilters(clearedFilters);
    onFiltersChange(clearedFilters);
  };

  const activeFilterCount = Object.values(filters).filter(v => v && v !== 'created_date desc').length;

  return (
    <Box sx={{ mb: 3 }}>
      <Paper
        component="form"
        onSubmit={handleSearch}
        sx={{
          p: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          mb: 2
        }}
      >
        <InputBase
          sx={{ ml: 1, flex: 1 }}
          placeholder="Search files, photos, videos, documents..."
          inputProps={{ 'aria-label': 'search files' }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <IconButton 
          type="button" 
          sx={{ p: '10px' }} 
          aria-label="filters"
          onClick={() => setShowFilters(!showFilters)}
          color={activeFilterCount > 0 ? 'primary' : 'default'}
        >
          <FilterListIcon />
          {activeFilterCount > 0 && (
            <Chip 
              label={activeFilterCount} 
              size="small" 
              sx={{ ml: 0.5, minWidth: 20, height: 20, fontSize: '0.7rem' }}
            />
          )}
        </IconButton>
        <IconButton type="submit" sx={{ p: '10px' }} aria-label="search">
          <SearchIcon />
        </IconButton>
      </Paper>

      {showFilters && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ typography: 'h6' }}>Filters</Box>
            <IconButton size="small" onClick={clearFilters}>
              <ClearIcon />
            </IconButton>
          </Box>
          
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>File Type</InputLabel>
                <Select
                  value={filters.file_type}
                  label="File Type"
                  onChange={(e) => handleFilterChange('file_type', e.target.value)}
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="image">Images</MenuItem>
                  <MenuItem value="video">Videos</MenuItem>
                  <MenuItem value="audio">Audio</MenuItem>
                  <MenuItem value="document">Documents</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Content Type</InputLabel>
                <Select
                  value={filters.content_type}
                  label="Content Type"
                  onChange={(e) => handleFilterChange('content_type', e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="image/jpeg">JPEG</MenuItem>
                  <MenuItem value="image/png">PNG</MenuItem>
                  <MenuItem value="video/mp4">MP4</MenuItem>
                  <MenuItem value="audio/mpeg">MP3</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="Camera Make"
                value={filters.camera_make}
                onChange={(e) => handleFilterChange('camera_make', e.target.value)}
                placeholder="e.g., Canon, Nikon"
              />
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={filters.sort}
                  label="Sort By"
                  onChange={(e) => handleFilterChange('sort', e.target.value)}
                >
                  <MenuItem value="created_date desc">Newest First</MenuItem>
                  <MenuItem value="created_date asc">Oldest First</MenuItem>
                  <MenuItem value="file_size desc">Largest First</MenuItem>
                  <MenuItem value="file_size asc">Smallest First</MenuItem>
                  <MenuItem value="file_name asc">Name A-Z</MenuItem>
                  <MenuItem value="file_name desc">Name Z-A</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Date From"
                InputLabelProps={{ shrink: true }}
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
              />
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Date To"
                InputLabelProps={{ shrink: true }}
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
              />
            </Grid>
          </Grid>
        </Paper>
      )}
    </Box>
  );
}

export default SearchBar;