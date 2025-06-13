#!/usr/bin/env python3
"""
File Monitor Service - Watches NAS filesystem for changes and queues files for processing
"""

import os
import time
import json
import hashlib
from pathlib import Path
from typing import Set, Dict, Any
from datetime import datetime

import redis
import structlog
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

class NASFileHandler(FileSystemEventHandler):
    """Handles filesystem events for NAS files"""
    
    # Supported file extensions
    SUPPORTED_EXTENSIONS = {
        # Images
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.raw', '.cr2', '.nef', '.arw',
        # Videos
        '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg',
        # Audio
        '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a',
        # Documents
        '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.pages',
        # Archives
        '.zip', '.rar', '.7z', '.tar', '.gz'
    }
    
    def __init__(self, redis_client: redis.Redis, nas_path: str):
        self.redis_client = redis_client
        self.nas_path = Path(nas_path)
        self.processing_queue = 'file_processing_queue'
        self.processed_files: Set[str] = set()
        
        # Load processed files from Redis on startup
        self._load_processed_files()
        
    def _load_processed_files(self):
        """Load list of already processed files from Redis"""
        try:
            processed = self.redis_client.smembers('processed_files')
            self.processed_files = {f.decode('utf-8') for f in processed}
            logger.info("Loaded processed files", count=len(self.processed_files))
        except Exception as e:
            logger.error("Failed to load processed files", error=str(e))
    
    def _is_supported_file(self, file_path: Path) -> bool:
        """Check if file has supported extension"""
        return file_path.suffix.lower() in self.SUPPORTED_EXTENSIONS
    
    def _get_file_hash(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of file for duplicate detection"""
        try:
            hash_sha256 = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error("Failed to calculate file hash", file_path=str(file_path), error=str(e))
            return ""
    
    def _create_file_message(self, file_path: Path, event_type: str) -> Dict[str, Any]:
        """Create message for file processing queue"""
        try:
            stat = file_path.stat()
            file_hash = self._get_file_hash(file_path) if event_type != 'deleted' else ""
            
            return {
                'event_type': event_type,
                'file_path': str(file_path),
                'file_name': file_path.name,
                'file_size': stat.st_size if event_type != 'deleted' else 0,
                'file_extension': file_path.suffix.lower(),
                'content_hash': file_hash,
                'created_date': datetime.fromtimestamp(stat.st_ctime).isoformat() + 'Z' if event_type != 'deleted' else None,
                'modified_date': datetime.fromtimestamp(stat.st_mtime).isoformat() + 'Z' if event_type != 'deleted' else None,
                'directory_path': str(file_path.parent),
                'directory_depth': len(file_path.relative_to(self.nas_path).parts) - 1,
                'queued_at': datetime.utcnow().isoformat() + 'Z'
            }
        except Exception as e:
            logger.error("Failed to create file message", file_path=str(file_path), error=str(e))
            return {}
    
    def _queue_file_for_processing(self, file_path: Path, event_type: str):
        """Add file to processing queue"""
        try:
            # Skip if already processed (for created/modified events)
            file_key = f"{file_path}:{event_type}"
            if event_type in ['created', 'modified'] and file_key in self.processed_files:
                return
            
            message = self._create_file_message(file_path, event_type)
            if not message:
                return
            
            # Add to Redis queue
            self.redis_client.lpush(self.processing_queue, json.dumps(message))
            
            # Mark as queued
            if event_type != 'deleted':
                self.redis_client.sadd('queued_files', str(file_path))
            
            logger.info("File queued for processing", 
                       file_path=str(file_path), 
                       event_type=event_type,
                       file_size=message.get('file_size', 0))
            
        except Exception as e:
            logger.error("Failed to queue file", file_path=str(file_path), error=str(e))
    
    def on_created(self, event: FileSystemEvent):
        """Handle file creation events"""
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        if self._is_supported_file(file_path):
            # Wait a bit to ensure file is fully written
            time.sleep(1)
            if file_path.exists():
                self._queue_file_for_processing(file_path, 'created')
    
    def on_modified(self, event: FileSystemEvent):
        """Handle file modification events"""
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        if self._is_supported_file(file_path):
            # Wait a bit to ensure file is fully written
            time.sleep(1)
            if file_path.exists():
                self._queue_file_for_processing(file_path, 'modified')
    
    def on_deleted(self, event: FileSystemEvent):
        """Handle file deletion events"""
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        if self._is_supported_file(file_path):
            self._queue_file_for_processing(file_path, 'deleted')
            # Remove from processed files
            self.redis_client.srem('processed_files', str(file_path))
            self.redis_client.srem('queued_files', str(file_path))
    
    def on_moved(self, event: FileSystemEvent):
        """Handle file move/rename events"""
        if event.is_directory:
            return
        
        old_path = Path(event.src_path)
        new_path = Path(event.dest_path)
        
        if self._is_supported_file(old_path) or self._is_supported_file(new_path):
            # Handle as deletion of old path and creation of new path
            if self._is_supported_file(old_path):
                self._queue_file_for_processing(old_path, 'deleted')
            if self._is_supported_file(new_path) and new_path.exists():
                self._queue_file_for_processing(new_path, 'created')


class FileMonitorService:
    """Main file monitoring service"""
    
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.nas_path = os.getenv('NAS_PATH', '/nas')
        self.redis_client = None
        self.observer = None
        
    def connect_redis(self):
        """Connect to Redis"""
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=False)
            self.redis_client.ping()
            logger.info("Connected to Redis", redis_url=self.redis_url)
        except Exception as e:
            logger.error("Failed to connect to Redis", error=str(e))
            raise
    
    def scan_existing_files(self, event_handler):
        """Scan existing files on startup"""
        logger.info("Starting initial file scan", nas_path=self.nas_path)
        
        nas_path = Path(self.nas_path)
        total_files = 0
        processed_files = 0
        
        try:
            for file_path in nas_path.rglob('*'):
                if file_path.is_file():
                    total_files += 1
                    
                    # Check if file is supported and not already processed
                    if event_handler._is_supported_file(file_path):
                        file_str = str(file_path)
                        
                        # Check if already processed
                        if file_str not in event_handler.processed_files:
                            event_handler._queue_file_for_processing(file_path, 'created')
                            processed_files += 1
            
            logger.info("Initial file scan completed", 
                       total_files=total_files, 
                       queued_files=processed_files)
                       
        except Exception as e:
            logger.error("Failed during initial file scan", error=str(e))

    def start_monitoring(self):
        """Start filesystem monitoring"""
        if not Path(self.nas_path).exists():
            logger.error("NAS path does not exist", nas_path=self.nas_path)
            raise FileNotFoundError(f"NAS path {self.nas_path} does not exist")
        
        # Create event handler
        event_handler = NASFileHandler(self.redis_client, self.nas_path)
        
        # Perform initial scan of existing files
        self.scan_existing_files(event_handler)
        
        # Set up observer
        self.observer = Observer()
        self.observer.schedule(event_handler, self.nas_path, recursive=True)
        
        # Start monitoring
        self.observer.start()
        logger.info("Started file monitoring", nas_path=self.nas_path)
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Shutting down file monitor")
            self.observer.stop()
        
        self.observer.join()
    
    def run(self):
        """Main service entry point"""
        logger.info("Starting File Monitor Service")
        
        try:
            self.connect_redis()
            self.start_monitoring()
        except Exception as e:
            logger.error("Service failed", error=str(e))
            raise


if __name__ == "__main__":
    service = FileMonitorService()
    service.run()