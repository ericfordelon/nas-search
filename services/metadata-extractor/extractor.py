#!/usr/bin/env python3
"""
Metadata Extractor Service - Processes files from the queue and extracts metadata
"""

import os
import json
import time
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
from urllib.parse import urlparse

import redis
import requests
import structlog
import magic
from PIL import Image
from PIL.ExifTags import TAGS
import exifread
from mutagen import File as AudioFile

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


class MetadataExtractor:
    """Extract metadata from various file types"""
    
    def __init__(self, solr_url: str):
        self.solr_url = solr_url
        self.magic = magic.Magic(mime=True)
        
    def extract_image_metadata(self, file_path: Path) -> Dict[str, Any]:
        """Extract metadata from image files"""
        metadata = {}
        
        try:
            # Basic image info using PIL
            with Image.open(file_path) as img:
                metadata.update({
                    'width': img.width,
                    'height': img.height,
                    'color_space': img.mode,
                    'format': img.format
                })
            
            # EXIF data using exifread
            with open(file_path, 'rb') as f:
                tags = exifread.process_file(f, details=False)
                
                # Camera info
                if 'Image Make' in tags:
                    metadata['camera_make'] = str(tags['Image Make'])
                if 'Image Model' in tags:
                    metadata['camera_model'] = str(tags['Image Model'])
                if 'EXIF LensModel' in tags:
                    metadata['lens_model'] = str(tags['EXIF LensModel'])
                
                # Camera settings
                if 'EXIF FocalLength' in tags:
                    focal_length = str(tags['EXIF FocalLength'])
                    if '/' in focal_length:
                        num, den = focal_length.split('/')
                        metadata['focal_length'] = float(num) / float(den)
                
                if 'EXIF FNumber' in tags:
                    f_number = str(tags['EXIF FNumber'])
                    if '/' in f_number:
                        num, den = f_number.split('/')
                        metadata['aperture'] = float(num) / float(den)
                
                if 'EXIF ISOSpeedRatings' in tags:
                    metadata['iso_speed'] = int(str(tags['EXIF ISOSpeedRatings']))
                
                if 'EXIF ExposureTime' in tags:
                    metadata['shutter_speed'] = str(tags['EXIF ExposureTime'])
                
                if 'EXIF Flash' in tags:
                    try:
                        flash_value = str(tags['EXIF Flash'])
                        # Try to parse as integer, fallback to detecting keywords
                        try:
                            metadata['flash'] = int(flash_value) > 0
                        except ValueError:
                            # Parse text descriptions like "Flash did not fire"
                            metadata['flash'] = 'fire' in flash_value.lower()
                    except:
                        metadata['flash'] = False
                
                # GPS data
                if 'GPS GPSLatitude' in tags and 'GPS GPSLongitude' in tags:
                    lat_ref = str(tags.get('GPS GPSLatitudeRef', 'N'))
                    lon_ref = str(tags.get('GPS GPSLongitudeRef', 'E'))
                    
                    # Convert GPS coordinates
                    lat = self._convert_gps_coord(str(tags['GPS GPSLatitude']))
                    lon = self._convert_gps_coord(str(tags['GPS GPSLongitude']))
                    
                    if lat and lon:
                        if lat_ref == 'S':
                            lat = -lat
                        if lon_ref == 'W':
                            lon = -lon
                        metadata['gps_location'] = f"{lat},{lon}"
                
                if 'GPS GPSAltitude' in tags:
                    altitude = str(tags['GPS GPSAltitude'])
                    if '/' in altitude:
                        num, den = altitude.split('/')
                        metadata['gps_altitude'] = float(num) / float(den)
                
        except Exception as e:
            logger.error("Failed to extract image metadata", file_path=str(file_path), error=str(e))
        
        return metadata
    
    def _convert_gps_coord(self, coord_str: str) -> Optional[float]:
        """Convert GPS coordinate from EXIF format to decimal degrees"""
        try:
            # Format: [degrees, minutes, seconds]
            parts = coord_str.strip('[]').split(', ')
            if len(parts) == 3:
                degrees = float(parts[0])
                minutes = float(parts[1])
                seconds = float(parts[2])
                return degrees + minutes/60 + seconds/3600
        except:
            pass
        return None
    
    def extract_video_metadata(self, file_path: Path) -> Dict[str, Any]:
        """Extract metadata from video files using ffprobe"""
        metadata = {}
        
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', str(file_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                
                # Format info
                if 'format' in data:
                    fmt = data['format']
                    if 'duration' in fmt:
                        metadata['duration'] = int(float(fmt['duration']))
                    if 'bit_rate' in fmt:
                        metadata['bit_rate'] = int(fmt['bit_rate'])
                
                # Stream info
                video_stream = None
                audio_stream = None
                
                for stream in data.get('streams', []):
                    if stream.get('codec_type') == 'video' and not video_stream:
                        video_stream = stream
                    elif stream.get('codec_type') == 'audio' and not audio_stream:
                        audio_stream = stream
                
                if video_stream:
                    metadata.update({
                        'width': video_stream.get('width'),
                        'height': video_stream.get('height'),
                        'video_codec': video_stream.get('codec_name'),
                        'frame_rate': self._parse_frame_rate(video_stream.get('r_frame_rate')),
                        'resolution': f"{video_stream.get('width')}x{video_stream.get('height')}"
                    })
                
                if audio_stream:
                    metadata['audio_codec'] = audio_stream.get('codec_name')
                    
        except Exception as e:
            logger.error("Failed to extract video metadata", file_path=str(file_path), error=str(e))
        
        return metadata
    
    def _parse_frame_rate(self, frame_rate_str: str) -> Optional[float]:
        """Parse frame rate from ffprobe output"""
        try:
            if frame_rate_str and '/' in frame_rate_str:
                num, den = frame_rate_str.split('/')
                return float(num) / float(den)
        except:
            pass
        return None
    
    def extract_audio_metadata(self, file_path: Path) -> Dict[str, Any]:
        """Extract metadata from audio files"""
        metadata = {}
        
        try:
            audio_file = AudioFile(str(file_path))
            if audio_file is not None:
                tags = audio_file.tags
                if tags:
                    # Common audio tags
                    metadata.update({
                        'artist': self._get_tag_value(tags, ['TPE1', 'ARTIST', '\xa9ART']),
                        'album': self._get_tag_value(tags, ['TALB', 'ALBUM', '\xa9alb']),
                        'title': self._get_tag_value(tags, ['TIT2', 'TITLE', '\xa9nam']),
                        'genre': self._get_tag_value(tags, ['TCON', 'GENRE', '\xa9gen']),
                        'year': self._get_tag_value(tags, ['TDRC', 'DATE', '\xa9day']),
                        'track_number': self._get_tag_value(tags, ['TRCK', 'TRACKNUMBER', 'trkn'])
                    })
                
                # Duration
                if hasattr(audio_file, 'info') and audio_file.info:
                    metadata['duration'] = int(audio_file.info.length)
                    
        except Exception as e:
            logger.error("Failed to extract audio metadata", file_path=str(file_path), error=str(e))
        
        return metadata
    
    def _get_tag_value(self, tags: Dict, tag_names: list) -> Optional[str]:
        """Get tag value from various possible tag names"""
        for tag_name in tag_names:
            if tag_name in tags:
                value = tags[tag_name]
                if isinstance(value, list) and value:
                    return str(value[0])
                elif value:
                    return str(value)
        return None
    
    def extract_text_content(self, file_path: Path) -> Dict[str, Any]:
        """Extract text content from text files and documents"""
        metadata = {}
        
        try:
            file_extension = file_path.suffix.lower()
            
            if file_extension == '.txt':
                # Read plain text files directly
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    metadata['content'] = content[:10000]  # Limit to 10KB for indexing
                    metadata['character_count'] = len(content)
            elif file_extension in ['.pdf', '.doc', '.docx', '.rtf', '.odt']:
                # Use Apache Tika for document extraction (would need Tika server)
                # For now, just detect the document type
                metadata['document_type'] = file_extension[1:]
                
        except Exception as e:
            logger.error("Failed to extract text content", file_path=str(file_path), error=str(e))
        
        return metadata
    
    def extract_metadata(self, file_path: Path) -> Dict[str, Any]:
        """Extract metadata based on file type"""
        metadata = {}
        
        try:
            # Detect MIME type
            mime_type = self.magic.from_file(str(file_path))
            metadata['content_type'] = mime_type
            
            # Derive high-level file type for faceting
            if mime_type.startswith('image/'):
                metadata['file_type'] = 'image'
                metadata.update(self.extract_image_metadata(file_path))
            elif mime_type.startswith('video/'):
                metadata['file_type'] = 'video'
                metadata.update(self.extract_video_metadata(file_path))
            elif mime_type.startswith('audio/'):
                metadata['file_type'] = 'audio'
                metadata.update(self.extract_audio_metadata(file_path))
            elif mime_type.startswith('text/') or file_path.suffix.lower() in ['.txt', '.pdf', '.doc', '.docx', '.rtf', '.odt']:
                metadata['file_type'] = 'document'
                metadata.update(self.extract_text_content(file_path))
            else:
                # Default file type based on extension
                ext = file_path.suffix.lower()
                if ext in ['.zip', '.rar', '.7z', '.tar', '.gz']:
                    metadata['file_type'] = 'archive'
                else:
                    metadata['file_type'] = 'other'
            
        except Exception as e:
            logger.error("Failed to extract metadata", file_path=str(file_path), error=str(e))
        
        return metadata


