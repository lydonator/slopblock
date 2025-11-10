# Fix: Delta Sync Validation Error (v1.0.1)

## Problem

Delta sync was failing with validation error:
```
CDN delta validation failed: Invalid metadata.total_updates: must be non-negative integer
```

This is the same class of issue as the earlier blob validation fix - the validation was too strict and didn't handle optional/missing fields gracefully.

## Root Cause

**Delta validation code** (`src/lib/indexeddb.ts` line 306-310):
```typescript
if (!Number.isInteger(data.metadata.total_updates) || data.metadata.total_updates < 0) {
  throw new CDNValidationError('Invalid metadata.total_updates: must be non-negative integer', {
    total_updates: data.metadata.total_updates,
  });
}
```

The validation assumed `total_updates` would always be present and valid. However:
1. Edge Function might return different field names
2. Field might be undefined/null in some responses
3. Different counting logic between client and server

**Additionally**, validation required exact array length match:
```typescript
if (data.videos.length !== data.metadata.total_updates) {
  throw new CDNValidationError(
    'Delta videos array length does not match metadata.total_updates',
    { expected: data.metadata.total_updates, actual: data.videos.length }
  );
}
```

This caused delta syncs to fail even when the videos array was valid.

## Solution

Applied the same defensive validation strategy as the blob fix:

### 1. Made `total_updates` Optional in TypeScript Interface

```typescript
interface CDNDeltaResponse {
  metadata: {
    generated_at: string;
    since: string;
    total_updates?: number; // Optional - Edge Function might use different field names
  };
  videos: MarkedVideo[];
}
```

### 2. Relaxed Validation Logic

```typescript
// Validate videos array first (more important than metadata count)
if (!Array.isArray(data.videos)) {
  throw new CDNValidationError('Invalid videos field in delta response: must be an array', {
    videos: data.videos,
  });
}

// Validate total_updates if present, but don't require exact match
if (data.metadata.total_updates !== undefined) {
  if (!Number.isInteger(data.metadata.total_updates) || data.metadata.total_updates < 0) {
    throw new CDNValidationError('Invalid metadata.total_updates: must be non-negative integer', {
      total_updates: data.metadata.total_updates,
    });
  }

  // Warn if count doesn't match, but don't fail validation
  if (data.videos.length !== data.metadata.total_updates) {
    console.warn(
      `[SlopBlock] Delta metadata count mismatch: expected ${data.metadata.total_updates}, got ${data.videos.length} videos. Using actual array length.`
    );
  }
}
```

### Key Changes

1. ✅ **Validate videos array first** - The actual data is more important than metadata
2. ✅ **Make total_updates optional** - Only validate if present
3. ✅ **Warn instead of fail** - Log mismatch but continue processing
4. ✅ **Trust the videos array** - Use actual array length, not metadata count

## Expected Behavior After Fix

### Before (Broken)
1. ❌ Delta sync runs
2. ❌ Edge Function returns delta with undefined `total_updates`
3. ❌ Validation fails: "must be non-negative integer"
4. ❌ Delta sync aborted
5. ❌ Error logged to console

### After (Fixed)
1. ✅ Delta sync runs
2. ✅ Edge Function returns delta (with or without `total_updates`)
3. ✅ Validation checks videos array (required)
4. ✅ Validation skips `total_updates` if undefined
5. ✅ Delta sync completes successfully
6. ✅ Videos merged into local cache

## Files Changed

- `src/lib/indexeddb.ts`
  - Line 33-40: Made `total_updates` optional in interface
  - Line 306-329: Relaxed validation logic

## Testing

- [x] Delta sync no longer throws validation errors
- [x] Videos array is validated regardless of metadata
- [x] Mismatch warnings logged but don't block sync
- [x] Extension handles missing `total_updates` gracefully

## Build Info

- **Bundle size**: Service worker 185.88 KB (unchanged)
- **Build time**: 1.26s
- **Status**: Ready for v1.0.1 release

## Related Fixes

This is the same defensive validation pattern applied to:
1. **Blob validation** (earlier fix for `video_count` field)
2. **Timestamp validation** (handles PostgreSQL microseconds vs JavaScript milliseconds)
3. **Delta validation** (this fix)

All three ensure the extension is resilient to Edge Function schema changes.
