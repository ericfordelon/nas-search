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
            
            # Extract type-specific metadata
            if mime_type.startswith('image/'):
                metadata.update(self.extract_image_metadata(file_path))
            elif mime_type.startswith('video/'):
                metadata.update(self.extract_video_metadata(file_path))
            elif mime_type.startswith('audio/'):
                metadata.update(self.extract_audio_metadata(file_path))
            elif mime_type.startswith('text/') or file_path.suffix.lower() in ['.txt', '.pdf', '.doc', '.docx', '.rtf', '.odt']:
                metadata.update(self.extract_text_content(file_path))
            
        except Exception as e:
            logger.error("Failed to extract metadata", file_path=str(file_path), error=str(e))
        
        return metadata


class MetadataExtractorService:
    """Main metadata extraction service"""
    
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.solr_url = os.getenv('SOLR_URL', 'http://localhost:8983/solr/nas_content')
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
            file_path = Path(message['file_path'])
            event_type = message['event_type']
            
            if event_type == 'deleted':
                # Remove from Solr index
                self.delete_from_solr(file_path)
                return True
            
            if not file_path.exists():
                logger.warning("File no longer exists", file_path=str(file_path))
                return True
            
            # Extract metadata
            metadata = self.extractor.extract_metadata(file_path)
            
            # Combine with file message data
            document = {**message, **metadata}
            document['id'] = str(file_path)  # Use file path as unique ID
            document['processing_status'] = 'completed'
            
            # Fix date formats for Solr (ISO format with Z suffix)
            for date_field in ['created_date', 'modified_date']:
                if date_field in document and document[date_field]:
                    date_str = document[date_field]
                    if not date_str.endswith('Z'):
                        document[date_field] = date_str + 'Z'
            
            # Index in Solr
            success = self.index_in_solr(document)
            
            if success:
                # Mark as processed
                self.redis_client.sadd('processed_files', str(file_path))
                self.redis_client.srem('queued_files', str(file_path))
                
                # Trigger thumbnail generation for supported files
                self.trigger_thumbnail_generation(message)
                
                logger.info("File processed successfully", file_path=str(file_path))
            
            return success
            
        except Exception as e:
            logger.error("Failed to process file", message=message, error=str(e))
            return False
    
    def index_in_solr(self, document: Dict[str, Any]) -> bool:
        """Index document in Solr"""
        try:
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
    
    def delete_from_solr(self, file_path: Path) -> bool:
        """Delete document from Solr"""
        try:
            delete_query = {"delete": {"id": str(file_path)}}
            
            response = requests.post(
                f"{self.solr_url}/update?commit=true",
                json=delete_query,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                logger.info("Document deleted from Solr", file_path=str(file_path))
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