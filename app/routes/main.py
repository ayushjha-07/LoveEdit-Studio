from flask import render_template, request, redirect, url_for, session, flash
from app.models import get_db
from app.utils.styles import STYLE_PRESETS

def register_routes(app):
    @app.route('/')
    def landing():
        featured_ids = [
            'cinematic', 'sunset_beach_film',
            'fairytale', 'moonlight_magic',
            'wedding', 'royal_wedding',
            'vintage', 'vintage_polaroid',
            'anime', 'ghibli_inspired',
            'vogue_editorial', 'yacht_romance',
            'travel', 'paris_romance', 'tokyo_nights',
            'winter_wonderland', 'autumn_warmth',
            'royal_traditional_indian', 'bollywood_poster',
            'pencil_sketch', 'watercolor_painting', 'oil_painting'
        ]
        featured_styles = [p for p in STYLE_PRESETS if p['id'] in featured_ids]
        return render_template('landing.html', active_page='landing', styles=featured_styles)

    @app.route('/submit-contact', methods=['POST'])
    def submit_contact():
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip()
        subject = request.form.get('subject', '').strip()
        message = request.form.get('message', '').strip()
        
        user_id = session.get('user_id')
        username = session.get('username')
        
        if not name or not email or not subject or not message:
            flash("All form fields are required to submit a support ticket.", "error")
            return redirect(url_for('landing') + "#contact")
            
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
            
        with get_db() as conn:
            # Insert support ticket
            conn.execute(
                "INSERT INTO support_tickets (user_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)",
                (user_id, name, email, subject, message)
            )
            # Log activity
            conn.execute(
                "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                (user_id, username if username else f"Guest ({name})", f"Ticket Submitted: {subject}", ip, "Success")
            )
            conn.commit()
            
        flash("Thank you for reaching out! Your support ticket has been created. A LoveEdit Studio agent will respond within 24 hours.", "success")
        return redirect(url_for('landing') + "#contact")
