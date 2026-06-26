import os
import uuid
import queue
import threading
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageEnhance, ImageFont
from app.models import get_db
from app.utils.styles import STYLE_PRESETS, PRESETS_BY_ID

# Decoupled Upload/Images paths relative to the package root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "static", "uploads")
IMAGES_FOLDER = os.path.join(BASE_DIR, "static", "images")

# Initialize background task queue
image_queue = queue.Queue()

def update_project_progress(project_id, progress, status='processing', error_message=None):
    with get_db() as conn:
        conn.execute(
            "UPDATE projects SET progress = ?, status = ?, error_message = ? WHERE id = ?",
            (progress, status, error_message, project_id)
        )
        conn.commit()

def process_project_job(project_id):
    try:
        with get_db() as conn:
            project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
            
        if not project:
            return
        project = dict(project)
            
        # Update status to processing (5%)
        update_project_progress(project_id, 5, 'processing')
        
        # Callback to update database progress in real-time
        def progress_cb(percent):
            update_project_progress(project_id, percent, 'processing')
            
        path1 = os.path.join(UPLOAD_FOLDER, project['original_img_1'])
        path2 = os.path.join(UPLOAD_FOLDER, project['original_img_2'])
        style_id = project.get('style_id', 'cinematic')
        if not style_id:
            style_map = {p['name']: p['id'] for p in STYLE_PRESETS}
            style_id = style_map.get(project['style'], 'cinematic')

        custom_bg_path = None
        if project.get('custom_bg'):
            custom_bg_path = os.path.join(UPLOAD_FOLDER, project['custom_bg'])

        # Maps style_id to preset background images
        STYLE_DEFAULT_BGS = {
            'cinematic': 'sunset_beach',
            'hollywood_romance': 'paris',
            'netflix_drama': 'cyberpunk',
            'action_movie': 'cyberpunk',
            'paris_love_film': 'paris',
            'sunset_beach_film': 'sunset_beach',
            'golden_hour_romance': 'sunset_beach',
            'rainy_movie_scene': 'paris',
            
            'fairytale': 'starry_night',
            'gothic': 'starry_night',
            'enchanted_kingdom': 'taj_mahal',
            'fairy_forest': 'autumn_forest',
            'angelic_romance': 'starry_night',
            'moonlight_magic': 'starry_night',
            'celestial_lovers': 'starry_night',
            'dragon_fantasy': 'cyberpunk',
            'elven_kingdom': 'autumn_forest',
            'magical_castle': 'starry_night',
            
            'wedding': 'sunset_beach',
            'royal_wedding': 'taj_mahal',
            'luxury_bridal': 'paris',
            'destination_wedding': 'sunset_beach',
            'beach_wedding': 'sunset_beach',
            'christian_wedding': 'paris',
            'garden_wedding': 'autumn_forest',
            'fairytale_wedding': 'starry_night',
            
            'vintage': 'autumn_forest',
            'vintage_polaroid': 'sunset_beach',
            'film_noir': 'paris',
            'old_hollywood': 'paris',
            'retro_neon_80s': 'cyberpunk',
            
            'anime': 'paris',
            'ghibli_inspired': 'autumn_forest',
            'shonen_anime': 'cyberpunk',
            'kawaii_romance': 'paris',
            'anime_poster': 'sunset_beach',
            'manga_art': 'paris',
            'sakura_romance': 'autumn_forest',
            'fantasy_anime': 'starry_night'
        }

        # Maps category to default background images
        CATEGORY_DEFAULT_BGS = {
            'Cinematic': 'sunset_beach',
            'Fantasy': 'starry_night',
            'Wedding': 'taj_mahal',
            'Vintage': 'paris',
            'Anime': 'autumn_forest',
            'Luxury': 'paris',
            'Travel': 'paris',
            'Seasonal': 'autumn_forest',
            'Cultural': 'taj_mahal',
            'Artistic': 'paris'
        }

        # Resolve Preset Background if custom background is not uploaded
        preset_bg_path = None
        if not custom_bg_path:
            bg_id = project.get('preset_bg')
            if not bg_id:
                # Use default background mapped to style
                style_preset = PRESETS_BY_ID.get(style_id, PRESETS_BY_ID['cinematic'])
                category = style_preset.get('category', 'Cinematic')
                bg_id = STYLE_DEFAULT_BGS.get(style_id, CATEGORY_DEFAULT_BGS.get(category, 'sunset_beach'))
                
            if bg_id.startswith('custom_library_'):
                bg_filename = bg_id.replace('custom_library_', '')
                preset_full_path = os.path.join(UPLOAD_FOLDER, bg_filename)
            else:
                preset_filename = f"bg_{bg_id}.jpg"
                preset_full_path = os.path.join(IMAGES_FOLDER, "preset_bgs", preset_filename)
                
            if os.path.exists(preset_full_path):
                preset_bg_path = preset_full_path
                
        bg_path_to_use = custom_bg_path if custom_bg_path else preset_bg_path
            
        before_file, after_file = process_couple_edit(
            img1_path=path1,
            img2_path=path2,
            style_id=style_id,
            skin_retouch=project['skin_retouch'],
            bg_replace=project['bg_replace'],
            light_match=project['light_match'],
            aspect_ratio=project['aspect_ratio'],
            custom_text=project['custom_text'],
            brightness=project['brightness'],
            contrast=project['contrast'],
            custom_bg_path=bg_path_to_use,
            font_style=project['font_style'],
            text_position=project['text_position'],
            frame_style=project['frame_style'],
            progress_callback=progress_cb
        )
        
        # Mark project job completed
        with get_db() as conn:
            conn.execute(
                "UPDATE projects SET generated_img = ?, before_img = ?, progress = 100, status = 'completed' WHERE id = ?",
                (after_file, before_file, project_id)
            )
            # Log completed generation notification
            p = conn.execute("SELECT user_id, name FROM projects WHERE id = ?", (project_id,)).fetchone()
            if p:
                conn.execute(
                    "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
                    (p['user_id'], "Generation Completed", f"Your couple portrait '{p['name']}' has been successfully generated!", "generation")
                )
            conn.commit()
            
    except Exception as e:
        print(f"Failed to process project {project_id}: {e}", file=sys.stderr)
        update_project_progress(project_id, 0, 'failed', str(e))
        # Log failure notification
        try:
            with get_db() as conn:
                p = conn.execute("SELECT user_id, name FROM projects WHERE id = ?", (project_id,)).fetchone()
                if p:
                    conn.execute(
                        "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
                        (p['user_id'], "Generation Failed", f"We couldn't generate '{p['name']}': {str(e)}", "generation")
                    )
                conn.commit()
        except Exception as notif_err:
            print(f"Failed to insert failure notification: {notif_err}", file=sys.stderr)

