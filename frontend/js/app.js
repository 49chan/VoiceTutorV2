const defaultOrigin = (window.location.origin === "null" || window.location.origin.startsWith("file://") || !window.location.origin.startsWith("http")) ? "http://127.0.0.1:8000" : window.location.origin;
let BACKEND_URL = localStorage.getItem("backend_url") || defaultOrigin;
if (BACKEND_URL === "null" || BACKEND_URL.startsWith("file://") || !BACKEND_URL.startsWith("http")) {
    BACKEND_URL = "http://127.0.0.1:8000";
}
// Supabase Client Global Instance
let supabaseClient = null;

// App Globals
let activeView = "landing"; // "landing" or "practice"
let isEditingText = false;
let recordedWavBlob = null;
let currentAudioUrl = null;
let wordPlaybackStopTime = null;
let uploadedPdfFile = null;
let activeFilename = "";
let activePageNumber = 1;

// Recording Timer Globals
let recordingTimerInterval = null;
let recordingTimeout = null;
let recordingSecondsElapsed = 0;
const RECORDING_LIMIT_SECONDS = 90; // 1.5 minutes cutoff
let voiceDetected = false;
let voiceCheckTimeout = null;
let isLoggedIn = false;

// Audio Recorder Instance
let recorder = new AudioRecorder();

// 중지 후 저장된 MP3 정보 (평가 시 재사용)
let savedRecordingInfo = null;

// Settings schema
let settings = {
    learning_language: "ja-JP",
    local_storage_path: "",
    has_azure_speech: false,
    has_google_sheets: false
};

// Initial setup
document.addEventListener("DOMContentLoaded", async () => {
    // Apply saved screen theme immediately
    const savedTheme = localStorage.getItem("screen_theme") || "white";
    applyScreenTheme(savedTheme);

    loadAppSettings();
    initAudioPlayerEvents();
    
    // Initialize Supabase Client
    await initSupabase();
    
    // Update Login UI based on session
    updateLoginUI();
});

