#!/bin/bash

# Data Migration Script: Docker Volumes to Host Mounts
# ===================================================

set -e  # Exit on any error

# Configuration
PROJECT_DIR="/Users/eric/git/nas-search"
DATA_DIR="${PROJECT_DIR}/nas-search-data"
BACKUP_DIR="${PROJECT_DIR}/volume-backup-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    log_info "Checking Docker status..."
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    log_success "Docker is running"
}

# Function to backup existing volume data
backup_volumes() {
    log_info "Creating backup of existing volume data..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup Solr data
    if docker volume inspect nas-search_solr_data >/dev/null 2>&1; then
        log_info "Backing up Solr data..."
        docker run --rm -v nas-search_solr_data:/source -v "$BACKUP_DIR":/backup alpine \
            sh -c "cd /source && tar czf /backup/solr_data.tar.gz ."
        log_success "Solr data backed up to $BACKUP_DIR/solr_data.tar.gz"
    else
        log_warning "Solr volume not found, skipping backup"
    fi
    
    # Backup Redis data
    if docker volume inspect nas-search_redis_data >/dev/null 2>&1; then
        log_info "Backing up Redis data..."
        docker run --rm -v nas-search_redis_data:/source -v "$BACKUP_DIR":/backup alpine \
            sh -c "cd /source && tar czf /backup/redis_data.tar.gz ."
        log_success "Redis data backed up to $BACKUP_DIR/redis_data.tar.gz"
    else
        log_warning "Redis volume not found, skipping backup"
    fi
    
    # Backup Thumbnail data
    if docker volume inspect nas-search_thumbnail_data >/dev/null 2>&1; then
        log_info "Backing up Thumbnail data..."
        docker run --rm -v nas-search_thumbnail_data:/source -v "$BACKUP_DIR":/backup alpine \
            sh -c "cd /source && tar czf /backup/thumbnail_data.tar.gz ."
        log_success "Thumbnail data backed up to $BACKUP_DIR/thumbnail_data.tar.gz"
    else
        log_warning "Thumbnail volume not found, skipping backup"
    fi
}

# Function to migrate data to host mounts
migrate_data() {
    log_info "Migrating data to host mounts..."
    
    # Ensure data directories exist
    mkdir -p "${DATA_DIR}"/{solr,redis,thumbnails,logs,config}
    
    # Migrate Solr data
    if [ -f "$BACKUP_DIR/solr_data.tar.gz" ]; then
        log_info "Migrating Solr data..."
        cd "$DATA_DIR/solr"
        tar xzf "$BACKUP_DIR/solr_data.tar.gz"
        log_success "Solr data migrated to $DATA_DIR/solr"
    fi
    
    # Migrate Redis data
    if [ -f "$BACKUP_DIR/redis_data.tar.gz" ]; then
        log_info "Migrating Redis data..."
        cd "$DATA_DIR/redis"
        tar xzf "$BACKUP_DIR/redis_data.tar.gz"
        log_success "Redis data migrated to $DATA_DIR/redis"
    fi
    
    # Migrate Thumbnail data
    if [ -f "$BACKUP_DIR/thumbnail_data.tar.gz" ]; then
        log_info "Migrating Thumbnail data..."
        cd "$DATA_DIR/thumbnails"
        tar xzf "$BACKUP_DIR/thumbnail_data.tar.gz"
        log_success "Thumbnail data migrated to $DATA_DIR/thumbnails"
    fi
    
    # Set proper permissions
    log_info "Setting proper permissions..."
    chmod -R 755 "$DATA_DIR"
    log_success "Permissions set"
}

# Function to verify migration
verify_migration() {
    log_info "Verifying migration..."
    
    # Check if directories exist and have content
    for dir in solr redis thumbnails logs config; do
        if [ -d "$DATA_DIR/$dir" ]; then
            size=$(du -sh "$DATA_DIR/$dir" | cut -f1)
            log_success "$dir directory exists (${size})"
        else
            log_error "$dir directory missing!"
            return 1
        fi
    done
    
    log_success "Migration verification completed"
}

# Function to cleanup old volumes
cleanup_volumes() {
    log_warning "This will permanently delete the old Docker volumes!"
    read -p "Are you sure you want to cleanup old volumes? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up old volumes..."
        
        docker volume rm nas-search_solr_data 2>/dev/null || true
        docker volume rm nas-search_redis_data 2>/dev/null || true  
        docker volume rm nas-search_thumbnail_data 2>/dev/null || true
        
        log_success "Old volumes cleaned up"
    else
        log_info "Keeping old volumes for safety"
    fi
}

# Function to show disk usage
show_disk_usage() {
    log_info "Disk usage summary:"
    echo "----------------------------------------"
    echo "Data Directory: $DATA_DIR"
    if [ -d "$DATA_DIR" ]; then
        du -sh "$DATA_DIR"/*/ 2>/dev/null || log_info "No subdirectories found"
        echo "Total: $(du -sh "$DATA_DIR" | cut -f1)"
    else
        log_warning "Data directory not found"
    fi
    echo "----------------------------------------"
    
    if [ -d "$BACKUP_DIR" ]; then
        echo "Backup Directory: $BACKUP_DIR"
        du -sh "$BACKUP_DIR"/*/ 2>/dev/null || log_info "No backup files found"
        echo "Total backup: $(du -sh "$BACKUP_DIR" | cut -f1)"
        echo "----------------------------------------"
    fi
}

# Main execution
main() {
    log_info "Starting migration from Docker volumes to host mounts"
    log_info "Project directory: $PROJECT_DIR"
    log_info "Data directory: $DATA_DIR"
    log_info "Backup directory: $BACKUP_DIR"
    echo
    
    # Check prerequisites
    check_docker
    
    # Stop services
    log_info "Stopping services..."
    cd "$PROJECT_DIR"
    docker-compose down
    log_success "Services stopped"
    
    # Perform migration
    backup_volumes
    migrate_data
    verify_migration
    
    # Show results
    show_disk_usage
    
    log_success "Migration completed successfully!"
    echo
    log_info "Next steps:"
    echo "1. Review the migrated data in: $DATA_DIR"
    echo "2. Start services with: docker-compose up -d"
    echo "3. Verify services are working correctly"
    echo "4. Once verified, you can cleanup old volumes with:"
    echo "   $0 --cleanup"
    echo
    log_info "Backup created at: $BACKUP_DIR"
}

# Handle cleanup flag
if [ "$1" = "--cleanup" ]; then
    check_docker
    cleanup_volumes
    exit 0
fi

# Handle help flag
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Data Migration Script: Docker Volumes to Host Mounts"
    echo
    echo "Usage:"
    echo "  $0              # Perform migration"
    echo "  $0 --cleanup    # Cleanup old volumes (after verification)"
    echo "  $0 --help       # Show this help"
    echo
    exit 0
fi

# Run main migration
main