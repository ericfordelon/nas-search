#!/bin/bash

# Generate Docker Compose from Template
# =====================================
# This script generates docker-compose.yml with dynamic volume mounts based on .env configuration

set -e

ENV_FILE=".env"
TEMPLATE_FILE="docker-compose.template.yml"
OUTPUT_FILE="docker-compose.yml"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Function to get volume mounts from .env
get_volume_mounts() {
    if [ -f "$ENV_FILE" ]; then
        grep "^VOLUME_MOUNTS=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' || echo "test-data:./test-data"
    else
        echo "test-data:./test-data"
    fi
}

# Function to generate volume mount strings for docker-compose
generate_volume_mounts() {
    local volume_mounts="$1"
    
    IFS=',' read -ra VOLUMES <<< "$volume_mounts"
    for volume in "${VOLUMES[@]}"; do
        IFS=':' read -ra PARTS <<< "$volume"
        volume_name="${PARTS[0]}"
        host_path="${PARTS[1]}"
        
        echo "      - ${host_path}:/nas/${volume_name}:ro"
    done
}

# Function to generate environment variables for services
generate_volume_env() {
    local volume_mounts="$1"
    
    echo "      - VOLUME_MOUNTS=${volume_mounts}"
    
    # Generate MOUNT_PATHS for internal container paths
    local mount_paths=""
    IFS=',' read -ra VOLUMES <<< "$volume_mounts"
    for volume in "${VOLUMES[@]}"; do
        IFS=':' read -ra PARTS <<< "$volume"
        volume_name="${PARTS[0]}"
        
        if [ -z "$mount_paths" ]; then
            mount_paths="/nas/${volume_name}"
        else
            mount_paths="${mount_paths},/nas/${volume_name}"
        fi
    done
    
    echo "      - MOUNT_PATHS=${mount_paths}"
}

# Main generation function
generate_docker_compose() {
    log_info "Generating docker-compose.yml from template..."
    
    if [ ! -f "$TEMPLATE_FILE" ]; then
        echo "Error: Template file $TEMPLATE_FILE not found"
        exit 1
    fi
    
    local volume_mounts=$(get_volume_mounts)
    log_info "Volume mounts: $volume_mounts"
    
    # Generate volume mount strings
    local volume_mount_str=$(generate_volume_mounts "$volume_mounts")
    local volume_env_str=$(generate_volume_env "$volume_mounts")
    
    # Create temporary files for replacements
    local volume_mounts_file="/tmp/volume_mounts.$$"
    local volume_env_file="/tmp/volume_env.$$"
    
    # Generate replacement content to temp files
    generate_volume_mounts "$volume_mounts" > "$volume_mounts_file"
    generate_volume_env "$volume_mounts" > "$volume_env_file"
    
    # Process template using awk with file inclusion
    awk '
        /# VOLUME_MOUNTS_PLACEHOLDER/ {
            while ((getline line < "'$volume_mounts_file'") > 0) print line
            close("'$volume_mounts_file'")
            next
        }
        /# VOLUME_ENV_PLACEHOLDER/ {
            while ((getline line < "'$volume_env_file'") > 0) print line
            close("'$volume_env_file'")
            next
        }
        { print }
    ' "$TEMPLATE_FILE" > "$OUTPUT_FILE"
    
    # Cleanup temp files
    rm -f "$volume_mounts_file" "$volume_env_file"
    
    log_success "Generated $OUTPUT_FILE"
    
    # Show volume mount summary
    echo
    echo "Volume Mount Summary:"
    echo "===================="
    IFS=',' read -ra VOLUMES <<< "$volume_mounts"
    for volume in "${VOLUMES[@]}"; do
        IFS=':' read -ra PARTS <<< "$volume"
        echo "  ${PARTS[0]}: ${PARTS[1]} -> /nas/${PARTS[0]} (read-only)"
    done
    echo
}

# Function to validate volume paths
validate_paths() {
    local volume_mounts=$(get_volume_mounts)
    local all_valid=true
    
    log_info "Validating volume paths..."
    
    IFS=',' read -ra VOLUMES <<< "$volume_mounts"
    for volume in "${VOLUMES[@]}"; do
        IFS=':' read -ra PARTS <<< "$volume"
        volume_name="${PARTS[0]}"
        host_path="${PARTS[1]}"
        
        if [ ! -d "$host_path" ]; then
            echo "Warning: Path $host_path (volume: $volume_name) does not exist"
            all_valid=false
        else
            echo "✓ $volume_name: $host_path exists"
        fi
    done
    
    if [ "$all_valid" = false ]; then
        echo
        echo "Some volume paths don't exist. Create them or update .env configuration."
        echo "Example: mkdir -p ./photos ./documents"
    fi
    
    echo
}

# Handle command line arguments
case "${1:-generate}" in
    "generate")
        validate_paths
        generate_docker_compose
        ;;
    "validate")
        validate_paths
        ;;
    "show")
        volume_mounts=$(get_volume_mounts)
        echo "Current VOLUME_MOUNTS: $volume_mounts"
        echo
        echo "Volume Configuration:"
        IFS=',' read -ra VOLUMES <<< "$volume_mounts"
        for volume in "${VOLUMES[@]}"; do
            IFS=':' read -ra PARTS <<< "$volume"
            echo "  ${PARTS[0]} -> ${PARTS[1]} (container: /nas/${PARTS[0]})"
        done
        ;;
    *)
        echo "Usage: $0 [generate|validate|show]"
        echo "  generate  - Generate docker-compose.yml from template (default)"
        echo "  validate  - Check if volume paths exist"
        echo "  show     - Show current volume configuration"
        exit 1
        ;;
esac