async function initSupabase() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/supabase-config`);
        if (response.ok) {
            const config = await response.json();
            if (config.supabase_url && config.supabase_key) {
                supabaseClient = supabase.createClient(config.supabase_url, config.supabase_key);
                console.log("Supabase Client initialized successfully.");
            } else {
                console.warn("Supabase configuration keys are empty.");
            }
        } else {
            console.error("Failed to fetch Supabase config from API.");
        }
    } catch (err) {
        console.error("Error during Supabase initialization:", err);
    }
}

function updateLoginUI() {
    const isSessionLoggedIn = sessionStorage.getItem("isLoggedIn") === "true";
    const userEmail = sessionStorage.getItem("userEmail");
    const userName = sessionStorage.getItem("userName");
    const userAvatar = sessionStorage.getItem("userAvatar");
    
    const startBtn = document.getElementById("btn-landing-start-app");
    const loginBtn = document.getElementById("btn-tab-login");
    const profileHeader = document.getElementById("user-profile-header");
    const avatarImg = document.getElementById("user-avatar");
    const nameSpan = document.getElementById("user-name");
    const emailSpan = document.getElementById("user-email");
    
    if (isSessionLoggedIn && userEmail) {
        isLoggedIn = true;
        
        // Enable Start App Button
        if (startBtn) {
            startBtn.classList.remove("disabled");
            startBtn.disabled = false;
        }
        
        // Update Login/Logout Button
        if (loginBtn) {
            loginBtn.innerHTML = "<i class='fa-solid fa-user-check'></i> 로그아웃";
            loginBtn.onclick = logoutGoogleUser;
        }
        
        // Render Profile Info
        if (profileHeader) {
            profileHeader.classList.remove("hidden");
            if (avatarImg) {
                avatarImg.src = userAvatar || "";
                avatarImg.onerror = () => { 
                    avatarImg.src = "https://lh3.googleusercontent.com/a/default-user=s96-c"; 
                };
            }
            if (nameSpan) nameSpan.textContent = userName || "사용자";
            if (emailSpan) emailSpan.textContent = userEmail;
        }
    } else {
        isLoggedIn = false;
        
        // Disable Start App Button
        if (startBtn) {
            startBtn.classList.add("disabled");
            startBtn.disabled = true;
        }
        
        // Reset Login/Logout Button
        if (loginBtn) {
            loginBtn.innerHTML = "<i class='fa-solid fa-user-lock'></i> 로그인";
            loginBtn.onclick = () => toggleDrawer('login', true);
        }
        
        // Hide Profile Info
        if (profileHeader) {
            profileHeader.classList.add("hidden");
        }
    }
}

// -----------------
// View Router & Drawer Controllers
// -----------------
function enterPracticeRoom() {
    activeView = "practice";
    document.getElementById("screen-landing").classList.add("hidden");
    document.getElementById("screen-practice").classList.remove("hidden");
    loadAppSettings();
}

function exitPracticeRoom() {
    // Stop any ongoing recording
    if (recorder.isRecording) {
        stopMobileRecording();
    }
    
    // Pause any playing audio
    const player = document.getElementById("evaluation-audio-player");
    player.pause();
    
    activeView = "landing";
    document.getElementById("screen-practice").classList.add("hidden");
    document.getElementById("screen-landing").classList.remove("hidden");
}

function toggleDrawer(drawerId, show) {
    const overlay = document.getElementById(`drawer-${drawerId}`);
    if (!overlay) return;
    
    if (show) {
        overlay.classList.remove("hidden");
        if (drawerId === 'file-upload') {
            loadDbHistory();
        }
    } else {
        overlay.classList.add("hidden");
        // If settings drawer is closed, turn off mic testing and validate status
        if (drawerId === 'settings') {
            const micToggle = document.getElementById("setting-mic-toggle");
            const testStatusText = document.getElementById("mic-test-status").textContent;
            
            if (micToggle.checked && testStatusText !== "정상 (목소리 감지됨)") {
                alert("⚠️ 마이크 테스트가 '정상' 상태가 아닙니다!\n마이크 장치 연결 상태나 입력 볼륨을 확인해 주세요.");
            }
            
            micToggle.checked = false;
            stopMicTest();
        }
    }
}

// -----------------
// Configuration Loader
// -----------------
async function loadAppSettings() {
    try {
        // Restore saved screen theme
        const savedTheme = localStorage.getItem("screen_theme") || "white";
        applyScreenTheme(savedTheme);
        const themeSelect = document.getElementById("setting-screen-theme");
        if (themeSelect) themeSelect.value = savedTheme;

        const response = await fetch(`${BACKEND_URL}/api/settings`);
        if (response.ok) {
            settings = await response.json();
            
            // Populate form fields
            const isLocal = localStorage.getItem("dev_local_checked") === "true";
            const devLocalCheckbox = document.getElementById("setting-dev-local");
            if (devLocalCheckbox) {
                devLocalCheckbox.checked = isLocal;
            }
            
            const localUrlInput = document.getElementById("setting-dev-local-url");
            if (localUrlInput) {
                localUrlInput.value = localStorage.getItem("dev_local_url") || "";
            }
            
            toggleDevLocalUrlField();
            
            document.getElementById("setting-learning-lang").value = settings.learning_language || "ja-JP";
            
            // Update status dots indicators
            updateStatusDots();
            
            // Initialize Google Sign-In button stub
            initGoogleSignIn();
        }
    } catch (err) {
        console.error("Failed to load settings from server:", err);
    }
}

function toggleDevLocalUrlField() {
    const checkbox = document.getElementById("setting-dev-local");
    const container = document.getElementById("dev-local-url-container");
    if (checkbox && container) {
        if (checkbox.checked) {
            container.style.display = "flex";
        } else {
            container.style.display = "none";
        }
    }
}

function updateStatusDots() {
    const dotMic = document.getElementById("dot-mic-status");
    const dotSheets = document.getElementById("dot-sheets-status");
    
    // Check if mic checkbox is toggled
    const micEnabled = document.getElementById("setting-mic-toggle").checked;
    if (micEnabled) {
        dotMic.className = "dot dot-green";
        dotMic.title = "마이크 사용 가능";
    } else {
        dotMic.className = "dot dot-red";
        dotMic.title = "마이크 비활성화";
    }
    
    // Sheets webhook is managed on server-side env vars
    if (settings.has_google_sheets) {
        dotSheets.className = "dot dot-green";
        dotSheets.title = "구글 시트 연동 활성 (서버 환경변수)";
    } else {
        dotSheets.className = "dot dot-red";
        dotSheets.title = "구글 시트 연동 비활성 (서버 환경변수 미설정)";
    }
}

// Bind change listener to mic checkbox to update status dots
document.getElementById("setting-mic-toggle").addEventListener("change", updateStatusDots);

async function saveAppSettings() {
    const isLocalChecked = document.getElementById("setting-dev-local").checked;
    localStorage.setItem("dev_local_checked", isLocalChecked ? "true" : "false");
    
    if (isLocalChecked) {
        const customUrl = document.getElementById("setting-dev-local-url").value.trim();
        localStorage.setItem("dev_local_url", customUrl);
        if (customUrl) {
            BACKEND_URL = customUrl;
            localStorage.setItem("backend_url", customUrl);
        } else {
            BACKEND_URL = "http://127.0.0.1:8000";
            localStorage.setItem("backend_url", "http://127.0.0.1:8000");
        }
    } else {
        const defaultOrigin = (window.location.origin === "null" || window.location.origin.startsWith("file://") || !window.location.origin.startsWith("http")) ? "http://127.0.0.1:8000" : window.location.origin;
        BACKEND_URL = defaultOrigin;
        localStorage.setItem("backend_url", defaultOrigin);
    }
    settings.learning_language = document.getElementById("setting-learning-lang").value;
    
    // Save theme setting
    const selectedTheme = document.getElementById("setting-screen-theme").value;
    applyScreenTheme(selectedTheme);
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            alert("설정이 성공적으로 저장되었습니다!");
            updateStatusDots();
            toggleDrawer('settings', false);
            loadAppSettings();
        } else {
            const errText = await response.text();
            alert(`❌ 설정 저장 실패 (서버 오류):\n${errText}`);
        }
    } catch (err) {
        console.error("Save settings error:", err);
        alert(`❌ 서버 연결 실패\n\n지정한 API 주소(${BACKEND_URL})에 백엔드가 구동 중인지, 또는 PC의 로컬 서버가 켜져 있는지 확인해 주세요.`);
    }
}

function updateBackendUrlField() {
    const isLocal = document.getElementById("backend-type-local").checked;
    const urlField = document.getElementById("setting-backend-url");
    if (isLocal) {
        urlField.value = "http://127.0.0.1:8000";
    } else {
        urlField.value = window.location.origin;
    }
}



// -----------------
// File Upload & Local Import handlers
// -----------------
function forceViewMode() {
    isEditingText = false;
    const editor = document.getElementById("raw-text-editor");
    const viewer = document.getElementById("text-highlight-viewer");
    const editToggleIcon = document.getElementById("icon-edit-toggle");
    const saveBtn = document.getElementById("btn-save-edited-text");
    
    if (editor) editor.classList.add("hidden");
    if (viewer) viewer.classList.remove("hidden");
    if (editToggleIcon) editToggleIcon.className = "fa-solid fa-pen-to-square";
    if (saveBtn) saveBtn.classList.add("hidden");
}

function handleFileImport(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    const extension = file.name.split('.').pop().toLowerCase();
    activeFilename = file.name;
    
    // Close Drawer
    toggleDrawer('file-upload', false);
    
    if (extension === "pdf") {
        uploadedPdfFile = file;
        document.getElementById("label-pdf-active").textContent = file.name;
        // Open PDF Page selector
        toggleDrawer('extract-pdf', true);
    } else if (extension === "txt") {
        // Read text locally using FileReader API
        const reader = new FileReader();
        reader.onload = (e) => {
            const rawText = e.target.result;
            // Set text values
            document.getElementById("raw-text-editor").value = rawText;
            document.getElementById("label-active-filename").textContent = file.name;
            
            // Clean view highlights card and reset score displays (txt is new practice)
            resetEvaluationDisplay();
            
            // Force view mode so the loaded text is shown immediately
            forceViewMode();
            
            // Set raw text into viewer
            renderRawTextView(rawText);
            updateWordCounters();
            
            // Enable practice buttons, disable stopped/evaluate
            const btnExtract = document.getElementById("btn-func-extract");
            const btnRecord = document.getElementById("btn-func-record");
            const btnStop = document.getElementById("btn-func-stop");
            const btnEval = document.getElementById("btn-func-evaluate");
            
            [btnExtract, btnRecord].forEach(btn => {
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove("disabled");
                }
            });
            [btnStop, btnEval].forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add("disabled");
                }
            });
            
            // Re-enable edit button
            const btnEdit = document.getElementById("btn-edit-text-toggle");
            if (btnEdit) {
                btnEdit.disabled = false;
                btnEdit.classList.remove("disabled");
            }
            
            alert(`교재 텍스트 파일 (.txt) 로드 완료!\n녹음 버튼을 눌러 연습을 시작해 주세요.`);
        };
        reader.readAsText(file, "utf-8");
    } else if (extension === "txt") {
        // Read text locally using FileReader API
        const reader = new FileReader();
        reader.onload = (e) => {
            const rawText = e.target.result;
            // Set text values
            document.getElementById("raw-text-editor").value = rawText;
            document.getElementById("label-active-filename").textContent = file.name;
            
            // Clean view highlights card and reset score displays (txt is new practice)
            resetEvaluationDisplay();
            
            // Force view mode so the loaded text is shown immediately
            forceViewMode();
            
            // Set raw text into viewer
            renderRawTextView(rawText);
            updateWordCounters();
            
            // Enable practice buttons, disable stopped/evaluate
            const btnExtract = document.getElementById("btn-func-extract");
            const btnRecord = document.getElementById("btn-func-record");
            const btnStop = document.getElementById("btn-func-stop");
            const btnEval = document.getElementById("btn-func-evaluate");
            
            [btnExtract, btnRecord].forEach(btn => {
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove("disabled");
                }
            });
            [btnStop, btnEval].forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add("disabled");
                }
            });
            
            // Re-enable edit button
            const btnEdit = document.getElementById("btn-edit-text-toggle");
            if (btnEdit) {
                btnEdit.disabled = false;
                btnEdit.classList.remove("disabled");
            }
            
            alert(`교재 텍스트 파일 (.txt) 로드 완료!\n녹음 버튼을 눌러 연습을 시작해 주세요.`);
        };
        reader.readAsText(file, "utf-8");
    } else {
        alert("지원하지 않는 파일 형식입니다. .txt, .pdf 파일만 가능합니다.");
    }
    
    // Clear input
    input.value = "";
}

function renderRawTextView(text) {
    const viewer = document.getElementById("text-highlight-viewer");
    viewer.innerHTML = "";
    
    if (!text.trim()) {
        viewer.innerHTML = `<span class="placeholder-text">[파일열기] 또는 [변환]으로 교재를 로드하세요.</span>`;
        return;
    }
    
    // Split by original line breaks (newlines)
    const lines = text.split('\n');
    lines.forEach(line => {
        const lineDiv = document.createElement("div");
        lineDiv.className = "reading-line";
        lineDiv.style.marginBottom = "6px";
        
        const words = line.trim().split(/\s+/);
        if (line.trim() === "") {
            const br = document.createElement("br");
            lineDiv.appendChild(br);
        } else {
            words.forEach(w => {
                if (w.trim()) {
                    const span = document.createElement("span");
                    span.className = "word-span";
                    span.textContent = w + " ";
                    lineDiv.appendChild(span);
                }
            });
        }
        viewer.appendChild(lineDiv);
    });
}

function resetEvaluationDisplay(keepAudio = false) {
    document.getElementById("stat-overall-score").textContent = "--";
    document.getElementById("stat-overall-score").style.background = "";
    document.getElementById("stat-overall-score").style.webkitTextFillColor = "";
    document.getElementById("stat-overall-score").style.webkitBackgroundClip = "";
    document.getElementById("stat-summary-feedback").textContent = "평가를 진행하시면 이곳에 오발음 분석 리포트가 표시됩니다.";
    
    if (!keepAudio) {
        const player = document.getElementById("evaluation-audio-player");
        player.src = "";
        const playbackIcon = document.getElementById("icon-playback-state");
        if (playbackIcon) playbackIcon.className = "fa-solid fa-circle-play";
        
        recordedWavBlob = null;
        currentAudioUrl = null;
        wordPlaybackStopTime = null;
        savedRecordingInfo = null; // 이전 녹음 세션 저장 정보 초기화
    }
    
    // Reset evaluation and recording button states
    const btnStop = document.getElementById("btn-func-stop");
    if (btnStop) {
        btnStop.disabled = true;
        btnStop.classList.add("disabled");
    }
    
    const btnEval = document.getElementById("btn-func-evaluate");
    if (btnEval) {
        if (keepAudio && recordedWavBlob) {
            btnEval.disabled = false;
            btnEval.classList.remove("disabled");
        } else {
            btnEval.disabled = true; // Disabled initially until recording is complete
            btnEval.classList.add("disabled");
        }
    }
    
    const btnRecord = document.getElementById("btn-func-record");
    if (btnRecord) {
        btnRecord.disabled = false;
        btnRecord.classList.remove("disabled");
    }
}

function restoreEvaluationFromData(data) {
    // 1. Filename overlays
    activeFilename = data.file_name || "복원된이력.json";
    document.getElementById("label-active-filename").textContent = activeFilename;
    document.getElementById("raw-text-editor").value = data.raw_text || "";
    
    // 2. Score details display
    const score = parseFloat(data.overall_score || 0);
    const overallDisplay = document.getElementById("stat-overall-score");
    overallDisplay.textContent = Math.round(score);
    
    if (score >= 85) {
        overallDisplay.style.background = "linear-gradient(135deg, var(--score-gradient-start) 40%, var(--color-high) 100%)";
    } else if (score >= 60) {
        overallDisplay.style.background = "linear-gradient(135deg, var(--score-gradient-start) 40%, var(--color-mid) 100%)";
    } else {
        overallDisplay.style.background = "linear-gradient(135deg, var(--score-gradient-start) 40%, var(--color-low) 100%)";
    }
    overallDisplay.style.webkitTextFillColor = "transparent";
    overallDisplay.style.webkitBackgroundClip = "text";
    
    document.getElementById("stat-summary-feedback").textContent = data.summary_feedback || "복원 완료.";
    
    // 3. Highlight Word spans (preserving line breaks)
    const viewer = document.getElementById("text-highlight-viewer");
    viewer.innerHTML = "";
    
    const evalWords = data.words || [];
    let wordIdx = 0;
    
    const originalText = data.raw_text || "";
    const lines = originalText.split('\n');
    
    lines.forEach(line => {
        const lineDiv = document.createElement("div");
        lineDiv.className = "reading-line";
        lineDiv.style.marginBottom = "6px";
        
        const lineWords = line.trim().split(/\s+/);
        if (line.trim() === "") {
            const br = document.createElement("br");
            lineDiv.appendChild(br);
        } else {
            lineWords.forEach(w => {
                if (w.trim()) {
                    const span = document.createElement("span");
                    span.className = "word-span";
                    span.textContent = w + " ";
                    
                    // Match with evaluated word index
                    if (wordIdx < evalWords.length) {
                        const wData = evalWords[wordIdx];
                        const wScore = wData.AccuracyScore;
                        
                        if (wScore >= 85) {
                            span.classList.add("score-high");
                        } else if (wScore >= 60) {
                            span.classList.add("score-mid");
                        } else {
                            span.classList.add("score-low");
                        }
                        
                        span.title = `정확도: ${wScore.toFixed(0)}점 | ${wData.ErrorType}`;
                        span.onclick = () => playWordSegment(wData.Offset, wData.Duration);
                        
                        wordIdx++;
                    }
                    lineDiv.appendChild(span);
                }
            });
        }
        viewer.appendChild(lineDiv);
    });
    
    // 4. Audio loading
    if (data.audio_filename) {
        const player = document.getElementById("evaluation-audio-player");
        player.src = `${BACKEND_URL}/api/history/audio/${data.audio_filename}`;
    }
}

// -----------------
// PDF Extract operations
// -----------------
async function runPdfPageExtraction() {
    if (!uploadedPdfFile) {
        alert("먼저 PDF 파일을 업로드하세요!");
        return;
    }
    
    const pageNum = parseInt(document.getElementById("pdf-page-selector-input").value) || 1;
    activePageNumber = pageNum;
    
    const btn = document.getElementById("btn-run-extraction");
    btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> 추출 중...";
    btn.disabled = true;
    
    const formData = new FormData();
    formData.append("file", uploadedPdfFile);
    formData.append("page_number", pageNum);
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/extract-page`, {
            method: "POST",
            body: formData
        });
        
        if (response.ok) {
            const res = await response.json();
            document.getElementById("raw-text-editor").value = res.raw_text;
            const baseName = uploadedPdfFile.name.replace(/\.pdf$/i, "");
            activeFilename = `${baseName}_p${pageNum}.txt`;
            document.getElementById("label-active-filename").textContent = activeFilename;
            
            resetEvaluationDisplay();
            forceViewMode();
            renderRawTextView(res.raw_text);
            updateWordCounters();
            
            // Enable convert & record, disable stop & evaluate
            const btnExtract = document.getElementById("btn-func-extract");
            const btnRecord = document.getElementById("btn-func-record");
            const btnStop = document.getElementById("btn-func-stop");
            const btnEval = document.getElementById("btn-func-evaluate");
            
            [btnExtract, btnRecord].forEach(btn => {
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove("disabled");
                }
            });
            [btnStop, btnEval].forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add("disabled");
                }
            });
            
            // Re-enable edit button
            const btnEdit = document.getElementById("btn-edit-text-toggle");
            if (btnEdit) {
                btnEdit.disabled = false;
                btnEdit.classList.remove("disabled");
            }
            
            toggleDrawer('extract-pdf', false);
            alert(`PDF p.${pageNum} 문자 추출이 정상 완료되었습니다!\n텍스트에 오류가 있다면 수정하실 수 있습니다.`);
        } else {
            let errorMsg = "알 수 없는 오류";
            try {
                const err = await response.json();
                errorMsg = err.detail || err.message || "오류";
            } catch (jsonErr) {
                try {
                    errorMsg = await response.text();
                    if (errorMsg.length > 150) {
                        errorMsg = errorMsg.substring(0, 150) + "...";
                    }
                } catch (textErr) {
                    errorMsg = `HTTP 상태 코드: ${response.status} ${response.statusText}`;
                }
            }
            alert(`❌ 문자 추출 실패: ${errorMsg}`);
        }
    } catch (err) {
        console.error("PDF page extraction exception:", err);
        alert(`❌ 클라이언트 오류 발생:\n${err.message || err}\n\n(상세 내용: ${err.stack ? err.stack.split('\n')[0] : ''})`);
    } finally {
        btn.innerHTML = "페이지 문자 추출 <i class='fa-solid fa-wand-magic'></i>";
        btn.disabled = false;
    }
}

