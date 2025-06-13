import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync } from 'fs';
import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('file_path');
    const size = searchParams.get('size');
    
    if (!filePath) {
      return NextResponse.json({ error: 'file_path parameter required' }, { status: 400 });
    }
    
    if (!size || !['small', 'medium', 'large'].includes(size)) {
      return NextResponse.json({ error: 'Invalid thumbnail size' }, { status: 400 });
    }
    
    // Get thumbnail path from Redis
    const thumbnailKey = `thumbnails:${filePath}`;
    const thumbnailPath = await redis.hget(thumbnailKey, size);
    
    if (!thumbnailPath) {
      return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });
    }
    
    if (!existsSync(thumbnailPath)) {
      return NextResponse.json({ error: 'Thumbnail file not found' }, { status: 404 });
    }
    
    // Create a readable stream
    const stream = createReadStream(thumbnailPath);
    const chunks: Buffer[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400' // Cache for 1 day
      }
    });
    
  } catch (error) {
    console.error('Failed to serve thumbnail:', error);
    return NextResponse.json(
      { error: 'Failed to serve thumbnail' },
      { status: 500 }
    );
  }
}