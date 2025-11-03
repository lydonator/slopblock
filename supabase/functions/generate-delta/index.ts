import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const sinceParam = url.searchParams.get("since");

    if (!sinceParam) {
      return new Response(
        JSON.stringify({ error: "Missing 'since' query parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate timestamp format
    const since = new Date(sinceParam);
    if (isNaN(since.getTime())) {
      return new Response(
        JSON.stringify({ error: "Invalid timestamp format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query videos updated since timestamp
    const { data: videos, error: queryError } = await supabase
      .from("video_aggregates_cache")
      .select("*")
      .eq("is_marked", true)
      .gte("last_updated_at", since.toISOString())
      .order("last_updated_at", { ascending: false });

    if (queryError) {
      throw new Error(`Database query failed: ${queryError.message}`);
    }

    const now = new Date().toISOString();
    const deltaData = {
      metadata: {
        generated_at: now,
        since: since.toISOString(),
        video_count: videos?.length || 0,
        delta_version: "1.0.0",
      },
      videos: videos || [],
    };

    console.log(`Delta: ${videos?.length || 0} videos since ${since.toISOString()}`);

    return new Response(JSON.stringify(deltaData), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
      status: 200,
    });
  } catch (error) {
    console.error("Delta generation error:", error);
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
