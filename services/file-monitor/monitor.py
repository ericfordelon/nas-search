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
import threading
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
    
    def __init__(self, redis_client: redis.Redis, mount_paths: str):
        self.redis_client = redis_client
        self.processing_queue = 'file_processing_queue'
        self.processed_files: Set[str] = set()
        
        # Parse multiple mount paths
        self.mount_points = self._parse_mount_paths(mount_paths)
        
        # Event debouncing: track recent events to prevent duplicates
        self.pending_events: Dict[str, Dict] = {}  # file_path -> event_data
        self.debounce_delay = 5.0  # seconds to wait before processing events
        self.debounce_lock = threading.Lock()
        
        # Load processed files from Redis on startup
        self._load_processed_files()
        
    def _parse_mount_paths(self, mount_paths: str) -> Dict[str, Path]:
        """Parse MOUNT_PATHS environment variable into volume name -> path mapping"""
        mount_points = {}
        
        # mount_paths format: "/nas/test-data,/nas/photos,/nas/documents"
        for mount_path in mount_paths.split(','):
            mount_path = mount_path.strip()
            if mount_path:
                # Extract volume name from path like "/nas/test-data" -> "test-data"
                volume_name = mount_path.split('/')[-1]
                mount_points[volume_name] = Path(mount_path)
                logger.info("Configured mount point", volume=volume_name, path=mount_path)
        
        return mount_points
    
    def _get_standardized_path(self, file_path: Path) -> str:
        """Convert container file path to standardized index path"""
        # Find which mount point this file belongs to
        for volume_name, mount_point in self.mount_points.items():
            try:
                # Check if file_path is under this mount point
                relative_path = file_path.relative_to(mount_point)
                # Return standardized path: /volume_name/relative_path
                return f"/{volume_name}/{relative_path}"
            except ValueError:
                # file_path is not under this mount_point
                continue
        
        # Fallback: return original path if no mount point matches
        logger.warning("File path not under any configured mount point", file_path=str(file_path))
        return str(file_path)
        
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
            
            # Get standardized path for indexing
            standardized_path = self._get_standardized_path(file_path)
            standardized_dir = str(Path(standardized_path).parent)
            
            return {
                'event_type': event_type,
                'file_path': standardized_path,  # Use standardized path for indexing
                'container_path': str(file_path),  # Keep original container path for file operations
                'file_name': file_path.name,
                'file_size': stat.st_size if event_type != 'deleted' else 0,
                'file_extension': file_path.suffix.lower(),
                'content_hash': file_hash,
                'created_date': datetime.fromtimestamp(stat.st_ctime).isoformat() + 'Z' if event_type != 'deleted' else None,
                'modified_date': datetime.fromtimestamp(stat.st_mtime).isoformat() + 'Z' if event_type != 'deleted' else None,
                'directory_path': standardized_dir,  # Use standardized directory path
                'directory_depth': len(Path(standardized_path).parts) - 2,  # Depth from volume root
                'queued_at': datetime.utcnow().isoformat() + 'Z'
            }
        except Exception as e:
            logger.error("Failed to create file message", file_path=str(file_path), error=str(e))
            return {}
    
    def _queue_file_for_processing(self, file_path: Path, event_type: str):
        """Add file to processing queue with proper deduplication"""
        try:
            file_str = str(file_path)
            
            # First check: Global processing lock per file path (longer duration)
            global_lock_key = f"global_processing:{file_str}"
            
            # Try to acquire a global processing lock (expires in 30 minutes)
            if not self.redis_client.set(global_lock_key, "processing", nx=True, ex=1800):
                logger.debug("File globally locked for processing", file_path=file_str)
                return
            
            try:
                # Second check: Skip if already in queue
                if self.redis_client.sismember('queued_files', file_str):
                    logger.debug("File already in queue", file_path=file_str)
                    return
                
                # Third check: Skip if recently processed (for created/modified events)
                if event_type in ['created', 'modified']:
                    processed_key = f"processed:{file_str}"
                    last_processed = self.redis_client.get(processed_key)
                    if last_processed:
                        # Check if file was processed recently (within last 2 hours)
                        try:
                            last_time = float(last_processed)
                            if time.time() - last_time < 7200:  # 2 hours
                                logger.debug("File processed recently, skipping", file_path=file_str)
                                return
                        except (ValueError, TypeError):
                            pass
                
                # Fourth check: Use file content hash to detect identical files
                if event_type in ['created', 'modified'] and file_path.exists():
                    file_hash = self._get_file_hash(file_path)
                    if file_hash:
                        hash_key = f"file_hash:{file_hash}"
                        existing_path = self.redis_client.get(hash_key)
                        if existing_path and existing_path.decode('utf-8') != file_str:
                            logger.debug("File with identical content already exists", 
                                       file_path=file_str, 
                                       existing_path=existing_path.decode('utf-8'))
                            return
                        # Store this file's hash
                        self.redis_client.set(hash_key, file_str, ex=86400)  # 24 hours
                
                # Use shorter-term queue lock for atomic queue operations
                queue_key = f"queue_lock:{file_str}"
                if not self.redis_client.set(queue_key, "queuing", nx=True, ex=60):
                    logger.debug("File being queued by another process", file_path=file_str)
                    return
                
                try:
                    message = self._create_file_message(file_path, event_type)
                    if not message:
                        return
                    
                    # Add to Redis queue
                    self.redis_client.lpush(self.processing_queue, json.dumps(message))
                    
                    # Mark as queued
                    if event_type != 'deleted':
                        self.redis_client.sadd('queued_files', file_str)
                    
                    logger.info("File queued for processing", 
                               file_path=file_str, 
                               event_type=event_type,
                               file_size=message.get('file_size', 0),
                               content_hash=message.get('content_hash', 'none'))
                               
                finally:
                    # Release the queue lock
                    self.redis_client.delete(queue_key)
                    
            finally:
                # Keep the global lock until processing is complete
                # The metadata extractor will release it
                pass
            
        except Exception as e:
            logger.error("Failed to queue file", file_path=str(file_path), error=str(e))
            # Clean up locks on error
            try:
                self.redis_client.delete(f"global_processing:{file_str}")
                self.redis_client.delete(f"queue_lock:{file_str}")
            except:
                pass
    
    def _schedule_debounced_event(self, file_path: Path, event_type: str):
        """Schedule an event to be processed after debounce delay"""
        file_str = str(file_path)
        
        with self.debounce_lock:
            # Update or create pending event
            self.pending_events[file_str] = {
                'file_path': file_path,
                'event_type': event_type,
                'timestamp': time.time()
            }
            
            # Schedule processing after delay
            timer = threading.Timer(self.debounce_delay, self._process_debounced_event, [file_str])
            timer.start()
            
            logger.debug("Scheduled debounced event", 
                        file_path=file_str, 
                        event_type=event_type,
                        delay=self.debounce_delay)
    
    def _process_debounced_event(self, file_str: str):
        """Process a debounced event after delay has passed"""
        with self.debounce_lock:
            if file_str not in self.pending_events:
                # Event was cancelled or already processed
                return
            
            event_data = self.pending_events.pop(file_str)
            
        # Check if file still exists (for created/modified events)
        file_path = event_data['file_path']
        event_type = event_data['event_type']
        
        if event_type in ['created', 'modified']:
            if not file_path.exists():
                logger.debug("File no longer exists, skipping debounced event", file_path=file_str)
                return
                
        # Check if this is the most recent event for this file
        event_time = event_data['timestamp']
        if time.time() - event_time > self.debounce_delay * 2:
            logger.debug("Event too old, skipping", file_path=file_str)
            return
            
        logger.info("Processing debounced event", 
                   file_path=file_str, 
                   event_type=event_type,
                   age=time.time() - event_time)
        
        # Process the event
        self._queue_file_for_processing(file_path, event_type)
    
    def on_created(self, event: FileSystemEvent):
        """Handle file creation events"""
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        if self._is_supported_file(file_path):
            # Use debouncing to prevent duplicate events
            self._schedule_debounced_event(file_path, 'created')
    
    def on_modified(self, event: FileSystemEvent):
        """Handle file modification events"""
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        if self._is_supported_file(file_path):
            # Wait a bit to ensure file is fully written
            time.sleep(1)
            if file_path.exists():
                # Use debouncing to prevent duplicate events
                self._schedule_debounced_event(file_path, 'modified')
    
    def on_deleted(self, event: FileSystemEvent):
        """Handle file deletion events"""
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        if self._is_supported_file(file_path):
            # Use debouncing to prevent duplicate events
            self._schedule_debounced_event(file_path, 'deleted')
            # Remove from processed files immediately (no need to debounce cleanup)
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
                # Use debouncing to prevent duplicate events
                self._schedule_debounced_event(old_path, 'deleted')
            if self._is_supported_file(new_path) and new_path.exists():
                # Use debouncing to prevent duplicate events
                self._schedule_debounced_event(new_path, 'created')


