import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface MarkedVideo {
  video_id: string;
  channel_id: string;
  effective_trust_points: number;
  raw_report_count: number;
  is_marked: boolean;
  first_reported_at: string;
  last_updated_at: string;
  cache_version: number;
}

interface BlobMetadata {
  generated_at: string;
  video_count: number;
  window_start: string;
  window_end: string;
  blob_version: string;
}

serve(async (req) => {
  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Query 48-hour window from video_aggregates_cache
    const windowStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: videos, error: queryError } = await supabase
      .from("video_aggregates_cache")
      .select("*")
      .eq("is_marked", true)
      .gte("last_updated_at", windowStart)
      .order("last_updated_at", { ascending: false });

    if (queryError) {
      throw new Error(`Database query failed: ${queryError.message}`);
    }

    console.log(`Fetched ${videos?.length || 0} marked videos in 48h window`);

    // 2. Build JSON blob
    const blobData = {
      metadata: {
        generated_at: now,
        video_count: videos?.length || 0,
        window_start: windowStart,
        window_end: now,
        blob_version: "1.0.0",
      } as BlobMetadata,
      videos: videos || [],
    };

    const blobJson = JSON.stringify(blobData);
    const blobSize = new Blob([blobJson]).size;

    console.log(`Generated blob: ${blobSize} bytes (${Math.round(blobSize / 1024)} KB)`);

    // 3. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("cdn-cache")
      .upload("marked-videos-48h.json", blobJson, {
        contentType: "application/json",
        cacheControl: "3600", // Cache for 1 hour
        upsert: true, // Overwrite existing file
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 4. Update metadata.json with last generation timestamp
    const metadataJson = JSON.stringify({
      last_updated: now,
      video_count: videos?.length || 0,
      blob_version: "1.0.0",
    });

    await supabase.storage
      .from("cdn-cache")
      .upload("metadata.json", metadataJson, {
        contentType: "application/json",
        cacheControl: "60", // Cache for 1 minute
        upsert: true,
      });

    const executionTimeMs = Date.now() - startTime;

    // 5. Log execution to monitoring table
    await supabase.from("cron_job_logs").insert({
      job_name: "generate-48h-blob",
      executed_at: now,
      status: "success",
      video_count: videos?.length || 0,
      execution_time_ms: executionTimeMs,
    });

    return new Response(
      JSON.stringify({
        success: true,
        generated_at: now,
        video_count: videos?.length || 0,
        blob_size_bytes: blobSize,
        execution_time_ms: executionTimeMs,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    console.error("Edge function error:", error);

    // Log failure to monitoring table
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from("cron_job_logs").insert({
        job_name: "generate-48h-blob",
        executed_at: new Date().toISOString(),
        status: "failed",
        error_message: error.message,
        execution_time_ms: executionTimeMs,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
