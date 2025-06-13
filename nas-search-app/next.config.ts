import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    SOLR_URL: process.env.SOLR_URL || 'http://solr:8983/solr/nas_content',
    REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
  }
};

export default nextConfig;
