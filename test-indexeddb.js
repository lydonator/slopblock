/**
 * IndexedDB Verification Test Script
 *
 * Run this in the POPUP DevTools console (not service worker console)
 *
 * Instructions:
 * 1. Right-click the SlopBlock extension popup
 * 2. Click "Inspect"
 * 3. Go to Console tab
 * 4. Copy and paste this entire script
 * 5. Press Enter to run
 *
 * Expected output:
 * - "✅ Database exists"
 * - "✅ Found X videos in cache"
 * - "✅ Found cache metadata"
 * - List of all cached videos
 */

(async function testIndexedDB() {
  console.log('🔍 Testing IndexedDB persistence...\n');

  try {
    // Step 1: Check if database exists
    const databases = await indexedDB.databases();
    const slopblockDB = databases.find(db => db.name === 'slopblock-cache');

    if (!slopblockDB) {
      console.error('❌ Database "slopblock-cache" not found!');
      console.log('Available databases:', databases);
      return;
    }

    console.log('✅ Database exists:', slopblockDB);
    console.log(`   Version: ${slopblockDB.version}\n`);

    // Step 2: Open the database
    const openRequest = indexedDB.open('slopblock-cache', 2);

    const db = await new Promise((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });

    console.log('✅ Database opened successfully\n');

    // Step 3: Count videos in cache
    const countRequest = db.transaction('marked-videos', 'readonly')
      .objectStore('marked-videos')
      .count();

    const videoCount = await new Promise((resolve, reject) => {
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });

    if (videoCount === 0) {
      console.warn('⚠️  No videos found in cache (count: 0)');
      console.log('   This might mean:');
      console.log('   1. Cache not initialized yet (wait for sync)');
      console.log('   2. No videos marked in last 48 hours');
      console.log('   3. IndexedDB bug still present\n');
    } else {
      console.log(`✅ Found ${videoCount} videos in cache\n`);
    }

    // Step 4: Get all videos
    const getAllRequest = db.transaction('marked-videos', 'readonly')
      .objectStore('marked-videos')
      .getAll();

    const allVideos = await new Promise((resolve, reject) => {
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    });

    if (allVideos.length > 0) {
      console.log('📹 Cached videos:');
      allVideos.forEach((video, index) => {
        console.log(`   ${index + 1}. Video ID: ${video.video_id}`);
        console.log(`      Channel: ${video.channel_id}`);
        console.log(`      Trust Points: ${video.effective_trust_points}`);
        console.log(`      Marked: ${video.is_marked}`);
        console.log(`      Last Updated: ${video.last_updated_at}\n`);
      });
    }

    // Step 5: Get cache metadata
    const metadataRequest = db.transaction('cache-metadata', 'readonly')
      .objectStore('cache-metadata')
      .get('sync');

    const metadata = await new Promise((resolve, reject) => {
      metadataRequest.onsuccess = () => resolve(metadataRequest.result);
      metadataRequest.onerror = () => reject(metadataRequest.error);
    });

    if (metadata) {
      console.log('✅ Found cache metadata:');
      console.log(`   Last Sync: ${metadata.last_sync_timestamp}`);
      console.log(`   Last Prune: ${metadata.last_prune_timestamp}`);
      console.log(`   Blob Version: ${metadata.blob_version}\n`);
    } else {
      console.warn('⚠️  No cache metadata found');
      console.log('   Cache may not be initialized yet\n');
    }

    // Step 6: Close database
    db.close();

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('SUMMARY:');
    console.log('═══════════════════════════════════════');

    if (videoCount > 0 && metadata) {
      console.log('✅ IndexedDB is working correctly!');
      console.log(`✅ ${videoCount} videos cached`);
      console.log('✅ Metadata present');
      console.log('\n🎉 The persistence bug is FIXED!');
    } else if (videoCount === 0 && !metadata) {
      console.log('⚠️  Cache appears empty');
      console.log('   Try refreshing the cache from popup UI');
      console.log('   Or wait for automatic sync (every 30 min)');
    } else {
      console.log('⚠️  Partial data found - investigate further');
    }

    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    console.error('   Stack trace:', error.stack);
  }
})();
