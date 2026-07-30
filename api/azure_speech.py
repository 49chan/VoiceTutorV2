import time
import json
import random
import logging
import httpx
# Lazy loaded module to avoid serverless startup crashes due to missing C++ shared libraries
speechsdk = None

logger = logging.getLogger(__name__)

async def test_azure_connection(subscription_key: str, region: str) -> bool:
    """
    Validates Azure Speech credentials using a lightweight REST call to the
    Azure Cognitive Services Token Service. Extremely fast and hardware-independent.
    """
    if not subscription_key or not region:
        return False
    
    # Azure Issue Token REST endpoint
    url = f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    headers = {
        "Ocp-Apim-Subscription-Key": subscription_key
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, timeout=5.0)
            # If 200 OK, the key and region are valid and a token was issued
            return response.status_code == 200
    except Exception as e:
        logger.error(f"Azure Speech REST validation failed: {e}")
        return False

def run_pronunciation_assessment(
    subscription_key: str,
    region: str,
    language_code: str,
    reference_text: str,
    audio_file_path: str
) -> dict:
    """
    Performs continuous pronunciation assessment on a saved WAV audio file.
    Aggregates results from multiple recognized chunks.
    """
    global speechsdk
    if speechsdk is None:
        import azure.cognitiveservices.speech as speechsdk
        
    # Initialize Azure Speech Config
    speech_config = speechsdk.SpeechConfig(subscription=subscription_key, region=region)
    speech_config.output_format = speechsdk.OutputFormat.Detailed
    
    # Read audio from local WAV file
    audio_config = speechsdk.audio.AudioConfig(filename=audio_file_path)
    
    # Initialize speech recognizer
    speech_recognizer = speechsdk.SpeechRecognizer(
        speech_config=speech_config,
        language=language_code,
        audio_config=audio_config
    )
    
    try:
        # Configure Pronunciation Assessment
        pron_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Word,
            enable_miscue=False  # Typically False in continuous mode
        )
        pron_config.apply_to(speech_recognizer)
        
        # Thread-safe structures for event collection
        all_words = []
        recognized_texts = []
        done = False
        error_occurred = False
        error_message = ""
        
        # Callbacks
        def recognized_cb(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                json_str = evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
                if json_str:
                    try:
                        res_json = json.loads(json_str)
                        nbest = res_json.get("NBest", [])
                        if nbest:
                            best = nbest[0]
                            words = best.get("Words", [])
                            pron_assessment = best.get("PronunciationAssessment", {})
                            
                            # Extract individual words
                            for w in words:
                                word_text = w.get("Word")
                                offset = w.get("Offset")
                                duration = w.get("Duration")
                                
                                pa = w.get("PronunciationAssessment", {})
                                accuracy_score = pa.get("AccuracyScore", 100.0)
                                error_type = pa.get("ErrorType", "None")
                                
                                all_words.append({
                                    "Word": word_text,
                                    "Offset": offset,       # Ticks (100 nanoseconds)
                                    "Duration": duration,   # Ticks (100 nanoseconds)
                                    "AccuracyScore": accuracy_score,
                                    "ErrorType": error_type
                                })
                            recognized_texts.append(best.get("Display", ""))
                    except Exception as ex:
                        logger.error(f"Error parsing recognized JSON chunk: {ex}")
                        
        def session_stopped_cb(evt):
            nonlocal done
            done = True
            
        def canceled_cb(evt):
            nonlocal done, error_occurred, error_message
            done = True
            if evt.reason == speechsdk.CancellationReason.Error:
                error_occurred = True
                error_message = evt.error_details
                logger.error(f"Azure Speech continuous recognition error: {evt.error_details}")
                
        # Bind events
        speech_recognizer.recognized.connect(recognized_cb)
        speech_recognizer.session_stopped.connect(session_stopped_cb)
        speech_recognizer.canceled.connect(canceled_cb)
        
        # Execute continuous recognition
        speech_recognizer.start_continuous_recognition()
        
        # Block until completion (audio file EOF or timeout)
        max_timeout = 240.0  # 4 minutes max for a page
        start_time = time.time()
        while not done:
            time.sleep(0.2)
            if time.time() - start_time > max_timeout:
                speech_recognizer.stop_continuous_recognition()
                raise TimeoutError("Azure continuous pronunciation assessment timed out.")
                
        speech_recognizer.stop_continuous_recognition()
        
        if error_occurred:
            raise Exception(f"Azure Speech Recognition failed: {error_message}")
    finally:
        del speech_recognizer
        del audio_config
        
    if not all_words:
        return {
            "overall_score": 0.0,
            "accuracy_score": 0.0,
            "fluency_score": 0.0,
            "completeness_score": 0.0,
            "words": [],
            "recognized_text": ""
        }
        
    # Aggregate stats
    avg_accuracy = sum(w["AccuracyScore"] for w in all_words) / len(all_words)
    overall_score = avg_accuracy  # Fallback overall score as average word accuracy
    
    return {
        "overall_score": round(overall_score),
        "accuracy_score": round(avg_accuracy),
        "fluency_score": round(avg_accuracy),
        "completeness_score": 100.0,
        "words": all_words,
        "recognized_text": " ".join(recognized_texts)
    }

def run_mock_assessment(reference_text: str) -> dict:
    """
    Generates simulated word alignments and scores to test the UI and
    evaluation flow without requiring active Azure Speech configurations.
    """
    # Simple word tokenizer (supporting East Asian and space-separated languages)
    # Match words or individual Japanese/Korean/Chinese characters
    words = []
    # Tokenize by finding words (en) or characters (ja/ko)
    # We will split by whitespace, and for each token, if it's CJK we split it, otherwise keep it as a word.
    tokens = reference_text.split()
    for token in tokens:
        # Clean basic punctuation
        clean_token = token.strip(".,!?、。()（）[]［］")
        if not clean_token:
            continue
            
        # If English/Roman text, keep as a word
        if clean_token.isascii():
            words.append(clean_token)
        else:
            # For CJK, let's treat word boundaries by characters, or just keep tokens.
            # Keeping tokens is safer to match user reading, but for Japanese,
            # characters or short clauses are common. Let's keep words separated by spaces.
            words.append(clean_token)
            
    if not words:
        return {
            "overall_score": 0.0,
            "accuracy_score": 0.0,
            "fluency_score": 0.0,
            "completeness_score": 0.0,
            "words": [],
            "recognized_text": ""
        }
        
    simulated_words = []
    current_offset_ticks = 2000000  # Start at 200ms
    
    for word in words:
        # Random score profile: 50% high (85-100), 40% mid (60-84), 10% low (40-59)
        rand = random.random()
        if rand < 0.5:
            score = random.randint(85, 100)
        elif rand < 0.9:
            score = random.randint(60, 84)
        else:
            score = random.randint(40, 59)
            
        # Duration: English words about 300-700ms, CJK characters about 200-500ms
        duration_ms = random.randint(300, 700) if word.isascii() else random.randint(200, 500)
        duration_ticks = duration_ms * 10000  # 1ms = 10,000 ticks
        
        simulated_words.append({
            "Word": word,
            "Offset": current_offset_ticks,
            "Duration": duration_ticks,
            "AccuracyScore": score,
            "ErrorType": "None" if score >= 60 else "Mispronunciation"
        })
        
        # Advance offset with a small gap (50ms - 150ms)
        gap_ticks = random.randint(50, 150) * 10000
        current_offset_ticks += duration_ticks + gap_ticks
        
    avg_score = sum(w["AccuracyScore"] for w in simulated_words) / len(simulated_words)
    
    return {
        "overall_score": round(avg_score),
        "accuracy_score": round(avg_score),
        "fluency_score": round(avg_score - 2.0),
        "completeness_score": 100.0,
        "words": simulated_words,
        "recognized_text": reference_text
    }
