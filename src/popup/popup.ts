/**
 * Popup UI logic
 * Handles settings, statistics display, and user interactions
 */

import { getAutoHideEnabled, setAutoHideEnabled } from '../lib/storage';
import { MessageType, type UserStatsResponse, type MessageResponse, type ExtensionTrust, type CommunityStats } from '../types';
import { getCacheMetadata, getCachedVideoCount, clearCache } from '../lib/indexeddb';
import { USE_CDN_CACHE } from '../lib/constants';

/**
 * Persistent connection to background worker
 * Inspired by SponsorBlock's real-time popup updates
 */
let backgroundPort: chrome.runtime.Port | null = null;

/**
 * Connect to background worker via persistent port
 */
function connectToBackground(): void {
  backgroundPort = chrome.runtime.connect({ name: 'popup-connection' });

  backgroundPort.onMessage.addListener((message) => {
    // Handle real-time updates from background worker
    if (message.type === 'VIDEO_MARKED') {
      // New video was marked - update statistics
      loadStatistics(
        document.getElementById('totalVideos')!,
        document.getElementById('userReports')!,
        document.getElementById('statsNote')!
      );
      loadCacheStatus();
    } else if (message.type === 'CACHE_UPDATED') {
      // Cache was updated - refresh cache status
      loadCacheStatus();
    }
  });

  backgroundPort.onDisconnect.addListener(() => {
    console.log('[SlopBlock] Background connection lost');
    backgroundPort = null;
  });
}

/**
 * Send message via persistent port (with fallback to chrome.runtime.sendMessage)
 */
async function sendBackgroundMessage<T>(message: any): Promise<MessageResponse<T>> {
  return new Promise((resolve, reject) => {
    if (backgroundPort) {
      // Use persistent connection
      const listener = (response: MessageResponse<T>) => {
        backgroundPort!.onMessage.removeListener(listener);
        resolve(response);
      };
      backgroundPort.onMessage.addListener(listener);
      backgroundPort.postMessage(message);
    } else {
      // Fallback to traditional message passing
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    }
  });
}

/**
 * Initialize the popup UI
 */
async function init(): Promise<void> {
  // Connect to background worker for real-time updates
  connectToBackground();

  // Get DOM elements
  const autoHideToggle = document.getElementById('autoHideToggle') as HTMLInputElement;
  const totalVideosElement = document.getElementById('totalVideos');
  const userReportsElement = document.getElementById('userReports');
  const statsNoteElement = document.getElementById('statsNote');

  if (!autoHideToggle || !totalVideosElement || !userReportsElement || !statsNoteElement) {
    console.error('Failed to find required DOM elements');
    return;
  }

  // Load and set current auto-hide setting
  try {
    const autoHideEnabled = await getAutoHideEnabled();
    autoHideToggle.checked = autoHideEnabled;
  } catch (error) {
    console.error('Error loading auto-hide setting:', error);
  }

  // Handle toggle changes
  autoHideToggle.addEventListener('change', async (event) => {
    const enabled = (event.target as HTMLInputElement).checked;

    try {
      await setAutoHideEnabled(enabled);

      // Show feedback to user
      showToast(enabled ? 'Auto-hide enabled' : 'Auto-hide disabled');

      // Notify content scripts about setting change
      notifyContentScripts(enabled);
    } catch (error) {
      console.error('Error updating auto-hide setting:', error);
      showToast('Failed to update setting', true);

      // Revert toggle on error
      autoHideToggle.checked = !enabled;
    }
  });

  // Load statistics
  await loadStatistics(totalVideosElement, userReportsElement, statsNoteElement);

  // Load trust score and community health
  await loadTrustScore();

  // Load cache status (Phase 4) - only if CDN cache is enabled
  if (USE_CDN_CACHE) {
    await loadCacheStatus();
    setupCacheRefreshButton();
    setupCacheClearButton();
    setupDeltaSyncButton();
  } else {
    // Hide cache section if CDN cache is disabled
    const cacheSection = document.getElementById('cacheSection');
    if (cacheSection) {
      cacheSection.style.display = 'none';
    }
  }

  // Setup link handlers
  setupLinks();
}

/**
 * Load statistics from background or API
 */
