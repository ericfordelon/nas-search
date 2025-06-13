import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
  try {
    console.log('Starting automatic service restart for reindexing...');
    
    // Change to the project root directory and restart services
    const projectRoot = process.env.PROJECT_ROOT || '/Users/eric/git/nas-search';
    const command = `cd "${projectRoot}" && docker-compose restart file-monitor metadata-extractor`;
    
    console.log(`Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    console.log('Docker restart stdout:', stdout);
    if (stderr) {
      console.log('Docker restart stderr:', stderr);
    }
    
    // Check if the restart was successful
    if (stderr && stderr.includes('Error') || stderr.includes('error')) {
      throw new Error(`Docker restart failed: ${stderr}`);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Services restarted successfully. Reindexing has begun automatically.',
      details: [
        'File monitor and metadata extractor services have been restarted',
        'All files in the NAS path will be scanned and reindexed',
        'This operation may take several minutes depending on the number of files',
        'Files will be processed with the latest deduplication mechanisms',
        'Check the service logs for progress updates: docker-compose logs -f file-monitor'
      ],
      restartOutput: stdout,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error triggering reindex:', error);
    
    // Provide fallback instructions if automatic restart fails
    const fallbackInstructions = [
      'Automatic service restart failed. Please manually restart the services:',
      'cd /Users/eric/git/nas-search',
      'docker-compose restart file-monitor metadata-extractor',
      '',
      'After manual restart, reindexing will begin automatically.'
    ];
    
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to automatically restart services',
        error: error instanceof Error ? error.message : 'Unknown error',
        fallbackInstructions,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}