class MetadataExtractorService:
    """Main metadata extraction service"""
    
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL', 'redis://redis:6379')
        self.solr_url = os.getenv('SOLR_URL', 'http://solr:8983/solr/nas_content')
        self.processing_queue = 'file_processing_queue'
        self.thumbnail_queue = 'thumbnail_generation_queue'
        self.redis_client = None
        self.extractor = None
        
    def connect_redis(self):
        """Connect to Redis"""
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            self.redis_client.ping()
            logger.info("Connected to Redis", redis_url=self.redis_url)
        except Exception as e:
            logger.error("Failed to connect to Redis", error=str(e))
            raise
    
    def initialize_extractor(self):
        """Initialize metadata extractor"""
        self.extractor = MetadataExtractor(self.solr_url)
        logger.info("Initialized metadata extractor", solr_url=self.solr_url)
    
    def process_file(self, message: Dict[str, Any]) -> bool:
        """Process a single file message"""
        try:
            # Use standardized path for indexing/tracking
            standardized_path = message['file_path']
            # Use container path for actual file operations
            container_path = Path(message.get('container_path', message['file_path']))
            event_type = message['event_type']
            
            if event_type == 'deleted':
                # Remove from Solr index using standardized path
                success = self.delete_from_solr(standardized_path)
                # Release the global processing lock
                global_lock_key = f"global_processing:{standardized_path}"
                self.redis_client.delete(global_lock_key)
                return success
            
            if not container_path.exists():
                logger.warning("File no longer exists", 
                             standardized_path=standardized_path, 
                             container_path=str(container_path))
                return True
            
            # Extract metadata from actual file
            metadata = self.extractor.extract_metadata(container_path)
            
            # Combine with file message data
            document = {**message, **metadata}
            
            # Create deterministic document ID based on standardized path
            # This ensures the same file always gets the same ID, allowing updates to overwrite
            import hashlib
            deterministic_id = hashlib.sha256(standardized_path.encode()).hexdigest()
            document['id'] = deterministic_id
            document['processing_status'] = 'completed'
            
            # Remove container_path from final document (not needed in index)
            document.pop('container_path', None)
            
            # Fix date formats for Solr (ISO format with Z suffix)
            for date_field in ['created_date', 'modified_date']:
                if date_field in document and document[date_field]:
                    date_str = document[date_field]
                    if not date_str.endswith('Z'):
                        document[date_field] = date_str + 'Z'
            
            # Index in Solr
            success = self.index_in_solr(document)
            
            if success:
                # Mark as processed with timestamp using standardized path
                processed_key = f"processed:{standardized_path}"
                self.redis_client.set(processed_key, str(time.time()), ex=86400)  # Expire after 24 hours
                self.redis_client.sadd('processed_files', standardized_path)
                self.redis_client.srem('queued_files', standardized_path)
                
                # Release the global processing lock
                global_lock_key = f"global_processing:{standardized_path}"
                self.redis_client.delete(global_lock_key)
                
                # Trigger thumbnail generation for supported files
                self.trigger_thumbnail_generation(message)
                
                logger.info("File processed successfully", 
                           standardized_path=standardized_path,
                           container_path=str(container_path))
            else:
                # Release the global processing lock even on failure
                global_lock_key = f"global_processing:{standardized_path}"
                self.redis_client.delete(global_lock_key)
            
            return success
            
        except Exception as e:
            logger.error("Failed to process file", message=message, error=str(e))
            # Release the global processing lock on exception
            try:
                standardized_path = message.get('file_path')
                if standardized_path:
                    global_lock_key = f"global_processing:{standardized_path}"
                    self.redis_client.delete(global_lock_key)
            except:
                pass
            return False
    
    def check_if_update_needed(self, document: Dict[str, Any]) -> bool:
        """Check if document needs to be updated in Solr"""
        try:
            file_path = document.get('file_path')
            content_hash = document.get('content_hash')
            modified_date = document.get('modified_date')
            file_size = document.get('file_size')
            
            if not file_path:
                return True
            
            # Query existing document from Solr by file_path (since we now use deterministic IDs)
            response = requests.get(
                f"{self.solr_url}/select",
                params={
                    'q': f'file_path:"{file_path}"',
                    'fl': 'content_hash,modified_date,file_size',
                    'wt': 'json'
                }
            )
            
            if response.status_code != 200:
                logger.warning("Failed to query Solr for existing document", file_path=file_path)
                return True
            
            data = response.json()
            if data['response']['numFound'] == 0:
                # Document doesn't exist, needs indexing
                logger.info("Document not found in Solr, needs indexing", file_path=file_path)
                return True
            
            if data['response']['numFound'] > 1:
                # Multiple documents found - this shouldn't happen with deterministic IDs
                logger.warning("Multiple documents found for file_path, will reindex", 
                             file_path=file_path, count=data['response']['numFound'])
                return True
            
            existing_doc = data['response']['docs'][0]
            existing_hash = existing_doc.get('content_hash')
            existing_modified = existing_doc.get('modified_date')
            existing_size = existing_doc.get('file_size')
            
            # Skip if content hash AND file size match (file hasn't changed)
            if (content_hash and existing_hash == content_hash and 
                file_size and existing_size == file_size):
                logger.info("Skipping indexing - content and size unchanged", 
                           file_path=file_path, 
                           hash=content_hash[:16] + "...",
                           size=file_size)
                return False
            
            # Skip if modification date is the same or older AND size matches
            if (modified_date and existing_modified and modified_date <= existing_modified and
                file_size and existing_size == file_size):
                logger.info("Skipping indexing - file not newer and size unchanged", 
                           file_path=file_path, 
                           existing_modified=existing_modified,
                           new_modified=modified_date)
                return False
            
            logger.info("Document needs updating", 
                       file_path=file_path,
                       hash_changed=existing_hash != content_hash,
                       size_changed=existing_size != file_size,
                       date_newer=modified_date > existing_modified if existing_modified else True)
            return True
            
        except Exception as e:
            logger.warning("Error checking if update needed, proceeding with indexing", 
                          file_path=document.get('file_path'), error=str(e))
            return True

    def index_in_solr(self, document: Dict[str, Any]) -> bool:
        """Index document in Solr"""
        try:
            # Check if update is actually needed
            if not self.check_if_update_needed(document):
                return True  # Return success since document is already up to date
            
            # Fields that should not be sent to Solr (not in our schema)
            excluded_fields = {'event_type', 'queued_at', 'format'}
            
            # Clean up document for Solr
            solr_doc = {k: v for k, v in document.items() 
                       if v is not None and k not in excluded_fields}
            
            # Post to Solr
            response = requests.post(
                f"{self.solr_url}/update?commit=true",
                json=[solr_doc],
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                logger.info("Document indexed in Solr", file_path=document.get('file_path'))
                return True
            else:
                logger.error("Failed to index in Solr", 
                           status_code=response.status_code, 
                           response=response.text)
                return False
                
        except Exception as e:
            logger.error("Solr indexing error", error=str(e))
            return False
    
    def trigger_thumbnail_generation(self, message: Dict[str, Any]):
        """Trigger thumbnail generation for supported files"""
        try:
            # Check if file type supports thumbnails
            file_extension = message.get('file_extension', '').lower()
            image_formats = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp'}
            video_formats = {'.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'}
            
            if file_extension in image_formats or file_extension in video_formats:
                # Send message to thumbnail generation queue
                self.redis_client.lpush(self.thumbnail_queue, json.dumps(message))
                logger.info("Triggered thumbnail generation", 
                          file_path=message.get('file_path'),
                          file_type=file_extension)
        except Exception as e:
            logger.error("Failed to trigger thumbnail generation", error=str(e))
    
    def delete_from_solr(self, file_path) -> bool:
        """Delete document from Solr using file_path query"""
        try:
            # Since we now use deterministic IDs, we need to delete by file_path query
            # file_path can be either a Path object or string (standardized path)
            path_str = str(file_path)
            delete_query = f'file_path:"{path_str}"'
            
            response = requests.post(
                f"{self.solr_url}/update?commit=true",
                data=f'<delete><query>{delete_query}</query></delete>',
                headers={'Content-Type': 'text/xml'}
            )
            
            if response.status_code == 200:
                logger.info("Document deleted from Solr", file_path=path_str)
                return True
            else:
                logger.error("Failed to delete from Solr", 
                           status_code=response.status_code, 
                           response=response.text)
                return False
                
        except Exception as e:
            logger.error("Solr deletion error", error=str(e))
            return False
    
    def process_queue(self):
        """Process files from the Redis queue"""
        logger.info("Starting queue processing")
        
        while True:
            try:
                # Block for 1 second waiting for messages
                result = self.redis_client.brpop(self.processing_queue, timeout=1)
                
                if result:
                    queue_name, message_data = result
                    message = json.loads(message_data)
                    
                    logger.info("Processing file", 
                              file_path=message.get('file_path'),
                              event_type=message.get('event_type'))
                    
                    success = self.process_file(message)
                    
                    if not success:
                        # Could implement retry logic here
                        logger.error("File processing failed", message=message)
                        
            except KeyboardInterrupt:
                logger.info("Shutting down metadata extractor")
                break
            except Exception as e:
                logger.error("Queue processing error", error=str(e))
                time.sleep(5)  # Brief pause before retrying
    
    def run(self):
        """Main service entry point"""
        logger.info("Starting Metadata Extractor Service")
        
        try:
            self.connect_redis()
            self.initialize_extractor()
            self.process_queue()
        except Exception as e:
            logger.error("Service failed", error=str(e))
            raise


if __name__ == "__main__":
    service = MetadataExtractorService()
    service.run()