# GitHub Pages Setup Guide

This guide will help you set up GitHub Pages for your SlopBlock extension documentation.

## Overview

GitHub Pages allows you to host static documentation websites directly from your GitHub repository. You'll create three documentation pages:

- **Help** - User guide and FAQ
- **Privacy** - Privacy policy
- **Feedback** - Feedback form and issue reporting

## Step 1: Create Documentation Directory

1. In your repository root, create a `docs/` folder:
   ```bash
   mkdir docs
   ```

2. Add an `index.html` file to serve as the landing page (optional):
   ```bash
   touch docs/index.html
   ```

## Step 2: Add Documentation Files

Create the following markdown files in the `docs/` directory:

- `docs/help.md` - User help and FAQ
- `docs/privacy.md` - Privacy policy
- `docs/feedback.md` - Feedback instructions

Content templates for these files are provided in separate markdown files in your project root.

## Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (in the repository menu)
3. Scroll down to **Pages** in the left sidebar
4. Under **Source**, select:
   - **Branch**: `main` (or your default branch)
   - **Folder**: `/docs`
5. Click **Save**

GitHub will automatically build and deploy your site. This may take a few minutes.

## Step 4: Get Your GitHub Pages URL

After enabling GitHub Pages, GitHub will show you your site URL:

```
https://<your-username>.github.io/<repository-name>/
```

For example:
- If your username is `johndoe`
- And your repository is `slopblock`
- Your URL will be: `https://johndoe.github.io/slopblock/`

## Step 5: Update Extension Links

Once you have your GitHub Pages URL, update the popup link handlers:

### File: `src/popup/popup.ts`

Update the `setupLinks()` function with your actual URLs:

```typescript
function setupLinks(): void {
  const helpLink = document.getElementById('helpLink');
  const privacyLink = document.getElementById('privacyLink');
  const feedbackLink = document.getElementById('feedbackLink');

  if (helpLink) {
    helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://your-username.github.io/slopblock/help' });
    });
  }

  if (privacyLink) {
    privacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://your-username.github.io/slopblock/privacy' });
    });
  }

  if (feedbackLink) {
    feedbackLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://your-username.github.io/slopblock/issues' });
    });
  }
}
```

Replace `your-username` and `slopblock` with your actual GitHub username and repository name.

## Step 6: Configure GitHub Pages Theme (Optional)

To make your documentation look professional, add a `_config.yml` file in the `docs/` folder:

```yaml
# docs/_config.yml
theme: jekyll-theme-minimal
title: SlopBlock Documentation
description: Crowdsourced AI content detection for YouTube

# Navigation
navigation:
  - name: Help
    url: /help
  - name: Privacy
    url: /privacy
  - name: Feedback
    url: /feedback
```

Popular GitHub Pages themes:
- `jekyll-theme-minimal` - Clean and simple
- `jekyll-theme-cayman` - Modern with header
- `jekyll-theme-slate` - Dark theme
- `jekyll-theme-tactile` - Professional

## Step 7: Verify Deployment

1. Wait 1-2 minutes for GitHub Pages to build
2. Visit your GitHub Pages URL
3. Test the navigation:
   - `https://your-username.github.io/slopblock/` - Home
   - `https://your-username.github.io/slopblock/help` - Help page
   - `https://your-username.github.io/slopblock/privacy` - Privacy policy
   - `https://your-username.github.io/slopblock/feedback` - Feedback instructions

## Step 8: Test Extension Links

1. Build your extension: `npm run build`
2. Load the extension in Chrome
3. Click the extension icon to open the popup
4. Click each link (Help, Privacy, Feedback) to verify they open the correct pages

## Troubleshooting

### 404 Errors

If you get 404 errors, check:

1. **Branch name**: Make sure you selected the correct branch in GitHub Pages settings
2. **Folder location**: Ensure files are in `/docs` folder, not root
3. **File names**: Markdown files must be lowercase (e.g., `help.md`, not `HELP.md`)
4. **Build status**: Check the **Actions** tab in GitHub to see if the build succeeded

### Pages Not Updating

If changes don't appear:

1. Wait 2-3 minutes for GitHub to rebuild
2. Clear your browser cache
3. Check the **Actions** tab for build errors
4. Try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Links Not Working in Extension

If popup links don't work:

1. Check the browser console for errors
2. Verify the URLs in `popup.ts` match your GitHub Pages URL
3. Rebuild the extension after changing URLs: `npm run build`
4. Reload the extension in Chrome

## Advanced: Custom Domain (Optional)

If you want a custom domain (e.g., `slopblock.com`):

1. Buy a domain from a registrar (Namecheap, Google Domains, etc.)
2. Create a `CNAME` file in `/docs` with your domain:
   ```
   slopblock.com
   ```
3. Configure DNS settings with your registrar:
   - Add a `CNAME` record pointing to `your-username.github.io`
4. Update GitHub Pages settings to use your custom domain
5. Wait 24-48 hours for DNS propagation

## Quick Reference

**Enable GitHub Pages:**
1. Repository → Settings → Pages
2. Source: `main` branch, `/docs` folder
3. Save and wait for deployment

**Your URLs:**
- Home: `https://your-username.github.io/repository-name/`
- Help: `https://your-username.github.io/repository-name/help`
- Privacy: `https://your-username.github.io/repository-name/privacy`
- Feedback: `https://your-username.github.io/repository-name/issues`

**Update Extension:**
1. Edit `src/popup/popup.ts` with your URLs
2. Run `npm run build`
3. Reload extension in Chrome

## Next Steps

After setting up GitHub Pages:

1. ✅ Create the documentation content (help.md, privacy.md, feedback.md)
2. ✅ Update popup.ts with your GitHub Pages URLs
3. ✅ Rebuild the extension
4. ✅ Test all links
5. ✅ Optional: Add a custom theme with `_config.yml`
6. ✅ Optional: Create an `index.md` homepage
