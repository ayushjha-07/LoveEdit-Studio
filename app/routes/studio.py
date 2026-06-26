import os
import uuid
import datetime
import secrets
import sys
from flask import render_template, request, redirect, url_for, session, flash, jsonify, send_file
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image, ImageFilter
from app.models import get_db
from app.services.security import rate_limit, login_required
from app.services.image_processor import image_queue, UPLOAD_FOLDER
from app.utils.styles import STYLE_PRESETS, CATEGORIES, PRESETS_BY_ID

def register_routes(app):
    @app.route('/dashboard')
    @login_required
    def dashboard():
        style_param = request.args.get('style', 'cinematic').strip()
        with get_db() as conn:
            custom_bgs = conn.execute(
                "SELECT * FROM custom_backgrounds WHERE user_id = ? ORDER BY created_at DESC",
                (session['user_id'],)
            ).fetchall()
            fav_rows = conn.execute(
                "SELECT style_id FROM favorite_styles WHERE user_id = ?",
                (session['user_id'],)
            ).fetchall()
            fav_styles = [row['style_id'] for row in fav_rows]
        return render_template(
            'dashboard.html', 
            active_page='dashboard', 
            custom_bgs=custom_bgs, 
            fav_styles=fav_styles, 
            selected_style=style_param,
            styles=STYLE_PRESETS,
            categories=CATEGORIES
        )

    @app.route('/generate', methods=['POST'])
    @login_required
    @rate_limit(10, 60)
    def generate():
        photo_mine = request.files.get('photo_mine')
        photo_girlfriend = request.files.get('photo_girlfriend')
        style_id = request.form.get('style_id', 'cinematic')
        skin_retouch = int(request.form.get('retouch_strength', 50))
        replace_bg = request.form.get('replace_bg') == 'true'
        light_match = request.form.get('light_match') == 'true'
        
        # Tuning Parameters
        aspect_ratio = request.form.get('aspect_ratio', '3:2')
        custom_text = request.form.get('custom_text', '').strip()
        brightness = int(request.form.get('brightness', 0))
        contrast = int(request.form.get('contrast', 0))
        
        # Expanded features
        preset_bg = request.form.get('preset_bg', '').strip()
        font_style = request.form.get('font_style', 'Cinematic')
        text_position = request.form.get('text_position', 'Bottom')
        frame_style = request.form.get('frame_style', 'None')
        
        custom_bg = request.files.get('custom_bg')
        
        def validate_file(file):
            if not file or file.filename == '':
                return False, "No file selected."
            
            file.seek(0, os.SEEK_END)
            size = file.tell()
            file.seek(0)
            
            if size > 5 * 1024 * 1024:
                return False, "File exceeds 5MB size limit."
                
            allowed_extensions = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
            ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
            if ext not in allowed_extensions:
                return False, f"File format '{ext}' is not supported. Use JPG, PNG, WEBP, or GIF."
                
            try:
                file.seek(0)
                img = Image.open(file)
                img.format
                if img.format.lower() not in {'png', 'jpeg', 'gif', 'webp', 'jpg'}:
                    file.seek(0)
                    return False, f"Parsed image format '{img.format}' is not supported."
                file.seek(0)
            except Exception:
                file.seek(0)
                return False, "Uploaded file is not a valid image or is corrupted."
                
            return True, None

        if not photo_mine or photo_mine.filename == '':
            return jsonify({'success': False, 'message': 'Missing upload photo: Your Photo.'})
        if not photo_girlfriend or photo_girlfriend.filename == '':
            return jsonify({'success': False, 'message': 'Missing upload photo: Partner\'s Photo.'})

        ok1, err1 = validate_file(photo_mine)
        if not ok1:
            return jsonify({'success': False, 'message': f"Your Photo: {err1}"})
            
        ok2, err2 = validate_file(photo_girlfriend)
        if not ok2:
            return jsonify({'success': False, 'message': f"Girlfriend's Photo: {err2}"})

        if custom_bg and custom_bg.filename != '':
            ok3, err3 = validate_file(custom_bg)
            if not ok3:
                return jsonify({'success': False, 'message': f"Custom Background: {err3}"})

        ext1 = secure_filename(photo_mine.filename).split('.')[-1]
        ext2 = secure_filename(photo_girlfriend.filename).split('.')[-1]
        
        name1 = f"original_a_{uuid.uuid4().hex}.{ext1}"
        name2 = f"original_b_{uuid.uuid4().hex}.{ext2}"
        
        path1 = os.path.join(UPLOAD_FOLDER, name1)
        path2 = os.path.join(UPLOAD_FOLDER, name2)
        
        try:
            photo_mine.seek(0)
            img1 = Image.open(photo_mine)
            img1.save(path1, exif=b'')
            
            photo_girlfriend.seek(0)
            img2 = Image.open(photo_girlfriend)
            img2.save(path2, exif=b'')
        except Exception as e:
            return jsonify({'success': False, 'message': f"Failed to save uploaded photos: {str(e)}"})
        
        custom_bg_name = None
        if custom_bg and custom_bg.filename != '':
            ext_bg = secure_filename(custom_bg.filename).split('.')[-1]
            custom_bg_name = f"custom_bg_{uuid.uuid4().hex}.{ext_bg}"
            custom_bg_path = os.path.join(UPLOAD_FOLDER, custom_bg_name)
            try:
                custom_bg.seek(0)
                img_bg = Image.open(custom_bg)
                img_bg.save(custom_bg_path, exif=b'')
            except Exception as e:
                return jsonify({'success': False, 'message': f"Failed to save custom background: {str(e)}"})

        preset = PRESETS_BY_ID.get(style_id)
        style_name = preset['name'] if preset else 'Romantic Edit'
        project_name = f"{session['username']} & Partner - {style_name}"
        
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """INSERT INTO projects 
                       (user_id, name, original_img_1, original_img_2, generated_img, before_img, style, skin_retouch, bg_replace, light_match,
                        aspect_ratio, custom_text, brightness, contrast, custom_bg, preset_bg, font_style, text_position, frame_style,
                        status, progress, style_id) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (session['user_id'], project_name, name1, name2, "", "", style_name, skin_retouch, replace_bg, light_match,
                     aspect_ratio, custom_text if custom_text else None, brightness, contrast, custom_bg_name, preset_bg if preset_bg else None, font_style, text_position, frame_style,
                     'queued', 0, style_id)
                )
                project_id = cursor.lastrowid
                
                # Log the generation start action
                ip = request.headers.get('X-Forwarded-For', request.remote_addr)
                if ip and ',' in ip:
                    ip = ip.split(',')[0].strip()
                conn.execute(
                    "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                    (session['user_id'], session['username'], f"Started Generation: {style_name}", ip, f"Project ID: {project_id}")
                )
                
                conn.commit()
                
            # Put project ID in the background worker queue
            image_queue.put(project_id)
            
            return jsonify({
                'success': True,
                'project_id': project_id,
                'status': 'queued',
                'progress': 0
            })
            
        except Exception as e:
            print(f"Error starting queue: {e}", file=sys.stderr)
            return jsonify({'success': False, 'message': 'Failed to queue your render request.'})

    @app.route('/generate/status/<int:project_id>', methods=['GET'])
    @login_required
    def generate_status(project_id):
        with get_db() as conn:
            project = conn.execute("SELECT * FROM projects WHERE id = ? AND user_id = ?", (project_id, session['user_id'])).fetchone()
            
        if not project:
            return jsonify({'success': False, 'message': 'Creation not found.'}), 404
            
        project = dict(project)
            
        response = {
            'success': True,
            'project_id': project['id'],
            'status': project.get('status', 'completed'),
            'progress': project.get('progress', 100),
            'error_message': project.get('error_message'),
            'aspect_ratio': project.get('aspect_ratio', '3:2')
        }
        
        if project.get('status') == 'completed':
            response['before_img_url'] = url_for('static', filename='uploads/' + project['before_img'])
            response['after_img_url'] = url_for('static', filename='uploads/' + project['generated_img'])
            response['style_name'] = project['style']
            
        return jsonify(response)

    @app.route('/generate/history', methods=['GET'])
    @login_required
    def generate_history():
        with get_db() as conn:
            projects = conn.execute(
                "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC", 
                (session['user_id'],)
            ).fetchall()
            
        history = []
        for p in projects:
            p = dict(p)
            history.append({
                'id': p['id'],
                'name': p['name'],
                'style': p['style'],
                'style_id': p.get('style_id', 'cinematic'),
                'status': p.get('status', 'completed'),
                'progress': p.get('progress', 100),
                'before_img_url': url_for('static', filename='uploads/' + p['before_img']) if p['before_img'] else "",
                'after_img_url': url_for('static', filename='uploads/' + p['generated_img']) if p['generated_img'] else "",
                'created_at': p['created_at']
            })
            
        return jsonify({'success': True, 'history': history})

    @app.route('/generate/delete/<int:project_id>', methods=['POST'])
    @login_required
    def generate_delete(project_id):
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
        with get_db() as conn:
            project = conn.execute("SELECT * FROM projects WHERE id = ? AND user_id = ?", (project_id, session['user_id'])).fetchone()
            
            if not project:
                return jsonify({'success': False, 'message': 'Project not found.'}), 404
                
            for img in [project['original_img_1'], project['original_img_2'], project['generated_img'], project['before_img'], project['custom_bg']]:
                if img:
                    p_path = os.path.join(UPLOAD_FOLDER, img)
                    if os.path.exists(p_path):
                        try:
                            os.remove(p_path)
                        except Exception as err:
                            print(f"Error removing file: {err}", file=sys.stderr)
                            
            conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.execute("DELETE FROM downloads WHERE project_id = ?", (project_id,))
            conn.execute(
                "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                (session['user_id'], session['username'], f"Project Deleted: {project['name']}", ip, "Success")
            )
            conn.commit()
            
        return jsonify({'success': True, 'message': 'Creation deleted successfully.'})

    @app.route('/download/<int:project_id>')
    @login_required
    def download_project(project_id):
        res = request.args.get('res', 'HD')
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
        
        with get_db() as conn:
            project = conn.execute("SELECT * FROM projects WHERE id = ? AND user_id = ?", (project_id, session['user_id'])).fetchone()
            
        if not project:
            flash("Creations not found.", "error")
            return redirect(url_for('dashboard'))
            
        filename = project['generated_img']
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        
        if res == '4K':
            img = Image.open(file_path)
            upscaled_name = f"4k_{filename}"
            upscaled_path = os.path.join(UPLOAD_FOLDER, upscaled_name)
            
            if not os.path.exists(upscaled_path):
                img_4k = img.resize((3840, 2560), Image.Resampling.LANCZOS)
                img_4k = img_4k.filter(ImageFilter.SHARPEN)
                img_4k.save(upscaled_path, "JPEG", quality=98)
                
            file_path = upscaled_path
            filename = upscaled_name

        with get_db() as conn:
            conn.execute(
                "INSERT INTO downloads (project_id, user_id, resolution) VALUES (?, ?, ?)",
                (project_id, session['user_id'], res)
            )
            conn.execute(
                "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                (session['user_id'], session['username'], f"Project Exported ({res}): {project['name']}", ip, "Success")
            )
            conn.commit()
            
        return send_file(file_path, as_attachment=True, download_name=f"LoveEditStudio_{res}_{project['style'].replace(' ', '_')}.jpg")

    @app.route('/download-gallery/<int:project_id>')
    @login_required
    def download_project_from_gallery(project_id):
        return redirect(url_for('download_project', project_id=project_id, res='HD'))

    @app.route('/delete-project/<int:project_id>')
    @login_required
    def delete_project(project_id):
        with get_db() as conn:
            conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, session['user_id']))
            conn.commit()
        flash("Project deleted successfully.", "success")
        return redirect(url_for('gallery'))

    @app.route('/gallery')
    @login_required
    def gallery():
        with get_db() as conn:
            projects = conn.execute(
                "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC", 
                (session['user_id'],)
            ).fetchall()
            
            downloads = conn.execute(
                """SELECT d.*, p.name as project_name, p.style 
                   FROM downloads d 
                   JOIN projects p ON d.project_id = p.id 
                   WHERE d.user_id = ? 
                   ORDER BY d.downloaded_at DESC""",
                (session['user_id'],)
            ).fetchall()
            
        return render_template('gallery.html', projects=projects, downloads=downloads, active_page='gallery')

    @app.route('/user-dashboard')
    @login_required
    def user_dashboard():
        with get_db() as conn:
            user = conn.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()
            
            projects = conn.execute(
                "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC", 
                (session['user_id'],)
            ).fetchall()
            
            downloads = conn.execute(
                """SELECT d.*, p.name as project_name, p.style 
                   FROM downloads d 
                   JOIN projects p ON d.project_id = p.id 
                   WHERE d.user_id = ? 
                   ORDER BY d.downloaded_at DESC""",
                (session['user_id'],)
            ).fetchall()
            
            transactions = conn.execute(
                "SELECT * FROM transactions WHERE user_id = ? ORDER BY billing_date DESC",
                (session['user_id'],)
            ).fetchall()
            
            custom_bgs = conn.execute(
                "SELECT * FROM custom_backgrounds WHERE user_id = ? ORDER BY created_at DESC",
                (session['user_id'],)
            ).fetchall()
            
            fav_rows = conn.execute(
                "SELECT style_id FROM favorite_styles WHERE user_id = ?",
                (session['user_id'],)
            ).fetchall()
            fav_styles = [row['style_id'] for row in fav_rows]
            
            activity = conn.execute(
                "SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
                (session['user_id'],)
            ).fetchall()
            
        return render_template(
            'user_dashboard.html', 
            user=user, 
            projects=projects, 
            downloads=downloads, 
            transactions=transactions, 
            custom_bgs=custom_bgs,
            fav_styles=fav_styles,
            activity=activity,
            active_page='user_dashboard',
            styles=STYLE_PRESETS
        )

    @app.route('/api/styles/favorite', methods=['POST'])
    @login_required
    def toggle_favorite_style():
        style_id = request.json.get('style_id') if request.is_json else request.form.get('style_id')
        if not style_id:
            return jsonify({'success': False, 'message': 'Missing style_id.'}), 400
            
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
            
        with get_db() as conn:
            exists = conn.execute(
                "SELECT id FROM favorite_styles WHERE user_id = ? AND style_id = ?",
                (session['user_id'], style_id)
            ).fetchone()
            
            if exists:
                conn.execute(
                    "DELETE FROM favorite_styles WHERE user_id = ? AND style_id = ?",
                    (session['user_id'], style_id)
                )
                action = f"Unfavorited Style: {style_id}"
                favorited = False
            else:
                conn.execute(
                    "INSERT INTO favorite_styles (user_id, style_id) VALUES (?, ?)",
                    (session['user_id'], style_id)
                )
                action = f"Favorited Style: {style_id}"
                favorited = True
                
            conn.execute(
                "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                (session['user_id'], session['username'], action, ip, "Success")
            )
            conn.commit()
            
        return jsonify({'success': True, 'favorited': favorited})

    @app.route('/api/user/custom-backgrounds', methods=['GET', 'POST'])
    @login_required
    @rate_limit(10, 60)
    def manage_custom_backgrounds():
        if request.method == 'GET':
            with get_db() as conn:
                bgs = conn.execute("SELECT * FROM custom_backgrounds WHERE user_id = ? ORDER BY created_at DESC", (session['user_id'],)).fetchall()
            return jsonify({
                'success': True,
                'backgrounds': [{'id': b['id'], 'filename': b['filename'], 'original_name': b['original_name'], 'created_at': b['created_at']} for b in bgs]
            })
            
        file = request.files.get('file')
        if not file or file.filename == '':
            return jsonify({'success': False, 'message': 'No file uploaded.'}), 400
            
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        
        if size > 5 * 1024 * 1024:
            return jsonify({'success': False, 'message': 'File size exceeds 5MB limit.'}), 400
            
        allowed_extensions = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in allowed_extensions:
            return jsonify({'success': False, 'message': f"Unsupported file extension: {ext}"}), 400
            
        try:
            file.seek(0)
            img = Image.open(file)
            img.format
            if img.format.lower() not in {'png', 'jpeg', 'gif', 'webp', 'jpg'}:
                file.seek(0)
                return jsonify({'success': False, 'message': f"Parsed image format '{img.format}' is not supported."}), 400
            file.seek(0)
        except Exception:
            file.seek(0)
            return jsonify({'success': False, 'message': 'Uploaded file is not a valid image or is corrupted.'}), 400
            
        original_name = secure_filename(file.filename)
        filename = f"lib_bg_{uuid.uuid4().hex}.{ext}"
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        
        try:
            file.seek(0)
            img = Image.open(file)
            img.save(file_path, exif=b'')
        except Exception as e:
            return jsonify({'success': False, 'message': f"Failed to save image: {str(e)}"}), 500
            
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
            
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO custom_backgrounds (user_id, filename, original_name) VALUES (?, ?, ?)",
                (session['user_id'], filename, original_name)
            )
            bg_id = cursor.lastrowid
            conn.execute(
                "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                (session['user_id'], session['username'], f"Uploaded Custom Backdrop: {original_name}", ip, f"File size: {size} bytes")
            )
            conn.commit()
            
        return jsonify({
            'success': True,
            'background': {
                'id': bg_id,
                'filename': filename,
                'original_name': original_name,
                'url': url_for('static', filename='uploads/' + filename)
            }
        })

    @app.route('/api/user/custom-backgrounds/<int:bg_id>', methods=['DELETE'])
    @login_required
    def delete_custom_background(bg_id):
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
            
        with get_db() as conn:
            bg = conn.execute("SELECT * FROM custom_backgrounds WHERE id = ? AND user_id = ?", (bg_id, session['user_id'])).fetchone()
            if not bg:
                return jsonify({'success': False, 'message': 'Backdrop not found.'}), 404
                
            path = os.path.join(UPLOAD_FOLDER, bg['filename'])
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    print(f"Error deleting backdrop file: {e}", file=sys.stderr)
                    
            conn.execute("DELETE FROM custom_backgrounds WHERE id = ?", (bg_id,))
            conn.execute(
                "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                (session['user_id'], session['username'], f"Deleted Custom Backdrop: {bg['original_name']}", ip, "Success")
            )
            conn.commit()
            
        return jsonify({'success': True, 'message': 'Backdrop deleted successfully.'})

    @app.route('/api/user/update-profile', methods=['POST'])
    @login_required
    def update_profile():
        data = request.json if request.is_json else request.form
        email = data.get('email', '').strip()
        old_password = data.get('old_password', '')
        new_password = data.get('new_password', '')
        theme_pref = data.get('theme_preference', 'dark')
        
        with get_db() as conn:
            user = conn.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()
            
            if theme_pref in ['dark', 'light']:
                conn.execute("UPDATE users SET theme_preference = ? WHERE id = ?", (theme_pref, session['user_id']))
                
            if email and email != user['email']:
                email_exists = conn.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email, session['user_id'])).fetchone()
                if email_exists:
                    return jsonify({'success': False, 'message': 'Email address is already in use by another account.'}), 400
                ip = request.headers.get('X-Forwarded-For', request.remote_addr)
                if ip and ',' in ip:
                    ip = ip.split(',')[0].strip()
                conn.execute("UPDATE users SET email = ? WHERE id = ?", (email, session['user_id']))
                conn.execute(
                    "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                    (session['user_id'], session['username'], "Updated Email", ip, f"To: {email}")
                )
                
            if new_password:
                if not old_password:
                    return jsonify({'success': False, 'message': 'Current password is required to set a new password.'}), 400
                    
                if not check_password_hash(user['password_hash'], old_password):
                    return jsonify({'success': False, 'message': 'Incorrect current password.'}), 400
                    
                if len(new_password) < 6:
                    return jsonify({'success': False, 'message': 'New password must be at least 6 characters.'}), 400
                    
                hashed_pwd = generate_password_hash(new_password)
                new_session_token = secrets.token_hex(16)
                ip = request.headers.get('X-Forwarded-For', request.remote_addr)
                if ip and ',' in ip:
                    ip = ip.split(',')[0].strip()
                    
                conn.execute(
                    "UPDATE users SET password_hash = ?, session_token = ? WHERE id = ?", 
                    (hashed_pwd, new_session_token, session['user_id'])
                )
                session['session_token'] = new_session_token
                
                conn.execute(
                    "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                    (session['user_id'], session['username'], "Changed Password", ip, "Success (Concurrent sessions invalidated)")
                )
                
            conn.commit()
            
        return jsonify({'success': True, 'message': 'Account settings updated successfully.'})

    @app.route('/api/user/update-subscription', methods=['POST'])
    @login_required
    def update_subscription():
        data = request.json if request.is_json else request.form
        plan_tier = data.get('plan_tier', 'Basic').strip()
        
        if plan_tier not in ['Basic', 'Premium', 'VIP']:
            return jsonify({'success': False, 'message': 'Invalid subscription plan.'}), 400
            
        prices = {
            'Basic': 0.0,
            'Premium': 9.0,
            'VIP': 29.0
        }
        amount = prices[plan_tier]
        
        renews_date = None
        if plan_tier in ['Premium', 'VIP']:
            renews_date = (datetime.datetime.now() + datetime.timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
            
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
            
        with get_db() as conn:
            conn.execute(
                """UPDATE users 
                   SET subscription_plan = ?, subscription_status = ?, subscription_renews = ? 
                   WHERE id = ?""",
                (plan_tier, 'Active', renews_date, session['user_id'])
            )
            
            conn.execute(
                "INSERT INTO transactions (user_id, amount, plan_tier) VALUES (?, ?, ?)",
                (session['user_id'], amount, plan_tier)
            )
            
            conn.execute(
                "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                (session['user_id'], session['username'], f"Updated subscription plan to {plan_tier}", ip, "Success")
            )
            
            notif_title = "Subscription Upgraded" if plan_tier != 'Basic' else "Subscription Changed"
            notif_msg = f"Your account has been successfully upgraded to the {plan_tier} tier!" if plan_tier != 'Basic' else "Your plan has been changed back to Basic Free."
            conn.execute(
                "INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
                (session['user_id'], notif_title, notif_msg, "subscription")
            )
            conn.commit()
            
        return jsonify({
            'success': True,
            'message': f'Subscription upgraded to {plan_tier} successfully!',
            'plan': plan_tier,
            'renews': renews_date if renews_date else 'Never (Free Tier)'
        })

    @app.route('/api/styles/recommend', methods=['POST'])
    @login_required
    @rate_limit(10, 60)
    def recommend_styles():
        photo_mine = request.files.get('photo_mine')
        photo_girlfriend = request.files.get('photo_girlfriend')
        
        if not photo_mine or not photo_girlfriend:
            return jsonify({'success': False, 'message': 'Both photos are required for AI analysis.'}), 400
            
        try:
            # Analyze photo_mine
            img1 = Image.open(photo_mine.stream)
            img1_small = img1.resize((32, 32))
            pixels1 = list(img1_small.getdata())
            
            # Analyze photo_girlfriend
            img2 = Image.open(photo_girlfriend.stream)
            img2_small = img2.resize((32, 32))
            pixels2 = list(img2_small.getdata())
            
            total_r = 0
            total_g = 0
            total_b = 0
            warm_count = 0
            green_count = 0
            cool_count = 0
            
            # Combine pixels
            all_pixels = pixels1 + pixels2
            num_pixels = len(all_pixels)
            
            for p in all_pixels:
                r, g, b = p[0], p[1], p[2]
                total_r += r
                total_g += g
                total_b += b
                
                # warm colors (reds, oranges, yellows)
                if r > g and g >= b and r > 100:
                    warm_count += 1
                # green colors (forest, leaves, nature)
                elif g > r and g > b and g > 80:
                    green_count += 1
                # cool colors (sky, night, water, cyan/blues)
                elif b > r and b > g and b > 80:
                    cool_count += 1
                    
            avg_r = total_r / num_pixels
            avg_g = total_g / num_pixels
            avg_b = total_b / num_pixels
            brightness = (avg_r + avg_g + avg_b) / 3
            
            warm_ratio = warm_count / num_pixels
            green_ratio = green_count / num_pixels
            cool_ratio = cool_count / num_pixels
            
            recommendations = []
            
            if cool_ratio > 0.35 or brightness < 85:
                recommendations = [
                    {
                        'id': 'tokyo_nights',
                        'confidence': 96,
                        'reasoning': 'Low ambient light and cool cyan/blue values detected. Tokyo Nights will add vibrant retro-neon street lights that blend beautifully.'
                    },
                    {
                        'id': 'moonlight_magic',
                        'confidence': 92,
                        'reasoning': 'Midnight blue sky tones detected. Moonlight Magic will envelop your portrait in mystical lunar glows and romantic shadows.'
                    },
                    {
                        'id': 'retro_neon_80s',
                        'confidence': 89,
                        'reasoning': 'Cool-toned background environment detected. Retro Neon 80s adds bright vaporwave lighting and dynamic grids for a high-contrast edit.'
                    }
                ]
            elif green_ratio > 0.35:
                recommendations = [
                    {
                        'id': 'fairy_forest',
                        'confidence': 97,
                        'reasoning': 'Lush green foliage detected in the background. Fairy Forest adds golden sunbeams, magical woodland wisps, and a soft emerald tint.'
                    },
                    {
                        'id': 'garden_wedding',
                        'confidence': 94,
                        'reasoning': 'Scenic outdoor garden tones detected. Garden Wedding adds elegant floral accents, bright exposure, and soft romantic focus.'
                    },
                    {
                        'id': 'ghibli_inspired',
                        'confidence': 91,
                        'reasoning': 'Nature-filled landscape framing detected. Studio Ghibli Inspired transforms your photos into a beautifully hand-painted anime art look.'
                    }
                ]
            elif warm_ratio > 0.35 or (avg_r > 140 and avg_g > 90):
                recommendations = [
                    {
                        'id': 'golden_hour_romance',
                        'confidence': 98,
                        'reasoning': 'Warm sunlight and gold/amber tones detected. Golden Hour Romance matches the existing lighting and amplifies golden rays.'
                    },
                    {
                        'id': 'sunset_beach_film',
                        'confidence': 95,
                        'reasoning': 'Warm sunset colors detected. Sunset Beach Film enhances the horizon contrast and applies soft retro film saturation.'
                    },
                    {
                        'id': 'autumn_warmth',
                        'confidence': 92,
                        'reasoning': 'Sepia and warm organic tones detected. Autumn Warmth adds fallen orange leaves and cozy forest backdrops.'
                    }
                ]
            else:
                recommendations = [
                    {
                        'id': 'vogue_editorial',
                        'confidence': 95,
                        'reasoning': 'Balanced studio lighting detected. Vogue Editorial applies an ultra-chic, high-fashion layout with crisp contrast.'
                    },
                    {
                        'id': 'hollywood_romance',
                        'confidence': 92,
                        'reasoning': 'Clean portrait lighting detected. Hollywood Romance adds high-end cinematic soft focus and classic silver-screen tones.'
                    },
                    {
                        'id': 'digital_illustration',
                        'confidence': 88,
                        'reasoning': 'Neutral lighting detected. Digital Illustration applies a stylized hand-drawn digital art contour and soft glow.'
                    }
                ]
                
            results = []
            for rec in recommendations:
                preset = PRESETS_BY_ID.get(rec['id'])
                if preset:
                    results.append({
                        'style_id': rec['id'],
                        'name': preset['name'],
                        'category': preset['category'],
                        'confidence': rec['confidence'],
                        'reasoning': rec['reasoning'],
                        'thumbnail': url_for('static', filename='images/' + preset['thumbnail'])
                    })
                    
            return jsonify({
                'success': True,
                'characteristics': {
                    'brightness': round(brightness, 1),
                    'warm_ratio': round(warm_ratio, 2),
                    'green_ratio': round(green_ratio, 2),
                    'cool_ratio': round(cool_ratio, 2)
                },
                'recommendations': results
            })
            
        except Exception as e:
            return jsonify({'success': False, 'message': f'Analysis failed: {str(e)}'}), 500

    @app.route('/api/notifications', methods=['GET'])
    @login_required
    def get_notifications():
        user_id = session['user_id']
        with get_db() as conn:
            # Check if user has any notifications
            count = conn.execute("SELECT COUNT(*) FROM notifications WHERE user_id = ?", (user_id,)).fetchone()[0]
            
            # If 0, auto-seed some default promotional and system notifications
            if count == 0:
                now = datetime.datetime.now()
                # 1. Promo offer
                conn.execute(
                    """INSERT INTO notifications (user_id, title, message, type, created_at) 
                       VALUES (?, ?, ?, ?, ?)""",
                    (user_id, "Limited Time Offer: 15% Off Prints", 
                     "Turn your AI couple edits into stunning canvas prints! Use promo code LOVE15 at checkout for 15% off.",
                     "promo", (now - datetime.timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S"))
                )
                # 2. System announcement
                conn.execute(
                    """INSERT INTO notifications (user_id, title, message, type, created_at) 
                       VALUES (?, ?, ?, ?, ?)""",
                    (user_id, "New Creative Styles Released!", 
                     "Fairy Forest and Charcoal Pencil Sketch have been added to the studio. Go try them out now!",
                     "system", (now - datetime.timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S"))
                )
                # 3. System tip
                conn.execute(
                    """INSERT INTO notifications (user_id, title, message, type, created_at) 
                       VALUES (?, ?, ?, ?, ?)""",
                    (user_id, "Welcome to LoveEdit Studio!", 
                     "Use the left settings panel to adjust skin retouching, aspect ratios, custom captions, or borders.",
                     "system", (now - datetime.timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"))
                )
                conn.commit()

            # Query all notifications for user
            rows = conn.execute(
                """SELECT * FROM notifications 
                   WHERE user_id = ? 
                   ORDER BY created_at DESC LIMIT 50""",
                (user_id,)
            ).fetchall()
            
            unread_count = conn.execute(
                "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0",
                (user_id,)
            ).fetchone()[0]
            
        notifs_list = []
        for r in rows:
            notifs_list.append({
                'id': r['id'],
                'title': r['title'],
                'message': r['message'],
                'type': r['type'],
                'is_read': bool(r['is_read']),
                'created_at': r['created_at']
            })
            
        return jsonify({
            'success': True,
            'notifications': notifs_list,
            'unread_count': unread_count
        })

    @app.route('/api/notifications/read', methods=['POST'])
    @login_required
    def mark_notifications_read():
        user_id = session['user_id']
        notif_id = request.json.get('notification_id') if request.is_json else request.form.get('notification_id')
        
        with get_db() as conn:
            if notif_id == 'all' or not notif_id:
                conn.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
            else:
                conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (notif_id, user_id))
            conn.commit()
            
        return jsonify({'success': True, 'message': 'Notifications marked as read.'})

    @app.route('/api/notifications/clear', methods=['POST'])
    @login_required
    def clear_notifications():
        user_id = session['user_id']
        notif_id = request.json.get('notification_id') if request.is_json else request.form.get('notification_id')
        
        with get_db() as conn:
            if notif_id == 'all' or not notif_id:
                conn.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
            else:
                conn.execute("DELETE FROM notifications WHERE id = ? AND user_id = ?", (notif_id, user_id))
            conn.commit()
            
        return jsonify({'success': True, 'message': 'Notifications cleared.'})
