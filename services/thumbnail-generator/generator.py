#!/usr/bin/env python3
"""
Thumbnail Generator Service - Generates multiple thumbnail sizes for visual browsing
"""

import os
import json
import time
import hashlib
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime

import redis
import structlog
import magic
from PIL import Image, ImageOps

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


class ThumbnailGenerator:
    """Generate thumbnails for images and videos"""
    
    # Thumbnail configurations
    THUMBNAIL_SIZES = {
        'small': (150, 150),
        'medium': (300, 300),
        'large': (800, 600)
    }
    
    # Supported formats
    IMAGE_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp'}
    VIDEO_FORMATS = {'.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'}
    
    def __init__(self, thumbnail_dir: str, quality: int = 85):
        self.thumbnail_dir = Path(thumbnail_dir)
        self.quality = quality
        self.magic = magic.Magic(mime=True)
        
        # Create thumbnail directories
        for size in self.THUMBNAIL_SIZES:
            (self.thumbnail_dir / size).mkdir(parents=True, exist_ok=True)
        
        logger.info("Thumbnail generator initialized", 
                   thumbnail_dir=str(self.thumbnail_dir),
                   quality=quality)
    
    def _get_thumbnail_path(self, file_path: Path, size: str) -> Path:
        """Generate thumbnail file path"""
        # Create a hash-based filename to avoid conflicts
        file_hash = hashlib.md5(str(file_path).encode()).hexdigest()
        filename = f"{file_hash}_{file_path.stem}.jpg"
        return self.thumbnail_dir / size / filename
    
    def _is_supported_image(self, file_path: Path) -> bool:
        """Check if file is a supported image format"""
        return file_path.suffix.lower() in self.IMAGE_FORMATS
    
    def _is_supported_video(self, file_path: Path) -> bool:
        """Check if file is a supported video format"""
        return file_path.suffix.lower() in self.VIDEO_FORMATS
    
    def generate_image_thumbnails(self, file_path: Path) -> Dict[str, str]:
        """Generate thumbnails for image files"""
        thumbnails = {}
        
        try:
            with Image.open(file_path) as img:
                # Auto-rotate based on EXIF orientation
                img = ImageOps.exif_transpose(img)
                
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Generate thumbnails for each size
                for size_name, (width, height) in self.THUMBNAIL_SIZES.items():
                    thumbnail_path = self._get_thumbnail_path(file_path, size_name)
                    
                    # Create thumbnail with aspect ratio preservation
                    img_copy = img.copy()
                    img_copy.thumbnail((width, height), Image.Resampling.LANCZOS)
                    
                    # Create a new image with the exact dimensions (centered)
                    thumb = Image.new('RGB', (width, height), (255, 255, 255))
                    offset = ((width - img_copy.width) // 2, (height - img_copy.height) // 2)
                    thumb.paste(img_copy, offset)
                    
                    # Save thumbnail
                    thumb.save(thumbnail_path, 'JPEG', quality=self.quality, optimize=True)
                    thumbnails[size_name] = str(thumbnail_path)
                    
                    logger.debug("Generated image thumbnail", 
                               file_path=str(file_path),
                               size=size_name,
                               thumbnail_path=str(thumbnail_path))
                
        except Exception as e:
            logger.error("Failed to generate image thumbnails", 
                        file_path=str(file_path), error=str(e))
        
        return thumbnails
    
    def generate_video_thumbnails(self, file_path: Path) -> Dict[str, str]:
        """Generate thumbnails for video files using ffmpeg"""
        thumbnails = {}
        
        try:
            # Get video duration first
            duration_cmd = [
                'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                '-of', 'csv=p=0', str(file_path)
            ]
            
            result = subprocess.run(duration_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error("Failed to get video duration", file_path=str(file_path))
                return thumbnails
            
            try:
                duration = float(result.stdout.strip())
                # Extract frame from 10% into the video (avoid black frames at start)
                seek_time = max(1.0, duration * 0.1)
            except (ValueError, TypeError):
                seek_time = 5.0  # Default to 5 seconds
            
            # Generate thumbnails for each size
            for size_name, (width, height) in self.THUMBNAIL_SIZES.items():
                thumbnail_path = self._get_thumbnail_path(file_path, size_name)
                
                # Use ffmpeg to extract frame and resize
                ffmpeg_cmd = [
                    'ffmpeg', '-y', '-v', 'quiet',
                    '-ss', str(seek_time),
                    '-i', str(file_path),
                    '-vframes', '1',
                    '-vf', f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:white',
                    '-q:v', '2',
                    str(thumbnail_path)
                ]
                
                result = subprocess.run(ffmpeg_cmd, capture_output=True)
                if result.returncode == 0:
                    thumbnails[size_name] = str(thumbnail_path)
                    logger.debug("Generated video thumbnail", 
                               file_path=str(file_path),
                               size=size_name,
                               thumbnail_path=str(thumbnail_path))
                else:
                    logger.error("Failed to generate video thumbnail", 
                               file_path=str(file_path),
                               size=size_name,
                               error=result.stderr.decode())
                
        except Exception as e:
            logger.error("Failed to generate video thumbnails", 
                        file_path=str(file_path), error=str(e))
        
        return thumbnails
    
    def generate_thumbnails(self, file_path: Path) -> Dict[str, str]:
        """Generate thumbnails based on file type"""
        if not file_path.exists():
            logger.warning("File does not exist", file_path=str(file_path))
            return {}
        
        # Check if thumbnails already exist
        existing_thumbnails = {}
        all_exist = True
        
        for size_name in self.THUMBNAIL_SIZES:
            thumbnail_path = self._get_thumbnail_path(file_path, size_name)
            if thumbnail_path.exists():
                existing_thumbnails[size_name] = str(thumbnail_path)
            else:
                all_exist = False
        
        if all_exist:
            logger.debug("Thumbnails already exist", file_path=str(file_path))
            return existing_thumbnails
        
        # Generate new thumbnails
        if self._is_supported_image(file_path):
            return self.generate_image_thumbnails(file_path)
        elif self._is_supported_video(file_path):
            return self.generate_video_thumbnails(file_path)
        else:
            logger.debug("Unsupported file type for thumbnails", file_path=str(file_path))
            return {}
    
    def cleanup_thumbnails(self, file_path: Path):
        """Remove thumbnails for a deleted file"""
        for size_name in self.THUMBNAIL_SIZES:
            thumbnail_path = self._get_thumbnail_path(file_path, size_name)
            if thumbnail_path.exists():
                try:
                    thumbnail_path.unlink()
                    logger.debug("Removed thumbnail", thumbnail_path=str(thumbnail_path))
                except Exception as e:
                    logger.error("Failed to remove thumbnail", 
                               thumbnail_path=str(thumbnail_path), error=str(e))


class ThumbnailGeneratorService:
    """Main thumbnail generation service"""
    
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.thumbnail_dir = os.getenv('THUMBNAIL_DIR', '/app/thumbnails')
        self.quality = int(os.getenv('THUMBNAIL_QUALITY', '85'))
        self.thumbnail_queue = 'thumbnail_generation_queue'
        self.redis_client = None
        self.generator = None
        
    def connect_redis(self):
        """Connect to Redis"""
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            self.redis_client.ping()
            logger.info("Connected to Redis", redis_url=self.redis_url)
        except Exception as e:
            logger.error("Failed to connect to Redis", error=str(e))
            raise
    
    def initialize_generator(self):
        """Initialize thumbnail generator"""
        self.generator = ThumbnailGenerator(self.thumbnail_dir, self.quality)
        logger.info("Initialized thumbnail generator")
    
    def process_file(self, message: Dict) -> bool:
        """Process a single file message"""
        try:
            file_path = Path(message['file_path'])
            event_type = message['event_type']
            
            if event_type == 'deleted':
                # Remove thumbnails for deleted file
                self.generator.cleanup_thumbnails(file_path)
                return True
            
            # Generate thumbnails
            thumbnails = self.generator.generate_thumbnails(file_path)
            
            if thumbnails:
                # Store thumbnail paths in Redis for the file
                thumbnail_key = f"thumbnails:{file_path}"
                self.redis_client.hset(thumbnail_key, mapping=thumbnails)
                
                # Set expiration (optional, for cleanup)
                self.redis_client.expire(thumbnail_key, 86400 * 30)  # 30 days
                
                logger.info("Generated thumbnails", 
                          file_path=str(file_path),
                          count=len(thumbnails))
                return True
            else:
                logger.debug("No thumbnails generated", file_path=str(file_path))
                return True  # Not an error for unsupported files
                
        except Exception as e:
            logger.error("Failed to process file", message=message, error=str(e))
            return False
    
    def process_queue(self):
        """Process thumbnail generation queue"""
        logger.info("Starting thumbnail generation queue processing")
        
        while True:
            try:
                # Listen for messages from metadata extractor
                result = self.redis_client.brpop(self.thumbnail_queue, timeout=1)
                
                if result:
                    queue_name, message_data = result
                    message = json.loads(message_data)
                    
                    logger.info("Processing thumbnail generation", 
                              file_path=message.get('file_path'),
                              event_type=message.get('event_type'))
                    
                    success = self.process_file(message)
                    
                    if not success:
                        logger.error("Thumbnail generation failed", message=message)
                        
            except KeyboardInterrupt:
                logger.info("Shutting down thumbnail generator")
                break
            except Exception as e:
                logger.error("Queue processing error", error=str(e))
                time.sleep(5)  # Brief pause before retrying
    
    def run(self):
        """Main service entry point"""
        logger.info("Starting Thumbnail Generator Service")
        
        try:
            self.connect_redis()
            self.initialize_generator()
            self.process_queue()
        except Exception as e:
            logger.error("Service failed", error=str(e))
            raise


if __name__ == "__main__":
    service = ThumbnailGeneratorService()
    service.run()