async function loadStatistics(
  totalVideosElement: HTMLElement,
  userReportsElement: HTMLElement,
  statsNoteElement: HTMLElement
): Promise<void> {
  try {
    // Fetch user statistics from background service worker
    const response: MessageResponse<UserStatsResponse> = await sendBackgroundMessage({
      type: MessageType.GET_USER_STATS,
      payload: {},
    });

    if (response.success && response.data) {
      totalVideosElement.textContent = response.data.total_marked_videos.toString();
      userReportsElement.textContent = response.data.user_reports.toString();

      // Update note based on activity
      if (response.data.user_reports === 0) {
        statsNoteElement.textContent = 'Report videos to help the community identify AI content.';
      } else {
        statsNoteElement.textContent = `Thank you for contributing to the community!`;
      }
    } else {
      throw new Error(response.error || 'Failed to fetch statistics');
    }
  } catch (error) {
    console.error('Error loading statistics:', error);
    totalVideosElement.textContent = 'Error';
    userReportsElement.textContent = 'Error';
    statsNoteElement.textContent = 'Failed to load statistics. Please try again.';
  }
}

/**
 * Load trust score from background or API
 */
async function loadTrustScore(): Promise<void> {
  // Get DOM elements for trust score display
  const trustScoreElement = document.getElementById('trustScore');
  const accuracyRateElement = document.getElementById('accuracyRate');
  const evaluatedReportsElement = document.getElementById('evaluatedReports');
  const pendingReportsElement = document.getElementById('pendingReports');
  const pioneerBoostElement = document.getElementById('pioneerBoost');
  const pioneerBoostContainer = document.getElementById('pioneerBoostContainer');
  const trustNoteElement = document.getElementById('trustNote');

  // Check if all elements exist
  if (!trustScoreElement || !accuracyRateElement || !evaluatedReportsElement ||
      !pendingReportsElement || !trustNoteElement || !pioneerBoostElement || !pioneerBoostContainer) {
    console.error('Failed to find trust score DOM elements');
    return;
  }

  // Set loading state
  trustScoreElement.textContent = 'Loading...';
  accuracyRateElement.textContent = '-';
  evaluatedReportsElement.textContent = '-';
  pendingReportsElement.textContent = '-';

  try {
    // Fetch trust score from background service worker
    const response: MessageResponse<ExtensionTrust> = await sendBackgroundMessage({
      type: MessageType.GET_TRUST_SCORE,
      payload: {},
    });

    if (response.success && response.data) {
      const trust = response.data;

      // Format trust score as percentage (0.00-1.00 → 0%-100%)
      const trustPercentage = Math.round(trust.trust_score * 100);

      // Add pioneer badge if user has pioneer boost
      if (trust.pioneer_boost && trust.pioneer_boost > 0) {
        trustScoreElement.innerHTML = `${trustPercentage}% <span class="pioneer-badge" title="Pioneer: Early community member">★</span>`;
      } else {
        trustScoreElement.textContent = `${trustPercentage}%`;
      }

      // Format accuracy rate as percentage
      const accuracyPercentage = Math.round(trust.accuracy_rate * 100);
      accuracyRateElement.textContent = `${accuracyPercentage}%`;

      // Calculate evaluated reports (accurate + inaccurate)
      const evaluatedCount = trust.accurate_reports + trust.inaccurate_reports;
      evaluatedReportsElement.textContent = evaluatedCount.toString();

      // Show pending reports
      pendingReportsElement.textContent = trust.pending_reports.toString();

      // Show pioneer boost if applicable (Phase 3 Cold-Start)
      if (trust.pioneer_boost && trust.pioneer_boost > 0) {
        pioneerBoostContainer.style.display = 'flex';
        const pioneerBoostPercentage = Math.round(trust.pioneer_boost * 100);
        pioneerBoostElement.textContent = `+${pioneerBoostPercentage}%`;

        // Add user number context if available
        if (trust.user_number) {
          let tier = '';
          if (trust.user_number <= 500) {
            tier = ' (Pioneer!)';
          } else if (trust.user_number <= 1000) {
            tier = ' (Early Adopter)';
          } else if (trust.user_number <= 2000) {
            tier = ' (Early Supporter)';
          }
          pioneerBoostElement.title = `You're user #${trust.user_number}${tier}`;
        }
      } else {
        pioneerBoostContainer.style.display = 'none';
      }

      // Color-code trust score based on level
      trustScoreElement.className = 'trust-score-value';
      if (trust.trust_score >= 0.9) {
        trustScoreElement.classList.add('trust-excellent'); // Green
      } else if (trust.trust_score >= 0.7) {
        trustScoreElement.classList.add('trust-good'); // Yellow
      } else if (trust.trust_score >= 0.5) {
        trustScoreElement.classList.add('trust-fair'); // Orange
      } else {
        trustScoreElement.classList.add('trust-low'); // Red
      }

      // Update note based on trust level
      if (trust.is_flagged) {
        trustNoteElement.textContent = `Account flagged: ${trust.flagged_reason || 'Suspicious activity detected.'}`;
        trustNoteElement.style.color = '#ff6b6b';
      } else if (evaluatedCount === 0) {
        trustNoteElement.textContent = 'Trust score grows with account age and accuracy.';
      } else if (trust.trust_score >= 0.9) {
        trustNoteElement.textContent = 'Excellent! Your reports have high impact in the community.';
      } else if (trust.trust_score >= 0.7) {
        trustNoteElement.textContent = 'Good standing. Keep making accurate reports to increase your score.';
      } else if (trust.trust_score >= 0.5) {
        trustNoteElement.textContent = 'Fair standing. Focus on accurate reports to improve your trust score.';
      } else {
        trustNoteElement.textContent = 'Low trust score. Your reports have reduced impact. Try to improve accuracy.';
      }

      // Load community health indicator (Phase 3 Cold-Start)
      await loadCommunityHealth();
    } else {
      throw new Error(response.error || 'Failed to fetch trust score');
    }
  } catch (error) {
    console.error('Error loading trust score:', error);
    trustScoreElement.textContent = 'Error';
    trustScoreElement.className = 'trust-score-value';
    accuracyRateElement.textContent = '-';
    evaluatedReportsElement.textContent = '-';
    pendingReportsElement.textContent = '-';
    trustNoteElement.textContent = 'Failed to load trust score. Please try again.';
    trustNoteElement.style.color = '#888';
  }
}

