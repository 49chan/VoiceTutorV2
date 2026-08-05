import re

def remove_spaces_between_cjk(text: str) -> str:
    """
    Collapses spaces that appear between CJK characters (Hiragana, Katakana, Kanji).
    This fixes issues with PDF text extractors inserting spaces between every character.
    """
    if not text:
        return ""
    
    # CJK character range pattern (Hiragana, Katakana, CJK Unified Ideographs / Kanji, Fullwidth Forms, Hangul Syllables/Jamo)
    cjk_char_class = r'[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7a3\u3130-\u318f\u1100-\u11ff]'
    pattern = re.compile(f'({cjk_char_class})\\s+({cjk_char_class})')
    
    prev_text = ""
    while text != prev_text:
        prev_text = text
        text = pattern.sub(r'\1\2', text)
    return text

def clean_text(text: str) -> str:
    """
    Cleans raw text by removing unpronounced special characters, parentheses and their contents,
    wave lines, and extra whitespace to prepare it for pronunciation assessment.
    """
    if not text:
        return ""
    
    # Collapses spaces between CJK characters first
    text = remove_spaces_between_cjk(text)
    
    # 1. Remove text inside parentheses, square brackets, and curly braces (metadata/non-spoken)
    text = re.sub(r'\([^)]*\)', '', text)          # (standard parentheses)
    text = re.sub(r'\[[^\]]*\]', '', text)        # [square brackets]
    text = re.sub(r'\{[^}]*\}', '', text)          # {curly braces}
    text = re.sub(r'（[^）]*）', '', text)        # （Japanese full-width parens）
    text = re.sub(r'［[^］]*］', '', text)        # ［Japanese full-width brackets］
    text = re.sub(r'｛[^｝]*｝', '', text)        # ｛Japanese full-width curly braces｝
    
    # Strip black brackets symbols but keep their contents (emphasis markers)
    text = re.sub(r'[【】]', '', text)


    # 2. Remove wave lines (frequent in range "1~2" or Japanese speech elongation "～")
    text = re.sub(r'[~～]', '', text)

    # 3. Remove non-pronounced decorative or structural special characters
    # Keep alphanumeric characters, East Asian glyphs, spaces, and basic punctuation.
    text = re.sub(r'[*#@$%^&_+=\\|<>/`\-—_]', '', text)

    # 4. Collapse multiple spaces and trim
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text
