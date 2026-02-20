# Claude Memory for Obsidian AI Copilot

This file exists to remember specific quirks, build steps, and environment issues for this project so they aren't repeated in the future.

## Build and Deployment Workflow

**DO NOT** run `npm run build` directly in the source directory if it relies on node modules that are failing, and **DO NOT** attempt to copy `main.js` into the iCloud destination folder using standard `cp` or bash copy commands as iCloud will block it with an `EPERM` error.

Instead, follow this specific workflow when making changes:

1. **Edit code** normally in this main source working directory (`/Users/boss/ai-projects/side-hustles/obsidian_ai_copilot/`).
2. **SYNC the code** to the temporary build directory:
   ```bash
   rsync -av /Users/boss/ai-projects/side-hustles/obsidian_ai_copilot/src/ /tmp/obsidian_build/src/
   ```
   *(Failure to do this step will result in building old code and deploying a stale `main.js`!)*
3. **Build the plugin** in the tmp directory:
   ```bash
   cd /tmp/obsidian_build
   npm run build
   ```
4. **Deploy the plugin** to the live Obsidian iCloud folder using a Python script to bypass iCloud permission errors:
   ```bash
   cd "/Users/boss/Library/Mobile Documents/iCloud~md~obsidian/Documents/Life_OS/.obsidian/plugins/obsidian_ai_copilot"
   python3 -c "import os, shutil; dst='main.js'; src='/tmp/obsidian_build/main.js'; os.remove(dst) if os.path.exists(dst) else None; shutil.copyfile(src, dst); print('deployed')"
   ```

## Development Quirks
- **Svelte & Obsidian `ItemView`**: For UI clickability issues, make sure `ItemView` containers use `this.contentEl` instead of grabbing raw children arrays. Header buttons need `position: relative; z-index: 10;` to not be occluded by Obsidian title bars. 
- **Dependencies**: Keep Svelte and other external imports out of `obsidian` module imports, as Obsidian restricts node APIs.

**NEVER skip step 2!** Always `rsync` before building.