function updateWordCounters() {
    const val = document.getElementById("raw-text-editor").value;
    document.getElementById("char-counter-text").textContent = `글자수: ${val.length}`;
}

// -----------------
// Manual Text Edit Mode & Save (.txt)
// -----------------
function toggleTextEditMode() {
    const textViewer = document.getElementById("text-highlight-viewer");
    const textEditor = document.getElementById("raw-text-editor");
    const editToggleIcon = document.getElementById("icon-edit-toggle");
    const saveBtn = document.getElementById("btn-save-edited-text");
    
    isEditingText = !isEditingText;
    
    if (isEditingText) {
        // Enter Edit Mode
        textViewer.classList.add("hidden");
        textEditor.classList.remove("hidden");
        editToggleIcon.className = "fa-solid fa-check";
        saveBtn.classList.remove("hidden");
        textEditor.focus();
        updateWordCounters();
    } else {
        // Exit Edit Mode (Commit text and display basic spans)
        textEditor.classList.add("hidden");
        textViewer.classList.remove("hidden");
        editToggleIcon.className = "fa-solid fa-pen-to-square";
        saveBtn.classList.add("hidden");
        
        renderRawTextView(textEditor.value);
        resetEvaluationDisplay(true); // Reset evaluation display but keep recording audio
        
        // Auto-save the text! (silent: alert 없이 저장)
        saveEditedText(true);
    }
}