/**
 * Load community health indicator (Phase 3 Cold-Start - Simplified)
 */
async function loadCommunityHealth(): Promise<void> {
  // Get DOM elements
  const healthDot = document.getElementById('healthDot');
  const healthText = document.getElementById('healthText');

  if (!healthDot || !healthText) {
    console.error('Failed to find community health DOM elements');
    return;
  }

  try {
    // Fetch community stats from background service worker
    const response: MessageResponse<CommunityStats> = await sendBackgroundMessage({
      type: MessageType.GET_COMMUNITY_STATS,
      payload: {},
    });

    if (response.success && response.data) {
      const stats = response.data;
      const activeUsers = stats.active_users_30d;

      // Ultra-conservative tiers for viral scale (10k-100k-1M+ users)
      let healthClass = '';
      let healthLabel = '';

      if (activeUsers < 100) {
        healthClass = 'health-building';
        healthLabel = 'Building';
      } else if (activeUsers < 1000) {
        healthClass = 'health-growing';
        healthLabel = 'Growing';
      } else if (activeUsers < 10000) {
        healthClass = 'health-healthy';
        healthLabel = 'Healthy';
      } else {
        healthClass = 'health-thriving';
        healthLabel = 'Thriving';
      }

      // Update UI
      healthDot.className = `health-dot ${healthClass}`;
      healthText.textContent = healthLabel;
    } else {
      // Silently fail - health indicator is optional
      healthText.textContent = 'Unknown';
      healthDot.className = 'health-dot health-building';
    }
  } catch (error) {
    // Silently fail - health indicator is optional
    console.error('Error loading community health:', error);
    healthText.textContent = 'Unknown';
    healthDot.className = 'health-dot health-building';
  }
}

/**
 * Show a toast notification
 */
function showToast(message: string, isError: boolean = false): void {
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);

  // Remove after 2 seconds
  setTimeout(() => {
    toast.remove();
  }, 2000);
}

/**
 * Notify all YouTube tabs about setting change
 */
async function notifyContentScripts(autoHideEnabled: boolean): Promise<void> {
  try {
    // Query all YouTube tabs
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });

    // Send message to each tab
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'AUTO_HIDE_CHANGED',
          payload: { enabled: autoHideEnabled },
        }).catch(() => {
          // Ignore errors for tabs that don't have the content script loaded yet
        });
      }
    }
  } catch (error) {
    console.error('Error notifying content scripts:', error);
  }
}

/**
 * Load cache status (Phase 4)
 */
