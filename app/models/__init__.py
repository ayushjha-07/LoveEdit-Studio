import os
import sys
import sqlite3
import datetime
import random
from flask import current_app
from werkzeug.security import generate_password_hash
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def get_db():
    """
    Acquires a database connection, resolving the database path from Flask config if available.
    """
    try:
        db_name = current_app.config['DB_NAME']
    except RuntimeError:
        db_name = os.environ.get("DB_NAME", "loveedit.db")
    
    conn = sqlite3.connect(db_name)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.OperationalError:
        pass
    conn.row_factory = sqlite3.Row
    return conn

def init_db(app):
    """
    Initializes SQL tables, indexes, dynamic column migrations, and mocks seeding.
    """
    db_name = app.config.get("DB_NAME", "loveedit.db")
    
    # Establish connection
    conn = sqlite3.connect(db_name)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.OperationalError:
        pass
    conn.row_factory = sqlite3.Row
    
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                original_img_1 TEXT NOT NULL,
                original_img_2 TEXT NOT NULL,
                generated_img TEXT NOT NULL,
                before_img TEXT NOT NULL,
                style TEXT NOT NULL,
                skin_retouch INTEGER DEFAULT 50,
                bg_replace BOOLEAN DEFAULT 1,
                light_match BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS downloads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                resolution TEXT NOT NULL,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                plan_tier TEXT NOT NULL,
                billing_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                reply TEXT,
                status TEXT DEFAULT 'Open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                action TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mail_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_to TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                link TEXT NOT NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS favorite_styles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                style_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                UNIQUE(user_id, style_id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS custom_backgrounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL,
                is_read BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS rate_limit_hits (
                ip TEXT NOT NULL,
                path TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Indexes for query performance
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rate_limit_hits ON rate_limit_hits(ip, path, timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at, user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(downloaded_at)")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read)")
        except sqlite3.OperationalError:
            pass

        # Dynamic Migrations for users table subscription & auth columns
        user_columns_to_add = [
            ("subscription_plan", "TEXT DEFAULT 'Basic'"),
            ("subscription_status", "TEXT DEFAULT 'Active'"),
            ("subscription_renews", "TIMESTAMP"),
            ("email", "TEXT"),
            ("reset_token", "TEXT"),
            ("reset_token_expiry", "TIMESTAMP"),
            ("oauth_provider", "TEXT"),
            ("oauth_id", "TEXT"),
            ("theme_preference", "TEXT DEFAULT 'dark'"),
            ("login_attempts", "INTEGER DEFAULT 0"),
            ("lockout_until", "TIMESTAMP"),
            ("session_token", "TEXT")
        ]
        for col_name, col_type in user_columns_to_add:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass
                
        # Dynamic Migrations for activity_logs table
        activity_columns_to_add = [
            ("ip_address", "TEXT"),
            ("details", "TEXT")
        ]
        for col_name, col_type in activity_columns_to_add:
            try:
                conn.execute(f"ALTER TABLE activity_logs ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass
        
        # Dynamic Migrations for projects table
        columns_to_add = [
            ("aspect_ratio", "TEXT DEFAULT '3:2'"),
            ("custom_text", "TEXT"),
            ("brightness", "INTEGER DEFAULT 0"),
            ("contrast", "INTEGER DEFAULT 0"),
            ("custom_bg", "TEXT"),
            ("preset_bg", "TEXT"),
            ("font_style", "TEXT DEFAULT 'Cinematic'"),
            ("text_position", "TEXT DEFAULT 'Bottom'"),
            ("frame_style", "TEXT DEFAULT 'None'"),
            ("status", "TEXT DEFAULT 'completed'"),
            ("progress", "INTEGER DEFAULT 100"),
            ("error_message", "TEXT"),
            ("style_id", "TEXT DEFAULT 'cinematic'")
        ]
        for col_name, col_type in columns_to_add:
            try:
                conn.execute(f"ALTER TABLE projects ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass
        
        conn.commit()
        
        # Seed dummy records for analytics demonstration if empty
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM transactions")
        if cursor.fetchone()[0] == 0:
            now = datetime.datetime.now()
            
            # Check if mock users exist; if not, create them
            cursor.execute("SELECT COUNT(*) FROM users")
            if cursor.fetchone()[0] <= 1:
                mock_users = [
                    ("alex_gold", generate_password_hash("password123"), "alex@loveedit.com", "Gold", "Active", (now + datetime.timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")),
                    ("sarah_pro", generate_password_hash("password123"), "sarah@loveedit.com", "Pro", "Active", (now + datetime.timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")),
                    ("john_basic", generate_password_hash("password123"), "john@loveedit.com", "Basic", "Active", None),
                    ("emily_cancelled", generate_password_hash("password123"), "emily@loveedit.com", "Gold", "Cancelled", "2026-06-01 10:00:00"),
                    ("michael_pro", generate_password_hash("password123"), "michael@loveedit.com", "Pro", "Active", (now + datetime.timedelta(days=15)).strftime("%Y-%m-%d %H:%M:%S"))
                ]
                for uname, phash, email, plan, status, renews in mock_users:
                    try:
                        cursor.execute(
                            "INSERT INTO users (username, password_hash, email, subscription_plan, subscription_status, subscription_renews) VALUES (?, ?, ?, ?, ?, ?)",
                            (uname, phash, email, plan, status, renews)
                        )
                    except sqlite3.IntegrityError:
                        pass
                conn.commit()
            
            # Backwards compatibility: update existing mock users emails
            cursor.execute("UPDATE users SET email = 'alex@loveedit.com' WHERE username = 'alex_gold' AND email IS NULL")
            cursor.execute("UPDATE users SET email = 'sarah@loveedit.com' WHERE username = 'sarah_pro' AND email IS NULL")
            cursor.execute("UPDATE users SET email = 'john@loveedit.com' WHERE username = 'john_basic' AND email IS NULL")
            cursor.execute("UPDATE users SET email = 'emily@loveedit.com' WHERE username = 'emily_cancelled' AND email IS NULL")
            cursor.execute("UPDATE users SET email = 'michael@loveedit.com' WHERE username = 'michael_pro' AND email IS NULL")
            conn.commit()
                
            users_list = conn.execute("SELECT * FROM users").fetchall()
            
            # Seed billing transactions for the past 6 months to make MRR trends look fantastic
            plans = {"Basic": 0.0, "Gold": 9.00, "Pro": 19.00}
            for u in users_list:
                if u['subscription_plan'] != 'Basic':
                    price = plans[u['subscription_plan']]
                    for month_offset in [3, 2, 1]:
                        tx_date = now - datetime.timedelta(days=30 * month_offset + random.randint(-5, 5))
                        cursor.execute(
                            "INSERT INTO transactions (user_id, amount, plan_tier, billing_date) VALUES (?, ?, ?, ?)",
                            (u['id'], price, u['subscription_plan'], tx_date.strftime("%Y-%m-%d %H:%M:%S"))
                        )
            
            # Seed additional billing transactions to populate Chart.js timeline beautifully
            for d_offset in range(90, 0, -3):
                tx_date = now - datetime.timedelta(days=d_offset + random.randint(-1, 1))
                tier = random.choice(["Gold", "Pro"])
                price = plans[tier]
                if users_list:
                    u_target = random.choice(users_list)
                    cursor.execute(
                        "INSERT INTO transactions (user_id, amount, plan_tier, billing_date) VALUES (?, ?, ?, ?)",
                        (u_target['id'], price, tier, tx_date.strftime("%Y-%m-%d %H:%M:%S"))
                    )

            # Seed support tickets
            tickets = [
                (None, "David Miller", "david.m@outlook.com", "4K prints quality question", "Hi, I just downloaded a 4K copy but it looks slightly blurred on my large canvas print. Any recommendations?", "Hi David! For high-quality physical prints, please make sure your original uploaded selfies are high-resolution and not compressed. We have adjusted your rendering filter settings slightly to increase sharpness. Please try regenerating now.", "Resolved"),
                (None, "Sophia Watson", "sophia.watson@gmail.com", "Love the cinematic style!", "I created three portraits with my fiance and they look absolutely gorgeous! Just wanted to send my compliments to the team. Keep up the amazing work!", None, "Open"),
                (None, "Marcus Aurelius", "marcus@rome.com", "Billing issue - double charged", "I upgraded to the Pro tier today but I see two transactions of $19 in my card statement. Please refund one of them.", None, "Open"),
                (None, "Jessica Chen", "jess.chen@design.co", "Refund query on Gold tier", "I accidentally subscribed to Gold instead of Pro. Can you refund this so I can purchase the Pro tier?", "Hello Jessica! We have manually upgraded your account to the Pro tier and adjusted the billing difference. You do not need to purchase another tier. Let us know if you need anything else!", "Resolved")
            ]
            for u_id, name, email, subject, message, reply, status in tickets:
                cursor.execute(
                    "INSERT INTO support_tickets (user_id, name, email, subject, message, reply, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (u_id, name, email, subject, message, reply, status)
                )

            # Seed activity logs
            actions = [
                ("User Registered", "john_basic"),
                ("User Registered", "sarah_pro"),
                ("Project Generated: Romantic Cinematic", "sarah_pro"),
                ("Project Exported (HD): sarah_pro & Partner", "sarah_pro"),
                ("User Registered", "alex_gold"),
                ("Project Generated: Royal Traditional Indian", "alex_gold"),
                ("Project Exported (4K): alex_gold & Partner", "alex_gold"),
                ("Ticket Resolved: david.m@outlook.com", "admin"),
                ("Database Optimized (VACUUM/ANALYZE)", "admin")
            ]
            for action, uname in actions:
                u = conn.execute("SELECT id FROM users WHERE username = ?", (uname,)).fetchone()
                u_id = u['id'] if u else None
                log_date = now - datetime.timedelta(hours=random.randint(1, 48))
                cursor.execute(
                    "INSERT INTO activity_logs (user_id, username, action, ip_address, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (u_id, uname, action, "127.0.0.1", "Seed Log", log_date.strftime("%Y-%m-%d %H:%M:%S"))
                )
                
            # Seed projects if empty to give style popularity stats some volume
            cursor.execute("SELECT COUNT(*) FROM projects")
            if cursor.fetchone()[0] == 0:
                from app.utils.styles import STYLE_PRESETS
                for u in users_list:
                    for _ in range(random.randint(3, 6)):
                        preset = random.choice(STYLE_PRESETS)
                        proj_name = f"{u['username']} & Partner - {preset['name']}"
                        cursor.execute(
                            """INSERT INTO projects 
                               (user_id, name, original_img_1, original_img_2, generated_img, before_img, style, style_id, skin_retouch, bg_replace, light_match) 
                               VALUES (?, ?, 'sample_before.jpg', 'sample_before.jpg', 'sample_after.jpg', 'sample_before.jpg', ?, ?, 50, 1, 1)""",
                            (u['id'], proj_name, preset['name'], preset['id'])
                        )
            
            conn.commit()
    conn.close()

def generate_placeholder_images(images_folder):
    """
    Generates placeholder couples assets and dynamic style thumbnails if not present inside static/images.
    """
    def create_gradient(w, h, color1, color2):
        base = Image.new("RGB", (w, h), color1)
        top = Image.new("RGB", (w, h), color2)
        mask = Image.new("L", (w, h))
        draw = ImageDraw.Draw(mask)
        for y in range(h):
            draw.line([(0, y), (w, y)], fill=int(255 * (y / h)))
        return Image.composite(top, base, mask)

    path_before = os.path.join(images_folder, "sample_before.jpg")
    if not os.path.exists(path_before):
        img = create_gradient(800, 1000, (30, 28, 25), (60, 50, 45))
        draw = ImageDraw.Draw(img)
        draw.ellipse([200, 300, 450, 550], fill=(120, 100, 90), outline=(212, 175, 55), width=2)
        draw.ellipse([400, 350, 650, 600], fill=(150, 130, 120), outline=(212, 175, 55), width=2)
        draw.text((320, 250), "Original Portraits", fill=(245, 224, 163))
        img.save(path_before, quality=90)

    path_after = os.path.join(images_folder, "sample_after.jpg")
    if not os.path.exists(path_after):
        img = create_gradient(800, 1000, (12, 11, 9), (45, 30, 10))
        draw = ImageDraw.Draw(img)
        draw.ellipse([200, 300, 450, 550], fill=(180, 150, 120), outline=(212, 175, 55), width=3)
        draw.ellipse([380, 320, 630, 570], fill=(210, 180, 150), outline=(212, 175, 55), width=3)
        draw.rectangle([0, 0, 800, 60], fill=(6, 6, 6))
        draw.rectangle([0, 940, 800, 1000], fill=(6, 6, 6))
        draw.text((290, 80), "L O V E   E D I T   S T U D I O", fill=(212, 175, 55))
        draw.text((330, 900), "A ROYAL RETOUR", fill=(255, 255, 255))
        img = img.filter(ImageFilter.SMOOTH_MORE)
        img.save(path_after, quality=90)

    # Dynamic Style Thumbnails Generator
    from app.utils.styles import STYLE_PRESETS
    
    font_path = "C:\\Windows\\Fonts\\segoeuib.ttf"
    if not os.path.exists(font_path):
        font_path = "C:\\Windows\\Fonts\\arial.ttf"
        
    font_title = None
    font_badge = None
    font_desc = None
    
    if os.path.exists(font_path):
        try:
            font_title = ImageFont.truetype(font_path, 22)
            font_badge = ImageFont.truetype(font_path, 11)
            font_desc = ImageFont.truetype(font_path, 13)
        except Exception:
            pass

    for preset in STYLE_PRESETS:
        thumb_path = os.path.join(images_folder, preset['thumbnail'])
        if not os.path.exists(thumb_path):
            w, h = 512, 512
            c1, c2 = preset.get('bg_gradient', ((30, 28, 25), (60, 50, 45)))
            
            # Draw base gradient
            img = create_gradient(w, h, c1, c2)
            draw = ImageDraw.Draw(img)
            
            # Add subtle visual patterns based on category
            cat = preset['category']
            sid = preset['id']
            if cat == 'Cyberpunk' or sid == 'cyberpunk' or sid == 'retro_neon_80s':
                for cy in range(0, h, 30):
                    draw.line([(0, cy), (w, cy)], fill=(255, 0, 128, 25), width=1)
                for cx in range(0, w, 30):
                    draw.line([(cx, 0), (cx, h)], fill=(0, 255, 255, 25), width=1)
            elif cat == 'Fantasy' or sid == 'fairytale':
                for _ in range(15):
                    fx = random.randint(15, w-15)
                    fy = random.randint(15, h-15)
                    fr = random.randint(6, 16)
                    draw.ellipse([fx-fr, fy-fr, fx+fr, fy+fr], fill=(255, 255, 150, 50))
            elif cat == 'Wedding' or cat == 'Luxury':
                draw.ellipse([w//2-120, h//2-120, w//2+120, h//2+120], outline=(255, 255, 255, 25), width=2)
            elif cat == 'Artistic' and 'sketch' in sid:
                for _ in range(30):
                    x = random.randint(0, w-60)
                    y = random.randint(0, h-60)
                    draw.line([(x, y), (x+60, y+40)], fill=(110, 110, 110, 50), width=1)

            # Draw outer gold border
            draw.rectangle([12, 12, w-12, h-12], outline=(212, 175, 55, 130), width=3)
            
            # Draw Category Pill Badge
            badge_text = cat.upper()
            text_size = len(badge_text) * 7
            draw.rectangle([25, 25, 25 + text_size + 15, 50], fill=(212, 175, 55, 180), outline=(212, 175, 55), width=1)
            if font_badge:
                draw.text((32, 30), badge_text, fill=(0, 0, 0), font=font_badge)
            else:
                draw.text((32, 30), badge_text, fill=(0, 0, 0))

            # Draw Title text (Centered)
            title = preset['name']
            if font_title:
                t_bbox = font_title.getbbox(title)
                t_w = t_bbox[2] - t_bbox[0]
                t_h = t_bbox[3] - t_bbox[1]
                draw.text((w // 2 - t_w // 2, h // 2 - t_h // 2 - 10), title, fill=(255, 255, 255), font=font_title)
            else:
                draw.text((w // 2 - len(title)*4, h // 2 - 10), title, fill=(255, 255, 255))

            # Draw Description (Centered below title)
            desc = preset['description']
            if len(desc) > 40:
                desc = desc[:37] + "..."
            if font_desc:
                d_bbox = font_desc.getbbox(desc)
                d_w = d_bbox[2] - d_bbox[0]
                draw.text((w // 2 - d_w // 2, h // 2 + 25), desc, fill=(210, 210, 210), font=font_desc)
            else:
                draw.text((w // 2 - len(desc)*3.5, h // 2 + 20), desc, fill=(210, 210, 210))

            img.save(thumb_path, "JPEG", quality=90)
