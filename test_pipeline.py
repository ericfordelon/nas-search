#!/usr/bin/env python3
"""
Simple test script to verify the pipeline works
"""

import json
import redis
import requests
from pathlib import Path

def test_pipeline():
    # Connect to Redis
    r = redis.from_url('redis://localhost:6379', decode_responses=True)
    
    # Test file
    test_file = Path('test-data/sample-document.txt')
    
    # Create a test message
    message = {
        'event_type': 'created',
        'file_path': str(test_file.absolute()),
        'file_name': test_file.name,
        'file_size': test_file.stat().st_size if test_file.exists() else 0,
        'file_extension': test_file.suffix.lower(),
        'content_hash': 'test-hash-123',
        'created_date': '2023-12-06T12:00:00',
        'modified_date': '2023-12-06T12:00:00',
        'directory_path': str(test_file.parent),
        'directory_depth': 1,
        'queued_at': '2023-12-06T12:00:00'
    }
    
    # Add to queue
    r.lpush('file_processing_queue', json.dumps(message))
    print(f"Added test message to queue: {test_file}")
    
    # Check queue length
    queue_length = r.llen('file_processing_queue')
    print(f"Queue length: {queue_length}")
    
    # Test direct Solr indexing
    solr_doc = {
        'id': str(test_file.absolute()),
        'file_path': str(test_file.absolute()),
        'file_name': test_file.name,
        'file_type': 'text',
        'content': 'This is a test document for NAS search indexing.',
        'content_type': 'text/plain'
    }
    
    response = requests.post(
        'http://localhost:8983/solr/nas_content/update?commit=true',
        json=[solr_doc],
        headers={'Content-Type': 'application/json'}
    )
    
    if response.status_code == 200:
        print("Successfully indexed test document in Solr")
    else:
        print(f"Failed to index in Solr: {response.status_code} - {response.text}")
    
    # Test search
    search_response = requests.get(
        'http://localhost:8983/solr/nas_content/select?q=test&wt=json&indent=true'
    )
    
    if search_response.status_code == 200:
        data = search_response.json()
        print(f"Search results: {data['response']['numFound']} documents found")
        if data['response']['numFound'] > 0:
            print(f"First result: {data['response']['docs'][0]['file_name']}")
    
if __name__ == "__main__":
    test_pipeline()