async function loadCacheStatus(): Promise<void> {
  const lastSyncedElement = document.getElementById('lastSynced');
  const cachedVideoCountElement = document.getElementById('cachedVideoCount');

  if (!lastSyncedElement || !cachedVideoCountElement) {
    console.error('Failed to find cache status DOM elements');
    return;
  }

  try {
    // Get cache metadata
    const metadata = await getCacheMetadata();
    const videoCount = await getCachedVideoCount();

    if (metadata) {
      // Format last sync timestamp
      const lastSync = new Date(metadata.last_sync_timestamp);
      const now = new Date();
      const diffMs = now.getTime() - lastSync.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) {
        lastSyncedElement.textContent = 'Just now';
      } else if (diffMins < 60) {
        lastSyncedElement.textContent = `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
      } else {
        const diffHours = Math.floor(diffMins / 60);
        lastSyncedElement.textContent = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      }
    } else {
      lastSyncedElement.textContent = 'Never';
    }

    cachedVideoCountElement.textContent = videoCount.toString();
  } catch (error) {
    console.error('Error loading cache status:', error);
    lastSyncedElement.textContent = 'Error';
    cachedVideoCountElement.textContent = 'Error';
  }
}

/**
 * Setup cache refresh button handler
 */
function setupCacheRefreshButton(): void {
  const refreshButton = document.getElementById('refreshCacheBtn');

  if (!refreshButton) {
    console.error('Failed to find refresh cache button');
    return;
  }

  refreshButton.addEventListener('click', async () => {
    const button = refreshButton as HTMLButtonElement;
    const originalText = button.textContent;

    try {
      // Disable button and show loading state
      button.disabled = true;
      button.textContent = 'Refreshing...';

      // Send refresh cache message to background worker
      const response: MessageResponse = await sendBackgroundMessage({
        type: MessageType.REFRESH_CACHE,
        payload: {},
      });

      if (response.success) {
        showToast('Cache refreshed successfully!');
        // Reload cache status
        await loadCacheStatus();
      } else {
        throw new Error(response.error || 'Failed to refresh cache');
      }
    } catch (error) {
      console.error('Error refreshing cache:', error);
      showToast('Failed to refresh cache', true);
    } finally {
      // Re-enable button
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

/**
 * Setup cache clear button handler
 */
function setupCacheClearButton(): void {
  const clearButton = document.getElementById('clearCacheBtn');

  if (!clearButton) {
    console.error('Failed to find clear cache button');
    return;
  }

  clearButton.addEventListener('click', async () => {
    const button = clearButton as HTMLButtonElement;
    const originalText = button.textContent;

    // Confirm action
    if (!confirm('Are you sure you want to clear the local cache? This will remove all cached video data.')) {
      return;
    }

    try {
      // Disable button and show loading state
      button.disabled = true;
      button.textContent = 'Clearing...';

      // Clear IndexedDB cache
      await clearCache();

      showToast('Cache cleared successfully!');

      // Reload cache status
      await loadCacheStatus();
    } catch (error) {
      console.error('Error clearing cache:', error);
      showToast('Failed to clear cache', true);
    } finally {
      // Re-enable button
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

/**
 * Setup delta sync button handler (for testing)
 */
function setupDeltaSyncButton(): void {
  const deltaSyncButton = document.getElementById('deltaSyncBtn');

  if (!deltaSyncButton) {
    console.error('Failed to find delta sync button');
    return;
  }

  deltaSyncButton.addEventListener('click', async () => {
    const button = deltaSyncButton as HTMLButtonElement;
    const originalText = button.textContent;

    try {
      // Disable button and show loading state
      button.disabled = true;
      button.textContent = 'Syncing...';

      // Send delta sync message to background worker
      const response: MessageResponse = await sendBackgroundMessage({
        type: MessageType.DELTA_SYNC,
        payload: {},
      });

      if (response.success) {
        showToast('Delta sync completed!');
        // Reload cache status
        await loadCacheStatus();
      } else {
        throw new Error(response.error || 'Failed to perform delta sync');
      }
    } catch (error) {
      console.error('Error performing delta sync:', error);
      showToast('Delta sync failed - check console', true);
    } finally {
      // Re-enable button
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

/**
 * Setup link click handlers
 *
 * TODO: Update these URLs after setting up GitHub Pages
 * Follow the instructions in GITHUB_PAGES_SETUP.md, then replace
 * 'yourusername' and 'slopblock' with your actual GitHub details.
 *
 * Example URLs:
 * - Help: https://yourusername.github.io/slopblock/help
 * - Privacy: https://yourusername.github.io/slopblock/privacy
 * - Feedback: https://yourusername.github.io/slopblock/feedback
 * or https://github.com/yourusername/slopblock/issues
 */
function setupLinks(): void {
  const helpLink = document.getElementById('helpLink');
  const privacyLink = document.getElementById('privacyLink');
  const feedbackLink = document.getElementById('feedbackLink');

  if (helpLink) {
    helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://lydonator.github.io/slopblock/help' });
    });
  }

  if (privacyLink) {
    privacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://lydonator.github.io/slopblock/privacy' });
    });
  }

  if (feedbackLink) {
    feedbackLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://lydonator.github.io/slopblock/feedback' });
    });
  }
}

/**
 * Start the popup when DOM is ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
