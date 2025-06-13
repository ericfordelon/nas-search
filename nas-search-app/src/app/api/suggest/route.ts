import { NextRequest, NextResponse } from 'next/server';

const SOLR_URL = process.env.SOLR_URL || 'http://solr:8983/solr/nas_content';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const count = parseInt(searchParams.get('count') || '5');
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
    }
    
    if (count < 1 || count > 20) {
      return NextResponse.json({ error: 'Count must be between 1 and 20' }, { status: 400 });
    }
    
    // Simple suggestion based on file names and content
    const params = new URLSearchParams({
      q: `file_name:*${query}* OR content:*${query}*`,
      rows: count.toString(),
      wt: 'json',
      fl: 'file_name'
    });
    
    const response = await fetch(`${SOLR_URL}/select?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Solr request failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    const suggestions: string[] = [];
    
    for (const doc of data.response.docs) {
      const fileName = doc.file_name || '';
      if (fileName && !suggestions.includes(fileName)) {
        suggestions.push(fileName);
      }
    }
    
    return NextResponse.json({ suggestions: suggestions.slice(0, count) });
    
  } catch (error) {
    console.error('Suggestion request failed:', error);
    return NextResponse.json(
      { error: 'Failed to get suggestions' },
      { status: 500 }
    );
  }
}