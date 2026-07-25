# TutorDoc AI Phase 2 MVP - Walkthrough & GitHub Repository Guide

We have successfully switched the remote URL and pushed all local changes to the correct `voice_tutor` repository!

---

## 🔗 GitHub Remote Repository
The code has been successfully pushed and is available online:
- **Repository URL**: [https://github.com/49chan/voice_tutor](https://github.com/49chan/voice_tutor)
- **Primary Branches**: `main`, `master` (both kept fully in sync)

---

## 📖 Work History Documentation
We created a comprehensive, detailed Korean documentation file detailing all security, layout, connection, and file display changes made today:
- **File Link**: [docs/work_history.md](file:///D:/12.%20Antigravity/20260724_KCoach_v2/docs/work_history.md)

---

## 📱 Mobile & Tablet Layout Enhancements
We resolved your layout concerns regarding cut-off buttons on mobile and tablet screens:
1. **Dynamic Viewport Height (`dvh`)**: Swapped `100vh` for `100dvh` on `body`, `.screen-view`, and overlays to perfectly fit the actual visible area inside mobile browser chrome (preventing page contents from being pushed off-screen by address and navigation bars).
2. **Bottom Safe Area Padding**: Added `padding-bottom: calc(24px + env(safe-area-inset-bottom));` to `.drawer-card` so buttons like "로그인" and "설정 암화화 저장" are padded above the home indicator bar on modern iOS/Android devices.
3. **Scroll Spacing inside Drawers**: Added a healthy `padding-bottom: 30px;` to `.drawer-body` so that scrollable content can be pulled up entirely, making buttons completely visible.
4. **Media Query Image Scaling**: Configured a responsive media query (for heights <= 720px) that automatically scales down the home page diagram (from `320px` to `220px` max-width) and shrinks vertical margins. This fits the slogan, diagram, and "시작하기" button completely on small screens without requiring scrolling!

---

## ✍️ Brand Name & Settings Save Error Updates
1. **Branding Update**: Changed the landing page footer brand logo from "K-Coach AI Business Japanese" to **"Voice Tutor AI Business"**.
2. **Settings Connection Error Details**: Improved the settings save exception reporting in `app.js` to display the exact URL target that failed:
   - *Example Alert*: `❌ 서버 연결 실패. 지정한 API 주소(http://192.168.0.15:8000)에 백엔드가 구동 중인지, 또는 PC의 로컬 서버가 켜져 있는지 확인해 주세요.`
   - This helps diagnose whether the error is due to a dead backend server or an incorrect IP address configured in the browser's local storage.

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
