import React from 'react';
import {
  Paper,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  Box,
  Divider,
  Collapse
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';

function FacetPanel({ facets, onFacetClick, selectedFacets = {} }) {
  const [expanded, setExpanded] = React.useState({
    file_type: true,
    content_type: false,
    camera_make: false,
    directory_path: false
  });

  const handleExpand = (facetName) => {
    setExpanded(prev => ({
      ...prev,
      [facetName]: !prev[facetName]
    }));
  };

  const facetConfig = [
    { key: 'file_type', label: 'File Types', icon: '📁' },
    { key: 'content_type', label: 'Content Types', icon: '🏷️' },
    { key: 'camera_make', label: 'Camera Make', icon: '📷' },
    { key: 'camera_model', label: 'Camera Model', icon: '📸' },
    { key: 'author', label: 'Authors', icon: '✍️' },
    { key: 'artist', label: 'Artists', icon: '🎵' },
    { key: 'genre', label: 'Genres', icon: '🎼' },
    { key: 'directory_path', label: 'Directories', icon: '📂' }
  ];

  const renderFacetSection = (config) => {
    const facetData = facets[config.key] || [];
    if (facetData.length === 0) return null;

    return (
      <Box key={config.key}>
        <ListItemButton onClick={() => handleExpand(config.key)}>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>{config.icon}</span>
                <Typography variant="subtitle2">{config.label}</Typography>
              </Box>
            }
          />
          {expanded[config.key] ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        
        <Collapse in={expanded[config.key]} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {facetData.slice(0, 10).map((facet, index) => (
              <ListItem key={index} dense>
                <ListItemButton
                  sx={{ pl: 4 }}
                  onClick={() => onFacetClick(config.key, facet.value)}
                  selected={selectedFacets[config.key] === facet.value}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" noWrap>
                          {facet.value}
                        </Typography>
                        <Chip 
                          label={facet.count} 
                          size="small" 
                          variant="outlined"
                          sx={{ ml: 1, minWidth: 'auto' }}
                        />
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {facetData.length > 10 && (
              <ListItem dense>
                <ListItemText
                  sx={{ pl: 4 }}
                  primary={
                    <Typography variant="caption" color="text.secondary">
                      +{facetData.length - 10} more...
                    </Typography>
                  }
                />
              </ListItem>
            )}
          </List>
        </Collapse>
        <Divider />
      </Box>
    );
  };

  const hasFacets = facetConfig.some(config => facets[config.key]?.length > 0);

  if (!hasFacets) {
    return null;
  }

  return (
    <Paper sx={{ height: 'fit-content', maxHeight: '80vh', overflow: 'auto' }}>
      <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Typography variant="h6">Filter Results</Typography>
      </Box>
      
      <List component="nav" disablePadding>
        {facetConfig.map(renderFacetSection)}
      </List>
    </Paper>
  );
}

export default FacetPanel;