def generation_worker():
    while True:
        try:
            project_id = image_queue.get()
            if project_id is None:
                break
            process_project_job(project_id)
        except Exception as e:
            print(f"Error in background worker: {e}", file=sys.stderr)
        finally:
            image_queue.task_done()

def recover_pending_jobs():
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM projects WHERE status IN ('queued', 'processing') ORDER BY created_at ASC")
            jobs = cursor.fetchall()
            for job in jobs:
                conn.execute("UPDATE projects SET status = 'queued', progress = 0 WHERE id = ?", (job[0],))
                image_queue.put(job[0])
            conn.commit()
            if jobs:
                print(f"Recovered {len(jobs)} pending image jobs from database queue.", file=sys.stderr)
    except Exception as e:
        print(f"Error recovering pending jobs: {e}", file=sys.stderr)

# Start background queue thread automatically on import
worker_thread = threading.Thread(target=generation_worker, daemon=True)
worker_thread.start()

# Helper filters
def add_film_grain(img, intensity=8):
    w, h = img.size
    arr = np.array(img, dtype=np.int16)
    noise = np.random.randint(-intensity, intensity, (h, w, 3), dtype=np.int16)
    arr[:, :, :3] += noise
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def add_vignette(img, color=(0, 0, 0), intensity=0.55):
    w, h = img.size
    vignette = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(vignette)
    cx, cy = w // 2, h // 2
    max_r = int(np.sqrt(cx**2 + cy**2))
    
    for r in range(max_r, 0, -20):
        alpha = int((r / max_r) ** 2 * 255 * intensity)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(color[0], color[1], color[2], alpha))
        
    vignette = vignette.filter(ImageFilter.GaussianBlur(30))
    return Image.alpha_composite(img.convert("RGBA"), vignette).convert("RGB")

