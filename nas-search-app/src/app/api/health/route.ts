import { NextResponse } from 'next/server';
import { Redis } from 'ioredis';

const SOLR_URL = process.env.SOLR_URL || 'http://solr:8983/solr/nas_content';
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

export async function GET() {
  try {
    // Check Solr connection
    let solrHealthy = false;
    try {
      const response = await fetch(`${SOLR_URL}/admin/ping`, { 
        signal: AbortSignal.timeout(5000) 
      });
      solrHealthy = response.ok;
    } catch {
      solrHealthy = false;
    }
    
    // Check Redis connection
    let redisHealthy = false;
    try {
      const redis = new Redis(REDIS_URL);
      await redis.ping();
      redisHealthy = true;
      redis.disconnect();
    } catch {
      redisHealthy = false;
    }
    
    const overallHealthy = solrHealthy && redisHealthy;
    
    return NextResponse.json({
      status: overallHealthy ? "healthy" : "degraded",
      solr: solrHealthy ? "healthy" : "unhealthy",
      redis: redisHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json({
      status: "unhealthy",
      solr: "unreachable",
      redis: "unreachable",
      timestamp: new Date().toISOString()
    });
  }
}