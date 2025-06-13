#!/usr/bin/env python3
"""
Fast duplicate cleanup - removes all duplicates in bulk operations
"""

import requests
import time
from collections import defaultdict
import argparse

def get_all_file_paths(solr_url):
    """Get all unique file paths from Solr"""
    file_paths = set()
    start = 0
    batch_size = 1000
    
    while True:
        response = requests.get(f"{solr_url}/select", params={
            'q': '*:*',
            'start': start,
            'rows': batch_size,
            'fl': 'file_path',
            'wt': 'json'
        })
        
        if response.status_code != 200:
            print(f"Error querying Solr: {response.status_code}")
            break
            
        data = response.json()
        docs = data['response']['docs']
        
        if not docs:
            break
            
        for doc in docs:
            file_path = doc.get('file_path')
            if file_path:
                file_paths.add(file_path)
        
        start += batch_size
        print(f"Retrieved {len(file_paths)} unique file paths...")
        
        if len(docs) < batch_size:
            break
    
    return file_paths

def count_duplicates_per_path(solr_url, file_paths):
    """Count how many documents exist for each file path"""
    duplicates = {}
    
    for file_path in file_paths:
        response = requests.get(f"{solr_url}/select", params={
            'q': f'file_path:"{file_path}"',
            'rows': 0,
            'wt': 'json'
        })
        
        if response.status_code == 200:
            data = response.json()
            count = data['response']['numFound']
            if count > 1:
                duplicates[file_path] = count
                print(f"Found {count} duplicates for: {file_path}")
    
    return duplicates

def cleanup_duplicates_for_path(solr_url, file_path, count):
    """Remove all documents for a file path, then re-add one"""
    try:
        # First, get one document to keep
        response = requests.get(f"{solr_url}/select", params={
            'q': f'file_path:"{file_path}"',
            'rows': 1,
            'fl': '*',
            'sort': 'modified_date desc',
            'wt': 'json'
        })
        
        if response.status_code != 200:
            print(f"Error getting document for {file_path}")
            return False
        
        data = response.json()
        if data['response']['numFound'] == 0:
            print(f"No documents found for {file_path}")
            return True
        
        keeper_doc = data['response']['docs'][0]
        
        # Delete all documents with this file_path
        delete_response = requests.post(
            f"{solr_url}/update?commit=true",
            data=f'<delete><query>file_path:"{file_path}"</query></delete>',
            headers={'Content-Type': 'text/xml'}
        )
        
        if delete_response.status_code != 200:
            print(f"Error deleting documents for {file_path}: {delete_response.status_code}")
            return False
        
        # Re-add the keeper document
        add_response = requests.post(
            f"{solr_url}/update?commit=true",
            json=[keeper_doc],
            headers={'Content-Type': 'application/json'}
        )
        
        if add_response.status_code != 200:
            print(f"Error re-adding document for {file_path}: {add_response.status_code}")
            return False
        
        print(f"Cleaned up {count-1} duplicates for: {file_path}")
        return True
        
    except Exception as e:
        print(f"Error cleaning up {file_path}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Fast cleanup of duplicate documents in Solr')
    parser.add_argument('--solr-url', default='http://localhost:8983/solr/nas_content',
                       help='Solr URL (default: http://localhost:8983/solr/nas_content)')
    parser.add_argument('--execute', action='store_true',
                       help='Actually delete duplicates (default is dry run)')
    
    args = parser.parse_args()
    
    print(f"Connecting to Solr at: {args.solr_url}")
    
    # Get all unique file paths
    print("Getting all unique file paths...")
    file_paths = get_all_file_paths(args.solr_url)
    print(f"Found {len(file_paths)} unique file paths")
    
    # Count duplicates
    print("Checking for duplicates...")
    duplicates = count_duplicates_per_path(args.solr_url, file_paths)
    
    total_duplicates = sum(count - 1 for count in duplicates.values())
    print(f"\nFound {len(duplicates)} file paths with duplicates")
    print(f"Total duplicate documents to remove: {total_duplicates}")
    
    if not args.execute:
        print("\nDry run complete. Use --execute to actually clean up duplicates")
        return
    
    # Clean up duplicates
    print("\nCleaning up duplicates...")
    success_count = 0
    for file_path, count in duplicates.items():
        if cleanup_duplicates_for_path(args.solr_url, file_path, count):
            success_count += 1
        time.sleep(0.1)  # Small delay between operations
    
    print(f"\nCleanup complete! Successfully cleaned {success_count}/{len(duplicates)} file paths")

if __name__ == "__main__":
    main()