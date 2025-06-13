#!/usr/bin/env python3
"""
Search API Service - REST API for querying the NAS search index
"""

import os
from typing import Dict, List, Optional, Any
from urllib.parse import urlencode
from pathlib import Path

import requests
import structlog
import redis
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

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

# Configuration
SOLR_URL = os.getenv('SOLR_URL', 'http://localhost:8983/solr/nas_content')
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
THUMBNAIL_DIR = os.getenv('THUMBNAIL_DIR', '/app/thumbnails')

# Initialize Redis connection
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

app = FastAPI(
    title="NAS Search API",
    description="Search API for personal NAS content indexing and discovery",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Response models
class SearchResult(BaseModel):
    id: str
    file_path: str
    file_name: str
    file_type: Optional[str] = None
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    created_date: Optional[str] = None
    modified_date: Optional[str] = None
    directory_path: Optional[str] = None
    
    # Image metadata
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    gps_location: Optional[str] = None
    
    # Video metadata
    duration: Optional[int] = None
    video_codec: Optional[str] = None
    resolution: Optional[str] = None
    
    # Audio metadata
    artist: Optional[str] = None
    album: Optional[str] = None
    title: Optional[str] = None
    genre: Optional[str] = None
    
    # Document metadata
    author: Optional[str] = None
    page_count: Optional[int] = None
    
    # Highlights
    highlights: Optional[List[str]] = None
    score: Optional[float] = None

class FacetValue(BaseModel):
    value: str
    count: int

class SearchFacets(BaseModel):
    file_type: List[FacetValue] = []
    content_type: List[FacetValue] = []
    camera_make: List[FacetValue] = []
    camera_model: List[FacetValue] = []
    author: List[FacetValue] = []
    artist: List[FacetValue] = []
    genre: List[FacetValue] = []
    directory_path: List[FacetValue] = []

class SearchResponse(BaseModel):
    query: str
    total: int
    start: int
    rows: int
    docs: List[SearchResult]
    facets: SearchFacets
    query_time: int

class StatsResponse(BaseModel):
    total_documents: int
    file_types: Dict[str, int]
    content_types: Dict[str, int]
    total_size: int
    index_status: str

@app.get("/")
async def root():
    """API health check"""
    return {"message": "NAS Search API", "version": "1.0.0", "status": "healthy"}

@app.get("/search", response_model=SearchResponse)
async def search(request: Request):
    """
    Search the NAS content index - passes all parameters directly to Solr
    
    Supports all Solr query parameters:
    - **q**: Search query (supports Solr syntax) 
    - **start**: Pagination offset
    - **rows**: Number of results per page
    - **sort**: Sort order (e.g., 'created_date desc')
    - **fq**: Filter queries (e.g., 'file_type:image')
    - **facet**: Enable faceting
    - **hl**: Enable highlighting
    - Any other Solr parameters
    """
    try:
        # Get all query parameters from the request
        params = dict(request.query_params)
        
        # Add default Solr parameters for our use case
        default_params = {
            'wt': 'json',
            'indent': 'true',
            'facet': 'true',
            'facet.field': [
                'file_type', 'content_type', 'camera_make', 
                'camera_model', 'author', 'artist', 'genre', 'directory_path'
            ],
            'facet.mincount': 1,
            'hl': 'true',
            'hl.fl': 'content',
            'hl.simple.pre': '<mark>',
            'hl.simple.post': '</mark>',
            'fl': '*,score'
        }
        
        # Merge defaults with user params (user params take precedence)
        final_params = {**default_params, **params}
        
        # Set default query if not provided
        if 'q' not in final_params:
            final_params['q'] = '*:*'
        
        # Make request to Solr
        response = requests.get(f"{SOLR_URL}/select", params=final_params)
        response.raise_for_status()
        
        solr_data = response.json()
        
        # Parse results
        docs = []
        for doc in solr_data['response']['docs']:
            # Extract highlights
            highlights = None
            doc_id = doc.get('id', '')
            if 'highlighting' in solr_data and doc_id in solr_data['highlighting']:
                hl_data = solr_data['highlighting'][doc_id]
                if 'content' in hl_data:
                    highlights = hl_data['content']
            
            search_result = SearchResult(
                id=doc.get('id', ''),
                file_path=doc.get('file_path', ''),
                file_name=doc.get('file_name', ''),
                file_type=doc.get('file_type'),
                content_type=doc.get('content_type'),
                file_size=doc.get('file_size'),
                created_date=doc.get('created_date'),
                modified_date=doc.get('modified_date'),
                directory_path=doc.get('directory_path'),
                camera_make=doc.get('camera_make'),
                camera_model=doc.get('camera_model'),
                width=doc.get('width'),
                height=doc.get('height'),
                gps_location=doc.get('gps_location'),
                duration=doc.get('duration'),
                video_codec=doc.get('video_codec'),
                resolution=doc.get('resolution'),
                artist=doc.get('artist'),
                album=doc.get('album'),
                title=doc.get('title'),
                genre=doc.get('genre'),
                author=doc.get('author'),
                page_count=doc.get('page_count'),
                highlights=highlights,
                score=doc.get('score')
            )
            docs.append(search_result)
        
        # Parse facets
        facets = SearchFacets()
        facet_fields = solr_data.get('facet_counts', {}).get('facet_fields', {})
        
        for field_name, values in facet_fields.items():
            facet_list = []
            # Solr returns facets as [value1, count1, value2, count2, ...]
            for i in range(0, len(values), 2):
                if i + 1 < len(values):
                    facet_list.append(FacetValue(value=values[i], count=values[i + 1]))
            
            if hasattr(facets, field_name):
                setattr(facets, field_name, facet_list)
        
        return SearchResponse(
            query=q,
            total=solr_data['response']['numFound'],
            start=start,
            rows=rows,
            docs=docs,
            facets=facets,
            query_time=solr_data['responseHeader']['QTime']
        )
        
    except requests.RequestException as e:
        logger.error("Solr request failed", error=str(e))
        raise HTTPException(status_code=503, detail="Search service unavailable")
    except Exception as e:
        logger.error("Search request failed", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/search/debug")
async def search_debug(request: Request):
    """
    Debug endpoint that returns raw Solr response with request parameters
    """
    try:
        # Get all query parameters from the request  
        params = dict(request.query_params)
        
        # Add default Solr parameters
        default_params = {
            'wt': 'json',
            'indent': 'true',
            'facet': 'true',
            'facet.field': [
                'file_type', 'content_type', 'camera_make', 
                'camera_model', 'author', 'artist', 'genre', 'directory_path'
            ],
            'facet.mincount': 1,
            'hl': 'true',
            'hl.fl': 'content',
            'hl.simple.pre': '<mark>',
            'hl.simple.post': '</mark>',
            'fl': '*,score'
        }
        
        # Merge defaults with user params
        final_params = {**default_params, **params}
        
        # Set default query if not provided
        if 'q' not in final_params:
            final_params['q'] = '*:*'
        
        # Make request to Solr
        response = requests.get(f"{SOLR_URL}/select", params=final_params)
        response.raise_for_status()
        
        solr_data = response.json()
        
        # Return debug info
        return {
            "frontend_params": dict(request.query_params),
            "solr_params": final_params,
            "solr_url": f"{SOLR_URL}/select",
            "solr_response": solr_data
        }
        
    except requests.RequestException as e:
        logger.error("Solr request failed", error=str(e))
        raise HTTPException(status_code=503, detail="Search service unavailable")
    except Exception as e:
        logger.error("Debug request failed", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Get index statistics"""
    try:
        # Get total document count
        response = requests.get(f"{SOLR_URL}/select", params={
            'q': '*:*',
            'rows': 0,
            'wt': 'json',
            'facet': 'true',
            'facet.field': ['file_type', 'content_type']
        })
        response.raise_for_status()
        
        data = response.json()
        total_docs = data['response']['numFound']
        
        # Parse facets
        facet_fields = data.get('facet_counts', {}).get('facet_fields', {})
        
        file_types = {}
        if 'file_type' in facet_fields:
            values = facet_fields['file_type']
            for i in range(0, len(values), 2):
                if i + 1 < len(values):
                    file_types[values[i]] = values[i + 1]
        
        content_types = {}
        if 'content_type' in facet_fields:
            values = facet_fields['content_type']
            for i in range(0, len(values), 2):
                if i + 1 < len(values):
                    content_types[values[i]] = values[i + 1]
        
        # Get total file size (would need aggregation for real implementation)
        total_size = 0  # Placeholder
        
        return StatsResponse(
            total_documents=total_docs,
            file_types=file_types,
            content_types=content_types,
            total_size=total_size,
            index_status="active"
        )
        
    except Exception as e:
        logger.error("Stats request failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get statistics")

@app.get("/suggest")
async def suggest(
    q: str = Query(..., description="Partial query for suggestions"),
    count: int = Query(5, ge=1, le=20, description="Number of suggestions")
):
    """Get search suggestions"""
    try:
        # Simple suggestion based on file names and content
        response = requests.get(f"{SOLR_URL}/select", params={
            'q': f'file_name:*{q}* OR content:*{q}*',
            'rows': count,
            'wt': 'json',
            'fl': 'file_name'
        })
        response.raise_for_status()
        
        data = response.json()
        suggestions = []
        
        for doc in data['response']['docs']:
            file_name = doc.get('file_name', '')
            if file_name and file_name not in suggestions:
                suggestions.append(file_name)
        
        return {"suggestions": suggestions[:count]}
        
    except Exception as e:
        logger.error("Suggestion request failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get suggestions")

@app.get("/thumbnail")
async def get_thumbnail(file_path: str = Query(..., description="Full file path"), size: str = Query(..., description="Thumbnail size")):
    """Get thumbnail for a file"""
    try:
        if size not in ['small', 'medium', 'large']:
            raise HTTPException(status_code=400, detail="Invalid thumbnail size")
        
        # Get thumbnail path from Redis
        thumbnail_key = f"thumbnails:{file_path}"
        thumbnail_path = redis_client.hget(thumbnail_key, size)
        
        if not thumbnail_path:
            raise HTTPException(status_code=404, detail="Thumbnail not found")
        
        thumbnail_file = Path(thumbnail_path)
        if not thumbnail_file.exists():
            raise HTTPException(status_code=404, detail="Thumbnail file not found")
        
        return FileResponse(
            thumbnail_file,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"}  # Cache for 1 day
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to serve thumbnail", file_path=file_path, size=size, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to serve thumbnail")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check Solr connection
        response = requests.get(f"{SOLR_URL}/admin/ping", timeout=5)
        solr_healthy = response.status_code == 200
        
        # Check Redis connection
        try:
            redis_client.ping()
            redis_healthy = True
        except Exception:
            redis_healthy = False
        
        overall_healthy = solr_healthy and redis_healthy
        
        return {
            "status": "healthy" if overall_healthy else "degraded",
            "solr": "healthy" if solr_healthy else "unhealthy",
            "redis": "healthy" if redis_healthy else "unhealthy",
            "timestamp": "2023-12-06T12:00:00Z"
        }
    except Exception:
        return {
            "status": "unhealthy",
            "solr": "unreachable",
            "redis": "unreachable",
            "timestamp": "2023-12-06T12:00:00Z"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)