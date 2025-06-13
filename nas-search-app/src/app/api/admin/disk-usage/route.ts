import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface DiskUsage {
  directory: string;
  sizeBytes: number;
  sizeHuman: string;
  files: number;
  lastUpdated: string;
}

interface DiskStats {
  totalUsage: DiskUsage;
  breakdown: DiskUsage[];
  warnings: string[];
  available: {
    total: string;
    used: string;
    available: string;
    percentage: number;
  };
}

async function getDirectorySize(dirPath: string): Promise<{ bytes: number; files: number }> {
  try {
    const { stdout } = await execAsync(`du -sb "${dirPath}" 2>/dev/null || echo "0	${dirPath}"`);
    const bytes = parseInt(stdout.split('\t')[0]) || 0;
    
    // Count files
    try {
      const { stdout: fileCount } = await execAsync(`find "${dirPath}" -type f 2>/dev/null | wc -l`);
      const files = parseInt(fileCount.trim()) || 0;
      return { bytes, files };
    } catch {
      return { bytes, files: 0 };
    }
  } catch {
    return { bytes: 0, files: 0 };
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function getSystemDiskUsage(dataPath: string): Promise<{
  total: string;
  used: string;
  available: string;
  percentage: number;
}> {
  try {
    // Get filesystem usage for the data directory
    const { stdout } = await execAsync(`df -h "${dataPath}" | tail -1`);
    const parts = stdout.trim().split(/\s+/);
    
    return {
      total: parts[1] || 'Unknown',
      used: parts[2] || 'Unknown', 
      available: parts[3] || 'Unknown',
      percentage: parseInt(parts[4]?.replace('%', '') || '0')
    };
  } catch {
    return {
      total: 'Unknown',
      used: 'Unknown',
      available: 'Unknown',
      percentage: 0
    };
  }
}

export async function GET() {
  try {
    // Get data directory from environment or use default
    const dataDir = process.env.NAS_SEARCH_DATA_DIR || 
                   path.join(process.cwd(), '..', 'nas-search-data');
    
    const absoluteDataDir = path.resolve(dataDir);
    
    // Check if data directory exists
    try {
      await fs.access(absoluteDataDir);
    } catch {
      return NextResponse.json({
        success: false,
        message: 'Data directory not found',
        error: `Directory does not exist: ${absoluteDataDir}`
      }, { status: 404 });
    }

    // Define subdirectories to monitor
    const subdirectories = ['solr', 'redis', 'thumbnails', 'logs', 'config'];
    const breakdown: DiskUsage[] = [];
    let totalFiles = 0;

    // Get usage for each subdirectory
    for (const subdir of subdirectories) {
      const subdirPath = path.join(absoluteDataDir, subdir);
      
      try {
        await fs.access(subdirPath);
        const { bytes, files } = await getDirectorySize(subdirPath);
        
        breakdown.push({
          directory: subdir,
          sizeBytes: bytes,
          sizeHuman: formatBytes(bytes),
          files,
          lastUpdated: new Date().toISOString()
        });
        
        totalFiles += files;
      } catch {
        // Directory doesn't exist, add with 0 usage
        breakdown.push({
          directory: subdir,
          sizeBytes: 0,
          sizeHuman: '0 B',
          files: 0,
          lastUpdated: new Date().toISOString()
        });
      }
    }

    // Get total directory usage (more accurate)
    const { bytes: actualTotalBytes } = await getDirectorySize(absoluteDataDir);
    
    const totalUsage: DiskUsage = {
      directory: 'total',
      sizeBytes: actualTotalBytes,
      sizeHuman: formatBytes(actualTotalBytes),
      files: totalFiles,
      lastUpdated: new Date().toISOString()
    };

    // Get system disk usage
    const available = await getSystemDiskUsage(absoluteDataDir);

    // Generate warnings
    const warnings: string[] = [];
    const warningThreshold = parseInt(process.env.DISK_WARNING_THRESHOLD || '80');
    const criticalThreshold = parseInt(process.env.DISK_CRITICAL_THRESHOLD || '90');

    if (available.percentage >= criticalThreshold) {
      warnings.push(`Critical: Disk usage at ${available.percentage}% (${available.used}/${available.total})`);
    } else if (available.percentage >= warningThreshold) {
      warnings.push(`Warning: Disk usage at ${available.percentage}% (${available.used}/${available.total})`);
    }

    // Check for large individual directories
    const largeDirectories = breakdown.filter(dir => dir.sizeBytes > 1024 * 1024 * 1024); // > 1GB
    if (largeDirectories.length > 0) {
      warnings.push(`Large directories detected: ${largeDirectories.map(d => `${d.directory} (${d.sizeHuman})`).join(', ')}`);
    }

    const stats: DiskStats = {
      totalUsage,
      breakdown: breakdown.sort((a, b) => b.sizeBytes - a.sizeBytes), // Sort by size descending
      warnings,
      available
    };

    return NextResponse.json({
      success: true,
      stats,
      dataDirectory: absoluteDataDir,
      lastChecked: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting disk usage:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to get disk usage information',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}