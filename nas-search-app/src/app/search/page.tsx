'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import SearchBar from '@/components/SearchBar';
import ResultCard from '@/components/ResultCard';
import FacetPanel from '@/components/FacetPanel';

interface SearchResult {
  id: string;
  file_path: string;
  file_name: string;
  file_type?: string;
  content_type?: string;
  file_size?: number;
  created_date?: string;
  modified_date?: string;
  directory_path?: string;
  camera_make?: string;
  camera_model?: string;
  width?: number;
  height?: number;
  gps_location?: string;
  duration?: number;
  video_codec?: string;
  resolution?: string;
  artist?: string;
  album?: string;
  title?: string;
  genre?: string;
  author?: string;
  page_count?: number;
  highlights?: string[];
  score?: number;
}

interface FacetValue {
  value: string;
  count: number;
}

interface Facets {
  file_type: FacetValue[];
  content_type: FacetValue[];
  camera_make: FacetValue[];
  camera_model: FacetValue[];
  author: FacetValue[];
  artist: FacetValue[];
  genre: FacetValue[];
  directory_path: FacetValue[];
}

interface SearchResponse {
  query: string;
  total: number;
  start: number;
  rows: number;
  docs: SearchResult[];
  facets: Facets;
  query_time: number;
}

interface Filters {
  file_type: string;
  content_type: string;
  camera_make: string;
  date_from: string;
  date_to: string;
  sort: string;
  [key: string]: string;
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [query, setQuery] = useState(searchParams.get('q') || '*:*');
  const [filters, setFilters] = useState<Filters>(() => {
    const urlFilters: Filters = {
      file_type: '',
      content_type: '',
      camera_make: '',
      date_from: '',
      date_to: '',
      sort: 'created_date desc'
    };
    
    const fqParams = searchParams.getAll('fq');
    fqParams.forEach(fq => {
      const colonIndex = fq.indexOf(':');
      if (colonIndex > 0) {
        const field = fq.substring(0, colonIndex);
        const value = fq.substring(colonIndex + 1);
        urlFilters[field] = value;
      }
    });
    
    const sortParam = searchParams.get('sort');
    if (sortParam) {
      urlFilters.sort = sortParam;
    }
    
    return urlFilters;
  });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<Partial<Facets>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1'));
  const [rowsPerPage, setRowsPerPage] = useState(parseInt(searchParams.get('size') || '12'));
  const [queryTime, setQueryTime] = useState(0);

  const updateURL = useCallback((newQuery: string, newFilters: Filters, newPage: number, newPageSize: number) => {
    const params = new URLSearchParams();
    
    if (newQuery && newQuery !== '*:*') {
      params.set('q', newQuery);
    }
    
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value && value !== '' && key !== 'sort') {
        params.append('fq', `${key}:${value}`);
      }
    });
    
    if (newFilters.sort && newFilters.sort !== '') {
      params.set('sort', newFilters.sort);
    }
    
    if (newPage > 1) {
      params.set('page', newPage.toString());
    }
    
    if (newPageSize !== 12) {
      params.set('size', newPageSize.toString());
    }
    
    router.push(`/search?${params.toString()}`);
  }, [router]);

  const performSearch = useCallback(async (searchQuery: string, page = 1, pageSize = rowsPerPage) => {
    setLoading(true);
    setError(null);
    
    try {
      const fqParams: string[] = [];
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '' && key !== 'sort') {
          fqParams.push(`${key}:${value}`);
        }
      });
      
      const params = new URLSearchParams({
        q: searchQuery || '*:*',
        start: ((page - 1) * pageSize).toString(),
        rows: pageSize.toString(),
      });
      
      if (fqParams.length > 0) {
        fqParams.forEach(fq => params.append('fq', fq));
      }
      
      if (filters.sort && filters.sort !== '') {
        params.set('sort', filters.sort);
      }

      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      const data: SearchResponse = await response.json();
      
      setResults(data.docs);
      setFacets(data.facets);
      setTotalResults(data.total);
      setQueryTime(data.query_time);
      
      updateURL(searchQuery, filters, page, pageSize);
    } catch (err) {
      setError('Failed to search files. Please try again.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, rowsPerPage, updateURL]);

  useEffect(() => {
    performSearch(query, currentPage, rowsPerPage);
  }, [performSearch, query, currentPage, rowsPerPage, filters]);

  const handleSearch = (newQuery: string) => {
    setQuery(newQuery);
    setCurrentPage(1);
    updateURL(newQuery, filters, 1, rowsPerPage);
  };

  const handleFiltersChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    updateURL(query, newFilters, 1, rowsPerPage);
  };

  const handleFacetClick = (facetType: string, facetValue: string) => {
    const newFilters = { ...filters };
    
    if (newFilters[facetType] === facetValue) {
      delete newFilters[facetType];
    } else {
      newFilters[facetType] = facetValue;
    }
    
    setFilters(newFilters);
    setCurrentPage(1);
    updateURL(query, newFilters, 1, rowsPerPage);
  };

  const handlePageChange = (event: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page);
    updateURL(query, filters, page, rowsPerPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRowsPerPageChange = (event: any) => {
    const newPageSize = parseInt(event.target.value);
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
        <Grid size={{ xs: 12, md: 3 }}>
          <FacetPanel
            facets={facets}
            onFacetClick={handleFacetClick}
            selectedFacets={filters}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 9 }}>
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
                    No results found
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Try adjusting your search query or filters
                  </Typography>
                </Paper>
              ) : (
                <Grid container spacing={2}>
                  {results.map((result, index) => (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={result.id || index}>
                      <ResultCard result={result} />
                    </Grid>
                  ))}
                </Grid>
              )}

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

function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}

export default SearchPage;