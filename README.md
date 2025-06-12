# NAS Search

A microservices-based search system for personal NAS storage with full-text search, metadata indexing, and visual browsing capabilities.

## Quick Start

1. **Clone and configure**:
   ```bash
   git clone https://github.com/ericfordelon/nas-search.git
   cd nas-search
   cp .env.example .env
   # Edit .env to match your NAS path
   ```

2. **Start the infrastructure**:
   ```bash
   docker-compose up -d solr redis
   ```

3. **Verify Solr is running**:
   ```bash
   curl http://localhost:8983/solr/admin/cores?action=STATUS
   ```

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

## Services

| Service | Port | Description |
|---------|------|-------------|
| Solr | 8983 | Search engine |
| Redis | 6379 | Message queue |
| Search API | 8080 | REST API |
| Web Frontend | 3000 | Web interface |

## Configuration

The system uses environment variables for configuration. Copy `.env.example` to `.env` and adjust the `NAS_PATH` variable to point to your NAS mount point.

For Unraid systems, the default path is `/mnt/user`.