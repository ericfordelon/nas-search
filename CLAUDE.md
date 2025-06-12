# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a microservices-based search system for personal NAS storage (8TB+) running on Unraid with Docker containers. The system provides full-text search, metadata indexing, and visual browsing capabilities for personal media and documents.

## Architecture

The system follows a microservices architecture with the following core services:

### Core Services
- **File Monitor Service**: Filesystem monitoring and change detection using inotify
- **Metadata Extractor Service**: Extract EXIF, video metadata, and document text using Apache Tika, ffmpeg
- **Thumbnail Generator Service**: Generate multiple thumbnail sizes using ImageMagick/ffmpeg
- **Content Indexer Service**: Maintain Apache Solr search index
- **Search API Service**: REST API over Solr with faceted search
- **Web Frontend Service**: Responsive web application

### Infrastructure Components
- **Message Queue**: Redis or RabbitMQ for inter-service communication
- **Search Engine**: Apache Solr with custom schema for mixed content types
- **Storage**: Mounted NAS volumes for content access and thumbnail storage

## Technology Stack

### Backend
- Language: Python (asyncio) or Java/Spring Boot
- Message Queue: Redis with Celery or RabbitMQ
- Search Engine: Apache Solr 9.x
- File Processing: Apache Tika, ffmpeg, ImageMagick
- Containerization: Docker with Docker Compose

### Frontend
- Framework: React or Vue.js
- UI Components: Material-UI or similar
- Build Tools: Webpack/Vite

## Data Model

The Solr schema includes:
- Common fields: file_path, file_type, file_size, timestamps, content_hash
- Image fields: EXIF data (camera_make, camera_model, GPS coordinates, etc.)
- Video fields: duration, resolution, codecs, frame_rate
- Document fields: extracted text, author, title, page_count

## Development Phases

1. **Phase 1**: Core infrastructure (Solr, message queue, File Monitor, basic Metadata Extractor)
2. **Phase 2**: Complete metadata extraction, thumbnail generation, basic web frontend
3. **Phase 3**: Faceted search, visual browsing, performance optimization
4. **Phase 4**: UI polish, monitoring, documentation

## Performance Targets

- Search response: < 500ms
- Thumbnail loading: < 100ms per thumbnail
- File processing: < 30 seconds for typical photos
- System resource usage: < 25% CPU during normal operation
- Support 5+ concurrent users

## Deployment

- Docker containers for each microservice
- Docker Compose orchestration
- Unraid integration via Community Applications
- No authentication required (personal/internal use)