async function saveEditedText(silent = false) {
    const rawText = document.getElementById("raw-text-editor").value.trim();
    if (!rawText) {
        if (!silent) alert("저장할 텍스트 내용이 없습니다.");
        return;
    }
    
    let filenameToSave = activeFilename;
    if (!silent || activeFilename === "새텍스트.txt" || !activeFilename || activeFilename.trim() === "") {
        let defaultName = activeFilename ? activeFilename.replace(/\.txt$/i, "") : "";
        if (defaultName === "새텍스트") {
            defaultName = "";
        }
        let userFilename = prompt("저장할 파일명을 입력해 주세요:", defaultName);
        if (userFilename === null) {
            return; // Cancelled
        }
        userFilename = userFilename.trim();
        if (!userFilename) {
            alert("올바른 파일명을 입력해 주세요.");
            return;
        }
        if (!userFilename.toLowerCase().endsWith(".txt")) {
            userFilename += ".txt";
        }
        filenameToSave = userFilename;
        activeFilename = filenameToSave;
        document.getElementById("label-active-filename").textContent = activeFilename;
    }
    
    try {
        const currentLang = document.getElementById("setting-learning-lang")?.value || settings.learning_language || "ja-JP";
        const response = await fetch(`${BACKEND_URL}/api/save-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                file_name: filenameToSave,
                text: rawText,
                language: currentLang
            })
        });
        
        if (response.ok) {
            const res = await response.json();
            activeFilename = res.file_name;
            document.getElementById("label-active-filename").textContent = activeFilename;
            console.log(`텍스트 저장 완료: ${res.file_name}`);
        } else {
            if (!silent) alert("텍스트 파일 저장에 실패했습니다.");
        }
    } catch (err) {
        console.error("Save edited text network error:", err);
        if (!silent) alert("서버 연결 실패");
    }
}

// -----------------
// Voice Recording (Noise Gating & 2-Minute Cutoff)
// -----------------
async function startMobileRecording() {
    // 파일명 저장 여부 체크 (새텍스트.txt가 없거나 빈값인 경우 녹음 불가)
    if (!activeFilename || activeFilename === "새텍스트.txt" || activeFilename.trim() === "") {
        alert("⚠️ [파일저장 누락]\n녹음을 시작하기 전에 먼저 본문 텍스트를 저장하여 파일명을 지정해 주세요.");
        return;
    }

    const btnRecord = document.getElementById("btn-func-record");
    const btnStop = document.getElementById("btn-func-stop");
    const btnEval = document.getElementById("btn-func-evaluate");
    const timerLabel = document.getElementById("recording-timer-countdown");
    
    btnRecord.disabled = true;
    btnRecord.classList.add("disabled");
    
    try {
        // 기존 녹음 데이터 및 오디오 객체 URL 명시적 초기화
        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
            currentAudioUrl = null;
        }
        recordedWavBlob = null;
        savedRecordingInfo = null;
        
        const player = document.getElementById("evaluation-audio-player");
        if (player) {
            player.src = "";
        }
        
        // Turn off settings microphone test if it is running
        stopMicTest();
        document.getElementById("setting-mic-toggle").checked = false;
        
        // Reset voice detection flag
        voiceDetected = false;
        
        // Start WebRTC capture
        await recorder.start((rms) => {
            // Check if vocal sound is detected (RMS threshold)
            if (rms > 0.006) {
                voiceDetected = true;
            }
        });
        
        btnRecord.classList.add("active");
        btnStop.disabled = false;
        btnStop.classList.remove("disabled");
        
        btnEval.disabled = true;
        btnEval.classList.add("disabled");
        
        timerLabel.classList.remove("hidden");
        
        // Update top-right indicator (Red Play)
        const indicator = document.getElementById("recording-status-indicator");
        const icon = document.getElementById("icon-recording-status");
        indicator.className = "recording-status-indicator recording";
        icon.className = "fa-solid fa-play";
        
        recordingSecondsElapsed = 0;
        timerLabel.textContent = `1:30`;
        
        // Set 30-second silence detector timeout
        voiceCheckTimeout = setTimeout(() => {
            if (!voiceDetected && recorder.isRecording) {
                console.warn("No voice detected within 30 seconds. Cutting off automatically...");
                stopMobileRecording();
                alert("⚠️ 30초 동안 음성이 감지되지 않아 녹음이 자동 중지되었습니다.\n마이크 연결 상태나 마이크 볼륨 크기를 확인해 주세요.");
            }
        }, 30000);
        
        // Stagger Countdown Timer
        recordingTimerInterval = setInterval(() => {
            recordingSecondsElapsed++;
            const remaining = RECORDING_LIMIT_SECONDS - recordingSecondsElapsed;
            
            if (remaining <= 0) {
                // Auto cutoff at 2 minutes
                console.log("Reached 2 minutes recording threshold. Cutting off automatically...");
                stopMobileRecording();
            } else {
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                timerLabel.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }
        }, 1000);
        
    } catch (err) {
        console.error("Recording start error:", err);
        alert("설정에서 마이크 사용여부를 확인하세요.");
        btnRecord.disabled = false;
        btnRecord.classList.remove("disabled");
    }
}

async function stopMobileRecording() {
    const btnRecord = document.getElementById("btn-func-record");
    const btnStop = document.getElementById("btn-func-stop");
    const btnEval = document.getElementById("btn-func-evaluate");
    const timerLabel = document.getElementById("recording-timer-countdown");
    
    // Clear intervals and silence timeouts
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
    
    if (voiceCheckTimeout) {
        clearTimeout(voiceCheckTimeout);
        voiceCheckTimeout = null;
    }
    timerLabel.classList.add("hidden");
    
    try {
        recordedWavBlob = await recorder.stop();
        btnRecord.classList.remove("active");
        btnRecord.disabled = false;
        btnRecord.classList.remove("disabled");
        
        btnStop.disabled = true;
        btnStop.classList.add("disabled");
        
        btnEval.disabled = false;
        btnEval.classList.remove("disabled");
        
        // Update top-right indicator (Black Stop)
        const indicator = document.getElementById("recording-status-indicator");
        const icon = document.getElementById("icon-recording-status");
        indicator.className = "recording-status-indicator stopped";
        icon.className = "fa-solid fa-stop";
        
        // Feed wav into player
        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
        }
        currentAudioUrl = URL.createObjectURL(recordedWavBlob);
        document.getElementById("evaluation-audio-player").src = currentAudioUrl;
        
        console.log("Recorded WAV Blob size:", recordedWavBlob.size);

        // 중지 즉시 MP3 저장 요청 (백그라운드, 평가와 무관하게 파일 생성)
        savedRecordingInfo = null;
        try {
            const rawText = document.getElementById("raw-text-editor").value.trim();
            const saveForm = new FormData();
            saveForm.append("file_name", activeFilename);
            saveForm.append("page_number", activePageNumber);
            saveForm.append("audio", recordedWavBlob, "recording.wav");

            const saveRes = await fetch(`${BACKEND_URL}/api/save-recording`, {
                method: "POST",
                body: saveForm
            });
            if (saveRes.ok) {
                savedRecordingInfo = await saveRes.json();
                console.log("녹음 파일 저장 완료:", savedRecordingInfo);
            } else {
                console.warn("녹음 파일 저장 실패 (평가 시 재변환됩니다).");
            }
        } catch (saveErr) {
            console.warn("녹음 저장 요청 에러:", saveErr);
        }
    } catch (err) {
        console.error("Recording stop error:", err);
        btnRecord.disabled = false;
        btnRecord.classList.remove("disabled");
        btnStop.disabled = true;
        btnStop.classList.add("disabled");
    }
}

// -----------------
// Evaluation Submit
// -----------------
async function submitAssessment() {
    if (!recordedWavBlob) {
        alert("평가할 녹음 데이터가 없습니다. 먼저 녹음을 진행하세요!");
        return;
    }
    
    // Warn if API keys are missing on submit
    if (!settings.has_azure_speech) {
        const confirmMock = confirm("⚠️ Azure Speech API 구독 설정이 비어 있습니다. 시뮬레이터 모드로 발음 평가를 진행하시겠습니까?");
        if (!confirmMock) return;
    }
    
    // Automatically toggle out of text edit mode to show highlighted colors
    if (isEditingText) {
        toggleTextEditMode();
    }
    
    const rawText = document.getElementById("raw-text-editor").value.trim();
    if (!rawText) {
        alert("평가할 낭독 문장이 없습니다. 텍스트를 준비하세요.");
        return;
    }
    
    const btn = document.getElementById("btn-func-evaluate");
    if (btn) {
        btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
        btn.disabled = true;
    }
    
    let success = false;
    let isTimeout = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        isTimeout = true;
        controller.abort();
    }, 9000); // 9 seconds timeout
    
    try {
        const formData = new FormData();
        formData.append("file_name", activeFilename);
        formData.append("page_number", activePageNumber);
        formData.append("raw_text", rawText);
        
        const normalizedText = quickNormalizeText(rawText);
        formData.append("normalized_text", normalizedText);
        formData.append("audio", recordedWavBlob, "recording.wav");
        
        // 설정화면의 학습언어설정 값을 확인하여 함께 전달 (안전하게 취득)
        const learningLangSelect = document.getElementById("setting-learning-lang");
        const learningLang = learningLangSelect ? learningLangSelect.value : (settings.learning_language || "ja-JP");
        formData.append("learning_language", learningLang);

        // 중지 시 저장된 버전이 있으면 evaluate에 전달 (MP3 중복 생성 방지)
        if (savedRecordingInfo && savedRecordingInfo.version != null) {
            formData.append("pre_saved_version", savedRecordingInfo.version);
            console.log("pre_saved_version 전달:", savedRecordingInfo.version);
        }
        
        const response = await fetch(`${BACKEND_URL}/api/evaluate`, {
            method: "POST",
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const evalResult = await response.json();
            restoreEvaluationFromData(evalResult);
            success = true;
            savedRecordingInfo = null; // 평가 완료 후 초기화
            
            // Disable 녹음 button
            const btnRecord = document.getElementById("btn-func-record");
            if (btnRecord) {
                btnRecord.disabled = true;
                btnRecord.classList.add("disabled");
            }
            // Supabase user_records 테이블 적재
            if (supabaseClient) {
                try {
                    const sessionRes = await supabaseClient.auth.getSession();
                    const session = sessionRes.data?.session;
                    const userId = session?.user?.id;
                    if (userId) {
                        // 1. 동일 textbook에 대해 기존 최대 testcount 조회
                        const { data: existingRecords, error: fetchError } = await supabaseClient
                            .from('user_records')
                            .select('testcount')
                            .eq('user_id', userId)
                            .eq('textbook', activeFilename)
                            .order('testcount', { ascending: false })
                            .limit(1);

                        if (fetchError) throw fetchError;

                        let nextTestCount = 1;
                        if (existingRecords && existingRecords.length > 0) {
                            nextTestCount = (existingRecords[0].testcount || 0) + 1;
                        }

                        // 2. user_records 테이블에 데이터 삽입 (소문자 스키마 사용, created_at/updated_at은 now() 자동 지정 생략)
                        const { error: insertError } = await supabaseClient
                            .from('user_records')
                            .insert([{
                                user_id: userId,
                                record_type: 'test',
                                textbook: activeFilename,
                                testcount: nextTestCount,
                                score: Math.round(evalResult.overall_score),
                                feedback: evalResult.summary_feedback
                            }]);

                        if (insertError) throw insertError;
                        console.log(`Supabase user_records 적재 성공! (textbook: ${activeFilename}, testcount: ${nextTestCount})`);
                    } else {
                        console.warn("Supabase user_id를 찾을 수 없습니다. 로그인 상태를 확인하세요.");
                    }
                } catch (supaErr) {
                    console.error("Supabase user_records 적재 중 오류 발생:", supaErr);
                }
            }
        } else {
            const err = await response.json();
            alert(`평가 오류: ${err.detail || "서버 통신 오류"}`);
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError" || isTimeout) {
            alert("평가 시간 초과: 9초 동안 서버로부터 응답이 없어 평가를 강제 중단합니다.");
        } else {
            console.error("Evaluation exception:", err);
            alert("서버 통신 실패");
        }
    } finally {
        const btnEval = document.getElementById("btn-func-evaluate");
        if (btnEval) {
            btnEval.innerHTML = "<i class='fa-solid fa-square-poll-vertical'></i> 평가";
            if (success) {
                btnEval.disabled = true;
                btnEval.classList.add("disabled");
            } else {
                btnEval.disabled = false;
                btnEval.classList.remove("disabled");
            }
        }
    }
}

function quickNormalizeText(text) {
    let clean = text;
    clean = clean.replace(/\([^)]*\)/g, '');
    clean = clean.replace(/\[[^\]]*\]/g, '');
    clean = clean.replace(/\{[^}]*\}/g, '');
    clean = clean.replace(/（[^）]*）/g, '');
    clean = clean.replace(/［[^］]*］/g, '');
    clean = clean.replace(/｛[^｝]*｝/g, '');
    clean = clean.replace(/[【】]/g, '');
    clean = clean.replace(/[~～]/g, '');
    clean = clean.replace(/[*#@$%^&_+=\\|<>/`\-—_]/g, '');
    return clean.replace(/\s+/g, ' ').trim();
}

