import React, { useState, useEffect, useCallback } from 'react';
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
  Paper
} from '@mui/material';
import SearchBar from '../components/SearchBar';
import ResultCard from '../components/ResultCard';
import FacetPanel from '../components/FacetPanel';
import { searchFiles } from '../services/api';

function SearchPage() {
  const [query, setQuery] = useState('*:*');
  const [filters, setFilters] = useState({});
  const [results, setResults] = useState([]);
  const [facets, setFacets] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [queryTime, setQueryTime] = useState(0);

  const performSearch = useCallback(async (searchQuery, page = 1, pageSize = rowsPerPage) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = {
        q: searchQuery || '*:*',
        start: (page - 1) * pageSize,
        rows: pageSize,
        ...filters
      };

      const response = await searchFiles(params);
      
      setResults(response.docs);
      setFacets(response.facets);
      setTotalResults(response.total);
      setQueryTime(response.query_time);
    } catch (err) {
      setError('Failed to search files. Please try again.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, rowsPerPage]);

  useEffect(() => {
    performSearch(query, currentPage, rowsPerPage);
  }, [performSearch, query, currentPage, rowsPerPage]);

  const handleSearch = (newQuery) => {
    setQuery(newQuery);
    setCurrentPage(1);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleFacetClick = (facetType, facetValue) => {
    const newFilters = { ...filters };
    
    if (newFilters[facetType] === facetValue) {
      // Remove filter if clicking on already selected facet
      delete newFilters[facetType];
    } else {
      // Add or update filter
      newFilters[facetType] = facetValue;
    }
    
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handlePageChange = (event, page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(event.target.value);
    setCurrentPage(1);
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
    </Box>
  );
}

export default SearchPage;