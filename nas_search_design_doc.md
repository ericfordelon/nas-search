# Personal NAS Search System - Requirements & Design Document

## Project Overview

A microservices-based search system for personal NAS storage (8TB+) running on Unraid with Docker containers. The system provides full-text search, metadata indexing, and visual browsing capabilities for personal media and documents.

## Content Profile

- **Images (90%)**: Camera photos with EXIF data, require thumbnails
- **Videos (10%)**: Personal videos from devices, some movies
- **Documents**: Word, Excel, PDF files
- **Total Storage**: 8TB+ on Unraid NAS
- **Growth Pattern**: Continuous addition via camera imports

## Functional Requirements

### Core Search Capabilities
- Full-text search across document content
- Metadata-based search (EXIF data, file properties, dates)
- Visual browsing with thumbnail grids
- Faceted search (file type, camera model, date ranges, location)
- Advanced filters (file size, resolution, duration)

### Content Processing
- Automatic detection of new/modified files
- EXIF extraction from images (camera, GPS, timestamps)
- Video metadata extraction (duration, resolution, codec)
- Document text extraction (Word, Excel, PDF)
- Thumbnail generation (multiple sizes for different views)
- Duplicate detection capabilities

### User Interface
- Web-based responsive interface
- Grid view for visual content with thumbnails
- List view for documents
- Preview capabilities for all content types
- Search suggestions and autocomplete
- Bookmark/favorite functionality

### Performance Requirements
- Continuous monitoring without impacting NAS performance
- Configurable processing rates to balance system load
- Efficient thumbnail serving
- Sub-second search response times
- Handle bursts of new content (camera SD card imports)

## Technical Architecture

### Microservices Design

#### File Monitor Service
**Responsibility**: Filesystem monitoring and change detection
- Monitor mounted NAS volumes for file changes
- Use inotify/filesystem watchers for real-time detection
- Publish file events to message queue
- Track processing state for reliability
- Handle large batch imports gracefully

#### Metadata Extractor Service
**Responsibility**: Extract metadata from various file types
- EXIF data extraction from images
- Video metadata extraction (ffmpeg/ffprobe)
- Document text extraction (Apache Tika)
- File hash calculation for duplicate detection
- Configurable processing workers

#### Thumbnail Generator Service
**Responsibility**: Generate thumbnails for visual content
- Multiple thumbnail sizes (grid, preview, detail)
- Image thumbnail generation (ImageMagick)
- Video thumbnail generation (ffmpeg)
- Efficient storage and serving
- Background processing queue

#### Content Indexer Service
**Responsibility**: Maintain search index
- Interface with Apache Solr
- Schema management and mapping
- Batch indexing for performance
- Handle incremental updates
- Index optimization scheduling

#### Search API Service
**Responsibility**: Search interface and business logic
- REST API over Solr
- Search query processing and optimization
- Result formatting and pagination
- Faceted search implementation
- Search analytics and logging

#### Web Frontend Service
**Responsibility**: User interface
- Responsive web application
- Search interface with filters
- Visual browsing capabilities
- File preview functionality
- User preferences and settings

### Infrastructure Services

#### Message Queue
- Redis or RabbitMQ for inter-service communication
- Job queuing and processing coordination
- Event-driven architecture support

#### Search Engine
- Apache Solr for indexing and search
- Custom schema for mixed content types
- Faceted search configuration

#### Shared Storage
- Mounted NAS volumes for content access
- Separate volume for thumbnails
- Temporary processing space

## Data Model

### Solr Schema Fields

#### Common Fields
- `id`: Unique file identifier
- `file_path`: Full path to file
- `file_name`: Base filename
- `file_type`: MIME type
- `file_size`: Size in bytes
- `created_date`: File creation timestamp
- `modified_date`: Last modification timestamp
- `content_hash`: File hash for duplicate detection

#### Image-Specific Fields
- `camera_make`: Camera manufacturer
- `camera_model`: Camera model
- `lens_model`: Lens information
- `iso_speed`: ISO setting
- `aperture`: F-stop value
- `shutter_speed`: Exposure time
- `focal_length`: Lens focal length
- `gps_latitude`: GPS coordinates
- `gps_longitude`: GPS coordinates
- `image_width`: Image width in pixels
- `image_height`: Image height in pixels
- `orientation`: Image orientation

#### Video-Specific Fields
- `duration`: Video length in seconds
- `video_width`: Video width in pixels
- `video_height`: Video height in pixels
- `video_codec`: Video compression codec
- `audio_codec`: Audio compression codec
- `frame_rate`: Frames per second
- `bitrate`: Video bitrate

#### Document-Specific Fields
- `content_text`: Extracted text content
- `author`: Document author
- `title`: Document title
- `page_count`: Number of pages
- `word_count`: Text word count

## Deployment Architecture

### Docker Composition
- Individual containers for each microservice
- Docker Compose for orchestration
- Shared volumes for NAS content access
- Service discovery and networking

### Unraid Integration
- Community Applications template
- WebUI integration
- Resource management and limits
- Backup and restore capabilities

### Scalability Considerations
- Horizontal scaling for processing services
- Load balancing for API services
- Resource allocation based on workload
- Performance monitoring and alerting

## Implementation Phases

### Phase 1: Core Infrastructure
- Set up Solr and message queue
- Implement File Monitor Service
- Basic Metadata Extractor for images
- Simple search API

### Phase 2: Enhanced Processing
- Complete metadata extraction for all file types
- Thumbnail generation service
- Web frontend with basic search

### Phase 3: Advanced Features
- Faceted search and filters
- Visual browsing interface
- Performance optimization
- Duplicate detection

### Phase 4: Polish and Operations
- User interface refinements
- Monitoring and alerting
- Documentation and deployment guides
- Backup and recovery procedures

## Technology Stack Recommendations

### Backend Services
- **Language**: Python (asyncio for I/O intensive tasks) or Java/Spring Boot
- **Message Queue**: Redis with Celery or RabbitMQ
- **Search Engine**: Apache Solr 9.x
- **File Processing**: Apache Tika, ffmpeg, ImageMagick
- **Containerization**: Docker with Docker Compose

### Frontend
- **Framework**: React or Vue.js for SPA
- **UI Components**: Material-UI or similar component library
- **State Management**: Redux/Context API or Vuex
- **Build Tools**: Webpack/Vite

### Infrastructure
- **Reverse Proxy**: nginx for static file serving and load balancing
- **Monitoring**: Prometheus + Grafana or similar
- **Logging**: Centralized logging with ELK stack or similar

## Security Considerations

- No authentication required (personal/internal use)
- File system access controls via Docker volumes
- API rate limiting to prevent abuse
- Input validation for search queries
- Secure file path handling to prevent directory traversal

## Performance Targets

- Search response time: < 500ms for typical queries
- Thumbnail loading: < 100ms per thumbnail
- New file processing: < 30 seconds for typical photos
- System resource usage: < 25% CPU during normal operation
- Concurrent users: Support 5+ simultaneous users

## Monitoring and Maintenance

- Service health checks and auto-restart
- Processing queue monitoring
- Search performance metrics
- Storage usage tracking
- Error logging and alerting
- Regular index optimization

## Future Enhancements

- Machine learning for image tagging
- Facial recognition capabilities
- Similar image search
- Mobile application
- External storage integration (cloud services)
- Advanced analytics and reporting