import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const solrUrl = process.env.SOLR_URL || 'http://solr:8983/solr/nas_content';
    
    // Delete all documents from the index
    const deleteResponse = await fetch(`${solrUrl}/update?commit=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
      },
      body: '<delete><query>*:*</query></delete>',
    });

    if (!deleteResponse.ok) {
      throw new Error(`Failed to clear index: ${deleteResponse.status}`);
    }

    // Clear Redis tracking data
    try {
      // Send a command to clear Redis tracking keys
      // This would typically be done with a Redis client, but for now we'll document the keys to clear
      console.log('Solr index cleared. Redis keys that should be cleared:');
      console.log('- processed_files (set)');
      console.log('- queued_files (set)'); 
      console.log('- processed:* (keys)');
      console.log('- file_hash:* (keys)');
      console.log('- global_processing:* (keys)');
    } catch (redisError) {
      console.warn('Could not clear Redis data:', redisError);
      // Continue even if Redis clearing fails
    }

    return NextResponse.json({
      success: true,
      message: 'Index cleared successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error clearing index:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to clear index',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}