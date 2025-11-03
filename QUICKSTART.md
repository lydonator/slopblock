# SlopBlock - Quick Start Guide

This guide will help you get SlopBlock up and running in development mode in under 30 minutes.

## Prerequisites

- Node.js 18+ and npm installed
- Chrome or Chromium-based browser
- Supabase account (free tier)
- Basic familiarity with terminal/command line

---

## Step 1: Project Setup

### 1.1 Initialize the Project

```bash
# Navigate to your project directory
cd C:\Users\LydoSr\Desktop\slopblock

# Initialize npm project (if not already done)
npm init -y

# Install core dependencies
npm install @supabase/supabase-js

# Install development dependencies
npm install -D typescript vite @crxjs/vite-plugin @types/chrome

# Install ESLint and Prettier (optional but recommended)
npm install -D eslint prettier eslint-config-prettier
```

### 1.2 Create Project Structure

Create the following directory structure:

```
slopblock/
├── src/
│   ├── background/
│   │   ├── service-worker.ts
│   │   └── api.ts
│   ├── content/
│   │   ├── youtube.ts
│   │   └── youtube.css
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── storage.ts
│   │   └── constants.ts
│   ├── types/
│   │   └── index.ts
│   └── manifest.json
├── public/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── .env
├── .env.example
├── .gitignore
├── vite.config.ts
├── tsconfig.json
├── package.json
├── DATABASE_SETUP.sql
├── PROJECT_PLAN.md
└── README.md
```

You can create these directories manually or use:

```bash
mkdir -p src/{background,content,popup,lib,types} public/icons
```

---

## Step 2: Supabase Backend Setup

### 2.1 Create Supabase Project

1. Go to https://supabase.com/
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - **Name**: slopblock
   - **Database Password**: (generate a strong password and save it)
   - **Region**: Choose closest to your location
   - **Pricing Plan**: Free
5. Click "Create new project" and wait for setup to complete (~2 minutes)

### 2.2 Set Up Database

1. In your Supabase dashboard, click "SQL Editor" in the left sidebar
2. Click "New query"
3. Open the `DATABASE_SETUP.sql` file from this project
4. Copy the entire contents and paste into the SQL Editor
5. Click "Run" to execute the script
6. Verify success - you should see messages like "Success. No rows returned"

### 2.3 Get API Credentials

