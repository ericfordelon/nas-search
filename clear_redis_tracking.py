#!/usr/bin/env python3
"""
Script to clear Redis tracking data for the NAS search system
"""

import redis
import os
import argparse

def clear_redis_tracking(redis_url):
    """Clear all tracking data from Redis"""
    try:
        # Connect to Redis
        r = redis.from_url(redis_url, decode_responses=True)
        r.ping()
        print(f"Connected to Redis at: {redis_url}")
        
        keys_cleared = 0
        
        # Clear processed files set
        processed_count = r.scard('processed_files')
        if processed_count > 0:
            r.delete('processed_files')
            print(f"Cleared processed_files set ({processed_count} entries)")
            keys_cleared += 1
        
        # Clear queued files set
        queued_count = r.scard('queued_files')
        if queued_count > 0:
            r.delete('queued_files')
            print(f"Cleared queued_files set ({queued_count} entries)")
            keys_cleared += 1
        
        # Clear processed:* keys
        processed_keys = r.keys('processed:*')
        if processed_keys:
            r.delete(*processed_keys)
            print(f"Cleared {len(processed_keys)} processed:* keys")
            keys_cleared += len(processed_keys)
        
        # Clear file_hash:* keys
        hash_keys = r.keys('file_hash:*')
        if hash_keys:
            r.delete(*hash_keys)
            print(f"Cleared {len(hash_keys)} file_hash:* keys")
            keys_cleared += len(hash_keys)
        
        # Clear global_processing:* keys
        processing_keys = r.keys('global_processing:*')
        if processing_keys:
            r.delete(*processing_keys)
            print(f"Cleared {len(processing_keys)} global_processing:* keys")
            keys_cleared += len(processing_keys)
        
        # Clear queue_lock:* keys
        lock_keys = r.keys('queue_lock:*')
        if lock_keys:
            r.delete(*lock_keys)
            print(f"Cleared {len(lock_keys)} queue_lock:* keys")
            keys_cleared += len(lock_keys)
        
        print(f"\nTotal keys cleared: {keys_cleared}")
        
        if keys_cleared == 0:
            print("No tracking data found to clear")
        else:
            print("Redis tracking data cleared successfully")
            
        return True
        
    except Exception as e:
        print(f"Error clearing Redis tracking data: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Clear Redis tracking data for NAS search system')
    parser.add_argument('--redis-url', default='redis://redis:6379',
                       help='Redis URL (default: redis://redis:6379)')
    
    args = parser.parse_args()
    
    print("Clearing Redis tracking data...")
    success = clear_redis_tracking(args.redis_url)
    
    if success:
        print("\nRedis tracking data cleared. The file monitor service can now reindex all files.")
    else:
        print("\nFailed to clear Redis tracking data.")
        exit(1)

if __name__ == "__main__":
    main()