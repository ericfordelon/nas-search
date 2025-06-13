import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  CircularProgress,
  Alert,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton
} from '@mui/material';
import { ExpandMore, BugReport } from '@mui/icons-material';
import SearchBar from '../components/SearchBar';
import ResultCard from '../components/ResultCard';
import FacetPanel from '../components/FacetPanel';
import { searchFiles } from '../services/api';

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize state from URL parameters
  const [query, setQuery] = useState(searchParams.get('q') || '*:*');
  const [filters, setFilters] = useState(() => {
    const urlFilters = {};
    
    // Parse fq parameters from URL
    const fqParams = searchParams.getAll('fq');
    fqParams.forEach(fq => {
      const colonIndex = fq.indexOf(':');
      if (colonIndex > 0) {
        const field = fq.substring(0, colonIndex);
        const value = fq.substring(colonIndex + 1);
        urlFilters[field] = value;
      }
    });
    
    // Handle sort parameter separately
    const sortParam = searchParams.get('sort');
    if (sortParam) {
      urlFilters.sort = sortParam;
    }
    
    return urlFilters;
  });
  const [results, setResults] = useState([]);
  const [facets, setFacets] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page')) || 1);
  const [rowsPerPage, setRowsPerPage] = useState(parseInt(searchParams.get('size')) || 12);
  const [queryTime, setQueryTime] = useState(0);
  const [debugData, setDebugData] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  // Update URL parameters when state changes
  const updateURL = useCallback((newQuery, newFilters, newPage, newPageSize) => {
    const params = new URLSearchParams();
    
    if (newQuery && newQuery !== '*:*') {
      params.set('q', newQuery);
    }
    
    // Convert filters to fq parameters for the URL
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value && value !== '' && key !== 'sort') {
        params.append('fq', `${key}:${value}`);
      }
    });
    
    // Handle sort separately if it exists
    if (newFilters.sort && newFilters.sort !== '') {
      params.set('sort', newFilters.sort);
    }
    
    if (newPage > 1) {
      params.set('page', newPage.toString());
    }
    
    if (newPageSize !== 12) {
      params.set('size', newPageSize.toString());
    }
    
    setSearchParams(params);
  }, [setSearchParams]);

  const performSearch = useCallback(async (searchQuery, page = 1, pageSize = rowsPerPage) => {
    setLoading(true);
    setError(null);
    
    try {
      // Build fq (filter query) parameters in Solr format
      const fqParams = [];
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '' && key !== 'sort') {
          fqParams.push(`${key}:${value}`);
        }
      });
      
      const params = {
        q: searchQuery || '*:*',
        start: (page - 1) * pageSize,
        rows: pageSize,
      };
      
      // Add fq parameters
      if (fqParams.length > 0) {
        params.fq = fqParams;
      }
      
      // Add sort if specified
      if (filters.sort && filters.sort !== '') {
        params.sort = filters.sort;
      }

      console.log('Performing search with params:', params);
      const response = await searchFiles(params);
      console.log('Search response - total:', response.total);
      
      // Also fetch debug data
      try {
        const debugParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => debugParams.append(key, v));
          } else {
            debugParams.append(key, value);
          }
        });
        
        const debugResponse = await fetch(`/api/search/debug?${debugParams}`);
        if (debugResponse.ok) {
          const debugData = await debugResponse.json();
          setDebugData(debugData);
        } else {
          console.warn('Debug endpoint not available');
        }
      } catch (e) {
        console.warn('Failed to fetch debug data:', e);
      }
      
      setResults(response.docs);
      setFacets(response.facets);
      setTotalResults(response.total);
      setQueryTime(response.query_time);
      
      // Update URL with current search state
      updateURL(searchQuery, filters, page, pageSize);
    } catch (err) {
      setError('Failed to search files. Please try again.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, rowsPerPage, updateURL]);

  // Sync URL changes with state
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '*:*';
    const urlPage = parseInt(searchParams.get('page')) || 1;
    const urlPageSize = parseInt(searchParams.get('size')) || 12;
    
    // Parse fq parameters from URL
    const urlFilters = {};
    const fqParams = searchParams.getAll('fq');
    fqParams.forEach(fq => {
      const colonIndex = fq.indexOf(':');
      if (colonIndex > 0) {
        const field = fq.substring(0, colonIndex);
        const value = fq.substring(colonIndex + 1);
        urlFilters[field] = value;
      }
    });
    
    // Handle sort parameter separately
    const sortParam = searchParams.get('sort');
    if (sortParam) {
      urlFilters.sort = sortParam;
    }
    
    // Update state if different from URL
    if (urlQuery !== query) setQuery(urlQuery);
    if (urlPage !== currentPage) setCurrentPage(urlPage);
    if (urlPageSize !== rowsPerPage) setRowsPerPage(urlPageSize);
    if (JSON.stringify(urlFilters) !== JSON.stringify(filters)) {
      setFilters(urlFilters);
    }
  }, [searchParams]);

  useEffect(() => {
    performSearch(query, currentPage, rowsPerPage);
  }, [performSearch, query, currentPage, rowsPerPage, filters]);

  const handleSearch = (newQuery) => {
    setQuery(newQuery);
    setCurrentPage(1);
    updateURL(newQuery, filters, 1, rowsPerPage);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    updateURL(query, newFilters, 1, rowsPerPage);
  };

  const handleFacetClick = (facetType, facetValue) => {
    console.log('Facet clicked:', facetType, '=', facetValue);
    console.log('Current filters before click:', filters);
    
    const newFilters = { ...filters };
    
    if (newFilters[facetType] === facetValue) {
      // Remove filter if clicking on already selected facet
      console.log('Removing filter');
      delete newFilters[facetType];
    } else {
      // Add or update filter
      console.log('Adding filter');
      newFilters[facetType] = facetValue;
    }
    
    console.log('New filters after click:', newFilters);
    setFilters(newFilters);
    setCurrentPage(1);
    updateURL(query, newFilters, 1, rowsPerPage);
  };

  const handlePageChange = (event, page) => {
    setCurrentPage(page);
    updateURL(query, filters, page, rowsPerPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRowsPerPageChange = (event) => {
    const newPageSize = event.target.value;
    setRowsPerPage(newPageSize);
    setCurrentPage(1);
    updateURL(query, filters, 1, newPageSize);
  };

  const totalPages = Math.ceil(totalResults / rowsPerPage);

  return (
    <Box>
      <SearchBar
        onSearch={handleSearch}
        onFiltersChange={handleFiltersChange}
        initialQuery={query}
        initialFilters={filters}
      />

      <Grid container spacing={3}>
        {/* Facet Panel */}
        <Grid item xs={12} md={3}>
          <FacetPanel
            facets={facets}
            onFacetClick={handleFacetClick}
            selectedFacets={filters}
          />
        </Grid>

        {/* Results */}
        <Grid item xs={12} md={9}>
          {/* Results Header */}
          <Paper sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6">
                {totalResults.toLocaleString()} results
                {queryTime > 0 && (
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    ({queryTime}ms)
                  </Typography>
                )}
              </Typography>
            </Box>
            
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Per Page</InputLabel>
              <Select
                value={rowsPerPage}
                label="Per Page"
                onChange={handleRowsPerPageChange}
              >
                <MenuItem value={6}>6</MenuItem>
                <MenuItem value={12}>12</MenuItem>
                <MenuItem value={24}>24</MenuItem>
                <MenuItem value={48}>48</MenuItem>
              </Select>
            </FormControl>
          </Paper>

          {/* Loading State */}
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {/* Error State */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Results Grid */}
          {!loading && !error && (
            <>
              {results.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="h6" color="text.secondary">
                    No results found
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Try adjusting your search query or filters
                  </Typography>
                </Paper>
              ) : (
                <Grid container spacing={2}>
                  {results.map((result, index) => (
                    <Grid item xs={12} sm={6} md={4} key={result.id || index}>
                      <ResultCard result={result} />
                    </Grid>
                  ))}
                </Grid>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                  <Pagination
                    count={totalPages}
                    page={currentPage}
                    onChange={handlePageChange}
                    color="primary"
                    size="large"
                    showFirstButton
                    showLastButton
                  />
                </Box>
              )}
            </>
          )}
        </Grid>
      </Grid>

      {/* Debug Panel */}
      <Box sx={{ mt: 4 }}>
        <Accordion expanded={showDebug} onChange={() => setShowDebug(!showDebug)}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BugReport />
              <Typography variant="h6">Debug Information</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {debugData && (
              <Box sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Frontend Parameters:
                </Typography>
                <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.100' }}>
                  <pre>{JSON.stringify(debugData.frontend_params, null, 2)}</pre>
                </Paper>
                
                <Typography variant="subtitle2" gutterBottom>
                  Solr Parameters:
                </Typography>
                <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.100' }}>
                  <pre>{JSON.stringify(debugData.solr_params, null, 2)}</pre>
                </Paper>
                
                <Typography variant="subtitle2" gutterBottom>
                  Solr URL:
                </Typography>
                <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.100' }}>
                  <code>{debugData.solr_url}</code>
                </Paper>
                
                <Typography variant="subtitle2" gutterBottom>
                  Raw Solr Response:
                </Typography>
                <Paper sx={{ p: 2, bgcolor: 'grey.100', maxHeight: 400, overflow: 'auto' }}>
                  <pre>{JSON.stringify(debugData.solr_response, null, 2)}</pre>
                </Paper>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
}

export default SearchPage;