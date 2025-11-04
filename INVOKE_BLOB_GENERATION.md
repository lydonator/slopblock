# Invoke Blob Generation Edge Function

## Step 1: Mark Test Videos
Run `MARK_TEST_VIDEOS.sql` in Supabase SQL Editor

## Step 2: Create Storage Bucket (if needed)
1. Go to Supabase Dashboard → Storage
2. Check if bucket `cdn-cache` exists
3. If not, create it:
   - Click "New bucket"
   - Name: `cdn-cache`
   - **Public bucket**: YES (must be public for extension to fetch)
   - Click "Create bucket"

## Step 3: Invoke Edge Function

You can invoke it via:

### Option A: Curl Command
```bash
curl -X POST \
  'https://jbvufjdqnebzfqehbpdu.supabase.co/functions/v1/generate-48h-blob' \
  -H 'Authorization: Bearer YOUR_ANON_KEY_HERE'
```

### Option B: Supabase Dashboard
1. Go to Edge Functions → generate-48h-blob
2. Click "Invoke" button
3. Should return JSON with success status

### Option C: Browser (since it's deployed with --no-verify-jwt)
Just visit this URL in your browser:
```
https://jbvufjdqnebzfqehbpdu.supabase.co/functions/v1/generate-48h-blob
```

## Step 4: Verify
After invoking, check:
1. Storage → cdn-cache bucket → Should have `marked-videos-48h.json` and `metadata.json`
2. Check the JSON content - should have your 4 test videos
3. Check `cron_job_logs` table - should have a success entry

## Step 5: Test Extension
1. Clear IndexedDB cache via popup
2. Reload extension
3. Console should show: "Fetching blob from: ..." and "Cache initialized successfully"
4. Go to YouTube - thumbnails should show warning icons!