def add_light_leak(img, color=(255, 130, 0), intensity=0.25):
    w, h = img.size
    leak = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(leak)
    draw.ellipse([-120, -120, 350, 350], fill=(color[0], color[1], color[2], int(255 * intensity)))
    draw.ellipse([w-250, h-250, w+250, h+250], fill=(255, 90, 140, int(255 * intensity * 0.7)))
    leak = leak.filter(ImageFilter.GaussianBlur(55))
    return Image.alpha_composite(img.convert("RGBA"), leak).convert("RGB")

def add_cyberpunk_grid(img):
    w, h = img.size
    grid = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(grid)
    for y in range(0, h, 8):
        draw.line([(0, y), (w, y)], fill=(255, 0, 128, 15), width=1)
    for x in range(-200, w+200, 45):
        draw.line([(x, 480), (x*1.4 + (w/2)*(1 - 1.4), h)], fill=(0, 255, 255, 20), width=1)
    return Image.alpha_composite(img.convert("RGBA"), grid).convert("RGB")

def get_font(font_style, size):
    font_names = {
        'Cinematic': ['impact.ttf', 'segoeuib.ttf', 'arial.ttf'],
        'Signature': ['gabriola.ttf', 'itcedscr.ttf', 'brushsci.ttf', 'georgiab.ttf'],
        'Serif': ['georgia.ttf', 'times.ttf', 'palabi.ttf']
    }
    
    selected_names = font_names.get(font_style, ['arial.ttf'])
    system_font_dir = "C:\\Windows\\Fonts"
    
    for name in selected_names:
        font_path = os.path.join(system_font_dir, name)
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                pass
    try:
        return ImageFont.load_default()
    except Exception:
        return None

