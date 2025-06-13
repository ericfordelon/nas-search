import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const solrUrl = process.env.SOLR_URL || 'http://solr:8983/solr/nas_content';
    
    // Get total document count
    const countResponse = await fetch(`${solrUrl}/select?q=*:*&rows=0&wt=json`);
    if (!countResponse.ok) {
      throw new Error(`Failed to query document count: ${countResponse.status}`);
    }
    const countData = await countResponse.json();
    const totalDocuments = countData.response.numFound;

    // Get file type breakdown
    const facetResponse = await fetch(`${solrUrl}/select?q=*:*&rows=0&facet=true&facet.field=file_type&wt=json`);
    if (!facetResponse.ok) {
      throw new Error(`Failed to query facets: ${facetResponse.status}`);
    }
    const facetData = await facetResponse.json();
    
    const fileTypeFacets = facetData.facet_counts?.facet_fields?.file_type || [];
    const fileTypeBreakdown: Record<string, number> = {};
    
    for (let i = 0; i < fileTypeFacets.length; i += 2) {
      const type = fileTypeFacets[i];
      const count = fileTypeFacets[i + 1];
      if (type && count > 0) {
        fileTypeBreakdown[type] = count;
      }
    }

    // Get index size (approximate)
    const sizeResponse = await fetch(`${solrUrl}/admin/cores?action=STATUS&core=nas_content&wt=json`);
    let indexSize = 'Unknown';
    if (sizeResponse.ok) {
      const sizeData = await sizeResponse.json();
      const coreStatus = sizeData.status?.nas_content;
      if (coreStatus?.index?.sizeInBytes) {
        const bytes = parseInt(coreStatus.index.sizeInBytes);
        indexSize = formatBytes(bytes);
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalDocuments,
        fileTypeBreakdown,
        indexSize,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to get index statistics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}