class FileMonitorService:
    """Main file monitoring service"""
    
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL', 'redis://redis:6379')
        self.mount_paths = os.getenv('MOUNT_PATHS', '/nas/test-data')
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
        logger.info("Starting initial file scan", mount_paths=self.mount_paths)
        
        total_files = 0
        processed_files = 0
        
        try:
            # Scan all configured mount points
            for volume_name, mount_path in event_handler.mount_points.items():
                logger.info("Scanning volume", volume=volume_name, path=str(mount_path))
                volume_files = 0
                volume_processed = 0
                
                if not mount_path.exists():
                    logger.warning("Mount path does not exist", volume=volume_name, path=str(mount_path))
                    continue
                
                for file_path in mount_path.rglob('*'):
                    if file_path.is_file():
                        total_files += 1
                        volume_files += 1
                        
                        # Check if file is supported and not already processed
                        if event_handler._is_supported_file(file_path):
                            # Use standardized path for processing check
                            standardized_path = event_handler._get_standardized_path(file_path)
                            
                            # Check if already processed
                            if standardized_path not in event_handler.processed_files:
                                event_handler._queue_file_for_processing(file_path, 'created')
                                processed_files += 1
                                volume_processed += 1
                
                logger.info("Volume scan completed", 
                           volume=volume_name,
                           total_files=volume_files, 
                           queued_files=volume_processed)
            
            logger.info("Initial file scan completed", 
                       total_files=total_files, 
                       queued_files=processed_files)
                       
        except Exception as e:
            logger.error("Failed during initial file scan", error=str(e))

    def start_monitoring(self):
        """Start filesystem monitoring"""
        # Create event handler with multiple mount paths
        event_handler = NASFileHandler(self.redis_client, self.mount_paths)
        
        # Validate all mount paths exist
        all_paths_valid = True
        for volume_name, mount_path in event_handler.mount_points.items():
            if not mount_path.exists():
                logger.error("Mount path does not exist", volume=volume_name, path=str(mount_path))
                all_paths_valid = False
        
        if not all_paths_valid:
            raise FileNotFoundError("One or more mount paths do not exist")
        
        # Perform initial scan of existing files
        self.scan_existing_files(event_handler)
        
        # Set up observer for each mount point
        self.observer = Observer()
        for volume_name, mount_path in event_handler.mount_points.items():
            self.observer.schedule(event_handler, str(mount_path), recursive=True)
            logger.info("Watching mount point", volume=volume_name, path=str(mount_path))
        
        # Start monitoring
        self.observer.start()
        logger.info("Started file monitoring", mount_paths=self.mount_paths)
        
        try:
            scan_counter = 0
            while True:
                time.sleep(1)
                scan_counter += 1
                
                # Perform periodic rescan every 30 minutes (1800 seconds) to reduce duplicate processing
                if scan_counter % 1800 == 0:
                    logger.info("Performing periodic rescan for missed files")
                    self.scan_existing_files(event_handler)
                    
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