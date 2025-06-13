import { NextResponse } from 'next/server';

const SOLR_URL = process.env.SOLR_URL || 'http://localhost:8983/solr/nas_content';

export async function GET() {
  try {
    // Get total document count and facets
    const params = new URLSearchParams({
      q: '*:*',
      rows: '0',
      wt: 'json',
      facet: 'true',
      'facet.field': 'file_type,content_type'
    });
    
    const response = await fetch(`${SOLR_URL}/select?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Solr request failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    const totalDocs = data.response.numFound;
    
    // Parse facets
    const facetFields = data.facet_counts?.facet_fields || {};
    
    const fileTypes: Record<string, number> = {};
    if (facetFields.file_type) {
      const values = facetFields.file_type;
      for (let i = 0; i < values.length; i += 2) {
        if (i + 1 < values.length) {
          fileTypes[values[i]] = values[i + 1];
        }
      }
    }
    
    const contentTypes: Record<string, number> = {};
    if (facetFields.content_type) {
      const values = facetFields.content_type;
      for (let i = 0; i < values.length; i += 2) {
        if (i + 1 < values.length) {
          contentTypes[values[i]] = values[i + 1];
        }
      }
    }
    
    // Get total file size (would need aggregation for real implementation)
    const totalSize = 0; // Placeholder
    
    const result = {
      total_documents: totalDocs,
      file_types: fileTypes,
      content_types: contentTypes,
      total_size: totalSize,
      index_status: "active"
    };
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Stats request failed:', error);
    return NextResponse.json(
      { error: 'Failed to get statistics' },
      { status: 500 }
    );
  }
}