1. In Supabase dashboard, go to "Project Settings" (gear icon)
2. Click "API" in the left menu
3. Copy the following values:
   - **Project URL** (looks like: https://xxxxx.supabase.co)
   - **anon/public** key (long string starting with "eyJ...")

### 2.4 Configure Environment Variables

Create a `.env` file in your project root:

```bash
# .env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-key-here
```

**Important**: Add `.env` to your `.gitignore` to avoid committing secrets!

Create `.env.example` as a template (without real values):

```bash
# .env.example
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

---

## Step 3: Configure Build Tools

### 3.1 Create `vite.config.ts`

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
      },
    },
  },
});
```

### 3.2 Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["chrome", "vite/client"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3.3 Update `package.json` Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### 3.4 Create `.gitignore`

```
# Dependencies
node_modules/

# Build output
dist/
build/

# Environment variables
.env
.env.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Temporary files
.cache/
.temp/
```

---

## Step 4: Create Manifest and Core Files

### 4.1 Create `src/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "SlopBlock",
  "version": "0.1.0",
  "description": "Crowdsourced identification of AI-generated content on YouTube",
  "permissions": ["storage"],
  "host_permissions": ["*://*.youtube.com/*"],
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/*"],
      "js": ["src/content/youtube.ts"],
      "css": ["src/content/youtube.css"],
      "run_at": "document_end"
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 4.2 Create Placeholder Icons

For now, create simple colored square PNG files (16x16, 48x48, 128x128) and save them in `public/icons/`.

You can use any image editor or online tool. Quick option:
- Use https://www.favicon-generator.org/
- Upload any simple image
- Download generated favicons
- Rename and place in `public/icons/`

---

## Step 5: Create Minimal Working Extension

### 5.1 Create `src/lib/constants.ts`

```typescript
// src/lib/constants.ts
export const REPORT_THRESHOLD = 3;
export const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
export const STORAGE_KEYS = {
  EXTENSION_ID: 'slopblock_extension_id',
  AUTO_HIDE_ENABLED: 'slopblock_auto_hide',
  VIDEO_CACHE: 'slopblock_video_cache',
} as const;
```

### 5.2 Create `src/lib/supabase.ts`

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 5.3 Create `src/lib/storage.ts`

```typescript
// src/lib/storage.ts
import { STORAGE_KEYS } from './constants';

export async function getExtensionId(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXTENSION_ID);

  if (result[STORAGE_KEYS.EXTENSION_ID]) {
    return result[STORAGE_KEYS.EXTENSION_ID];
  }

  // Generate a unique ID for this extension installation
  const newId = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE_KEYS.EXTENSION_ID]: newId });
  return newId;
}

export async function getAutoHideEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.AUTO_HIDE_ENABLED);
  return result[STORAGE_KEYS.AUTO_HIDE_ENABLED] ?? false; // Default: OFF
}

export async function setAutoHideEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.AUTO_HIDE_ENABLED]: enabled });
}
```

### 5.4 Create `src/background/service-worker.ts`

```typescript
// src/background/service-worker.ts
console.log('SlopBlock background service worker loaded');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  // Handle async responses
  if (message.type === 'REPORT_VIDEO') {
    handleReportVideo(message.payload).then(sendResponse);
    return true; // Keep channel open for async response
  }

  return false;
});

async function handleReportVideo(payload: any) {
  console.log('Handling video report:', payload);
  // Implementation coming in Phase 1
  return { success: true };
}
```

### 5.5 Create `src/content/youtube.ts`

```typescript
// src/content/youtube.ts
console.log('SlopBlock content script loaded on YouTube');

// Test that content script is working
function init() {
  console.log('SlopBlock initialized');
  // Implementation coming in Phase 1
}

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

### 5.6 Create `src/content/youtube.css`

```css
/* src/content/youtube.css */
.slopblock-warning-icon {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background-color: #ff6b6b;
  border-radius: 4px;
  z-index: 1000;
  pointer-events: auto;
}
```

### 5.7 Create `src/popup/popup.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SlopBlock</title>
  <link rel="stylesheet" href="./popup.css">
</head>
<body>
  <div class="container">
    <h1>SlopBlock</h1>
    <p>AI Slop Detection for YouTube</p>

    <div class="setting">
      <label>
        <input type="checkbox" id="autoHideToggle">
        Auto-hide marked videos
      </label>
    </div>

    <div class="stats">
      <p id="stats">Loading...</p>
    </div>
  </div>
  <script type="module" src="./popup.ts"></script>
</body>
</html>
```

### 5.8 Create `src/popup/popup.ts`

```typescript
// src/popup/popup.ts
import { getAutoHideEnabled, setAutoHideEnabled } from '../lib/storage';

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('autoHideToggle') as HTMLInputElement;
  const stats = document.getElementById('stats');

  // Load current setting
  const autoHideEnabled = await getAutoHideEnabled();
  toggle.checked = autoHideEnabled;

  // Handle toggle changes
  toggle.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    await setAutoHideEnabled(enabled);
    console.log('Auto-hide set to:', enabled);
  });

  // Show placeholder stats
  if (stats) {
    stats.textContent = 'Extension is active!';
  }
});
```

### 5.9 Create `src/popup/popup.css`

```css
/* src/popup/popup.css */
body {
  width: 300px;
  min-height: 200px;
  margin: 0;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f5f5f5;
}

.container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h1 {
  margin: 0;
  font-size: 24px;
  color: #333;
}

