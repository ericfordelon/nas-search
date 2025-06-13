import { NextRequest, NextResponse } from 'next/server';

const SOLR_URL = process.env.SOLR_URL || 'http://solr:8983/solr/nas_content';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get all query parameters
    const params = Object.fromEntries(searchParams.entries());
    
    // Add default Solr parameters for our use case
    const defaultParams = {
      wt: 'json',
      indent: 'true',
      facet: 'true',
      'facet.field': [
        'file_type', 'content_type', 'camera_make', 
        'camera_model', 'author', 'artist', 'genre', 'directory_path'
      ],
      'facet.mincount': '1',
      hl: 'true',
      'hl.fl': 'content',
      'hl.simple.pre': '<mark>',
      'hl.simple.post': '</mark>',
      fl: '*,score'
    };
    
    // Merge defaults with user params (user params take precedence)
    const finalParams: Record<string, unknown> = { ...defaultParams, ...params };
    
    // Set default query if not provided
    if (!finalParams.q) {
      finalParams.q = '*:*';
    }
    
    // Handle fq parameters - escape special characters for Solr
    let fqParams: string[] = [];
    if (typeof finalParams.fq === 'string') {
      fqParams = [finalParams.fq];
    } else if (Array.isArray(finalParams.fq)) {
      fqParams = finalParams.fq as string[];
    }
    
    // Process fq parameters to escape forward slashes
    if (fqParams.length > 0) {
      const escapedFq = fqParams.map((fq: string) => fq.replace('/', '\\/'));
      finalParams.fq = escapedFq;
    }
    
    // Convert params to URLSearchParams for proper encoding
    const solrParams = new URLSearchParams();
    Object.entries(finalParams).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => solrParams.append(key, v));
      } else {
        solrParams.append(key, String(value));
      }
    });
    
    // Make request to Solr
    const response = await fetch(`${SOLR_URL}/select?${solrParams.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Solr request failed: ${response.statusText}`);
    }
    
    const solrData = await response.json();
    
    // Parse results
    const docs = solrData.response.docs.map((doc: Record<string, unknown>) => {
      // Extract highlights
      let highlights = null;
      const docId = String(doc.id || '');
      if (solrData.highlighting && typeof solrData.highlighting === 'object' && solrData.highlighting[docId]) {
        const hlData = solrData.highlighting[docId];
        if (hlData && typeof hlData === 'object' && 'content' in hlData) {
          highlights = hlData.content;
        }
      }
      
      return {
        id: doc.id || '',
        file_path: doc.file_path || '',
        file_name: doc.file_name || '',
        file_type: doc.file_type,
        content_type: doc.content_type,
        file_size: doc.file_size,
        created_date: doc.created_date,
        modified_date: doc.modified_date,
        directory_path: doc.directory_path,
        camera_make: doc.camera_make,
        camera_model: doc.camera_model,
        width: doc.width,
        height: doc.height,
        gps_location: doc.gps_location,
        duration: doc.duration,
        video_codec: doc.video_codec,
        resolution: doc.resolution,
        artist: doc.artist,
        album: doc.album,
        title: doc.title,
        genre: doc.genre,
        author: doc.author,
        page_count: doc.page_count,
        highlights,
        score: doc.score
      };
    });
    
    // Parse facets
    const facets: Record<string, { value: string; count: number }[]> = {
      file_type: [],
      content_type: [],
      camera_make: [],
      camera_model: [],
      author: [],
      artist: [],
      genre: [],
      directory_path: []
    };
    
    const facetFields = solrData.facet_counts?.facet_fields || {};
    
    Object.entries(facetFields).forEach(([fieldName, values]) => {
      if (Array.isArray(values)) {
        const facetList = [];
        // Solr returns facets as [value1, count1, value2, count2, ...]
        for (let i = 0; i < values.length; i += 2) {
          if (i + 1 < values.length) {
            facetList.push({ value: values[i], count: values[i + 1] });
          }
        }
      
        if (facets.hasOwnProperty(fieldName)) {
          facets[fieldName] = facetList;
        }
      }
    });
    
    const result = {
      query: String(finalParams.q),
      total: solrData.response.numFound,
      start: parseInt(String(finalParams.start || '0')),
      rows: parseInt(String(finalParams.rows || '10')),
      docs,
      facets,
      query_time: solrData.responseHeader.QTime
    };
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Search request failed:', error);
    return NextResponse.json(
      { error: 'Search service unavailable' },
      { status: 503 }
    );
  }
}