// -----------------
// Seek & Play word segment player
// -----------------
function playWordSegment(offsetTicks, durationTicks) {
    const player = document.getElementById("evaluation-audio-player");
    if (!player.src || player.src.includes("null")) return;
    
    const start = parseFloat(offsetTicks) / 10000000.0;
    const dur = parseFloat(durationTicks) / 10000000.0;
    const end = start + dur;
    
    wordPlaybackStopTime = end;
    player.currentTime = start;
    player.play().catch(e => console.error(e));
}

function toggleGlobalAudio() {
    const player = document.getElementById("evaluation-audio-player");
    const icon = document.getElementById("icon-playback-state");
    
    if (!player.src || player.src.includes("null")) {
        alert("재생할 녹음 오디오가 없습니다.");
        return;
    }
    
    if (player.paused) {
        wordPlaybackStopTime = null; // Clear word stop
        player.play();
        if (icon) icon.className = "fa-solid fa-circle-pause";
    } else {
        player.pause();
        if (icon) icon.className = "fa-solid fa-circle-play";
    }
}

function initAudioPlayerEvents() {
    const player = document.getElementById("evaluation-audio-player");
    const icon = document.getElementById("icon-playback-state");
    
    // timeupdate monitor
    player.addEventListener("timeupdate", () => {
        if (wordPlaybackStopTime !== null && player.currentTime >= wordPlaybackStopTime) {
            player.pause();
            wordPlaybackStopTime = null;
            if (icon) icon.className = "fa-solid fa-circle-play";
        }
    });

    player.addEventListener("play", () => {
        if (wordPlaybackStopTime === null) {
            if (icon) icon.className = "fa-solid fa-circle-pause";
        }
    });

    player.addEventListener("pause", () => {
        if (icon) icon.className = "fa-solid fa-circle-play";
    });

    player.addEventListener("ended", () => {
        if (icon) icon.className = "fa-solid fa-circle-play";
        wordPlaybackStopTime = null;
    });
    
    // Animation frame precise check
    function checkAudioPlaybackEnd() {
        if (wordPlaybackStopTime !== null && player.currentTime >= wordPlaybackStopTime) {
            player.pause();
            wordPlaybackStopTime = null;
            icon.className = "fa-solid fa-circle-play";
        }
        requestAnimationFrame(checkAudioPlaybackEnd);
    }
    requestAnimationFrame(checkAudioPlaybackEnd);
}

