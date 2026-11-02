import os
import sys
import uuid
import subprocess
import shutil

try:
    import pymupdf as fitz
except ImportError:
    import fitz

try:
    from pptx import Presentation
except ImportError:
    Presentation = None

def convert_pptx_with_powerpoint_com(pptx_abs_path, pdf_abs_path):
    ps_cmd = f'''
    $ErrorActionPreference = "Stop"
    try {{
        $ppt = New-Object -ComObject PowerPoint.Application
        $pres = $ppt.Presentations.Open("{pptx_abs_path}", [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
        $pres.SaveAs("{pdf_abs_path}", 32)
        $pres.Close()
        $ppt.Quit()
        exit 0
    }} catch {{
        if ($ppt) {{ try {{ $ppt.Quit() }} catch {{}} }}
        exit 1
    }}
    '''
    try:
        res = subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
                             capture_output=True, text=True, timeout=20)
        return res.returncode == 0 and os.path.exists(pdf_abs_path)
    except Exception as e:
        print(f"[PPTConverter] PowerPoint COM error: {e}")
        return False

def extract_pptx_content(pptx_path):
    if Presentation is None:
        return []
    prs = Presentation(pptx_path)
    slides = []
    total = len(prs.slides)
    for i, slide in enumerate(prs.slides):
        title = ""
        subtitle = ""
        points = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                txt = shape.text.strip()
                if not txt:
                    continue
                if not title and len(txt) < 80:
                    title = txt
                elif not subtitle and len(txt) < 120 and len(points) == 0:
                    subtitle = txt
                else:
                    for para in shape.text_frame.paragraphs:
                        pt = para.text.strip()
                        if pt and pt not in [title, subtitle] and pt not in points:
                            points.append(pt)
        slides.append({
            "id": i + 1,
            "title": title or f"Slide {i + 1}",
            "subtitle": subtitle or "",
            "badge": "Custom Slide",
            "content_type": "pptx_text",
            "points": points,
            "meta": f"Slide {i + 1} of {total}"
        })
    return slides

def render_pdf_to_images(pdf_path, out_dir, web_prefix):
    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    slides = []
    total = len(doc)
    for i, page in enumerate(doc):
        # 160 DPI delivers high quality for presentations
        pix = page.get_pixmap(dpi=160)
        fname = f"slide_{i + 1}.png"
        fpath = os.path.join(out_dir, fname)
        pix.save(fpath)
        slides.append({
            "id": i + 1,
            "title": f"Slide {i + 1}",
            "subtitle": "",
            "badge": "Uploaded Slide",
            "content_type": "image",
            "image_url": f"{web_prefix}/{fname}",
            "meta": f"Slide {i + 1} of {total}"
        })
    doc.close()
    return slides

def process_uploaded_presentation(file_obj, upload_folder, web_base_url="/static/uploads/slides"):
    """
    Takes an uploaded file (FileStorage), saves it, and converts it to slide definitions.
    Supports: .pdf, .pptx, .ppt, .png, .jpg, .jpeg
    Returns: (slides, deck_title, error_message)
    """
    import time
    filename = file_obj.filename or "presentation"
    ext = os.path.splitext(filename)[1].lower()
    
    if ext not in [".pdf", ".pptx", ".ppt", ".png", ".jpg", ".jpeg"]:
        return None, None, f"Unsupported file type: {ext}. Please upload a PDF, PowerPoint (.pptx / .ppt), or Image file."

    deck_id = f"deck_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    deck_dir = os.path.join(upload_folder, deck_id)
    os.makedirs(deck_dir, exist_ok=True)
    
    saved_path = os.path.join(deck_dir, f"source{ext}")
    file_obj.save(saved_path)
    
    web_prefix = f"{web_base_url}/{deck_id}"
    deck_title = os.path.splitext(filename)[0]

    try:
        # 1. PDF Document
        if ext == ".pdf":
            slides = render_pdf_to_images(saved_path, deck_dir, web_prefix)
            if not slides:
                return None, None, "No readable pages found in this PDF file."
            return slides, deck_title, None

        # 2. PowerPoint Presentation (.pptx or .ppt)
        elif ext in [".pptx", ".ppt"]:
            # Primary strategy: Convert to PDF using PowerPoint COM (preserves exact graphics and layouts)
            pdf_path = os.path.join(deck_dir, "converted.pdf")
            com_success = convert_pptx_with_powerpoint_com(os.path.abspath(saved_path), os.path.abspath(pdf_path))
            
            if com_success and os.path.exists(pdf_path):
                slides = render_pdf_to_images(pdf_path, deck_dir, web_prefix)
                if slides:
                    return slides, deck_title, None

            # Fallback strategy: Extract text & structure with python-pptx
            slides = extract_pptx_content(saved_path)
            if slides:
                return slides, deck_title, None
            return None, None, "Could not extract slides from PowerPoint presentation."

        # 3. Direct Image (.png, .jpg, .jpeg)
        elif ext in [".png", ".jpg", ".jpeg"]:
            out_img = os.path.join(deck_dir, f"slide_1{ext}")
            shutil.copy2(saved_path, out_img)
            slides = [{
                "id": 1,
                "title": deck_title,
                "subtitle": "",
                "badge": "Image Slide",
                "content_type": "image",
                "image_url": f"{web_prefix}/slide_1{ext}",
                "meta": "Slide 1 of 1"
            }]
            return slides, deck_title, None

    except Exception as e:
        return None, None, f"Failed to process presentation: {str(e)}"
