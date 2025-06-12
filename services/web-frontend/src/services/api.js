import axios from 'axios';

// Configure base URL for API calls
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`, config.params);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    
    if (error.response?.status >= 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.response?.status === 404) {
      throw new Error('Resource not found.');
    } else if (error.response?.status >= 400) {
      throw new Error(error.response?.data?.detail || 'Request failed.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please try again.');
    } else {
      throw new Error('Network error. Please check your connection.');
    }
  }
);

/**
 * Search files with various parameters
 * @param {Object} params - Search parameters
 * @param {string} params.q - Search query
 * @param {number} params.start - Starting offset
 * @param {number} params.rows - Number of results
 * @param {string} params.sort - Sort field and direction
 * @param {Array} params.fq - Filter queries
 * @param {string} params.file_type - File type filter
 * @param {string} params.content_type - Content type filter
 * @param {string} params.camera_make - Camera make filter
 * @param {string} params.date_from - Date from filter
 * @param {string} params.date_to - Date to filter
 * @returns {Promise} Search response
 */
export const searchFiles = async (params = {}) => {
  const response = await api.get('/search', { params });
  return response.data;
};

/**
 * Get search suggestions
 * @param {string} query - Partial query string
 * @param {number} count - Number of suggestions to return
 * @returns {Promise} Suggestions response
 */
export const getSuggestions = async (query, count = 5) => {
  const response = await api.get('/suggest', {
    params: { q: query, count }
  });
  return response.data;
};

/**
 * Get system statistics
 * @returns {Promise} Stats response
 */
export const getStats = async () => {
  const response = await api.get('/stats');
  return response.data;
};

/**
 * Get thumbnail for a file
 * @param {string} filePath - Full file path
 * @param {string} size - Thumbnail size (small, medium, large)
 * @returns {string} Thumbnail URL
 */
export const getThumbnailUrl = (filePath, size = 'medium') => {
  const params = new URLSearchParams({
    file_path: filePath,
    size: size
  });
  return `${API_BASE_URL}/thumbnail?${params.toString()}`;
};

/**
 * Health check endpoint
 * @returns {Promise} Health response
 */
export const healthCheck = async () => {
  const response = await api.get('/health');
  return response.data;
};

/**
 * Get API root information
 * @returns {Promise} Root response
 */
export const getApiInfo = async () => {
  const response = await api.get('/');
  return response.data;
};

// Export the configured axios instance for custom requests
export default api;