// -----------------
// Settings Microphone Hardware Test Utilities
// -----------------
let micTestAudioContext = null;
let micTestStream = null;
let micTestInterval = null;

function toggleMicTest() {
    const isChecked = document.getElementById("setting-mic-toggle").checked;
    
    if (isChecked) {
        startMicTest();
    } else {
        stopMicTest();
    }
}

async function startMicTest() {
    const statusLabel = document.getElementById("mic-test-status");
    statusLabel.textContent = "소리 감지 대기 중...";
    statusLabel.style.color = "var(--text-muted)";
    
    try {
        micTestStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        micTestAudioContext = new AudioContextClass();
        
        const source = micTestAudioContext.createMediaStreamSource(micTestStream);
        const analyser = micTestAudioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        micTestInterval = setInterval(() => {
            if (!micTestAudioContext) return;
            analyser.getByteTimeDomainData(dataArray);
            
            // Calculate Root Mean Square volume
            let rms = 0;
            for (let i = 0; i < bufferLength; i++) {
                let val = (dataArray[i] - 128) / 128;
                rms += val * val;
            }
            rms = Math.sqrt(rms / bufferLength);
            
            // If sound amplitude rises above threshold
            if (rms > 0.015) {
                statusLabel.textContent = "정상 (목소리 감지됨)";
                statusLabel.style.color = "var(--color-high)";
            }
        }, 150);
        
    } catch (err) {
        console.error("Microphone hardware test failure:", err);
        statusLabel.textContent = "마이크 사용 실패";
        statusLabel.style.color = "var(--color-low)";
        document.getElementById("setting-mic-toggle").checked = false;
    }
}

