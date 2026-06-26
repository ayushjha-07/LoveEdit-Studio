import hmac
import secrets
import datetime
from functools import wraps
from flask import request, session, abort, jsonify, redirect, url_for, flash, current_app
from app.models import get_db

def rate_limit(limit_count, period_seconds):
    """
    Database-driven IP-based rate limiting decorator.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
            path = request.path
            
            with get_db() as conn:
                # Clean up expired entries to keep DB compact
                conn.execute(
                    "DELETE FROM rate_limit_hits WHERE timestamp < datetime('now', ?)",
                    (f"-{period_seconds} seconds",)
                )
                # Count recent hits
                hits = conn.execute(
                    "SELECT COUNT(*) FROM rate_limit_hits WHERE ip = ? AND path = ? AND timestamp >= datetime('now', ?)",
                    (ip, path, f"-{period_seconds} seconds")
                )
                count = hits.fetchone()[0]
                
                if count >= limit_count:
                    user_id = session.get('user_id')
                    username = session.get('username')
                    conn.execute(
                        "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                        (user_id, username, "Rate Limit Exceeded", ip, f"Path: {path}, Hits: {count}")
                    )
                    conn.commit()
                    
                    if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                        return jsonify({'success': False, 'message': 'Too many requests. Please slow down.'}), 429
                    else:
                        abort(429, description="Too many requests. Please slow down and try again later.")
                
                conn.execute(
                    "INSERT INTO rate_limit_hits (ip, path) VALUES (?, ?)",
                    (ip, path)
                )
                conn.commit()
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def login_required(f):
    """
    Decorator requiring active session.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash("Please sign in to access the Love Studio workspace.", "error")
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def register_security_hooks(app):
    """
    Registers global security filters, CSRF checks, and session telemetry on the Flask app.
    """
    @app.before_request
    def security_before_request():
        # Skip static files
        if request.endpoint == 'static' or request.path.startswith('/static'):
            return

        # 1. CSRF Token Generation
        if 'csrf_token' not in session:
            session['csrf_token'] = secrets.token_hex(32)

        # 2. Session Inactivity Timeout (30 mins)
        if 'user_id' in session:
            now = datetime.datetime.now()
            last_activity_str = session.get('last_activity')
            if last_activity_str:
                try:
                    last_activity = datetime.datetime.strptime(last_activity_str, "%Y-%m-%d %H:%M:%S")
                    if (now - last_activity).total_seconds() > 30 * 60:
                        session.clear()
                        flash("Session timed out due to 30 minutes of inactivity. Please sign in again.", "warning")
                        return redirect(url_for('login'))
                except ValueError:
                    pass
            session['last_activity'] = now.strftime("%Y-%m-%d %H:%M:%S")

        # 3. Session Invalidation (Concurrent session check)
        if 'user_id' in session:
            with get_db() as conn:
                user = conn.execute("SELECT session_token FROM users WHERE id = ?", (session['user_id'],)).fetchone()
            if not user or user['session_token'] != session.get('session_token'):
                session.clear()
                if request.endpoint not in ['login', 'logout']:
                    flash("Your session has expired or has been invalidated. Please sign in again.", "warning")
                    return redirect(url_for('login'))

        # 4. CSRF Protection for modifying methods
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            if request.endpoint == 'oauth_callback':
                return
                
            token = request.form.get('csrf_token') or request.headers.get('X-CSRF-Token')
            if not token and request.is_json and request.json:
                token = request.json.get('csrf_token')
                
            session_token = session.get('csrf_token')
            if not session_token or not token or not hmac.compare_digest(session_token, token):
                user_id = session.get('user_id')
                username = session.get('username')
                ip = request.headers.get('X-Forwarded-For', request.remote_addr)
                if ip and ',' in ip:
                    ip = ip.split(',')[0].strip()
                with get_db() as conn:
                    conn.execute(
                        "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                        (user_id, username, "CSRF Validation Failed", ip, f"Path: {request.path}")
                    )
                    conn.commit()
                abort(403, description="CSRF token validation failed. Access denied.")

    @app.context_processor
    def inject_csrf_token():
        def csrf_token():
            return session.get('csrf_token', '')
        return dict(csrf_token=csrf_token)

def strip_exif(image_path):
    """
    Helper function to load a PIL Image, strip metadata/EXIF, and re-save it.
    """
    from PIL import Image
    try:
        img = Image.open(image_path)
        data = list(img.getdata())
        image_without_exif = Image.new(img.mode, img.size)
        image_without_exif.putdata(data)
        image_without_exif.save(image_path)
        return True
    except Exception:
        return False