p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.setting {
  padding: 12px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.setting label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.stats {
  padding: 12px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
```

---

## Step 6: Build and Test

### 6.1 Build the Extension

```bash
npm run dev
```

This will start the development server and build the extension to the `dist/` folder. Leave this running - it will rebuild on file changes.

### 6.2 Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Navigate to your project's `dist/` folder and select it
5. The extension should now appear in your extensions list

### 6.3 Test Basic Functionality

1. Click the SlopBlock extension icon in Chrome toolbar
   - Popup should open showing "Extension is active!"
   - Toggle should work (check/uncheck)

2. Navigate to YouTube (https://www.youtube.com/)
   - Open Chrome DevTools (F12)
   - Check Console tab for: "SlopBlock content script loaded on YouTube"
   - Check Console tab for: "SlopBlock initialized"

3. Check background service worker:
   - Go to `chrome://extensions/`
   - Find SlopBlock, click "Details"
   - Click "Inspect views: service worker"
   - Console should show: "SlopBlock background service worker loaded"

If you see all these messages, congratulations! Your extension is working.

---

## Step 7: Test Supabase Connection

### 7.1 Add Test Function to Background Worker

Add this test function to `src/background/service-worker.ts`:

```typescript
// Add to service-worker.ts
import { supabase } from '../lib/supabase';

async function testSupabaseConnection() {
  try {
    console.log('Testing Supabase connection...');

    const { data, error } = await supabase
      .from('videos')
      .select('count')
      .limit(1);

    if (error) {
      console.error('Supabase connection failed:', error);
    } else {
      console.log('Supabase connection successful!', data);
    }
  } catch (err) {
    console.error('Error testing Supabase:', err);
  }
}

// Call test function on startup
testSupabaseConnection();
```

### 7.2 Reload and Check

1. Go to `chrome://extensions/`
2. Click the reload button on your SlopBlock extension
3. Click "Inspect views: service worker" again
4. Check console - you should see "Supabase connection successful!"

If you see an error, double-check your `.env` file and Supabase credentials.

---

## Step 8: Verify Database Setup

### 8.1 Test Database Functions

Go to your Supabase SQL Editor and run:

```sql
-- Test report_video function
SELECT report_video('test_video_123', 'test_channel_456', 'test_extension_789');

-- Check if video was created
SELECT * FROM videos WHERE video_id = 'test_video_123';

-- Check if report was created
SELECT * FROM reports WHERE video_id = 'test_video_123';

-- Test get_marked_videos (should return nothing as report_count is only 1)
SELECT * FROM get_marked_videos(ARRAY['test_video_123']::VARCHAR[]);

-- Add two more reports to hit threshold
SELECT report_video('test_video_123', 'test_channel_456', 'extension_2');
SELECT report_video('test_video_123', 'test_channel_456', 'extension_3');

-- Now it should appear (report_count >= 3)
SELECT * FROM get_marked_videos(ARRAY['test_video_123']::VARCHAR[]);

-- Test channel stats
SELECT * FROM get_channel_stats('test_channel_456');

-- Clean up test data
DELETE FROM reports WHERE video_id = 'test_video_123';
DELETE FROM videos WHERE video_id = 'test_video_123';
```

All queries should work without errors.

---

## Next Steps

You now have a working development environment! Here's what to do next:

### Immediate Next Steps (Phase 1)

1. **Implement Report Button on Watch Page**:
   - Detect YouTube watch page URL
   - Extract video ID and channel ID
   - Add "Report as AI Slop" button to page
   - Connect button to `report_video` API function

2. **Implement API Service Module**:
   - Create `src/background/api.ts` with functions:
     - `reportVideo(videoId, channelId)`
     - `removeReport(videoId)`
     - `getMarkedVideos(videoIds)`
     - `getChannelStats(channelId)`

3. **Test End-to-End Flow**:
   - Click report button on a real YouTube video
   - Verify data appears in Supabase database
   - Test undo functionality

### Resources

- **Project Plan**: `PROJECT_PLAN.md` - Full specification
- **Chrome Extension Docs**: https://developer.chrome.com/docs/extensions/
- **Supabase Docs**: https://supabase.com/docs
- **TypeScript Docs**: https://www.typescriptlang.org/docs/

---

## Troubleshooting

### Extension Won't Load

- Check `dist/` folder exists and has `manifest.json`
- Look for build errors in terminal
- Try `npm run build` instead of `npm run dev`

### Content Script Not Running

- Refresh YouTube page after loading extension
- Check for JavaScript errors in page console
- Verify manifest.json content_scripts matches pattern

### Supabase Connection Failed

- Verify `.env` file exists and has correct values
- Check Supabase project is not paused
- Confirm anon key is the "anon/public" key, not service_role

### Can't See Console Logs

- **Content script logs**: Regular page DevTools (F12)
- **Background worker logs**: chrome://extensions/ → Inspect views
- **Popup logs**: Right-click popup → Inspect

---

## Getting Help

- Check `PROJECT_PLAN.md` for detailed architecture
- Review Chrome Extension documentation
- Check Supabase status page if API issues
- Look for similar Chrome extensions for examples (SponsorBlock, etc.)

---

**You're ready to start building! Follow the implementation phases in PROJECT_PLAN.md for step-by-step development guidance.**
