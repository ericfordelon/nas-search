#!/bin/bash

# Generate Volume Mounts Helper Script
# ===================================
# This script parses VOLUME_MOUNTS from .env and generates docker-compose volume definitions

set -e

# Default values
ENV_FILE="${1:-.env}"
DEFAULT_VOLUMES="test-data:./test-data"

# Function to parse volume mounts from .env
get_volume_mounts() {
    if [ -f "$ENV_FILE" ]; then
        grep "^VOLUME_MOUNTS=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' || echo "$DEFAULT_VOLUMES"
    else
        echo "$DEFAULT_VOLUMES"
    fi
}

# Function to generate docker-compose volume syntax
generate_docker_volumes() {
    local volume_mounts="$1"
    local service_name="$2"
    
    echo "      # Multiple volume mounts"
    
    IFS=',' read -ra VOLUMES <<< "$volume_mounts"
    for volume in "${VOLUMES[@]}"; do
        IFS=':' read -ra PARTS <<< "$volume"
        volume_name="${PARTS[0]}"
        host_path="${PARTS[1]}"
        
        echo "      - ${host_path}:/nas/${volume_name}:ro"
    done
}

# Function to generate environment variables for services
generate_mount_paths() {
    local volume_mounts="$1"
    
    echo "      # Volume mount paths"
    echo "      - VOLUME_MOUNTS=${volume_mounts}"
    
    mount_paths=""
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

# Main execution
VOLUME_MOUNTS=$(get_volume_mounts)

case "${1:-help}" in
    "docker-volumes")
        generate_docker_volumes "$VOLUME_MOUNTS" "$2"
        ;;
    "env-vars")
        generate_mount_paths "$VOLUME_MOUNTS"
        ;;
    "list")
        echo "Configured volume mounts:"
        IFS=',' read -ra VOLUMES <<< "$VOLUME_MOUNTS"
        for volume in "${VOLUMES[@]}"; do
            IFS=':' read -ra PARTS <<< "$volume"
            echo "  ${PARTS[0]} -> ${PARTS[1]} (container: /nas/${PARTS[0]})"
        done
        ;;
    *)
        echo "Usage: $0 [docker-volumes|env-vars|list]"
        echo "  docker-volumes  - Generate docker-compose volume mount syntax"
        echo "  env-vars       - Generate environment variables for services"
        echo "  list           - List configured volume mounts"
        echo
        echo "Current configuration: $VOLUME_MOUNTS"
        ;;
esac