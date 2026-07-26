import os
import json
import wave
import shutil
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

try:
    from backend.config import load_settings, save_settings, AppSettings, get_default_storage_path
    from backend.text_normalizer import clean_text
    from backend.security import encrypt_value
    from backend.google_sheets import test_sheet_connection, append_evaluation_row
    from backend.azure_speech import test_azure_connection, run_pronunciation_assessment, run_mock_assessment
except ImportError:
    from config import load_settings, save_settings, AppSettings, get_default_storage_path
    from text_normalizer import clean_text
    from security import encrypt_value
    from google_sheets import test_sheet_connection, append_evaluation_row
    from azure_speech import test_azure_connection, run_pronunciation_assessment, run_mock_assessment

import lameenc
from pypdf import PdfReader

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("TutorDocBackend")

app = FastAPI(title="TutorDoc AI Phase 2 MVP Backend", version="4.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temp files directory - use /tmp on Vercel or read-only filesystems
if os.environ.get("VERCEL") or not os.access(os.path.dirname(os.path.abspath(__file__)), os.W_OK):
    TEMP_DIR = "/tmp/tutor_doc_temp"
else:
    TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# -----------------
# Helper Functions
# -----------------

def convert_wav_to_mp3(wav_path: str, mp3_path: str) -> bool:
    """Converts a standard 16-bit PCM WAV file into an MP3 file using lameenc."""
    try:
        with wave.open(wav_path, "rb") as wav:
            num_channels = wav.getnchannels()
            sample_rate = wav.getframerate()
            sampwidth = wav.getsampwidth()
            
            # Read PCM frames
            pcm_data = wav.readframes(wav.getnframes())
            
            # Initialize lame encoder
            encoder = lameenc.Encoder()
            encoder.set_bit_rate(128)
            encoder.set_in_sample_rate(sample_rate)
            encoder.set_channels(num_channels)
            encoder.set_quality(2) # High quality (2-9 range)
            
            # Encode data
            mp3_data = encoder.encode(pcm_data)
            mp3_data += encoder.flush()
            
            with open(mp3_path, "wb") as f:
                f.write(mp3_data)
            logger.info(f"WAV successfully converted to MP3 at: {mp3_path}")
            return True
    except Exception as e:
        logger.error(f"LAME MP3 conversion failed: {e}. Falling back to copying raw audio.")
        # If conversion fails, copy the WAV to the target path as fallback
        try:
            shutil.copy2(wav_path, mp3_path)
            return True
        except Exception:
            return False

def get_next_version(storage_path: str, base_name: str) -> tuple[int, str]:
    """Scans the storage path to increment the version suffix (_01, _02, etc.)."""
    version = 1
    while True:
        version_str = f"{version:02d}"
        test_file = os.path.join(storage_path, f"{base_name}_{version_str}.json")
        if not os.path.exists(test_file):
            return version, version_str
        version += 1

def generate_feedback(score: float, language: str) -> str:
    """Generates localized qualitative pronunciation summary feedback."""
    if language == "ja-JP":
        if score >= 85:
            return "훌륭한 발음입니다! 일본어 고유의 장음과 촉음 리듬을 잘 살려 자연스럽게 낭독하셨습니다. 지속적으로 쉐도잉을 진행해 보세요."
        elif score >= 60:
            return "전반적으로 양호하나 일부 단어에서 발음 흔들림이 관찰됩니다. 장음(ー)이나 촉음(っ)의 길이 조절에 유의하여 추가로 연습하세요."
        else:
            return "조금 더 연습이 필요합니다. 한 글자씩 정확하게 발음하는 것부터 시작해, 원어민의 음성을 반복해서 모방해 보세요."
    elif language == "ko-KR":
        if score >= 85:
            return "매우 훌륭하고 자연스러운 한국어 발음입니다. 어조와 단어 고저의 균형이 잘 잡혀 있습니다."
        elif score >= 60:
            return "일부 자음동화나 받침 발음의 소리가 명확하지 않습니다. 발성 기관을 크게 열고 천천히 읽어 보세요."
        else:
            return "한국어 특유의 격음/경음 및 받침 소리 교정이 필요합니다. 짧은 단어부터 또박또박 낭독해 보세요."
    else:  # en-US
        if score >= 85:
            return "Excellent pronunciation! Your word stressing, intonation, and flow are very natural."
        elif score >= 60:
            return "Good job! Focus slightly more on the highlighted vowel clarity and consonant clusters."
        else:
            return "More practice is recommended. Slow down and focus on clear syllable articulation before speeding up."

# -----------------
# API Key Pydantics
# -----------------

class KeyTestRequestAzure(BaseModel):
    azure_speech_key: str
    azure_speech_region: str

class KeyTestRequestSheet(BaseModel):
    google_sheets_webhook_url: str

class SaveTextRequest(BaseModel):
    file_name: str
    text: str

# -----------------
# Endpoints
# -----------------

@app.post("/api/save-text")
def api_save_text(req: SaveTextRequest):
    """Saves manually edited raw text to a .txt file in the local storage directory."""
    settings = load_settings()
    storage_path = settings.local_storage_path or get_default_storage_path()
    os.makedirs(storage_path, exist_ok=True)
    
    base_name = os.path.splitext(req.file_name)[0]
    base_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip()
    if not base_name:
        base_name = "practice_text"
        
    target_filename = f"{base_name}.txt"
    target_path = os.path.join(storage_path, target_filename)
    
    try:
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(req.text)
        logger.info(f"Edited text successfully saved to: {target_path}")
        
        # Upload .txt to Google Drive if folder ID configured
        if settings.google_drive_folder_id:
            try:
                try:
                    from google_drive import upload_file_to_drive
                except ImportError:
                    from backend.google_drive import upload_file_to_drive
                upload_file_to_drive(
                    file_content=req.text.encode("utf-8"),
                    filename=target_filename,
                    mime_type="text/plain",
                    folder_id=settings.google_drive_folder_id
                )
            except Exception as ex:
                logger.error(f"Failed to auto-upload txt to Google Drive: {ex}")
                
        return {"status": "success", "file_name": target_filename}
    except Exception as e:
        logger.error(f"Failed to save text file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save text file: {str(e)}")


class LoginRequest(BaseModel):
    email: str

@app.post("/api/login")
def api_login(req: LoginRequest):
    """Checks google email login. Wipes credentials from settings.json if invalid."""
    settings = load_settings()
    input_email = req.email.strip().lower()
    correct_email = settings.authorized_email.strip().lower()
    
    if input_email != correct_email:
        logger.warning(f"Unauthorized email login: '{input_email}'. Clearing sensitive credentials.")
        settings.azure_speech_key = ""
        settings.google_vision_ocr_key = ""
        settings.google_sheets_webhook_url = ""
        save_settings(settings)
        return JSONResponse(
            status_code=403,
            content={
                "success": False,
                "message": "등록되지 않은 구글 계정입니다. 보안을 위해 시스템에 저장된 API Key가 즉시 초기화되었습니다!"
            }
        )
    return {"success": True, "message": "인증 성공"}

@app.get("/api/settings", response_model=AppSettings)
def api_get_settings():
    """Retrieves current settings with credentials masked for browser privacy."""
    s = load_settings()
    if s.azure_speech_key:
        s.azure_speech_key = "********"
    if s.google_vision_ocr_key:
        s.google_vision_ocr_key = "********"
    if s.google_sheets_webhook_url:
        s.google_sheets_webhook_url = "********"
    if s.google_drive_folder_id:
        s.google_drive_folder_id = "********"
    return s

@app.post("/api/settings")
def api_save_settings(settings: AppSettings):
    """Saves settings, checking for masked placeholders to avoid overwriting existing credentials."""
    existing = load_settings()
    
    if settings.azure_speech_key == "********":
        settings.azure_speech_key = existing.azure_speech_key
    if settings.google_vision_ocr_key == "********":
        settings.google_vision_ocr_key = existing.google_vision_ocr_key
    if settings.google_sheets_webhook_url == "********":
        settings.google_sheets_webhook_url = existing.google_sheets_webhook_url
    if settings.google_drive_folder_id == "********":
        settings.google_drive_folder_id = existing.google_drive_folder_id
        
    success = save_settings(settings)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save settings.")
    return {"status": "success", "message": "Settings saved successfully."}

@app.post("/api/test-azure-connection")
async def api_test_azure_connection(req: KeyTestRequestAzure):
    """Checks the validity of Azure Speech key and region via light REST query."""
    is_valid = await test_azure_connection(req.azure_speech_key, req.azure_speech_region)
    return {"success": is_valid}

@app.post("/api/test-sheet-connection")
async def api_test_sheet_connection(req: KeyTestRequestSheet):
    """Sends a connection verification payload to the Google Sheets Webhook."""
    is_valid = await test_sheet_connection(req.google_sheets_webhook_url)
    return {"success": is_valid}

@app.post("/api/extract-page")
async def api_extract_page(
    file: UploadFile = File(...),
    page_number: int = Form(...)
):
    """Extracts text from a single page of a PDF and outputs both raw and normalized text."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    # Save uploaded PDF to temp folder
    temp_pdf_path = os.path.join(TEMP_DIR, f"temp_{datetime.now().timestamp()}.pdf")
    try:
        with open(temp_pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_size = os.path.getsize(temp_pdf_path)
        logger.info(f"Received PDF upload '{file.filename}' - size: {file_size} bytes")
            
        reader = PdfReader(temp_pdf_path)
        total_pages = len(reader.pages)
        logger.info(f"PDF parsed successfully. Total pages counted by pypdf: {total_pages}")
        
        if page_number < 1 or page_number > total_pages:
            raise HTTPException(
                status_code=400,
                detail=f"Requested page {page_number} is out of range. PDF has {total_pages} pages."
            )
            
        page = reader.pages[page_number - 1]
        raw_text = page.extract_text() or ""
        normalized_text = clean_text(raw_text)
        
        return {
            "raw_text": raw_text,
            "normalized_text": normalized_text,
            "total_pages": total_pages
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error parsing PDF file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF file: {str(e)}")
    finally:
        # Cleanup temp file
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)

def upload_eval_assets_to_drive(settings, payload, out_json_name, out_mp3_path, out_mp3_name):
    """Background task to upload pronunciation report JSON and recording MP3 to Google Drive."""
    if not settings.google_drive_folder_id:
        return
    try:
        import json
        try:
            from google_drive import upload_file_to_drive
        except ImportError:
            from backend.google_drive import upload_file_to_drive
        
        # 1. Upload JSON report
        json_data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        upload_file_to_drive(
            file_content=json_data,
            filename=out_json_name,
            mime_type="application/json",
            folder_id=settings.google_drive_folder_id
        )
        
        # 2. Upload MP3 audio file
        if os.path.exists(out_mp3_path):
            with open(out_mp3_path, "rb") as f:
                mp3_data = f.read()
            upload_file_to_drive(
                file_content=mp3_data,
                filename=out_mp3_name,
                mime_type="audio/mpeg",
                folder_id=settings.google_drive_folder_id
            )
    except Exception as e:
        logger.error(f"Background Google Drive asset upload failed: {e}")

@app.post("/api/evaluate")
async def api_evaluate(
    background_tasks: BackgroundTasks,
    file_name: str = Form(...),
    page_number: int = Form(...),
    raw_text: str = Form(...),
    normalized_text: str = Form(...),
    audio: UploadFile = File(...)
):
    """
    Core pipeline:
    1. Normalizes reference text if not already done.
    2. Runs continuous Azure speech assessment (or fallback mock assessment).
    3. Version increments local filenames (json/mp3 pairs).
    4. Encodes WAV audio to MP3.
    5. Saves json/mp3 results locally.
    6. Dispatches background worker task to update Google Sheets.
    """
    settings = load_settings()
    storage_path = settings.local_storage_path or get_default_storage_path()
    os.makedirs(storage_path, exist_ok=True)
    
    # Secure raw audio WAV payload to temp directory
    temp_wav_path = os.path.join(TEMP_DIR, f"eval_{datetime.now().timestamp()}.wav")
    try:
        with open(temp_wav_path, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
            
        # Parse language & configure
        lang = settings.learning_language or "ja-JP"
        
        # Check Azure settings
        has_azure = bool(settings.azure_speech_key and settings.azure_speech_region)
        
        # Evaluate Pronunciation
        if has_azure:
            logger.info("Azure Speech API Keys found. Running real pronunciation assessment.")
            try:
                eval_result = run_pronunciation_assessment(
                    subscription_key=settings.azure_speech_key,
                    region=settings.azure_speech_region,
                    language_code=lang,
                    reference_text=normalized_text,
                    audio_file_path=temp_wav_path
                )
            except Exception as ex:
                logger.error(f"Azure Pronunciation Assessment crashed: {ex}. Falling back to Simulator.")
                eval_result = run_mock_assessment(normalized_text)
        else:
            logger.warn("Azure Speech API Keys missing. Running in simulator mode.")
            eval_result = run_mock_assessment(normalized_text)
            
        # Calculate clean filename base: e.g. "Japanese_Lesson_p1"
        base_filename = os.path.splitext(file_name)[0]
        # Clean special chars from filename
        base_filename = "".join(c for c in base_filename if c.isalnum() or c in ("-", "_")).strip()
        base_name_with_page = f"{base_filename}_p{page_number}"
        
        # Get next version number
        version_int, version_str = get_next_version(storage_path, base_name_with_page)
        
        # Create output filenames
        out_json_name = f"{base_name_with_page}_{version_str}.json"
        out_mp3_name = f"{base_name_with_page}_{version_str}.mp3"
        
        out_json_path = os.path.join(storage_path, out_json_name)
        out_mp3_path = os.path.join(storage_path, out_mp3_name)
        
        # Convert WAV upload to MP3
        convert_wav_to_mp3(temp_wav_path, out_mp3_path)
        
        # Generate summary feedback & timestamps
        created_at_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        overall_score = eval_result.get("overall_score", 0.0)
        feedback = generate_feedback(overall_score, lang)
        
        # Compile complete log payload
        payload = {
            "file_name": file_name,
            "version": version_int,
            "overall_score": overall_score,
            "accuracy_score": eval_result.get("accuracy_score", 0.0),
            "fluency_score": eval_result.get("fluency_score", 0.0),
            "completeness_score": eval_result.get("completeness_score", 100.0),
            "created_at": created_at_str,
            "raw_text": raw_text,
            "normalized_text": normalized_text,
            "summary_feedback": feedback,
            "language": lang,
            "words": eval_result.get("words", []),
            "recognized_text": eval_result.get("recognized_text", ""),
            "audio_filename": out_mp3_name
        }
        
        # Write JSON Log
        with open(out_json_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            
        # Queue Background Task for Google Drive uploads
        if settings.google_drive_folder_id:
            logger.info("Scheduling Google Drive assets upload background task.")
            background_tasks.add_task(
                upload_eval_assets_to_drive,
                settings,
                payload,
                out_json_name,
                out_mp3_path,
                out_mp3_name
            )
            
        # 5. Queue Background Webhook Task for Google Sheets Row Insertion
        if settings.google_sheets_webhook_url:
            logger.info("Scheduling Google Sheets Append background task.")
            background_tasks.add_task(
                append_evaluation_row,
                settings.google_sheets_webhook_url,
                file_name,
                version_int,
                overall_score,
                created_at_str,
                feedback
            )
            
        return payload
        
    except Exception as e:
        logger.error(f"Error executing evaluation API pipeline: {e}")
        raise HTTPException(status_code=500, detail=f"Pronunciation assessment pipeline error: {str(e)}")
        
    finally:
        # Cleanup temporary WAV file
        if os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)

@app.get("/api/history")
def api_get_history():
    """Lists all saved evaluation JSON files ordered by creation date descending."""
    settings = load_settings()
    storage_path = settings.local_storage_path or get_default_storage_path()
    
    if not os.path.exists(storage_path):
        return []
        
    history = []
    for file in os.listdir(storage_path):
        if file.lower().endswith(".json") and file != "settings.json":
            json_path = os.path.join(storage_path, file)
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                # Verify basic schema
                history.append({
                    "id": file,
                    "file_name": data.get("file_name", file),
                    "version": data.get("version", 1),
                    "overall_score": data.get("overall_score", 0.0),
                    "created_at": data.get("created_at", ""),
                    "summary_feedback": data.get("summary_feedback", ""),
                    "language": data.get("language", "ja-JP"),
                    "audio_filename": data.get("audio_filename", "")
                })
            except Exception as e:
                logger.error(f"Failed to read historical log file {file}: {e}")
                
    # Sort by created_at descending
    history.sort(key=lambda x: x["created_at"], reverse=True)
    return history

@app.get("/api/history/{filename}")
def api_get_history_detail(filename: str):
    """Retrieves full JSON details of a specific historical evaluation log."""
    settings = load_settings()
    storage_path = settings.local_storage_path or get_default_storage_path()
    file_path = os.path.join(storage_path, filename)
    
    if not os.path.exists(file_path) or not filename.lower().endswith(".json"):
        raise HTTPException(status_code=404, detail="Historical log file not found.")
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

@app.get("/api/history/audio/{filename}")
def api_get_history_audio(filename: str):
    """Streams the saved evaluation MP3 file from local storage."""
    settings = load_settings()
    storage_path = settings.local_storage_path or get_default_storage_path()
    file_path = os.path.join(storage_path, filename)
    
    # Strip path injections
    clean_filename = os.path.basename(filename)
    file_path = os.path.join(storage_path, clean_filename)
    
    if not os.path.exists(file_path) or not (clean_filename.lower().endswith(".mp3") or clean_filename.lower().endswith(".wav")):
        raise HTTPException(status_code=404, detail="Audio file not found.")
        
    # Standard MP3 or WAV media response
    media_type = "audio/mpeg" if clean_filename.lower().endswith(".mp3") else "audio/wav"
    return FileResponse(file_path, media_type=media_type, filename=clean_filename)

# Mount frontend static files at root endpoint
from fastapi.staticfiles import StaticFiles
frontend_path = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend"))
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    logger.error(f"Frontend directory not found at: {frontend_path}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True)
