/**
 * ThumbnailScanner
 * Optimizes DOM queries and video ID extraction with caching
 * Reduces O(n²) complexity to O(n) by combining selectors and caching results
 */

/**
 * All thumbnail selectors combined for single query
 * YouTube's DOM structure includes multiple container types
 */
const THUMBNAIL_SELECTORS = [
  'ytd-thumbnail',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-rich-item-renderer',
  'ytd-playlist-video-renderer',
  'ytd-movie-renderer',
  'ytd-reel-item-renderer',
  'yt-lockup-view-model',
  'ytm-compact-video-renderer',
  '#contents ytd-video-renderer',
  '#contents ytd-grid-video-renderer',
].join(', ');

/**
 * Cached thumbnail data
 * Stores extracted video ID per DOM element to avoid re-extraction
 */
interface CachedThumbnail {
  element: Element;
  videoId: string;
  lastAccessed: number;
}

/**
 * ThumbnailScanner class
 * Handles efficient thumbnail discovery and video ID extraction
 */
export class ThumbnailScanner {
  private cache: Map<Element, CachedThumbnail> = new Map();
  private readonly MAX_CACHE_SIZE = 500; // Prevent unbounded growth
  private readonly CACHE_TTL_MS = 60000; // 1 minute TTL

  /**
   * Scan page for all thumbnails and extract video IDs
   * Returns map of video ID to thumbnail element
   */
  scanPage(): Map<string, Element> {
    // OPTIMIZATION: Single querySelectorAll with combined selector (12 queries → 1 query)
    const thumbnails = document.querySelectorAll(THUMBNAIL_SELECTORS);
    const results = new Map<string, Element>();

    for (const thumbnail of thumbnails) {
      const videoId = this.extractVideoId(thumbnail);
      if (videoId) {
        results.set(videoId, thumbnail);
      }
    }

    return results;
  }

  /**
   * Extract video ID from a thumbnail element
   * Uses cache to avoid re-extraction and optimizes extraction order
   */
  private extractVideoId(element: Element): string | null {
    // Check cache first
    const cached = this.cache.get(element);
    if (cached && Date.now() - cached.lastAccessed < this.CACHE_TTL_MS) {
      cached.lastAccessed = Date.now();
      return cached.videoId;
    }

    // Extract video ID using optimized order (fastest methods first)
    const videoId = this.fastExtractVideoId(element);

    // Cache result (even if null to avoid repeated failed extractions)
    if (videoId) {
      this.cacheResult(element, videoId);
    }

    return videoId;
  }

  /**
   * Fast video ID extraction using optimized method order
   * Tries fastest methods (attributes) before slower methods (querySelector)
   */
  private fastExtractVideoId(element: Element): string | null {
    // Method 1: Direct data-video-id attribute (fastest)
    const dataVideoId = element.getAttribute('data-video-id');
    if (dataVideoId && this.isValidVideoId(dataVideoId)) {
      return dataVideoId;
    }

    // Method 2: Check if element itself is a link with href
    if (element.tagName === 'A') {
      const videoId = this.extractFromHref((element as HTMLAnchorElement).href);
      if (videoId) return videoId;
    }

    // Method 3: Look for link href attribute directly (avoid querySelector)
    const link = element.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]') as HTMLAnchorElement;
    if (link?.href) {
      const videoId = this.extractFromHref(link.href);
      if (videoId) return videoId;
    }

    // Method 4: Check child elements for data-video-id
    const childWithId = element.querySelector('[data-video-id]');
    if (childWithId) {
      const id = childWithId.getAttribute('data-video-id');
      if (id && this.isValidVideoId(id)) {
        return id;
      }
    }

    // Method 5: Check parent elements for data-video-id (last resort)
    const parentWithId = element.closest('[data-video-id]');
    if (parentWithId) {
      const id = parentWithId.getAttribute('data-video-id');
      if (id && this.isValidVideoId(id)) {
        return id;
      }
    }

    return null;
  }

  /**
   * Extract video ID from URL href
   * Handles both /watch?v= and /shorts/ formats
   */
  private extractFromHref(href: string): string | null {
    try {
      // Handle /watch?v=VIDEO_ID format
      if (href.includes('/watch?v=')) {
        const url = new URL(href);
        const videoId = url.searchParams.get('v');
        if (videoId && this.isValidVideoId(videoId)) {
          return videoId;
        }
      }

      // Handle /shorts/VIDEO_ID format
      if (href.includes('/shorts/')) {
        const match = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch (e) {
      // Invalid URL, return null
    }

    return null;
  }

  /**
   * Validate YouTube video ID format (11 alphanumeric characters)
   */
  private isValidVideoId(videoId: string): boolean {
    return typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
  }

  /**
   * Cache extraction result
   */
  private cacheResult(element: Element, videoId: string): void {
    // Enforce cache size limit
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestEntry();
    }

    this.cache.set(element, {
      element,
      videoId,
      lastAccessed: Date.now(),
    });
  }

  /**
   * Evict oldest cache entry (LRU strategy)
   */
  private evictOldestEntry(): void {
    let oldestTime = Infinity;
    let oldestElement: Element | null = null;

    for (const [element, cached] of this.cache.entries()) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestElement = element;
      }
    }

    if (oldestElement) {
      this.cache.delete(oldestElement);
    }
  }

  /**
   * Clear cache (called on SPA navigation to prevent stale references)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics (for debugging/monitoring)
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }
}