function stopMicTest() {
    const statusLabel = document.getElementById("mic-test-status");
    if (statusLabel) {
        statusLabel.textContent = "대기 중";
        statusLabel.style.color = "var(--text-muted)";
    }
    
    if (micTestInterval) {
        clearInterval(micTestInterval);
        micTestInterval = null;
    }
    if (micTestStream) {
        micTestStream.getTracks().forEach(track => track.stop());
        micTestStream = null;
    }
    if (micTestAudioContext) {
        micTestAudioContext.close().catch(() => {});
        micTestAudioContext = null;
    }
}

// -----------------
// Google Email Login & Security Helpers
// -----------------
function handleStartAppButtonClick() {
    const isSessionLoggedIn = sessionStorage.getItem("isLoggedIn") === "true";
    if (!isLoggedIn && !isSessionLoggedIn) {
        alert("⚠️ 서비스 보안 정책에 따라 먼저 등록된 구글 계정으로 로그인해 주셔야 입장이 가능합니다!");
        toggleDrawer('login', true);
        return;
    }
    enterPracticeRoom();
}



async function logoutGoogleUser() {
    if (supabaseClient) {
        try {
            await supabaseClient.auth.signOut();
        } catch (e) {
            console.error("Supabase 로그아웃 중 에러:", e);
        }
    }
    
    sessionStorage.removeItem("isLoggedIn");
    sessionStorage.removeItem("userEmail");
    sessionStorage.removeItem("userName");
    sessionStorage.removeItem("userAvatar");
    
    updateLoginUI();
    alert("로그아웃 되었습니다.");
}

function initGoogleSignIn() {
    // Supabase Google OAuth를 사용하므로 기존 Google GIS SDK 초기화는 건너뜁니다.
    console.log("Using Supabase Google OAuth instead of legacy GIS.");
}

async function loginWithGoogle() {
    if (!supabaseClient) {
        alert("Supabase 클라이언트가 초기화되지 않았습니다. 잠시 후 다시 시도해 주세요.");
        return;
    }
    
    const redirectToUrl = `${window.location.origin}/auth/callback`;
    console.log("Initiating Supabase Google OAuth to:", redirectToUrl);
    
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: redirectToUrl
        }
    });
    
    if (error) {
        console.error("Supabase OAuth error:", error);
        alert("Google 로그인 과정에서 오류가 발생했습니다: " + error.message);
    }
}

// -----------------
// Theme Management helper
// -----------------
function applyScreenTheme(theme) {
    if (theme === "white") {
        document.body.classList.add("theme-white");
    } else {
        document.body.classList.remove("theme-white");
    }
    localStorage.setItem("screen_theme", theme);
}

