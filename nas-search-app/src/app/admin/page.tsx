'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Alert,
  Card,
  CardContent,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  DeleteForever,
  Refresh,
  Analytics,
  Storage,
  Description,
} from '@mui/icons-material';

interface IndexStats {
  totalDocuments: number;
  fileTypeBreakdown: Record<string, number>;
  indexSize: string;
  lastUpdated: string;
}

interface DiskUsage {
  directory: string;
  sizeBytes: number;
  sizeHuman: string;
  files: number;
  lastUpdated: string;
}

interface DiskStats {
  totalUsage: DiskUsage;
  breakdown: DiskUsage[];
  warnings: string[];
  available: {
    total: string;
    used: string;
    available: string;
    percentage: number;
  };
}

interface AdminResponse {
  success: boolean;
  message: string;
  error?: string;
  stats?: IndexStats;
  diskStats?: DiskStats;
  dataDirectory?: string;
  instructions?: string[];
  details?: string[];
  clearedData?: string[];
  keysCleared?: number;
  restartOutput?: string;
  fallbackInstructions?: string[];
}

export default function AdminPage() {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [diskStats, setDiskStats] = useState<DiskStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [diskLoading, setDiskLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [reindexDialogOpen, setReindexDialogOpen] = useState(false);
  const [clearRedisDialogOpen, setClearRedisDialogOpen] = useState(false);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const response = await fetch('/api/admin/stats');
      const data: AdminResponse = await response.json();
      
      if (data.success && data.stats) {
        setStats(data.stats);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load stats' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load index statistics' });
    } finally {
      setStatsLoading(false);
    }
  };

  const loadDiskUsage = async () => {
    setDiskLoading(true);
    try {
      const response = await fetch('/api/admin/disk-usage');
      const data: AdminResponse = await response.json();
      
      if (data.success && data.diskStats) {
        setDiskStats(data.diskStats);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load disk usage' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load disk usage statistics' });
    } finally {
      setDiskLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadDiskUsage();
  }, []);

  const handleClearIndex = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/admin/clear-index', {
        method: 'POST',
      });
      const data: AdminResponse = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        loadStats(); // Reload stats after clearing
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to clear index' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to clear index' });
    } finally {
      setLoading(false);
      setClearDialogOpen(false);
    }
  };

  const handleReindex = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/admin/reindex', {
        method: 'POST',
      });
      const data: AdminResponse = await response.json();
      
      if (data.success) {
        const details = data.details ? '\n\n' + data.details.join('\n') : 
                        data.instructions ? '\n\n' + data.instructions.join('\n') : '';
        const output = data.restartOutput ? '\n\nRestart Output:\n' + data.restartOutput : '';
        setMessage({ 
          type: 'success', 
          text: data.message + details + output
        });
      } else {
        const fallback = data.fallbackInstructions ? '\n\n' + data.fallbackInstructions.join('\n') : '';
        setMessage({ 
          type: 'error', 
          text: (data.message || 'Failed to trigger reindexing') + fallback
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to trigger reindexing' });
    } finally {
      setLoading(false);
      setReindexDialogOpen(false);
    }
  };

  const handleClearRedis = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/admin/clear-redis', {
        method: 'POST',
      });
      const data: AdminResponse = await response.json();
      
      if (data.success) {
        const details = data.clearedData ? '\n\nDetails:\n' + data.clearedData.join('\n') : '';
        setMessage({ 
          type: 'success', 
          text: data.message + details
        });
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to clear Redis data' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to clear Redis data' });
    } finally {
      setLoading(false);
      setClearRedisDialogOpen(false);
    }
  };

  const fileTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'audio': return '🎵';
      case 'document': return '📄';
      case 'archive': return '📦';
      default: return '📁';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        <Analytics sx={{ mr: 2, verticalAlign: 'middle' }} />
        Search Index Administration
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Manage the search index and monitor system statistics
      </Typography>

      <Divider sx={{ my: 3 }} />

      {message && (
        <Alert 
          severity={message.type} 
          sx={{ mb: 3 }}
          onClose={() => setMessage(null)}
        >
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
            {message.text}
          </pre>
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Index Statistics */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <Storage sx={{ mr: 1, verticalAlign: 'middle' }} />
                Index Statistics
              </Typography>
              
              {statsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : stats ? (
                <Box>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 6, sm: 4 }}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">
                          {stats.totalDocuments.toLocaleString()}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Total Documents
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">
                          {stats.indexSize}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Index Size
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body1" color="primary">
                          {new Date(stats.lastUpdated).toLocaleString()}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Last Updated
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  <Typography variant="h6" gutterBottom>
                    File Type Breakdown
                  </Typography>
                  
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>File Type</TableCell>
                          <TableCell align="right">Count</TableCell>
                          <TableCell align="right">Percentage</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(stats.fileTypeBreakdown).map(([type, count]) => (
                          <TableRow key={type}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <span style={{ marginRight: 8 }}>{fileTypeIcon(type)}</span>
                                <Chip label={type} size="small" variant="outlined" />
                              </Box>
                            </TableCell>
                            <TableCell align="right">{count.toLocaleString()}</TableCell>
                            <TableCell align="right">
                              {((count / stats.totalDocuments) * 100).toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              ) : (
                <Alert severity="warning">
                  Failed to load index statistics
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Admin Actions */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <Description sx={{ mr: 1, verticalAlign: 'middle' }} />
                Admin Actions
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={() => setReindexDialogOpen(true)}
                  disabled={loading}
                  fullWidth
                  size="large"
                >
                  Reindex All Files
                </Button>
                
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteForever />}
                  onClick={() => setClearDialogOpen(true)}
                  disabled={loading}
                  fullWidth
                  size="large"
                >
                  Clear Index
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<Analytics />}
                  onClick={loadStats}
                  disabled={statsLoading}
                  fullWidth
                >
                  Refresh Stats
                </Button>

                <Button
                  variant="outlined"
                  color="warning"
                  onClick={() => setClearRedisDialogOpen(true)}
                  disabled={loading}
                  fullWidth
                >
                  Clear Redis Data
                </Button>
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="body2" color="text.secondary">
                <strong>Reindex:</strong> Automatically restarts services to scan all files and rebuild the index.<br/><br/>
                <strong>Clear Index:</strong> Removes all documents from the search index. Use with caution!<br/><br/>
                <strong>Clear Redis Data:</strong> Clears tracking data to allow complete reindexing of all files.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Disk Usage Statistics */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📊 Disk Usage Statistics
              </Typography>
              
              {diskLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : diskStats ? (
                <Box>
                  {/* Warnings */}
                  {diskStats.warnings.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                      {diskStats.warnings.map((warning, index) => (
                        <Alert 
                          key={index} 
                          severity={warning.includes('Critical') ? 'error' : 'warning'}
                          sx={{ mb: 1 }}
                        >
                          {warning}
                        </Alert>
                      ))}
                    </Box>
                  )}

                  {/* System Overview */}
                  <Grid container spacing={3} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">
                          {diskStats.totalUsage.sizeHuman}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Data Directory Size
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">
                          {diskStats.totalUsage.files.toLocaleString()}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Total Files
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">
                          {diskStats.available.used}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Disk Used
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography 
                          variant="h4" 
                          color={diskStats.available.percentage > 80 ? 'error' : 'primary'}
                        >
                          {diskStats.available.percentage}%
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Disk Usage
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {/* Directory Breakdown */}
                  <Typography variant="h6" gutterBottom>
                    Directory Breakdown
                  </Typography>
                  
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Directory</TableCell>
                          <TableCell align="right">Size</TableCell>
                          <TableCell align="right">Files</TableCell>
                          <TableCell align="right">Percentage</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {diskStats.breakdown.map((dir) => (
                          <TableRow key={dir.directory}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <span style={{ marginRight: 8 }}>
                                  {dir.directory === 'solr' ? '🔍' :
                                   dir.directory === 'redis' ? '🗄️' :
                                   dir.directory === 'thumbnails' ? '🖼️' :
                                   dir.directory === 'logs' ? '📝' :
                                   dir.directory === 'config' ? '⚙️' : '📁'}
                                </span>
                                <Chip label={dir.directory} size="small" variant="outlined" />
                              </Box>
                            </TableCell>
                            <TableCell align="right">{dir.sizeHuman}</TableCell>
                            <TableCell align="right">{dir.files.toLocaleString()}</TableCell>
                            <TableCell align="right">
                              {diskStats.totalUsage.sizeBytes > 0 
                                ? ((dir.sizeBytes / diskStats.totalUsage.sizeBytes) * 100).toFixed(1)
                                : '0.0'}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      Last updated: {new Date(diskStats.totalUsage.lastUpdated).toLocaleString()}
                    </Typography>
                    <Button 
                      variant="outlined" 
                      size="small"
                      onClick={loadDiskUsage}
                      disabled={diskLoading}
                    >
                      Refresh
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Alert severity="warning">
                  Failed to load disk usage statistics
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Clear Index Confirmation Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Search Index</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear the entire search index? This will remove all 
            {stats && ` ${stats.totalDocuments.toLocaleString()}`} indexed documents.
            <br /><br />
            This action cannot be undone. You will need to reindex all files to restore the search functionality.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleClearIndex} 
            color="error" 
            variant="contained"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Clear Index'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reindex Confirmation Dialog */}
      <Dialog open={reindexDialogOpen} onClose={() => setReindexDialogOpen(false)}>
        <DialogTitle>Reindex All Files</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will automatically restart the file monitor and metadata extractor services
            to scan all files in the NAS directory and rebuild the search index.
            <br /><br />
            Depending on the number of files, this process may take several minutes to complete.
            The system will remain accessible during reindexing.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReindexDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleReindex} 
            color="primary" 
            variant="contained"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Start Reindexing'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Redis Confirmation Dialog */}
      <Dialog open={clearRedisDialogOpen} onClose={() => setClearRedisDialogOpen(false)}>
        <DialogTitle>Clear Redis Tracking Data</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will clear all Redis tracking data including:
            <br />• Processed files tracking
            <br />• File content hashes  
            <br />• Processing locks
            <br />• Queue states
            <br /><br />
            After clearing this data, the file monitor will treat all files as new and reindex them.
            This is useful for forcing a complete reindex of all content.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearRedisDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleClearRedis} 
            color="warning" 
            variant="contained"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Clear Redis Data'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}