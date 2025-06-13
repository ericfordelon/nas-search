import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    message: "NAS Search API",
    version: "1.0.0",
    status: "healthy"
  });
}