// -----------------
// Load & Display Supabase Evaluation Result History
// -----------------
async function showResultHistory() {
    if (!supabaseClient) {
        alert("Supabase 클라이언트가 초기화되지 않았습니다. 잠시 후 다시 시도해 주세요.");
        return;
    }

    const container = document.getElementById("history-container");
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">불러오는 중...</div>`;
    toggleDrawer('history', true);

    try {
        const sessionRes = await supabaseClient.auth.getSession();
        const session = sessionRes.data?.session;
        const userId = session?.user?.id;

        if (!userId) {
            container.innerHTML = `<div style="text-align: center; color: var(--color-low); padding: 20px; font-weight: bold;">로그인이 필요한 서비스입니다.</div>`;
            return;
        }

        const { data, error } = await supabaseClient
            .from('user_records')
            .select('textbook, testcount, score, created_at, feedback')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">저장된 평가 이력이 없습니다.</div>`;
            return;
        }

        container.innerHTML = "";
        data.forEach(item => {
            const card = document.createElement("div");
            card.className = "history-item";
            card.style.border = "1px solid var(--border-light)";
            card.style.borderRadius = "12px";
            card.style.padding = "14px";
            card.style.background = "rgba(255, 255, 255, 0.02)";
            card.style.display = "flex";
            card.style.flexDirection = "column";
            card.style.gap = "8px";

            // Formatting score color
            let scoreColor = "var(--color-low)";
            const scoreVal = Math.round(parseFloat(item.score || 0));
            if (scoreVal >= 85) {
                scoreColor = "var(--color-high)";
            } else if (scoreVal >= 60) {
                scoreColor = "var(--color-mid)";
            }

            // Date parsing
            let formattedDate = item.created_at;
            try {
                if (item.created_at) {
                    const date = new Date(item.created_at);
                    const yyyy = date.getFullYear();
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    const dd = String(date.getDate()).padStart(2, '0');
                    const hh = String(date.getHours()).padStart(2, '0');
                    const min = String(date.getMinutes()).padStart(2, '0');
                    const ss = String(date.getSeconds()).padStart(2, '0');
                    formattedDate = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
                }
            } catch (e) {
                console.error(e);
            }

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; margin-bottom: 6px;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); word-break: break-all;">${item.textbook || '미지정교재'}</span>
                        <div style="display: flex; gap: 6px; align-items: center; font-size: 0.72rem; color: var(--text-muted);">
                            <span>${item.testcount ? item.testcount + '회차' : '1회차'}</span>
                            <span style="opacity: 0.4;">|</span>
                            <span>${formattedDate}</span>
                        </div>
                    </div>
                    <span style="font-weight: 800; font-size: 1.15rem; color: ${scoreColor}; white-space: nowrap;">${scoreVal}점</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-main); line-height: 1.4; white-space: pre-wrap; word-break: break-all;">${item.feedback || '평가 내역 없음'}</div>
            `;
            container.appendChild(card);
        });

    } catch (err) {
        console.error("Failed to load result history:", err);
        container.innerHTML = `<div style="text-align: center; color: var(--color-low); padding: 20px;">이력을 불러오는 중 오류가 발생했습니다.</div>`;
    }
}

// -----------------
// Enter Direct Text Input Mode
// -----------------
function enterTextInputMode() {
    const textViewer = document.getElementById("text-highlight-viewer");
    const textEditor = document.getElementById("raw-text-editor");
    const editToggleIcon = document.getElementById("icon-edit-toggle");
    const saveBtn = document.getElementById("btn-save-edited-text");
    
    isEditingText = true;
    
    textViewer.classList.add("hidden");
    textEditor.classList.remove("hidden");
    editToggleIcon.className = "fa-solid fa-check";
    saveBtn.classList.remove("hidden");
    
    textEditor.value = ""; // Start with empty editor
    textEditor.focus();
    updateWordCounters();
    
    activeFilename = "";
    document.getElementById("label-active-filename").textContent = "교재 없음 (저장 필요)";
    
    resetEvaluationDisplay();
}

// -----------------
// DB Evaluation History Loader
// -----------------
async function loadDbHistory() {
    const listContainer = document.getElementById("db-evaluation-history-list");
    if (!listContainer) return;
    
    listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 0.8rem;"><i class="fa-solid fa-spinner fa-spin"></i> 이력 불러오는 중...</div>`;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/db-history`);
        if (!response.ok) throw new Error("Failed to fetch history");
        
        const historyData = await response.json();
        if (historyData.length === 0) {
            listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 0.8rem;">저장된 평가 이력이 없습니다.</div>`;
            return;
        }
        
        listContainer.innerHTML = "";
        historyData.forEach(item => {
            const itemDiv = document.createElement("div");
            itemDiv.style.display = "flex";
            itemDiv.style.justifyContent = "space-between";
            itemDiv.style.alignItems = "center";
            itemDiv.style.padding = "8px 12px";
            itemDiv.style.background = "rgba(255, 255, 255, 0.03)";
            itemDiv.style.border = "1px solid var(--border-light)";
            itemDiv.style.borderRadius = "6px";
            itemDiv.style.cursor = "pointer";
            itemDiv.style.transition = "background 0.2s";
            
            itemDiv.onmouseover = () => { itemDiv.style.background = "rgba(255, 255, 255, 0.08)"; };
            itemDiv.onmouseout = () => { itemDiv.style.background = "rgba(255, 255, 255, 0.03)"; };
            
            // Format score color
            let scoreColor = "var(--color-low)";
            if (item.overall_score >= 85) scoreColor = "var(--color-high)";
            else if (item.overall_score >= 60) scoreColor = "var(--color-mid)";
            
            itemDiv.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 2px; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 75%;">
                    <strong style="font-size: 0.85rem; color: var(--text-main); text-overflow: ellipsis; overflow: hidden;">${item.file_name}</strong>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">버전 ${item.version} | ${item.created_at}</span>
                </div>
                <span style="font-weight: 700; font-size: 0.9rem; color: ${scoreColor};">${item.overall_score}점</span>
            `;
            
            itemDiv.onclick = () => loadDbEvaluationDetail(item.file_name, item.version);
            listContainer.appendChild(itemDiv);
        });
    } catch (err) {
        console.error("DB history load error:", err);
        listContainer.innerHTML = `<div style="text-align: center; color: var(--color-low); padding: 15px; font-size: 0.8rem;">이력을 불러오지 못했습니다.</div>`;
    }
}

async function loadDbEvaluationDetail(fileName, version) {
    toggleDrawer('file-upload', false);
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/db-history/${encodeURIComponent(fileName)}/${version}`);
        if (!response.ok) throw new Error("Failed to fetch detail");
        
        const evalData = await response.json();
        
        const onlyTxtChecked = document.getElementById("db-history-only-txt-checkbox")?.checked;
        if (onlyTxtChecked) {
            const rawText = evalData.raw_text || "";
            document.getElementById("raw-text-editor").value = rawText;
            activeFilename = fileName.endsWith(".txt") ? fileName : `${fileName}.txt`;
            document.getElementById("label-active-filename").textContent = activeFilename;
            
            resetEvaluationDisplay();
            forceViewMode();
            renderRawTextView(rawText);
            updateWordCounters();
            
            // Enable practice controls
            const btnExtract = document.getElementById("btn-func-extract");
            const btnRecord = document.getElementById("btn-func-record");
            const btnStop = document.getElementById("btn-func-stop");
            const btnEval = document.getElementById("btn-func-evaluate");
            
            [btnExtract, btnRecord].forEach(btn => {
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove("disabled");
                }
            });
            [btnStop, btnEval].forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add("disabled");
                }
            });
            
            const btnEdit = document.getElementById("btn-edit-text-toggle");
            if (btnEdit) {
                btnEdit.disabled = false;
                btnEdit.classList.remove("disabled");
            }
            
            alert(`교재 텍스트 [${fileName}] 복원 완료!\n녹음 버튼을 눌러 연습을 시작해 주세요.`);
            return;
        }
        
        forceViewMode();
        restoreEvaluationFromData(evalData);
        
        // Disable practice buttons as on static history logs
        const btnExtract = document.getElementById("btn-func-extract");
        const btnRecord = document.getElementById("btn-func-record");
        const btnStop = document.getElementById("btn-func-stop");
        const btnEval = document.getElementById("btn-func-evaluate");
        
        [btnExtract, btnRecord, btnStop, btnEval].forEach(btn => {
            if (btn) {
                btn.disabled = true;
                btn.classList.add("disabled");
            }
        });
        
        // Disable edit button for static json log
        const btnEdit = document.getElementById("btn-edit-text-toggle");
        if (btnEdit) {
            btnEdit.disabled = true;
            btnEdit.classList.add("disabled");
        }
    } catch (err) {
        console.error("Failed to load evaluation detail:", err);
        alert("평가 이력 상세 데이터를 복원하지 못했습니다.");
    }
}





