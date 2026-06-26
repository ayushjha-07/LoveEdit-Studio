import hashlib
import secrets
import datetime
import uuid
import sqlite3
from flask import render_template, request, redirect, url_for, session, flash
from werkzeug.security import generate_password_hash, check_password_hash
from app.models import get_db
from app.services.security import rate_limit

def register_routes(app):
    @app.route('/register', methods=['GET', 'POST'])
    @rate_limit(5, 60)
    def register():
        if request.method == 'POST':
            username = request.form.get('username', '').strip()
            email = request.form.get('email', '').strip()
            password = request.form.get('password', '').strip()
            
            if not username or not email or not password:
                flash("All fields are required.", "error")
                return redirect(url_for('register'))
                
            hashed_password = generate_password_hash(password)
            session_token = secrets.token_hex(16)
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
            
            try:
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        "INSERT INTO users (username, email, password_hash, session_token) VALUES (?, ?, ?, ?)",
                        (username, email, hashed_password, session_token)
                    )
                    new_id = cursor.lastrowid
                    
                    # Log registration
                    conn.execute(
                        "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, 'User Registered', ?, 'Success')",
                        (new_id, username, ip)
                    )
                    conn.commit()
                    
                # Log in the user in session
                session['user_id'] = new_id
                session['username'] = username
                session['session_token'] = session_token
                session['last_activity'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                flash(f"Account created successfully! Welcome to LoveEdit Studio, {username}!", "success")
                return redirect(url_for('dashboard'))
            except sqlite3.IntegrityError:
                flash("Username or email already exists. Please choose another.", "error")
                
        return render_template('register.html', active_page='register')

    @app.route('/login', methods=['GET', 'POST'])
    @rate_limit(5, 60)
    def login():
        if request.method == 'POST':
            login_id = request.form.get('username', '').strip()
            password = request.form.get('password', '').strip()
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
            
            with get_db() as conn:
                user = conn.execute(
                    "SELECT * FROM users WHERE username = ? OR email = ?", 
                    (login_id, login_id)
                ).fetchone()
                
            if user:
                # Check lockout state
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                if user['lockout_until'] and user['lockout_until'] > now_str:
                    lock_time = datetime.datetime.strptime(user['lockout_until'], "%Y-%m-%d %H:%M:%S")
                    remaining = int((lock_time - datetime.datetime.now()).total_seconds() / 60)
                    if remaining <= 0: remaining = 1
                    flash(f"Account temporarily locked due to excessive failed attempts. Please try again in {remaining} minutes.", "error")
                    return render_template('login.html', active_page='login')
                    
                if user['password_hash'] and check_password_hash(user['password_hash'], password):
                    # Correct password
                    session_token = secrets.token_hex(16)
                    with get_db() as conn:
                        conn.execute(
                            "UPDATE users SET login_attempts = 0, lockout_until = NULL, session_token = ? WHERE id = ?",
                            (session_token, user['id'])
                        )
                        conn.execute(
                            "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, 'User Logged In', ?, 'Success')",
                            (user['id'], user['username'], ip)
                        )
                        conn.commit()
                        
                    session['user_id'] = user['id']
                    session['username'] = user['username']
                    session['session_token'] = session_token
                    session['last_activity'] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    
                    flash(f"Welcome back, {user['username']}!", "success")
                    return redirect(url_for('dashboard'))
                else:
                    # Incorrect password
                    attempts = (user['login_attempts'] or 0) + 1
                    lockout_until = None
                    action_desc = "Failed Login Attempt"
                    details = f"Attempts: {attempts}"
                    
                    if attempts >= 5:
                        lockout_time = datetime.datetime.now() + datetime.timedelta(minutes=15)
                        lockout_until = lockout_time.strftime("%Y-%m-%d %H:%M:%S")
                        action_desc = "Account Locked Out"
                        details = f"Locked out until {lockout_until}"
                        flash("Account temporarily locked for 15 minutes due to 5 failed attempts.", "error")
                    else:
                        flash("Invalid username/email or password.", "error")
                        
                    with get_db() as conn:
                        conn.execute(
                            "UPDATE users SET login_attempts = ?, lockout_until = ? WHERE id = ?",
                            (attempts, lockout_until, user['id'])
                        )
                        conn.execute(
                            "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                            (user['id'], user['username'], action_desc, ip, details)
                        )
                        conn.commit()
            else:
                flash("Invalid username/email or password.", "error")
                
        return render_template('login.html', active_page='login')

    @app.route('/logout')
    def logout():
        session.clear()
        flash("Successfully signed out.", "success")
        return redirect(url_for('landing'))


    @app.route('/forgot-password', methods=['GET', 'POST'])
    @rate_limit(5, 60)
    def forgot_password():
        if request.method == 'POST':
            email = request.form.get('email', '').strip()
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
            
            with get_db() as conn:
                user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
                
            if user:
                raw_token = secrets.token_urlsafe(32)
                reset_token = hashlib.sha256(raw_token.encode()).hexdigest()
                expiry = (datetime.datetime.now() + datetime.timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
                
                with get_db() as conn:
                    conn.execute(
                        "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?",
                        (reset_token, expiry, user['id'])
                    )
                    reset_link = url_for('reset_password', token=raw_token, _external=True)
                    conn.execute(
                        "INSERT INTO mail_logs (email_to, subject, body, link) VALUES (?, ?, ?, ?)",
                        (email, "Password Reset Link - LoveEdit Studio", f"Reset your password here: {reset_link}", reset_link)
                    )
                    conn.execute(
                        "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, 'Password Reset Requested', ?, ?)",
                        (user['id'], user['username'], ip, f"Reset Token Expiry: {expiry}")
                    )
                    conn.commit()
                    
            # To avoid email enumeration attacks, always flash success
            flash("If that email address is registered, a password recovery link has been dispatched.", "success")
            return redirect(url_for('login'))
                
        return render_template('forgot_password.html', active_page='login')

    @app.route('/reset-password/<token>', methods=['GET', 'POST'])
    @rate_limit(5, 60)
    def reset_password(token):
        hashed_token = hashlib.sha256(token.encode()).hexdigest()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with get_db() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?", 
                (hashed_token, now_str)
            ).fetchone()
            
        if not user:
            with get_db() as conn:
                expired_user = conn.execute("SELECT * FROM users WHERE reset_token = ?", (hashed_token,)).fetchone()
            if expired_user:
                flash("This password reset token has expired. Please request a new link.", "error")
            else:
                flash("Invalid password reset token.", "error")
            return redirect(url_for('forgot_password'))
            
        if request.method == 'POST':
            password = request.form.get('password', '').strip()
            confirm_password = request.form.get('confirm_password', '').strip()
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)
            if ip and ',' in ip:
                ip = ip.split(',')[0].strip()
            
            if not password:
                flash("Password is required.", "error")
                return redirect(url_for('reset_password', token=token))
                
            if password != confirm_password:
                flash("Passwords do not match.", "error")
                return redirect(url_for('reset_password', token=token))
                
            hashed_password = generate_password_hash(password)
            
            with get_db() as conn:
                conn.execute(
                    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL, session_token = NULL WHERE id = ?",
                    (hashed_password, user['id'])
                )
                conn.execute(
                    "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, 'Password Reset Completed', ?, 'Success')",
                    (user['id'], user['username'], ip)
                )
                conn.commit()
                
            flash("Password reset successfully! Please sign in with your new credentials.", "success")
            return redirect(url_for('login'))
            
        return render_template('reset_password.html', token=token, active_page='login')

    @app.route('/oauth/<provider>')
    def oauth_mock(provider):
        if provider not in ['google', 'github']:
            flash("OAuth provider not supported.", "error")
            return redirect(url_for('login'))
        return render_template('oauth_mock.html', provider=provider)

    @app.route('/oauth/callback', methods=['POST'])
    def oauth_callback():
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
        provider = request.form.get('provider')
        oauth_id = request.form.get('oauth_id', '').strip()
        email = request.form.get('email', '').strip()
        name = request.form.get('name', '').strip()
        
        if not provider or not email or not oauth_id:
            flash("OAuth callback parameters missing.", "error")
            return redirect(url_for('login'))
            
        username = name.lower().replace(' ', '_') if name else email.split('@')[0]
        username = ''.join(c for c in username if c.isalnum() or c == '_')
        
        with get_db() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE (oauth_provider = ? AND oauth_id = ?) OR email = ?",
                (provider, oauth_id, email)
            ).fetchone()
            
        if user:
            with get_db() as conn:
                conn.execute(
                    "UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?",
                    (provider, oauth_id, user['id'])
                )
                conn.commit()
            logged_user = user
        else:
            random_pwd = uuid.uuid4().hex
            hashed_password = generate_password_hash(random_pwd)
            
            original_username = username
            counter = 1
            with get_db() as conn:
                while conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
                    username = f"{original_username}_{counter}"
                    counter += 1
                    
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """INSERT INTO users 
                       (username, email, password_hash, oauth_provider, oauth_id) 
                       VALUES (?, ?, ?, ?, ?)""",
                    (username, email, hashed_password, provider, oauth_id)
                )
                new_id = cursor.lastrowid
                
                conn.execute(
                    "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                    (new_id, username, f"Registered via {provider.capitalize()}", ip, "Success")
                )
                conn.commit()
                
            with get_db() as conn:
                logged_user = conn.execute("SELECT * FROM users WHERE id = ?", (new_id,)).fetchone()
                
        session['user_id'] = logged_user['id']
        session['username'] = logged_user['username']
        
        with get_db() as conn:
            conn.execute(
                "INSERT INTO activity_logs (user_id, username, action, ip_address, details) VALUES (?, ?, ?, ?, ?)",
                (logged_user['id'], logged_user['username'], f"Logged in via {provider.capitalize()}", ip, "Success")
            )
            conn.commit()
            
        flash(f"Logged in successfully via {provider.capitalize()} as {logged_user['username']}!", "success")
        return redirect(url_for('dashboard'))
