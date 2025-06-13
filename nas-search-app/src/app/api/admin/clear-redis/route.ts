import { NextResponse } from 'next/server';
import { createClient } from 'redis';

export async function POST() {
  let client = null;
  
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Create Redis client
    client = createClient({
      url: redisUrl
    });
    
    // Connect to Redis
    await client.connect();
    
    let keysCleared = 0;
    const clearedData: string[] = [];
    
    // Clear processed files set
    const processedCount = await client.sCard('processed_files');
    if (processedCount > 0) {
      await client.del('processed_files');
      clearedData.push(`Cleared processed_files set (${processedCount} entries)`);
      keysCleared++;
    }
    
    // Clear queued files set
    const queuedCount = await client.sCard('queued_files');
    if (queuedCount > 0) {
      await client.del('queued_files');
      clearedData.push(`Cleared queued_files set (${queuedCount} entries)`);
      keysCleared++;
    }
    
    // Clear processed:* keys
    const processedKeys = await client.keys('processed:*');
    if (processedKeys.length > 0) {
      await client.del(processedKeys);
      clearedData.push(`Cleared ${processedKeys.length} processed:* keys`);
      keysCleared += processedKeys.length;
    }
    
    // Clear file_hash:* keys
    const hashKeys = await client.keys('file_hash:*');
    if (hashKeys.length > 0) {
      await client.del(hashKeys);
      clearedData.push(`Cleared ${hashKeys.length} file_hash:* keys`);
      keysCleared += hashKeys.length;
    }
    
    // Clear global_processing:* keys
    const processingKeys = await client.keys('global_processing:*');
    if (processingKeys.length > 0) {
      await client.del(processingKeys);
      clearedData.push(`Cleared ${processingKeys.length} global_processing:* keys`);
      keysCleared += processingKeys.length;
    }
    
    // Clear queue_lock:* keys
    const lockKeys = await client.keys('queue_lock:*');
    if (lockKeys.length > 0) {
      await client.del(lockKeys);
      clearedData.push(`Cleared ${lockKeys.length} queue_lock:* keys`);
      keysCleared += lockKeys.length;
    }
    
    await client.disconnect();
    
    const message = keysCleared === 0 
      ? 'No Redis tracking data found to clear'
      : `Successfully cleared ${keysCleared} Redis keys`;
    
    return NextResponse.json({
      success: true,
      message,
      clearedData,
      keysCleared,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Error clearing Redis tracking data:', error);
    
    // Ensure client is disconnected on error
    if (client && client.isOpen) {
      try {
        await client.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting Redis client:', disconnectError);
      }
    }
    
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to clear Redis tracking data',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}