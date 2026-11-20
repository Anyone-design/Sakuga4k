import { NextResponse } from "next/server";

// Server process boot timestamp for uptime calculation
const bootTime = Date.now();

export async function GET() {
  const uptimeSeconds = Math.max(0, Math.floor((Date.now() - bootTime) / 1000));

  return NextResponse.json(
    {
      status: "ok",
      service: "sakuga4k-web-studio",
      uptimeSeconds,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/json",
      },
    }
  );
}
