import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Typography,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  IconButton
} from '@mui/material';
import { ViewModule, ViewList, Info } from '@mui/icons-material';
import ResultCard from '../components/ResultCard';
import { searchFiles } from '../services/api';

function BrowsePage() {
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('created_date desc');
  const [filterType, setFilterType] = useState('all');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalResults, setTotalResults] = useState(0);

  const loadContent = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = {
        q: '*:*',
        start: 0,
        rows: 100,
        sort: sortBy
      };

      // Add content type filter
      if (filterType !== 'all') {
        if (filterType === 'images') {
          params.fq = ['content_type:image/*'];
        } else if (filterType === 'videos') {
          params.fq = ['content_type:video/*'];
        } else if (filterType === 'audio') {
          params.fq = ['content_type:audio/*'];
        }
      }

      const response = await searchFiles(params);
      setResults(response.docs);
      setTotalResults(response.total);
    } catch (err) {
      setError('Failed to load content. Please try again.');
      console.error('Browse error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, [sortBy, filterType]);

  const handleViewModeChange = (event, newViewMode) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  const getThumbnailUrl = (filePath, size = 'medium') => {
    return `/api/thumbnail?file_path=${encodeURIComponent(filePath)}&size=${size}`;
  };

  const canShowThumbnail = (result) => {
    return result.content_type?.startsWith('image/') || result.content_type?.startsWith('video/');
  };

  const renderGridView = () => {
    const mediaResults = results.filter(canShowThumbnail);
    
    return (
      <ImageList cols={4} gap={8}>
        {mediaResults.map((result) => (
          <ImageListItem key={result.id}>
            <img
              src={getThumbnailUrl(result.file_path, 'medium')}
              alt={result.file_name}
              loading="lazy"
              style={{
                height: 200,
                objectFit: 'cover'
              }}
            />
            <ImageListItemBar
              title={result.file_name}
              subtitle={
                <Box>
                  {result.camera_make && (
                    <Typography variant="caption" display="block">
                      {result.camera_make}
                    </Typography>
                  )}
                  {result.width && result.height && (
                    <Typography variant="caption" display="block">
                      {result.width} × {result.height}
                    </Typography>
                  )}
                </Box>
              }
              actionIcon={
                <IconButton sx={{ color: 'rgba(255, 255, 255, 0.54)' }}>
                  <Info />
                </IconButton>
              }
            />
          </ImageListItem>
        ))}
      </ImageList>
    );
  };

  const renderCardView = () => {
    return (
      <Grid container spacing={2}>
        {results.map((result, index) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={result.id || index}>
            <ResultCard result={result} />
          </Grid>
        ))}
      </Grid>
    );
  };

  const renderListView = () => {
    return (
      <Box>
        {results.map((result, index) => (
          <Paper key={result.id || index} sx={{ p: 2, mb: 1, display: 'flex', alignItems: 'center' }}>
            {canShowThumbnail(result) && (
              <Box sx={{ mr: 2 }}>
                <img
                  src={getThumbnailUrl(result.file_path, 'small')}
                  alt={result.file_name}
                  style={{
                    width: 60,
                    height: 60,
                    objectFit: 'cover',
                    borderRadius: 4
                  }}
                />
              </Box>
            )}
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" noWrap>
                {result.file_name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {result.directory_path}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {result.content_type} • {result.file_size && `${(result.file_size / 1024 / 1024).toFixed(1)} MB`}
              </Typography>
            </Box>
            {result.camera_make && (
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="body2">{result.camera_make}</Typography>
                {result.camera_model && (
                  <Typography variant="caption" color="text.secondary">
                    {result.camera_model}
                  </Typography>
                )}
              </Box>
            )}
          </Paper>
        ))}
      </Box>
    );
  };

  return (
    <Box>
      {/* Controls */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" gutterBottom>
            Browse Content
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {totalResults.toLocaleString()} items
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Filter</InputLabel>
            <Select
              value={filterType}
              label="Filter"
              onChange={(e) => setFilterType(e.target.value)}
            >
              <MenuItem value="all">All Files</MenuItem>
              <MenuItem value="images">Images</MenuItem>
              <MenuItem value="videos">Videos</MenuItem>
              <MenuItem value="audio">Audio</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Sort By</InputLabel>
            <Select
              value={sortBy}
              label="Sort By"
              onChange={(e) => setSortBy(e.target.value)}
            >
              <MenuItem value="created_date desc">Newest First</MenuItem>
              <MenuItem value="created_date asc">Oldest First</MenuItem>
              <MenuItem value="file_size desc">Largest First</MenuItem>
              <MenuItem value="file_name asc">Name A-Z</MenuItem>
            </Select>
          </FormControl>
          
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
          >
            <ToggleButton value="grid" aria-label="grid view">
              <ViewModule />
            </ToggleButton>
            <ToggleButton value="cards" aria-label="card view">
              <ViewModule />
            </ToggleButton>
            <ToggleButton value="list" aria-label="list view">
              <ViewList />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Paper>

      {/* Content */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <>
          {results.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                No content found
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Make sure your content is being indexed
              </Typography>
            </Paper>
          ) : (
            <>
              {viewMode === 'grid' && renderGridView()}
              {viewMode === 'cards' && renderCardView()}
              {viewMode === 'list' && renderListView()}
            </>
          )}
        </>
      )}
    </Box>
  );
}

export default BrowsePage;