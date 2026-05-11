"""
firewall/document_extractor.py
==============================
Internal helper: extract plain text from uploaded documents.

Supported formats:
  .pdf   → pdfplumber
  .docx  → python-docx
  .txt   → direct decode
  images → pytesseract OCR (.png, .jpg, .jpeg, .bmp, .tiff, .webp)

Usage:
    text, error = extract_text(uploaded_file)
    if error:
        # handle extraction failure
    # pass `text` into the normal AI pipeline
"""

import io


def extract_text(uploaded_file) -> tuple[str, str | None]:
    """
    Extract text from a Django InMemoryUploadedFile / TemporaryUploadedFile.

    Returns:
        (text, None)        on success
        ("",  error_msg)    on failure
    """
    name = uploaded_file.name.lower()
    raw = uploaded_file.read()

    # ── PDF ────────────────────────────────────────────────────────────────
    if name.endswith(".pdf"):
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                pages = [p.extract_text() or "" for p in pdf.pages]
            text = "\n".join(pages).strip()
            if not text:
                return "", "PDF appears to contain no extractable text (may be scanned image)."
            return text, None
        except ImportError:
            return "", "pdfplumber is not installed. Run: pip install pdfplumber"
        except Exception as exc:
            return "", f"PDF extraction failed: {exc}"

    # ── DOCX ───────────────────────────────────────────────────────────────
    if name.endswith(".docx"):
        try:
            from docx import Document
            doc = Document(io.BytesIO(raw))
            text = "\n".join(p.text for p in doc.paragraphs).strip()
            if not text:
                return "", "DOCX file appears to be empty."
            return text, None
        except ImportError:
            return "", "python-docx is not installed. Run: pip install python-docx"
        except Exception as exc:
            return "", f"DOCX extraction failed: {exc}"

    # ── TXT ────────────────────────────────────────────────────────────────
    if name.endswith(".txt"):
        try:
            text = raw.decode("utf-8", errors="replace").strip()
            if not text:
                return "", "Text file is empty."
            return text, None
        except Exception as exc:
            return "", f"Text file read failed: {exc}"

    # ── Images (OCR) ───────────────────────────────────────────────────────
    _IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp")
    if any(name.endswith(ext) for ext in _IMAGE_EXTS):
        try:
            import pytesseract
            from PIL import Image
            img = Image.open(io.BytesIO(raw))
            text = pytesseract.image_to_string(img).strip()
            if not text:
                return "", "No text could be extracted from the image."
            return text, None
        except ImportError:
            return "", "pytesseract or Pillow is not installed. Run: pip install pytesseract pillow"
        except Exception as exc:
            return "", f"Image OCR failed: {exc}"

    return "", f"Unsupported file type: '{uploaded_file.name}'. Supported: PDF, DOCX, TXT, PNG, JPG, BMP, TIFF."
