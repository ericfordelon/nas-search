# NAS Search

A microservices-based search system for personal NAS storage with full-text search, metadata indexing, and visual browsing capabilities.

## Quick Start

1. **Clone and configure**:
   ```bash
   git clone https://github.com/ericfordelon/nas-search.git
   cd nas-search
   cp .env.example .env
   # Edit .env to configure your volume mounts (see Configuration section)
   ```

2. **Generate Docker Compose configuration**:
   ```bash
   chmod +x generate-docker-compose.sh
   ./generate-docker-compose.sh
   ```

3. **Start the system**:
   ```bash
   docker-compose up -d
   ```

4. **Verify services are running**:
   ```bash
   curl http://localhost:8983/solr/admin/cores?action=STATUS
   curl http://localhost:3000/api/health
   ```

5. **Access the web interface**:
   - Main search: http://localhost:3000
   - Admin dashboard: http://localhost:3000/admin

## Architecture

- **Apache Solr**: Search engine with custom schema for mixed content types
- **Redis**: Message queue for inter-service communication
- **File Monitor**: Filesystem monitoring using inotify
- **Metadata Extractor**: EXIF, video metadata, and document text extraction
- **Thumbnail Generator**: Multiple thumbnail sizes for visual browsing
- **Search API**: REST API with faceted search capabilities
- **Web Frontend**: Responsive web application

## Development

See `CLAUDE.md` for detailed development guidance and architecture decisions.

## Troubleshooting

### Volume Mount Issues

**Problem**: Services can't access mounted volumes
```bash
# Check if docker-compose.yml was generated
ls -la docker-compose.yml

# Regenerate if missing
./generate-docker-compose.sh

# Verify volume mounts in generated file
grep -A 10 "volumes:" docker-compose.yml
```

**Problem**: Files not being indexed from new volumes
```bash
# Check file monitor logs
docker logs nas-search-file-monitor

# Verify mount paths in container
docker exec nas-search-file-monitor ls -la /nas/
```

### Service Connection Issues

**Problem**: Services can't connect to Redis/Solr
```bash
# Check service logs
docker logs nas-search-file-monitor
docker logs nas-search-metadata-extractor

# Verify Redis connectivity
docker exec nas-search-redis redis-cli ping

# Verify Solr connectivity
curl http://localhost:8983/solr/admin/cores?action=STATUS
```

**Problem**: Environment variables not taking effect
```bash
# Rebuild containers after .env changes
docker-compose down
./generate-docker-compose.sh
docker-compose up --build -d
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Solr | 8983 | Search engine |
| Redis | 6379 | Message queue |
| Search API | 8080 | REST API |
| Web Frontend | 3000 | Web interface |

## Configuration

### Multi-Volume Mount Support

The system supports multiple volume mounts for comprehensive content indexing. Configure volume mounts in the `.env` file:

```bash
# Multiple Volume Mounts Configuration
# Format: volume_name:host_path,volume_name2:host_path2
VOLUME_MOUNTS=test-data:./test-data,photos:./photos,documents:./documents

# Data Directory (centralized storage for Solr, Redis, thumbnails, logs)
NAS_SEARCH_DATA_DIR=./nas-search-data
```

### Volume Mount Examples

**Development Setup:**
```bash
VOLUME_MOUNTS=test-data:./test-data,photos:./test-photos,documents:./test-documents
```

**Production Unraid Setup:**
```bash
VOLUME_MOUNTS=photos:/mnt/user/Photos,documents:/mnt/user/Documents,media:/mnt/user/Media
```

**Single Volume (Legacy):**
```bash
VOLUME_MOUNTS=nas:/mnt/user
```

### Path Standardization

Files are indexed with standardized paths regardless of their host location:
- Host path: `/mnt/user/Photos/vacation.jpg`
- Indexed path: `/photos/vacation.jpg`

This enables consistent search results and portable configurations across different environments.

### Docker Compose Generation

The system uses a template-based approach for Docker Compose configuration:

1. **Template**: `docker-compose.template.yml` contains placeholders for volume mounts
2. **Generator**: `generate-docker-compose.sh` reads `.env` and generates `docker-compose.yml`
3. **Dynamic Configuration**: Volume mounts are automatically configured based on `.env` settings

**Important**: Always run `./generate-docker-compose.sh` after modifying `VOLUME_MOUNTS` in `.env`.

## Admin Interface

The system includes a comprehensive admin dashboard at `/admin` with the following features:

### Index Management
- **Clear Index**: Remove all documents from the search index
- **Reindex**: Trigger complete reindexing of all mounted volumes
- **Clear Redis**: Reset all Redis tracking data

### System Monitoring
- **Health Status**: Real-time status of Solr, Redis, and other services
- **Disk Usage**: Monitor storage usage for data directories
- **Processing Stats**: View indexing progress and queue status

### Features
- **No Manual Steps**: All operations are automated via the web interface
- **Real-time Updates**: Dashboard updates automatically as operations complete
- **Error Handling**: Clear error messages and recovery suggestions