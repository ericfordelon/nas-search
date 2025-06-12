import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardMedia,
  Typography,
  Box,
  Chip,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Button,
  Grid,
  Tooltip
} from '@mui/material';
import {
  PhotoCamera,
  Videocam,
  AudioFile,
  Description,
  Folder,
  ZoomIn,
  GetApp,
  Info
} from '@mui/icons-material';

function ResultCard({ result }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const getFileIcon = (contentType, fileType) => {
    if (contentType?.startsWith('image/')) return <PhotoCamera />;
    if (contentType?.startsWith('video/')) return <Videocam />;
    if (contentType?.startsWith('audio/')) return <AudioFile />;
    return <Description />;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDuration = (seconds) => {
    if (!seconds) return null;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getThumbnailUrl = (filePath, size = 'medium') => {
    return `/api/thumbnail?file_path=${encodeURIComponent(filePath)}&size=${size}`;
  };

  const canShowThumbnail = result.content_type?.startsWith('image/') || result.content_type?.startsWith('video/');

  return (
    <>
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {canShowThumbnail && !imageError && (
          <CardMedia
            component="img"
            height="200"
            image={getThumbnailUrl(result.file_path, 'medium')}
            alt={result.file_name}
            onError={() => setImageError(true)}
            sx={{ 
              objectFit: 'cover',
              cursor: 'pointer'
            }}
            onClick={() => setDialogOpen(true)}
          />
        )}
        
        {(!canShowThumbnail || imageError) && (
          <Box
            sx={{
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'grey.100',
              color: 'grey.600'
            }}
          >
            {getFileIcon(result.content_type, result.file_type)}
          </Box>
        )}

        <CardContent sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="div" noWrap>
            {result.file_name}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Folder fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary" noWrap>
              {result.directory_path}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
            {result.content_type && (
              <Chip label={result.content_type.split('/')[1]} size="small" />
            )}
            {result.camera_make && (
              <Chip label={result.camera_make} size="small" color="primary" />
            )}
            {result.width && result.height && (
              <Chip label={`${result.width}×${result.height}`} size="small" />
            )}
            {result.duration && (
              <Chip label={formatDuration(result.duration)} size="small" />
            )}
          </Box>

          <Typography variant="body2" color="text.secondary">
            {formatFileSize(result.file_size)} • {formatDate(result.created_date)}
          </Typography>

          {result.highlights && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Highlights:
              </Typography>
              {result.highlights.map((highlight, index) => (
                <Typography 
                  key={index}
                  variant="body2" 
                  dangerouslySetInnerHTML={{ __html: highlight }}
                  sx={{ mt: 0.5 }}
                />
              ))}
            </Box>
          )}
        </CardContent>

        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between' }}>
          <Tooltip title="View Details">
            <IconButton size="small" onClick={() => setDialogOpen(true)}>
              <Info />
            </IconButton>
          </Tooltip>
          {canShowThumbnail && (
            <Tooltip title="Zoom">
              <IconButton size="small" onClick={() => setDialogOpen(true)}>
                <ZoomIn />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {result.file_name}
        </DialogTitle>
        <DialogContent>
          {canShowThumbnail && (
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <img
                src={getThumbnailUrl(result.file_path, 'large')}
                alt={result.file_name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px',
                  objectFit: 'contain'
                }}
              />
            </Box>
          )}
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2">File Info</Typography>
              <Typography variant="body2">Path: {result.file_path}</Typography>
              <Typography variant="body2">Size: {formatFileSize(result.file_size)}</Typography>
              <Typography variant="body2">Type: {result.content_type}</Typography>
              <Typography variant="body2">Created: {formatDate(result.created_date)}</Typography>
              <Typography variant="body2">Modified: {formatDate(result.modified_date)}</Typography>
            </Grid>
            
            {(result.camera_make || result.camera_model || result.width) && (
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2">Camera Info</Typography>
                {result.camera_make && (
                  <Typography variant="body2">Make: {result.camera_make}</Typography>
                )}
                {result.camera_model && (
                  <Typography variant="body2">Model: {result.camera_model}</Typography>
                )}
                {result.width && result.height && (
                  <Typography variant="body2">
                    Dimensions: {result.width} × {result.height}
                  </Typography>
                )}
                {result.gps_location && (
                  <Typography variant="body2">GPS: {result.gps_location}</Typography>
                )}
              </Grid>
            )}
            
            {(result.artist || result.album || result.duration) && (
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2">Media Info</Typography>
                {result.artist && (
                  <Typography variant="body2">Artist: {result.artist}</Typography>
                )}
                {result.album && (
                  <Typography variant="body2">Album: {result.album}</Typography>
                )}
                {result.title && (
                  <Typography variant="body2">Title: {result.title}</Typography>
                )}
                {result.duration && (
                  <Typography variant="body2">Duration: {formatDuration(result.duration)}</Typography>
                )}
                {result.video_codec && (
                  <Typography variant="body2">Video Codec: {result.video_codec}</Typography>
                )}
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ResultCard;