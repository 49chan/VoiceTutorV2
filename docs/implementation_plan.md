# TutorDoc AI Phase 2 MVP - Mobile-First Redesign Plan

This plan addresses your requirements to optimize the UI for mobile/phone screens based on the provided mockups (`첫로그인화면.png` and `메인기능화면.png`), rearrange components to prevent cluttered multi-card layouts, and implement new features like automatic recording limits and edited text file savings.

## User Review Required

> [!IMPORTANT]
> **Mobile Layout Optimization**:
> The UI will switch from a desktop-grid dashboard to a clean, multi-screen system:
> 1. **Initial Screen (`첫로그인화면.png` style)**: Includes the Board ("게시판") button, Login ("로그인") button, Slogan, and Illustration diagram (`frontend/images/tutor_doc_diagram.png`), plus a "시작하기" (Get Started) button that navigates to the Practice Studio.
> 2. **Main Practice Screen (`메인기능화면.png` style)**: Top header has inline buttons: Open File ("파일열기"), Extract/Convert ("변환"), Record ("녹음"), Stop ("중지"), Evaluate ("평가"). Under it sits the large text editor/viewer area. The bottom section displays the detailed report on the left, a large circular overall score (e.g. "99") on the right, and footer controls for Settings ("설정") and Exit ("종료").

> [!NOTE]
> **Automatic 2-Minute Cutoff**:
> For the voice recorder, we will add a strict client-side countdown timer of 120 seconds (2 minutes). When reached, the recorder stops automatically and saves the `.mp3`/`.json` results.

## Open Questions

> [!NOTE]
> **Text Save Destination**:
> When editing the extracted text and clicking the "저장" button, we will save it to the local configuration directory as a `.txt` file (e.g., `[원본파일명].txt` or `수동낭독연습.txt`) and update the current workspace text. This satisfies the requirement of managing `.txt` extraction paths in the settings.

---

## Proposed Changes

### Backend Pipeline Components

#### [MODIFY] [main.py](file:///D:/12. Antigravity/20260724_KCoach_v2/backend/main.py)
Add a text-save endpoint:
- **`POST /api/save-text`**: Accepts `file_name` and `text`, cleans the filename, and saves it as a `.txt` file in the configured `local_storage_path` directory.

---

### Frontend MVP Interface

#### [MODIFY] [index.html](file:///D:/12. Antigravity/20260724_KCoach_v2/frontend/index.html)
Refactor HTML to implement the dual-screen system (Landing View vs functional Practice View):
- **Landing view (`첫로그인화면.png` layout)**:
  - Header: Left "게시판" button, Right "로그인/가입하기" button.
  - Body: Center title "나만의 문서가 실시간 원어민 튜터가 되다", diagram image `images/tutor_doc_diagram.png`, and a giant glowing "시작하기" button.
  - Dialogs:
    - **로그인 Drawer**: Form for Email, satisfaction slider (0-5 stars), disabled login & submit buttons.
    - **게시판 Drawer**: Mock list of user IDs, star ratings, and text reviews (e.g., "발음 평가 덕분에 실력이 쑥쑥 늘었어요!").
- **Practice view (`메인기능화면.png` layout)**:
  - Top Nav Bar: `파일열기`, `변환`, `녹음`, `중지`, `평가` buttons + play icon overlay.
  - Large Reading Text Pane: Displays raw text / highlighted spans. Toggle editable mode inside this container and add a "저장" icon-button.
  - Secondary Stats Columns (below text pane):
    - Left Column: Feedback comment/report.
    - Right Column: Big overall score display (circular "99" style).
  - Bottom Footer: Left "설정" button, Right "종료" button.
  - Modals:
    - **Settings Drawer**: Mic enable checkbox, API keys fields, Storage paths for `.txt`, `.json`, `.mp3` files, and Webhook connection.
    - **Open File Drawer**: Native file upload input accepting `.txt`, `.json`, and `.pdf` files.
    - **Convert PDF Drawer**: Specific page selector for PDF file uploads.

#### [MODIFY] [style.css](file:///D:/12. Antigravity/20260724_KCoach_v2/frontend/css/style.css)
Add mobile-first styles:
- Custom media query styling targeting viewport widths of phones/tablets.
- Header and footer spacing matching the mockup button sizes.
- Slogan font adjustments and center alignment.
- Modal dialog overlays for Login, Board, Settings, and File Select.
- Dynamic color indicators for the microphone status (pulsing visual animations).

#### [MODIFY] [app.js](file:///D:/12. Antigravity/20260724_KCoach_v2/frontend/js/app.js)
Update app flow controller logic:
- **Navigation Controls**: Switch between initial screen, practice screen, settings modal, login modal, and board modal. Clicking `종료` navigates back to the landing screen.
- **File Upload Handler**:
  - Uploading `.txt`: load file, reset evaluation scores, show text in editor/viewer, prepare for record.
  - Uploading `.json`: parse content, populate overall score, metrics, summary feedback, color highlights, and load the audio MP3 player from `/api/history/audio/{audio_filename}`.
  - Uploading `.pdf`: open the page number selector modal.
- **Text Editor & Save**: Bind edit changes, and call `/api/save-text` to save the edited text to a `.txt` file in the local folder.
- **Recording Time Limit**: Set a 2-minute (120-second) timer on recording start. If reached, trigger recorder stop and submit assessment automatically.
- **Mic Enable State**: Check/uncheck mic toggle in settings to control recorder constraints.

---

## Verification Plan

### Automated Tests
- Run backend unit tests using: `python backend/test_backend_pipeline.py`

### Manual Verification
1. Launch uvicorn backend server.
2. Load page on mobile simulator (phone width, e.g., 390x844).
3. Verify landing page slogan, illustration image, and Board/Login buttons.
4. Click "게시판" and "로그인" (verify disabled buttons and mock inputs).
5. Click "시작하기" to open the practice view.
6. Click "설정" to toggle settings (verify Mic toggle, API keys, paths).
7. Test PDF page extraction, edit the text, click "저장", and check that the `.txt` file is generated in the recordings directory.
8. Start recording. Speak for 2 minutes to confirm auto-stop works, or click "중지" (verify saving versioned JSON/MP3 pairs).
9. Verify colored word scores, audio playback seek on word click, and click "종료" to return to the landing page.
