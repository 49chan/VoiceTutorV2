# TutorDoc AI Phase 2 MVP - Walkthrough & GitHub Repository Guide

We have successfully integrated both Google Drive API (for cloud file persistence) and Google Identity Services (for secure Google social sign-in), and fully configured the application to deploy on Vercel's serverless environment!

---

## 🔗 GitHub Remote Repository
The code has been successfully pushed and is available online:
- **Repository URL**: [https://github.com/49chan/voice_tutor](https://github.com/49chan/voice_tutor)
- **Primary Branches**: `main`, `master` (both kept fully in sync)

---

## ☁️ Google Cloud Integrations Added

### 1. Google Drive API + Vercel Deployment
Instead of storing audio and logs on local disks (which Vercel clears on restarts), the app now streams `.txt`, `.json`, and `.mp3` files directly to your cloud Google Drive folder!
* **Serverless Compatibility**: Bypasses Vercel's local file restriction, enabling 100% free hosting.
* **Credentials Security**:
  * Local development uses `backend/google_drive_key.json` (automatically ignored by git for security).
  * Vercel uses the environment variable `GOOGLE_DRIVE_CREDENTIALS_JSON` holding the service account key.

### 2. Google Identity Services (Google Social Sign-In Web SDK)
Instead of typing email addresses manually, you can now log in securely with your native Google account.
* **Authentication Security**: Prevents fake/mock email input. Only verified Google accounts are submitted.
* **Visual Button**: Embeds the official "Sign in with Google" standard button directly in the login drawer interface.

---

## ⚙️ How to Set Up Credentials (GCP Console Steps)

### A. Google Social Login Client ID
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services** ➔ **Credentials**.
3. Click **Create Credentials** ➔ **OAuth Client ID** (select Web Application).
4. Add `http://localhost:8000`, `http://127.0.0.1:8000`, and your Vercel URL to the **Authorized JavaScript origins**.
5. Copy the generated Client ID and paste it in the app Settings ➔ **Google Client ID**.

### B. Google Drive API & Folder ID
1. Enable **Google Drive API** in your Google Cloud Project.
2. Go to **Credentials** ➔ Create a **Service Account** (type: free robot account).
3. Create a **New Key (JSON)** under that Service Account.
   * *Local Run*: Save it as `backend/google_drive_key.json` (do not change this filename).
   * *Vercel Run*: Copy the raw contents of the JSON and save it as an Environment Variable named `GOOGLE_DRIVE_CREDENTIALS_JSON` in your Vercel Project dashboard.
4. Create a folder in your Google Drive and share it with the **Service Account's email** as an "Editor".
5. Copy the Folder ID from the browser URL (the long hash after `folders/`) and paste it in Settings ➔ **Google Drive Folder ID**.

---

## 📱 Mobile & Tablet Layout Enhancements
We resolved your layout concerns regarding cut-off buttons on mobile and tablet screens:
1. **Dynamic Viewport Height (`dvh`)**: Swapped `100vh` for `100dvh` on `body`, `.screen-view`, and overlays to perfectly fit the actual visible area inside mobile browser chrome.
2. **Bottom Safe Area Padding**: Added `padding-bottom: calc(24px + env(safe-area-inset-bottom));` to `.drawer-card`.
3. **Scroll Spacing inside Drawers**: Added a healthy `padding-bottom: 30px;` to `.drawer-body` so that scrollable content can be pulled up entirely, making buttons completely visible.
4. **Media Query Image Scaling**: Configured a responsive media query (for heights <= 720px) that automatically scales down the home page diagram (from `320px` to `220px` max-width) and shrinks vertical margins.

---

## ✍️ Brand Name & Settings Save Error Updates
1. **Branding Update**: Changed the landing page footer brand logo from "K-Coach AI Business Japanese" to **"Voice Tutor AI Business"**.
2. **Settings Connection Error Details**: Improved the settings save exception reporting in `app.js` to display the exact URL target that failed:
   - *Example Alert*: `❌ 서버 연결 실패. 지정한 API 주소(http://192.168.0.15:8000)에 백엔드가 구동 중인지, 또는 PC의 로컬 서버가 켜져 있는지 확인해 주세요.`

---

## 🛠️ Staged & Committed Assets (Safe Push Policy)
We initialized the repository with a strict **`.gitignore`** to ensure your sensitive keys and credentials never leak to public repositories:
- **Pushed files**: All frontend components (`index.html`, CSS, JS), backend Python servers (`main.py`, config, normalizers, unit tests), and developer plan blueprints.
- **Ignored files (kept locally for security)**:
  - `backend/settings.json` (contains your encrypted Azure Keys, OCR keys, and Google Webhook URLs).
  - `backend/.secret.key` (decryption key).
  - `recordings/` folder (local PCM WAV and converted MP3 files).
  - Temporary files and precompiled caches (`__pycache__/`, `backend/temp/`).

---

## 🏃 Running the Application (Local Mode)

Simply start the FastAPI backend server:
```powershell
$env:PYTHONUTF8=1
python backend/main.py
```
Open **`http://127.0.0.1:8000`** in your browser. 
1. Tapping **설정** in the landing header allows you to change the authorized email.
2. Logging in with that email will unlock the app, while any other email will trigger the security wipe.
3. Load a `.txt` file to verify that the text is immediately rendered.
4. Load a `.json` file to verify that the buttons are disabled and the top-right header correctly displays the `.json` name.
