'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  LinearProgress
} from '@mui/material';
import {
  Storage,
  Photo,
  Videocam,
  AudioFile,
  Description,
  Folder
} from '@mui/icons-material';

interface StatsResponse {
  total_documents: number;
  file_types: Record<string, number>;
  content_types: Record<string, number>;
  total_size: number;
  index_status: string;
}

interface SearchResult {
  id: string;
  file_path: string;
  file_name: string;
  content_type?: string;
  file_size?: number;
  directory_path?: string;
  camera_make?: string;
  indexed_date?: string;
}


function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [recentFiles, setRecentFiles] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load stats and recent files concurrently
      const [statsResponse, recentResponse] = await Promise.all([
        fetch('/api/stats').then(res => res.json()),
        fetch('/api/search?q=*:*&start=0&rows=10&sort=indexed_date%20desc').then(res => res.json())
      ]);
      
      setStats(statsResponse);
      setRecentFiles(recentResponse.docs);
    } catch (err) {
      setError('Failed to load statistics. Please try again.');
      console.error('Stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getFileTypeIcon = (contentType?: string) => {
    if (contentType?.startsWith('image/')) return <Photo color="primary" />;
    if (contentType?.startsWith('video/')) return <Videocam color="secondary" />;
    if (contentType?.startsWith('audio/')) return <AudioFile color="success" />;
    return <Description color="action" />;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!stats) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        No statistics available
      </Alert>
    );
  }

  const fileTypeData = Object.entries(stats.file_types || {}).map(([type, count]) => ({
    type,
    count,
    percentage: stats.total_documents > 0 ? (count / stats.total_documents) * 100 : 0
  }));

  const contentTypeData = Object.entries(stats.content_types || {}).map(([type, count]) => ({
    type,
    count,
    percentage: stats.total_documents > 0 ? (count / stats.total_documents) * 100 : 0
  }));

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        System Statistics
      </Typography>
      
      <Grid container spacing={3}>
        {/* Overview Cards */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Storage sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" component="div">
                {stats.total_documents?.toLocaleString() || 0}
              </Typography>
              <Typography color="text.secondary">
                Total Files
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Photo sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" component="div">
                {stats.file_types?.image?.toLocaleString() || 0}
              </Typography>
              <Typography color="text.secondary">
                Images
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Videocam sx={{ fontSize: 48, color: 'secondary.main', mb: 1 }} />
              <Typography variant="h4" component="div">
                {stats.file_types?.video?.toLocaleString() || 0}
              </Typography>
              <Typography color="text.secondary">
                Videos
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <AudioFile sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography variant="h4" component="div">
                {stats.file_types?.audio?.toLocaleString() || 0}
              </Typography>
              <Typography color="text.secondary">
                Audio Files
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* File Types Distribution */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              File Types Distribution
            </Typography>
            {fileTypeData.map((item) => (
              <Box key={item.type} sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                    {item.type}
                  </Typography>
                  <Typography variant="body2">
                    {item.count.toLocaleString()} ({item.percentage.toFixed(1)}%)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={item.percentage}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Content Types */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Content Types
            </Typography>
            <List dense>
              {contentTypeData.slice(0, 10).map((item) => (
                <ListItem key={item.type} sx={{ px: 0 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getFileTypeIcon(item.type)}
                        <Typography variant="body2">
                          {item.type}
                        </Typography>
                      </Box>
                    }
                  />
                  <Chip 
                    label={item.count.toLocaleString()} 
                    size="small" 
                    variant="outlined"
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Recently Indexed Files */}
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recently Indexed Files
            </Typography>
            <List>
              {recentFiles.map((file, index) => (
                <ListItem key={index} divider>
                  <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                    {getFileTypeIcon(file.content_type)}
                  </Box>
                  <ListItemText
                    primary={file.file_name}
                    secondary={
                      <Box>
                        <Typography variant="caption" component="div">
                          <Folder fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                          {file.directory_path}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {file.content_type} • {formatFileSize(file.file_size)}
                          {file.indexed_date && ` • Indexed ${new Date(file.indexed_date).toLocaleDateString()}`}
                        </Typography>
                      </Box>
                    }
                  />
                  {file.camera_make && (
                    <Box sx={{ textAlign: 'right', ml: 2 }}>
                      <Chip 
                        label={file.camera_make} 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                      />
                    </Box>
                  )}
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* System Status */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              System Status
            </Typography>
            <List dense>
              <ListItem sx={{ px: 0 }}>
                <ListItemText primary="Index Status" />
                <Chip 
                  label={stats.index_status || 'Unknown'} 
                  color={stats.index_status === 'active' ? 'success' : 'default'}
                  size="small"
                />
              </ListItem>
              <ListItem sx={{ px: 0 }}>
                <ListItemText primary="Total Storage" />
                <Typography variant="body2">
                  {formatFileSize(stats.total_size)}
                </Typography>
              </ListItem>
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default StatsPage;