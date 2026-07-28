import os
import sys

# Ensure backend directory is in path for imports
sys.path.append(os.path.dirname(__file__))

from text_normalizer import clean_text
from security import encrypt_value, decrypt_value
from config import load_settings, save_settings, AppSettings, get_default_storage_path
from azure_speech import run_mock_assessment

def test_text_normalization():
    print("[TEST] Running Text Normalization tests...")
    
    test_cases = [
        ("일본어 (학습) 연습~ 페이지", "일본어 연습 페이지"),
        ("English [Lesson 1] practice~ text", "English practice text"),
        ("한국어 {연습용} 문장~!!", "한국어 문장!!"),
        ("일본어 【고급】 회화（발음） 낭독", "일본어 고급 회화 낭독"),
        ("물결 기호 ~와 특수문자*#@$%^&_+=\\|<>/`들은 어떻게 될까?", "물결 기호 와 특수문자들은 어떻게 될까?"),
        ("  여러   공백들이      있어요.  ", "여러 공백들이 있어요.")
    ]
    
    for raw, expected in test_cases:
        cleaned = clean_text(raw)
        assert cleaned == expected, f"Normalization fail! Raw: '{raw}', Cleaned: '{cleaned}', Expected: '{expected}'"
        
    print("[SUCCESS] Text Normalization tests passed!")

def test_security_encryption():
    print("[TEST] Running Security Encryption/Decryption tests...")
    
    test_values = [
        "azure_speech_key_12345",
        "https://sheets.googleapis.com/v1/webhooks/abcde",
        "google_ocr_secret_key_xyz",
        ""
    ]
    
    for val in test_values:
        encrypted = encrypt_value(val)
        decrypted = decrypt_value(encrypted)
        assert decrypted == val, f"Decryption mismatch! Original: '{val}', Encrypted: '{encrypted}', Decrypted: '{decrypted}'"
        
    print("[SUCCESS] Security Encryption/Decryption tests passed!")

def test_config_operations():
    print("[TEST] Running Configuration operations tests...")
    
    # Save original env vars
    orig_env = {
        "AZURE_SPEECH_KEY": os.environ.get("AZURE_SPEECH_KEY"),
        "AZURE_SPEECH_REGION": os.environ.get("AZURE_SPEECH_REGION"),
        "GOOGLE_VISION_OCR_KEY": os.environ.get("GOOGLE_VISION_OCR_KEY"),
        "GOOGLE_SHEETS_WEBHOOK_URL": os.environ.get("GOOGLE_SHEETS_WEBHOOK_URL")
    }
    
    # Set mock env vars for testing load behavior
    os.environ["AZURE_SPEECH_KEY"] = "test_azure_key"
    os.environ["AZURE_SPEECH_REGION"] = "eastus"
    os.environ["GOOGLE_VISION_OCR_KEY"] = "test_ocr_key"
    os.environ["GOOGLE_SHEETS_WEBHOOK_URL"] = "https://webhook.google.com/test"
    
    # Reset cache to force reload from mocked env
    import config
    config._cached_settings = None
    
    try:
        # Save a test setting
        test_storage = os.path.join(get_default_storage_path(), "test_folder")
        settings = AppSettings(
            azure_speech_key="test_azure_key",
            azure_speech_region="eastus",
            google_vision_ocr_key="test_ocr_key",
            google_sheets_webhook_url="https://webhook.google.com/test",
            learning_language="ja-JP",
            local_storage_path=test_storage
        )
        
        save_success = save_settings(settings)
        assert save_success, "Failed to save settings."
        
        loaded = load_settings()
        assert loaded.azure_speech_key == "test_azure_key", "Azure Key mismatch"
        assert loaded.azure_speech_region == "eastus", "Azure Region mismatch"
        assert loaded.google_vision_ocr_key == "test_ocr_key", "Google OCR Key mismatch"
        assert loaded.google_sheets_webhook_url == "https://webhook.google.com/test", "Webhook URL mismatch"
        assert loaded.learning_language == "ja-JP", "Language mismatch"
        assert os.path.abspath(loaded.local_storage_path) == os.path.abspath(test_storage), f"Storage path mismatch: Loaded={loaded.local_storage_path}, Expected={test_storage}"
        assert loaded.has_azure_speech is True, "has_azure_speech flag mismatch"
        assert loaded.has_google_sheets is True, "has_google_sheets flag mismatch"
        
    finally:
        # Restore original env vars
        for k, v in orig_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        # Reset cache again
        config._cached_settings = None
        
        # Cleanup settings test file
        settings_file = os.path.join(os.path.dirname(__file__), "settings.json")
        if os.path.exists(settings_file):
            os.remove(settings_file)
            
    print("[SUCCESS] Configuration operations tests passed!")

def test_mock_pronunciation_assessment():
    print("[TEST] Running Mock Pronunciation Assessment tests...")
    
    reference_text = "일본어 발음 연습을 진행합시다"
    result = run_mock_assessment(reference_text)
    
    assert "overall_score" in result, "overall_score missing"
    assert "words" in result, "words missing"
    assert len(result["words"]) > 0, "No words generated in mock result"
    
    # Verify word format
    first_word = result["words"][0]
    assert "Word" in first_word, "Word text missing"
    assert "Offset" in first_word, "Word offset missing"
    assert "Duration" in first_word, "Word duration missing"
    assert "AccuracyScore" in first_word, "Word accuracy score missing"
    assert "ErrorType" in first_word, "Word error type missing"
    
    print("[SUCCESS] Mock Pronunciation Assessment tests passed!")

if __name__ == "__main__":
    print("=== STARTING BACKEND PIPELINE UNIT TESTS ===")
    try:
        test_text_normalization()
        test_security_encryption()
        test_config_operations()
        test_mock_pronunciation_assessment()
        print("=== ALL BACKEND PIPELINE UNIT TESTS PASSED SUCCESSFULLY! ===")
    except AssertionError as ae:
        print(f"[FAIL] Unit test assertion error: {ae}")
        sys.exit(1)
    except Exception as e:
        print(f"[FAIL] Unit test exception: {e}")
        sys.exit(1)