def process_couple_edit(img1_path, img2_path, style_id, skin_retouch, bg_replace, light_match, aspect_ratio='3:2', custom_text=None, brightness=0, contrast=0, custom_bg_path=None, font_style='Cinematic', text_position='Bottom', frame_style='None', progress_callback=None):
    if progress_callback: progress_callback(15)
    face1 = Image.open(img1_path).convert("RGBA")
    face2 = Image.open(img2_path).convert("RGBA")
    
    if aspect_ratio == '9:16':
        size = (360, 360)
        canvas_w, canvas_h = 800, 1420
        pos1 = (25, 520)
        pos2 = (415, 520)
        align_pos1 = (100, 520)
        align_pos2 = (340, 520)
    elif aspect_ratio == '1:1':
        size = (420, 420)
        canvas_w, canvas_h = 1000, 1000
        pos1 = (50, 290)
        pos2 = (530, 290)
        align_pos1 = (150, 290)
        align_pos2 = (430, 290)
    else: # Default 3:2
        size = (450, 450)
        canvas_w, canvas_h = 1200, 800
        pos1 = (120, 175)
        pos2 = (630, 175)
        align_pos1 = (220, 175)
        align_pos2 = (530, 175)
        
    face1 = ImageOps.fit(face1, size, Image.Resampling.LANCZOS)
    face2 = ImageOps.fit(face2, size, Image.Resampling.LANCZOS)
    
    mask1 = Image.new("L", size, 0)
    draw_m1 = ImageDraw.Draw(mask1)
    draw_m1.ellipse([15, 15, size[0]-15, size[1]-15], fill=255)
    mask1 = mask1.filter(ImageFilter.GaussianBlur(30))
    
    mask2 = Image.new("L", size, 0)
    draw_m2 = ImageDraw.Draw(mask2)
    draw_m2.ellipse([15, 15, size[0]-15, size[1]-15], fill=255)
    mask2 = mask2.filter(ImageFilter.GaussianBlur(30))

    if skin_retouch > 0:
        blur_radius = float(skin_retouch) / 12.0
        smoothed1 = face1.filter(ImageFilter.GaussianBlur(blur_radius))
        smoothed2 = face2.filter(ImageFilter.GaussianBlur(blur_radius))
        face1 = Image.blend(face1, smoothed1, 0.45)
        face2 = Image.blend(face2, smoothed2, 0.45)

    if progress_callback: progress_callback(40)

    before_canvas = Image.new("RGBA", (canvas_w, canvas_h), (18, 17, 15, 255))
    
    draw_bg = ImageDraw.Draw(before_canvas)
    for i in range(0, canvas_w, 40):
        draw_bg.line([(i, 0), (i, canvas_h)], fill=(30, 28, 25, 255), width=1)
    for j in range(0, canvas_h, 40):
        draw_bg.line([(0, j), (canvas_w, j)], fill=(30, 28, 25, 255), width=1)

    before_canvas.paste(face1, pos1, mask1)
    before_canvas.paste(face2, pos2, mask2)
    
    draw_before = ImageDraw.Draw(before_canvas)
    draw_before.rectangle([0, 0, canvas_w-1, canvas_h-1], outline=(212, 175, 55, 100), width=4)
    before_img_name = f"before_{uuid.uuid4().hex}.png"
    before_canvas.convert("RGB").save(os.path.join(UPLOAD_FOLDER, before_img_name), "JPEG", quality=90)

    if progress_callback: progress_callback(60)

    has_custom_bg = False
    if bg_replace and custom_bg_path and os.path.exists(custom_bg_path):
        try:
            custom_bg_img = Image.open(custom_bg_path).convert("RGBA")
            after_bg = ImageOps.fit(custom_bg_img, (canvas_w, canvas_h), Image.Resampling.LANCZOS)
            draw_after = ImageDraw.Draw(after_bg)
            has_custom_bg = True
        except Exception as bg_err:
            print(f"Error loading custom background: {bg_err}")
            after_bg = Image.new("RGBA", (canvas_w, canvas_h), (12, 11, 9, 255))
            draw_after = ImageDraw.Draw(after_bg)
    else:
        after_bg = Image.new("RGBA", (canvas_w, canvas_h), (12, 11, 9, 255))
        draw_after = ImageDraw.Draw(after_bg)

    def draw_gradient_fill(image, c1, c2):
        base = Image.new("RGBA", image.size, c1)
        top = Image.new("RGBA", image.size, c2)
        mask = Image.new("L", image.size)
        draw = ImageDraw.Draw(mask)
        for y in range(image.height):
            draw.line([(0, y), (image.width, y)], fill=int(255 * (y / image.height)))
        return Image.composite(top, base, mask)

    preset = PRESETS_BY_ID.get(style_id, PRESETS_BY_ID['cinematic'])
    face_tint_r, face_tint_g, face_tint_b = preset.get('face_tint', (1.0, 1.0, 1.0))
    overlay_text = preset.get('overlay_text')
    overlay_subtext = preset.get('overlay_subtext', 'A LOVE EDIT PORTRAIT')
    frame_color = None

    if not has_custom_bg:
        c1, c2 = preset.get('bg_gradient', ((10, 10, 8), (40, 36, 25)))
        after_bg = draw_gradient_fill(after_bg, c1, c2)
        draw_after = ImageDraw.Draw(after_bg)
        
        # Original legacy custom overlays
        if style_id == "wedding":
            draw_after.ellipse([canvas_w//2-200, -100, canvas_w//2+100, 200], fill=(255, 230, 235, 30))
            draw_after.ellipse([canvas_w-200, canvas_h-300, canvas_w, canvas_h-100], fill=(255, 230, 235, 20))
        elif style_id == "portrait":
            for r in range(max(canvas_w, canvas_h), 0, -20):
                color = int(45 - (r/max(canvas_w, canvas_h))*35)
                draw_after.ellipse([canvas_w//2-r, canvas_h//2-r, canvas_w//2+r, canvas_h//2+r], fill=(color, color, color))
        elif style_id == "bollywood":
            frame_color = (212, 175, 55, 150)
        elif style_id == "sunset":
            draw_after.ellipse([canvas_w//2-150, canvas_h//2-150, canvas_w//2+150, canvas_h//2+150], fill=(255, 215, 100, 120))
        elif style_id == "royal":
            frame_color = (212, 175, 55, 200)
            draw_after.rectangle([20, 20, canvas_w-20, canvas_h-20], outline=frame_color, width=4)
            draw_after.rectangle([30, 30, canvas_w-30, canvas_h-30], outline=frame_color, width=1)
        elif style_id == "travel":
            draw_after.rectangle([0, int(canvas_h*0.6), canvas_w, canvas_h], fill=(10, 30, 45, 255))
        elif style_id == "anime":
            draw_after.ellipse([200, 100, 400, 300], fill=(255, 255, 255, 18))
            draw_after.ellipse([canvas_w-300, 150, canvas_w-100, 350], fill=(255, 255, 255, 18))
        elif style_id == "vintage":
            draw_after.rectangle([20, 20, canvas_w-20, canvas_h-20], outline=(45, 35, 25, 150), width=2)
        elif style_id == "gothic":
            draw_after.ellipse([int(canvas_w*0.75), 100, int(canvas_w*0.87), 250], fill=(255, 255, 220, 40))

    # Apply background particle overlays
    overlay_type = preset.get('overlay')
    if overlay_type == 'rain':
        for _ in range(150):
            rx = np.random.randint(0, canvas_w)
            ry = np.random.randint(0, canvas_h)
            draw_after.line([(rx, ry), (rx+5, ry+25)], fill=(180, 200, 220, 60), width=1)
    elif overlay_type == 'snow':
        for _ in range(120):
            sx = np.random.randint(0, canvas_w)
            sy = np.random.randint(0, canvas_h)
            sr = np.random.randint(1, 5)
            draw_after.ellipse([sx-sr, sy-sr, sx+sr, sy+sr], fill=(255, 255, 255, 180))
    elif overlay_type == 'sparkles':
        for _ in range(35):
            fx = np.random.randint(50, canvas_w-50)
            fy = np.random.randint(50, canvas_h-50)
            fr = np.random.randint(4, 12)
            draw_after.ellipse([fx-fr, fy-fr, fx+fr, fy+fr], fill=(255, 255, 150, 60))
    elif overlay_type == 'sakura':
        for _ in range(45):
            px = np.random.randint(20, canvas_w-20)
            py = np.random.randint(20, canvas_h-20)
            pr = np.random.randint(5, 12)
            draw_after.ellipse([px-pr, py-pr, px+pr, py+pr], fill=(255, 182, 193, 100))
    elif overlay_type == 'leaves':
        for _ in range(25):
            lx = np.random.randint(50, canvas_w-50)
            ly = np.random.randint(50, canvas_h-50)
            lr = np.random.randint(8, 16)
            draw_after.ellipse([lx-lr, ly-lr//2, lx+lr, ly+lr//2], fill=(205, 95, 30, 80))
    elif overlay_type == 'sunlight':
        draw_after.ellipse([canvas_w//2-200, -150, canvas_w//2+200, 250], fill=(255, 255, 200, 40))
    elif overlay_type == 'wisps':
        for _ in range(25):
            wx = np.random.randint(40, canvas_w-40)
            wy = np.random.randint(40, canvas_h-40)
            wr = np.random.randint(4, 10)
            draw_after.ellipse([wx-wr, wy-wr, wx+wr, wy+wr], fill=(224, 255, 100, 70))
    elif overlay_type == 'grid':
        for i in range(0, canvas_w, 60):
            draw_after.line([(i, 0), (i, canvas_h)], fill=(0, 255, 255, 30), width=1)
        for j in range(0, canvas_h, 60):
            draw_after.line([(0, j), (canvas_w, j)], fill=(255, 0, 128, 30), width=1)

    pos1_x, pos1_y = align_pos1
    pos2_x, pos2_y = align_pos2
    
    if light_match:
        r1, g1, b1, a1 = face1.split()
        r1 = r1.point(lambda p: min(255, int(p * face_tint_r)))
        g1 = g1.point(lambda p: min(255, int(p * face_tint_g)))
        b1 = b1.point(lambda p: min(255, int(p * face_tint_b)))
        face1 = Image.merge("RGBA", (r1, g1, b1, a1))

        r2, g2, b2, a2 = face2.split()
        r2 = r2.point(lambda p: min(255, int(p * face_tint_r)))
        g2 = g2.point(lambda p: min(255, int(p * face_tint_g)))
        b2 = b2.point(lambda p: min(255, int(p * face_tint_b)))
        face2 = Image.merge("RGBA", (r2, g2, b2, a2))

    effect_type = preset.get('special_effect')
    if effect_type == 'posterize':
        face1 = ImageOps.posterize(face1.convert("RGB"), 3).convert("RGBA")
        face2 = ImageOps.posterize(face2.convert("RGB"), 3).convert("RGBA")
    elif effect_type == 'sketch':
        face1 = face1.convert("L").filter(ImageFilter.CONTOUR).convert("RGBA")
        face2 = face2.convert("L").filter(ImageFilter.CONTOUR).convert("RGBA")
    elif effect_type == 'grayscale':
        face1 = ImageOps.grayscale(face1.convert("RGB")).convert("RGBA")
        face2 = ImageOps.grayscale(face2.convert("RGB")).convert("RGBA")

    after_bg.paste(face1, (pos1_x, pos1_y), mask1)
    after_bg.paste(face2, (pos2_x, pos2_y), mask2)

    result = after_bg.convert("RGB")
    
    # Apply post-processing enhancements dynamically
    contrast_val = preset.get('contrast', 1.0)
    if contrast_val != 1.0:
        cont = ImageEnhance.Contrast(result)
        result = cont.enhance(contrast_val)
        
    saturation_val = preset.get('saturation', 1.0)
    if saturation_val != 1.0:
        sat = ImageEnhance.Color(result)
        result = sat.enhance(saturation_val)
        
    brightness_val = preset.get('brightness', 1.0)
    if brightness_val != 1.0:
        bright = ImageEnhance.Brightness(result)
        result = bright.enhance(brightness_val)

    # Post-processing filters based on overlay
    if overlay_type == 'film_grain':
        result = add_film_grain(result, 8)
    elif overlay_type == 'vignette':
        result = add_vignette(result, (0, 0, 0), 0.55)
    elif overlay_type == 'light_leak':
        leak_color = (255, 180, 200) if style_id == 'wedding' else (255, 130, 0)
        result = add_light_leak(result, leak_color, 0.25)
        
    if effect_type == 'watercolor':
        result = result.filter(ImageFilter.SMOOTH_MORE)
        result = add_film_grain(result, 4)
    elif effect_type == 'oil':
        result = result.filter(ImageFilter.DETAIL)
        sat = ImageEnhance.Color(result)
        result = sat.enhance(1.15)

    # Legacy style-specific details
    if style_id == "cyberpunk":
        result = add_cyberpunk_grid(result)
    elif style_id == "cinematic":
        result = add_film_grain(result, 7)
        result = add_vignette(result, (0, 0, 0), 0.45)
    elif style_id == "wedding":
        result = add_light_leak(result, (255, 180, 200), 0.25)
    elif style_id == "vintage":
        result = add_film_grain(result, 12)
        result = add_vignette(result, (50, 35, 15), 0.5)
    elif style_id == "fairytale":
        result = result.filter(ImageFilter.SMOOTH_MORE)
        result = add_light_leak(result, (180, 100, 255), 0.35)
    elif style_id == "winter":
        r, g, b = result.split()
        b = b.point(lambda p: min(255, int(p * 1.05)))
        result = Image.merge("RGB", (r, g, b))
        result = add_vignette(result, (200, 230, 255), 0.3)
    elif style_id == "gothic":
        result = add_vignette(result, (0, 0, 0), 0.75)
    elif style_id == "bollywood":
        result = add_film_grain(result, 8)
        result = add_vignette(result, (20, 10, 0), 0.55)

    draw_res = ImageDraw.Draw(result)
    
    if overlay_text:
        draw_res.text((canvas_w // 2 - 90, canvas_h - 120), overlay_text, fill=(212, 175, 55))
        draw_res.text((canvas_w // 2 - 150, canvas_h - 90), overlay_subtext, fill=(255, 255, 255))
        
    if style_id == "cinematic" or preset.get('frame') == 'Cinematic Letterbox':
        border_size = int(canvas_h * 0.09)
        draw_res.rectangle([0, 0, canvas_w, border_size], fill=(0,0,0))
        draw_res.rectangle([0, canvas_h-border_size, canvas_w, canvas_h], fill=(0,0,0))

    if frame_color:
        draw_res.rectangle([10, 10, canvas_w-10, canvas_h-10], outline=frame_color, width=3)

    preset_frame = preset.get('frame')
    if preset_frame and frame_style == 'None':
        frame_style = preset_frame

    if frame_style == 'Gold Foil' or frame_style == 'gold_foil':
        draw_res.rectangle([15, 15, canvas_w-15, canvas_h-15], outline=(212, 175, 55), width=3)
        draw_res.rectangle([25, 25, canvas_w-25, canvas_h-25], outline=(212, 175, 55), width=1)
    elif frame_style == 'mandap_border':
        for bx in range(10, canvas_w-10, 15):
            color = (255, 140, 0) if (bx // 15) % 2 == 0 else (255, 215, 0)
            draw_res.ellipse([bx-4, 10-4, bx+4, 10+4], fill=color)
            draw_res.ellipse([bx-4, canvas_h-10-4, bx+4, canvas_h-10+4], fill=color)
        for by in range(10, canvas_h-10, 15):
            color = (255, 140, 0) if (by // 15) % 2 == 0 else (255, 215, 0)
            draw_res.ellipse([10-4, by-4, 10+4, by+4], fill=color)
            draw_res.ellipse([canvas_w-10-4, by-4, canvas_w-10+4, by+4], fill=color)
    elif frame_style == 'Film Strip':
        strip_w = 60
        draw_res.rectangle([0, 0, strip_w, canvas_h], fill=(10, 10, 10))
        draw_res.rectangle([canvas_w-strip_w, 0, canvas_w, canvas_h], fill=(10, 10, 10))
        sprocket_h = 25
        sprocket_w = 15
        for sy in range(20, canvas_h, 60):
            draw_res.rectangle([22, sy, 22+sprocket_w, sy+sprocket_h], fill=(240, 240, 240))
            draw_res.rectangle([canvas_w-22-sprocket_w, sy, canvas_w-22, sy+sprocket_h], fill=(240, 240, 240))
    elif frame_style == 'Polaroid':
        border_lrt = 40
        border_b = 160
        polaroid_w = canvas_w + border_lrt * 2
        polaroid_h = canvas_h + border_lrt + border_b
        
        polaroid_canvas = Image.new("RGB", (polaroid_w, polaroid_h), (245, 245, 240))
        draw_p = ImageDraw.Draw(polaroid_canvas)
        draw_p.rectangle([border_lrt-2, border_lrt-2, polaroid_w-border_lrt+1, polaroid_h-border_b+1], outline=(200, 200, 200), width=1)
        
        polaroid_canvas.paste(result, (border_lrt, border_lrt))
        result = polaroid_canvas
        canvas_w, canvas_h = polaroid_w, polaroid_h
        draw_res = ImageDraw.Draw(result)

    if custom_text:
        size = 40
        if font_style == 'Signature':
            size = 60
        font = get_font(font_style, size)
        
        if font and hasattr(font, 'getbbox'):
            bbox = font.getbbox(custom_text)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
        else:
            text_w = len(custom_text) * (size // 2)
            text_h = size
            
        if frame_style == 'Polaroid':
            text_y = canvas_h - border_b + 40
        elif text_position == 'Top':
            text_y = 60 if style_id != "cinematic" else 100
        else:
            text_y = canvas_h - text_h - 60 if style_id != "cinematic" else canvas_h - text_h - 100
            
        text_x = max(10, canvas_w // 2 - text_w // 2)
        outline_color = (0, 0, 0)
        text_color = (212, 175, 55) if font_style != 'Serif' else (255, 255, 255)
        
        if font:
            for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2), (-1, -1), (1, -1), (-1, 1), (1, 1)]:
                draw_res.text((text_x + dx, text_y + dy), custom_text, fill=outline_color, font=font)
            draw_res.text((text_x, text_y), custom_text, fill=text_color, font=font)
        else:
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                draw_res.text((text_x + dx, text_y + dy), custom_text, fill=outline_color)
            draw_res.text((text_x, text_y), custom_text, fill=text_color)

    if progress_callback: progress_callback(80)
    if brightness != 0:
        enh_b = ImageEnhance.Brightness(result)
        factor_b = 1.0 + (float(brightness) / 100.0)
        result = enh_b.enhance(factor_b)
        
    if contrast != 0:
        enh_c = ImageEnhance.Contrast(result)
        factor_c = 1.0 + (float(contrast) / 100.0)
        result = enh_c.enhance(factor_c)

    if progress_callback: progress_callback(95)
    after_img_name = f"after_{uuid.uuid4().hex}.png"
    result.save(os.path.join(UPLOAD_FOLDER, after_img_name), "JPEG", quality=95)

    if progress_callback: progress_callback(100)
    return before_img_name, after_img_name
