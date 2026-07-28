let BACKEND_URL = localStorage.getItem("backend_url") || window.location.origin;
// Supabase Client Global Instance
let supabaseClient = null;

// App Globals
let activeView = "landing"; // "landing" or "practice"
let isEditingText = false;
let recordedWavBlob = null;
let currentAudioUrl = null;
let wordPlaybackStopTime = null;
let uploadedPdfFile = null;
let activeFilename = "수동낭독연습.txt";
let activePageNumber = 1;

// Recording Timer Globals
let recordingTimerInterval = null;
let recordingTimeout = null;
let recordingSecondsElapsed = 0;
const RECORDING_LIMIT_SECONDS = 120; // 2 minutes cutoff
let voiceDetected = false;
let voiceCheckTimeout = null;
let isLoggedIn = false;

// Audio Recorder Instance
let recorder = new AudioRecorder();

// Settings schema
let settings = {
    learning_language: "ja-JP",
    local_storage_path: "",
    has_azure_speech: false,
    has_google_sheets: false
};

// Initial setup
document.addEventListener("DOMContentLoaded", async () => {
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
        const response = await fetch(`${BACKEND_URL}/api/settings`);
        if (response.ok) {
            settings = await response.json();
            
            // Populate form fields
            document.getElementById("setting-backend-url").value = BACKEND_URL;
            document.getElementById("setting-learning-lang").value = settings.learning_language || "ja-JP";
            document.getElementById("setting-storage-path").value = settings.local_storage_path || "";
            
            // Update status dots indicators
            updateStatusDots();
            
            // Initialize Google Sign-In button stub
            initGoogleSignIn();
        }
    } catch (err) {
        console.error("Failed to load settings from server:", err);
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
    const inputBackendUrl = document.getElementById("setting-backend-url").value.trim();
    if (inputBackendUrl) {
        BACKEND_URL = inputBackendUrl;
        localStorage.setItem("backend_url", inputBackendUrl);
    } else {
        BACKEND_URL = window.location.origin;
        localStorage.removeItem("backend_url");
    }
    
    settings.learning_language = document.getElementById("setting-learning-lang").value;
    settings.local_storage_path = document.getElementById("setting-storage-path").value.trim();
    
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
            
            alert(`교재 텍스트 파일 (.txt) 로드 완료!\n녹음 버튼을 눌러 연습을 시작해 주세요.`);
        };
        reader.readAsText(file, "utf-8");
    } else if (extension === "json") {
        // Read previous JSON evaluation and restore dashboard results
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const evalData = JSON.parse(e.target.result);
                // Override with actual json filename to resolve top-name text mismatches
                evalData.file_name = file.name;
                
                forceViewMode();
                restoreEvaluationFromData(evalData);
                
                // Disable all action buttons on static history logs
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
                
                alert(`이력 결과 파일 (.json) 복원 완료!\n단어를 클릭하면 녹음 구간을 들을 수 있습니다.`);
            } catch (err) {
                alert("올바른 JSON 평가 파일 형식이 아닙니다.");
                console.error("JSON parse error:", err);
            }
        };
        reader.readAsText(file, "utf-8");
    } else {
        alert("지원하지 않는 파일 형식입니다. .txt, .json, .pdf 파일만 가능합니다.");
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

function resetEvaluationDisplay() {
    document.getElementById("stat-overall-score").textContent = "--";
    document.getElementById("stat-overall-score").style.background = "";
    document.getElementById("stat-overall-score").style.webkitTextFillColor = "";
    document.getElementById("stat-overall-score").style.webkitBackgroundClip = "";
    document.getElementById("stat-summary-feedback").textContent = "평가를 진행하시면 이곳에 오발음 분석 리포트가 표시됩니다.";
    
    const player = document.getElementById("evaluation-audio-player");
    player.src = "";
    const playbackIcon = document.getElementById("icon-playback-state");
    if (playbackIcon) playbackIcon.className = "fa-solid fa-circle-play";
    
    recordedWavBlob = null;
    currentAudioUrl = null;
    wordPlaybackStopTime = null;
    
    document.getElementById("btn-func-stop").disabled = true;
    document.getElementById("btn-func-evaluate").disabled = false;
}

function restoreEvaluationFromData(data) {
    // 1. Filename overlays
    activeFilename = data.file_name || "복원된이력.json";
    document.getElementById("label-active-filename").textContent = activeFilename;
    document.getElementById("raw-text-editor").value = data.raw_text || "";
    
    // 2. Score details display
    const score = parseFloat(data.overall_score || 0);
    const overallDisplay = document.getElementById("stat-overall-score");
    overallDisplay.textContent = score.toFixed(1);
    
    if (score >= 85) {
        overallDisplay.style.background = "linear-gradient(135deg, #ffffff 40%, var(--color-high) 100%)";
    } else if (score >= 60) {
        overallDisplay.style.background = "linear-gradient(135deg, #ffffff 40%, var(--color-mid) 100%)";
    } else {
        overallDisplay.style.background = "linear-gradient(135deg, #ffffff 40%, var(--color-low) 100%)";
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
            document.getElementById("label-active-filename").textContent = `${uploadedPdfFile.name} (p.${pageNum})`;
            
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
    }
}

async function saveEditedText() {
    const rawText = document.getElementById("raw-text-editor").value.trim();
    if (!rawText) {
        alert("저장할 텍스트 내용이 없습니다.");
        return;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/save-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                file_name: activeFilename,
                text: rawText
            })
        });
        
        if (response.ok) {
            const res = await response.json();
            alert(`수정된 텍스트가 [${res.file_name}] 파일로 지정된 저장 폴더에 저장되었습니다!`);
        } else {
            alert("텍스트 파일 저장에 실패했습니다.");
        }
    } catch (err) {
        console.error("Save edited text network error:", err);
        alert("서버 연결 실패");
    }
}

// -----------------
// Voice Recording (Noise Gating & 2-Minute Cutoff)
// -----------------
async function startMobileRecording() {
    const btnRecord = document.getElementById("btn-func-record");
    const btnStop = document.getElementById("btn-func-stop");
    const btnEval = document.getElementById("btn-func-evaluate");
    const timerLabel = document.getElementById("recording-timer-countdown");
    
    btnRecord.disabled = true;
    btnRecord.classList.add("disabled");
    
    try {
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
        
        recordedWavBlob = null;
        recordingSecondsElapsed = 0;
        timerLabel.textContent = `2:00`;
        
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
        alert("마이크 입력 오류. 권한을 확인하세요.");
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
    btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
    btn.disabled = true;
    
    const formData = new FormData();
    formData.append("file_name", activeFilename);
    formData.append("page_number", activePageNumber);
    formData.append("raw_text", rawText);
    
    const normalizedText = quickNormalizeText(rawText);
    formData.append("normalized_text", normalizedText);
    formData.append("audio", recordedWavBlob, "recording.wav");
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/evaluate`, {
            method: "POST",
            body: formData
        });
        
        if (response.ok) {
            const evalResult = await response.json();
            restoreEvaluationFromData(evalResult);
        } else {
            const err = await response.json();
            alert(`평가 오류: ${err.detail || "서버 통신 오류"}`);
        }
    } catch (err) {
        console.error("Evaluation exception:", err);
        alert("서버 통신 실패");
    } finally {
        btn.innerHTML = "<i class='fa-solid fa-square-poll-vertical'></i> 평가";
        btn.disabled = false;
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




