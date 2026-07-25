import re

def clean_text(text: str) -> str:
    """
    Cleans raw text by removing unpronounced special characters, parentheses and their contents,
    wave lines, and extra whitespace to prepare it for pronunciation assessment.
    """
    if not text:
        return ""
    
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
