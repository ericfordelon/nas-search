#!/usr/bin/env python3
"""
Script to clean up duplicate documents in Solr based on content hash and file path
"""

import os
import requests
import time
from collections import defaultdict
import argparse

def get_all_documents(solr_url, batch_size=1000):
    """Retrieve all documents from Solr"""
    documents = []
    start = 0
    
    while True:
        response = requests.get(f"{solr_url}/select", params={
            'q': '*:*',
            'start': start,
            'rows': batch_size,
            'fl': 'id,file_path,content_hash,modified_date',
            'wt': 'json'
        })
        
        if response.status_code != 200:
            print(f"Error querying Solr: {response.status_code}")
            break
            
        data = response.json()
        docs = data['response']['docs']
        
        if not docs:
            break
            
        documents.extend(docs)
        start += batch_size
        print(f"Retrieved {len(documents)} documents...")
        
        if len(docs) < batch_size:
            break
    
    return documents

def find_duplicates(documents):
    """Find duplicate documents based on file_path and content_hash"""
    
    # Group by file_path
    path_groups = defaultdict(list)
    for doc in documents:
        file_path = doc.get('file_path', '')
        if file_path:
            path_groups[file_path].append(doc)
    
    # Find actual duplicates
    duplicates_to_remove = []
    
    for file_path, docs in path_groups.items():
        if len(docs) > 1:
            print(f"Found {len(docs)} duplicates for: {file_path}")
            
            # Sort by modified_date (newest first)
            docs.sort(key=lambda x: x.get('modified_date', ''), reverse=True)
            
            # Keep the newest one, mark others for deletion
            keeper = docs[0]
            to_remove = docs[1:]
            
            print(f"  Keeping: {keeper['id']} (modified: {keeper.get('modified_date', 'unknown')})")
            for doc in to_remove:
                print(f"  Removing: {doc['id']} (modified: {doc.get('modified_date', 'unknown')})")
                duplicates_to_remove.append(doc['id'])
    
    return duplicates_to_remove

def delete_documents(solr_url, doc_ids, dry_run=True):
    """Delete documents from Solr"""
    
    if not doc_ids:
        print("No duplicates found to delete")
        return
    
    print(f"\nFound {len(doc_ids)} duplicate documents to delete")
    
    if dry_run:
        print("DRY RUN - Would delete the following documents:")
        for doc_id in doc_ids[:10]:  # Show first 10
            print(f"  - {doc_id}")
        if len(doc_ids) > 10:
            print(f"  ... and {len(doc_ids) - 10} more")
        print("\nRun with --execute to actually delete duplicates")
        return
    
    # Delete documents one by one using query-based deletion
    success_count = 0
    for doc_id in doc_ids:
        try:
            # Use query-based deletion which is more reliable
            delete_query = f'id:"{doc_id}"'
            
            response = requests.post(
                f"{solr_url}/update?commit=true",
                data=f'<delete><query>{delete_query}</query></delete>',
                headers={'Content-Type': 'text/xml'}
            )
            
            if response.status_code == 200:
                success_count += 1
                if success_count % 10 == 0:
                    print(f"Deleted {success_count}/{len(doc_ids)} documents...")
            else:
                print(f"Error deleting {doc_id}: {response.status_code}")
                
        except Exception as e:
            print(f"Error deleting {doc_id}: {e}")
        
        time.sleep(0.05)  # Small delay between deletions
    
    print(f"Successfully deleted {success_count}/{len(doc_ids)} documents")

def main():
    parser = argparse.ArgumentParser(description='Clean up duplicate documents in Solr')
    parser.add_argument('--solr-url', default='http://solr:8983/solr/nas_content',
                       help='Solr URL (default: http://solr:8983/solr/nas_content)')
    parser.add_argument('--execute', action='store_true',
                       help='Actually delete duplicates (default is dry run)')
    
    args = parser.parse_args()
    
    print(f"Connecting to Solr at: {args.solr_url}")
    
    # Get all documents
    print("Retrieving all documents from Solr...")
    documents = get_all_documents(args.solr_url)
    print(f"Found {len(documents)} total documents")
    
    # Find duplicates
    print("\nAnalyzing for duplicates...")
    duplicates = find_duplicates(documents)
    
    # Delete duplicates
    delete_documents(args.solr_url, duplicates, dry_run=not args.execute)
    
    if args.execute:
        print(f"\nCleanup complete! Deleted {len(duplicates)} duplicate documents")
    else:
        print(f"\nDry run complete. Found {len(duplicates)} duplicates to clean up")

if __name__ == "__main__":
    main()