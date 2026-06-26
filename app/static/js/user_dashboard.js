document.addEventListener('DOMContentLoaded', () => {
    initDashboardTabs();
    initSubscriptionManager();
    initBackdropLibrary();
    initSettingsManager();
    initCreationsManager();
    initDashboardStyles();
    initActivityTimeline();
});

// 1. Dashboard Tab Switching Logic
function initDashboardTabs() {
    const menuItems = document.querySelectorAll('.dashboard-sidebar .menu-item');
    const panels = document.querySelectorAll('.dashboard-content-panel .tab-panel');
    const tabSwitchButtons = document.querySelectorAll('.btn-switch-tab');

    function switchTab(tabId) {
        // Update menu items active class
        menuItems.forEach(item => {
            if (item.dataset.tab === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Toggle active panels
        panels.forEach(panel => {
            if (panel.id === `tab-${tabId}`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        // Set URL hash or session cache if wanted (optional)
        window.location.hash = tabId;
    }

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            switchTab(item.dataset.tab);
        });
    });

    tabSwitchButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.target);
        });
    });

    // Check hash on load to jump directly to tab
    const initialHash = window.location.hash.substring(1);
    const validTabs = ['overview', 'creations', 'subscription', 'styles', 'backdrops', 'activity', 'settings'];
    if (initialHash && validTabs.includes(initialHash)) {
        switchTab(initialHash);
    }
}

// 2. Subscription upgrades & simulated payment modal
function initSubscriptionManager() {
    const upgradeButtons = document.querySelectorAll('.btn-upgrade');
    const checkoutModal = document.getElementById('checkout-payment-modal');
    const closeCheckout = document.querySelector('.btn-close-checkout');
    const checkoutForm = document.getElementById('checkout-simulated-form');

    const checkoutPlanName = document.getElementById('checkout-plan-name');
    const checkoutPlanPrice = document.getElementById('checkout-plan-price');
    const checkoutPlanTier = document.getElementById('checkout-plan-tier');

    if (!checkoutModal) return;

    const planDetails = {
        'Basic': { name: 'Basic Free', price: '$0.00 / month' },
        'Premium': { name: 'Premium Pro', price: '$9.00 / month' },
        'VIP': { name: 'VIP Imperial', price: '$29.00 / month' }
    };

    upgradeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const plan = btn.dataset.plan;
            
            // If downgrading to basic or switching to Basic directly without checkout modal
            if (plan === 'Basic') {
                if (confirm('Are you sure you want to downgrade your plan to Basic? You will lose custom backdrop library storage.')) {
                    processSubscriptionUpdate('Basic');
                }
                return;
            }

            // Open Checkout Modal for Premium / VIP
            checkoutPlanTier.value = plan;
            checkoutPlanName.innerText = planDetails[plan].name;
            checkoutPlanPrice.innerText = planDetails[plan].price;
            checkoutModal.style.display = 'flex';
        });
    });

    if (closeCheckout) {
        closeCheckout.addEventListener('click', () => {
            checkoutModal.style.display = 'none';
        });
    }

    // Click outside modal content closes it
    checkoutModal.addEventListener('click', (e) => {
        if (e.target === checkoutModal) {
            checkoutModal.style.display = 'none';
        }
    });

    let paymentMethod = 'card';
    const payCardBtn = document.getElementById('pay-card-btn');
    const payUpiBtn = document.getElementById('pay-upi-btn');
    const cardFields = document.getElementById('card-payment-fields');
    const upiFields = document.getElementById('upi-payment-fields');

    if (payCardBtn && payUpiBtn && cardFields && upiFields) {
        payCardBtn.addEventListener('click', () => {
            paymentMethod = 'card';
            payCardBtn.classList.add('active');
            payCardBtn.style.border = '1px solid var(--gold-primary)';
            payCardBtn.style.background = 'rgba(229,193,88,0.1)';
            payCardBtn.style.color = 'var(--gold-primary)';
            
            payUpiBtn.classList.remove('active');
            payUpiBtn.style.border = '1px solid var(--border-color)';
            payUpiBtn.style.background = 'none';
            payUpiBtn.style.color = 'var(--text-muted)';
            
            cardFields.style.display = 'block';
            upiFields.style.display = 'none';
            
            document.getElementById('checkout-cardholder').required = true;
            document.getElementById('checkout-cardnumber').required = true;
            document.getElementById('checkout-expiry').required = true;
            document.getElementById('checkout-cvc').required = true;
        });

        payUpiBtn.addEventListener('click', () => {
            paymentMethod = 'upi';
            payUpiBtn.classList.add('active');
            payUpiBtn.style.border = '1px solid var(--gold-primary)';
            payUpiBtn.style.background = 'rgba(229,193,88,0.1)';
            payUpiBtn.style.color = 'var(--gold-primary)';
            
            payCardBtn.classList.remove('active');
            payCardBtn.style.border = '1px solid var(--border-color)';
            payCardBtn.style.background = 'none';
            payCardBtn.style.color = 'var(--text-muted)';
            
            cardFields.style.display = 'none';
            upiFields.style.display = 'flex';
            
            document.getElementById('checkout-cardholder').required = false;
            document.getElementById('checkout-cardnumber').required = false;
            document.getElementById('checkout-expiry').required = false;
            document.getElementById('checkout-cvc').required = false;
        });
    }

    if (checkoutForm) {
        // Form field event listeners for auto-formatting
        const cardEl = document.getElementById('checkout-cardnumber');
        if (cardEl) {
            cardEl.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
                let parts = [];
                for (let i = 0, len = value.length; i < len; i += 4) {
                    parts.push(value.substring(i, i + 4));
                }
                e.target.value = parts.length > 0 ? parts.join(' ') : value;
            });
        }

        const expiryEl = document.getElementById('checkout-expiry');
        if (expiryEl) {
            expiryEl.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
                if (value.length > 2) {
                    e.target.value = value.substring(0, 2) + ' / ' + value.substring(2, 4);
                } else {
                    e.target.value = value;
                }
            });
        }

        checkoutForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            if (paymentMethod === 'upi') {
                const selectedPlan = checkoutPlanTier.value;
                const submitBtn = checkoutForm.querySelector('button[type="submit"]');

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = 'Verifying UPI Payment... <i class="fas fa-spinner fa-spin"></i>';
                }

                setTimeout(() => {
                    processSubscriptionUpdate(selectedPlan, () => {
                        checkoutModal.style.display = 'none';
                        checkoutForm.reset();
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = 'Authorize Payment & Activate <i class="fas fa-lock"></i>';
                        }
                    });
                }, 1500);
                return;
            }
            
            const nameEl = document.getElementById('checkout-cardholder');
            const cardEl = document.getElementById('checkout-cardnumber');
            const expiryEl = document.getElementById('checkout-expiry');
            const cvcEl = document.getElementById('checkout-cvc');
            const errorAlert = document.getElementById('checkout-error-alert');
            const errorText = document.getElementById('checkout-error-text');

            // clear all errors first
            const inputs = [nameEl, cardEl, expiryEl, cvcEl];
            inputs.forEach(el => {
                if (el) {
                    el.classList.remove('is-invalid', 'shake-error');
                    const errSpan = document.getElementById(`${el.id}-error`);
                    if (errSpan) {
                        errSpan.style.display = 'none';
                        errSpan.innerText = '';
                    }
                }
            });
            if (errorAlert) errorAlert.style.display = 'none';

            let hasErrors = false;

            // Validate Cardholder Name
            if (!nameEl || !nameEl.value || nameEl.value.trim().length < 3) {
                if (nameEl) nameEl.classList.add('is-invalid', 'shake-error');
                const errSpan = document.getElementById('checkout-cardholder-error');
                if (errSpan) {
                    errSpan.innerText = 'Cardholder name must be at least 3 characters.';
                    errSpan.style.display = 'block';
                }
                hasErrors = true;
            }

            // Validate Card Number
            const cardRaw = cardEl ? cardEl.value.replace(/\s+/g, '') : '';
            if (!/^\d{13,19}$/.test(cardRaw)) {
                if (cardEl) cardEl.classList.add('is-invalid', 'shake-error');
                const errSpan = document.getElementById('checkout-cardnumber-error');
                if (errSpan) {
                    errSpan.innerText = 'Please enter a valid credit card number (13-19 digits).';
                    errSpan.style.display = 'block';
                }
                hasErrors = true;
            }

            // Validate Expiry Date (MM / YY)
            const expiryVal = expiryEl ? expiryEl.value.trim() : '';
            const expiryMatch = expiryVal.match(/^(0[1-9]|1[0-2])\s*\/\s*([0-9]{2})$/);
            if (!expiryMatch) {
                if (expiryEl) expiryEl.classList.add('is-invalid', 'shake-error');
                const errSpan = document.getElementById('checkout-expiry-error');
                if (errSpan) {
                    errSpan.innerText = 'Expiry must be in MM / YY format.';
                    errSpan.style.display = 'block';
                }
                hasErrors = true;
            } else {
                const expMonth = parseInt(expiryMatch[1], 10);
                const expYear = parseInt(expiryMatch[2], 10) + 2000;
                const now = new Date();
                const currentMonth = now.getMonth() + 1;
                const currentYear = now.getFullYear();
                if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
                    if (expiryEl) expiryEl.classList.add('is-invalid', 'shake-error');
                    const errSpan = document.getElementById('checkout-expiry-error');
                    if (errSpan) {
                        errSpan.innerText = 'This card is expired.';
                        errSpan.style.display = 'block';
                    }
                    hasErrors = true;
                }
            }

            // Validate CVC / CVV
            const cvcVal = cvcEl ? cvcEl.value.trim() : '';
            if (!/^\d{3,4}$/.test(cvcVal)) {
                if (cvcEl) cvcEl.classList.add('is-invalid', 'shake-error');
                const errSpan = document.getElementById('checkout-cvc-error');
                if (errSpan) {
                    errSpan.innerText = 'CVC must be 3 or 4 digits.';
                    errSpan.style.display = 'block';
                }
                hasErrors = true;
            }

            if (hasErrors) {
                // remove shake classes after animation
                setTimeout(() => {
                    inputs.forEach(el => { if (el) el.classList.remove('shake-error'); });
                }, 500);
                showToast('Please fix the highlighted billing errors.', 'error');
                return;
            }

            const selectedPlan = checkoutPlanTier.value;
            const submitBtn = checkoutForm.querySelector('button[type="submit"]');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = 'Activating Membership... <i class="fas fa-spinner fa-spin"></i>';
            }

            // Simulated Payment Decline check (card numbers ending in 9999)
            if (cardRaw.endsWith('9999')) {
                setTimeout(() => {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'Authorize Payment & Activate <i class="fas fa-lock"></i>';
                    }
                    if (cardEl) {
                        cardEl.classList.add('is-invalid', 'shake-error');
                        setTimeout(() => cardEl.classList.remove('shake-error'), 500);
                    }
                    if (errorAlert && errorText) {
                        errorText.innerText = 'Transaction Declined: Your card ending in 9999 has been declined by the card issuer. Please use another card to complete this upgrade.';
                        errorAlert.style.display = 'flex';
                    }
                    showToast('Transaction declined: Insufficient funds or card restriction (9999 simulation).', 'error');
                }, 1500);
                return;
            }

            // Simulate slight delay for authorization
            setTimeout(() => {
                processSubscriptionUpdate(selectedPlan, () => {
                    checkoutModal.style.display = 'none';
                    checkoutForm.reset();
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'Authorize Payment & Activate <i class="fas fa-lock"></i>';
                    }
                });
            }, 1500);
        });
    }

    function processSubscriptionUpdate(planTier, callback) {
        fetch('/api/user/update-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plan_tier: planTier })
        })
        .then(res => {
            if (!res.ok) throw new Error('Upgrade process failed.');
            return res.json();
        })
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                if (callback) callback();
                // Reload dashboard to update crowns, badges, lock displays, and transactions log
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                showToast('Upgrade Error: ' + data.message, 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('An unexpected error occurred during subscription update.', 'error');
        });
    }
}

// 3. Custom backdrop library management
function initBackdropLibrary() {
    const uploader = document.getElementById('backdrop-library-uploader');
    const fileInput = document.getElementById('backdrop-file-input');
    const gridContainer = document.getElementById('backdrop-grid-container');
    const noBackdropsMsg = document.getElementById('no-backdrops-msg');

    if (!uploader || !fileInput) return;

    // Trigger select click
    uploader.addEventListener('click', () => {
        fileInput.click();
    });

    // Drag-over hover states
    ['dragenter', 'dragover'].forEach(name => {
        uploader.addEventListener(name, (e) => {
            e.preventDefault();
            uploader.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        uploader.addEventListener(name, (e) => {
            e.preventDefault();
            uploader.classList.remove('drag-over');
        });
    });

    uploader.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleBackdropUpload(files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleBackdropUpload(fileInput.files[0]);
            fileInput.value = ''; // reset
        }
    });

    function handleBackdropUpload(file) {
        // Validate type & size
        if (file.size > 5 * 1024 * 1024) {
            showToast('File exceeds 5MB size limit.', 'error');
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            showToast('Format not supported. Use JPG, PNG, WEBP, or GIF.', 'error');
            return;
        }

        // Show a loader outline inside upload zone
        const originalContent = uploader.innerHTML;
        uploader.innerHTML = `
            <i class="fas fa-circle-notch fa-spin" style="font-size:2rem; color:var(--gold-primary);"></i>
            <span style="font-size:0.9rem;">Uploading backdrop to assets vault...</span>
        `;
        uploader.style.pointerEvents = 'none';

        const formData = new FormData();
        formData.append('file', file);

        fetch('/api/user/custom-backgrounds', {
            method: 'POST',
            body: formData
        })
        .then(res => {
            uploader.innerHTML = originalContent;
            uploader.style.pointerEvents = 'auto';
            if (!res.ok) throw new Error('Upload request failed.');
            return res.json();
        })
        .then(data => {
            if (data.success) {
                // Append card to grid dynamically
                const bg = data.background;
                const card = document.createElement('div');
                card.className = 'backdrop-asset-card glass-panel';
                card.dataset.id = bg.id;
                card.style.aspectRatio = '1/1';
                card.style.position = 'relative';
                card.style.borderRadius = '8px';
                card.style.overflow = 'hidden';
                card.style.display = 'flex';
                card.style.justifyContent = 'center';
                card.style.alignItems = 'center';

                card.innerHTML = `
                    <img src="${bg.url}" alt="${bg.original_name}" style="width: 100%; height: 100%; object-fit: cover;">
                    <div class="backdrop-card-overlay" style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.8); padding: 0.4rem; font-size: 0.6rem; color: var(--text-muted); text-align: center; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                        ${bg.original_name}
                    </div>
                    <button class="btn-delete-backdrop" data-id="${bg.id}" title="Delete backdrop" style="position: absolute; top: 6px; right: 6px; border: none; background: rgba(10,10,10,0.8); color: #ff8585; width: 22px; height: 22px; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 0.65rem; border: 1px solid rgba(255,255,255,0.08);">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;

                // Add delete listener to the new button
                card.querySelector('.btn-delete-backdrop').addEventListener('click', () => {
                    deleteBackdrop(bg.id, card);
                });

                if (noBackdropsMsg) noBackdropsMsg.style.display = 'none';
                gridContainer.insertBefore(card, gridContainer.firstChild);
            } else {
                showToast('Upload Error: ' + data.message, 'error');
            }
        })
        .catch(err => {
            uploader.innerHTML = originalContent;
            uploader.style.pointerEvents = 'auto';
            console.error(err);
            showToast('Could not upload backdrop to library.', 'error');
        });
    }

    // Attach deletion to existing backdrops in library
    document.querySelectorAll('.btn-delete-backdrop').forEach(btn => {
        btn.addEventListener('click', () => {
            const bgId = btn.dataset.id;
            const card = btn.closest('.backdrop-asset-card');
            deleteBackdrop(bgId, card);
        });
    });

    function deleteBackdrop(bgId, card) {
        if (!confirm('Are you sure you want to delete this backdrop from your library? It will no longer show in the studio.')) return;

        fetch(`/api/user/custom-backgrounds/${bgId}`, {
            method: 'DELETE'
        })
        .then(res => {
            if (!res.ok) throw new Error('Deletion failed.');
            return res.json();
        })
        .then(data => {
            if (data.success) {
                card.remove();
                
                // Show empty message if zero backdrops
                const currentBackdrops = gridContainer.querySelectorAll('.backdrop-asset-card');
                if (currentBackdrops.length === 0 && noBackdropsMsg) {
                    noBackdropsMsg.style.display = 'block';
                }
            } else {
                showToast('Delete failed: ' + data.message, 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('Error occurred while deleting backdrop.', 'error');
        });
    }
}

// 4. Profiles & Password settings updates
function initSettingsManager() {
    const settingsForm = document.getElementById('settings-profile-form');
    const newPwdInput = document.getElementById('settings-new-password');
    const confirmPwdInput = document.getElementById('settings-confirm-password');
    const gaugeContainer = document.getElementById('password-strength-container');
    const gaugeFill = document.getElementById('password-gauge-fill');
    const gaugeLabel = document.getElementById('password-gauge-label');

    if (!settingsForm) return;

    // Password strength checking
    if (newPwdInput) {
        newPwdInput.addEventListener('input', () => {
            const val = newPwdInput.value;
            if (!val) {
                gaugeContainer.style.display = 'none';
                return;
            }

            gaugeContainer.style.display = 'block';
            let score = 0;
            if (val.length >= 6) score++;
            if (val.length >= 10) score++;
            if (/[0-9]/.test(val)) score++;
            if (/[^A-Za-z0-9]/.test(val)) score++;

            // Draw gauge based on score
            if (score <= 1) {
                gaugeFill.style.width = '25%';
                gaugeFill.style.background = '#f44336'; // Red
                gaugeLabel.innerText = 'Weak';
                gaugeLabel.style.color = '#f44336';
            } else if (score === 2 || score === 3) {
                gaugeFill.style.width = '60%';
                gaugeFill.style.background = '#ff9800'; // Orange
                gaugeLabel.innerText = 'Medium';
                gaugeLabel.style.color = '#ff9800';
            } else {
                gaugeFill.style.width = '100%';
                gaugeFill.style.background = 'var(--gold-primary)'; // Gold
                gaugeLabel.innerText = 'Strong';
                gaugeLabel.style.color = 'var(--gold-primary)';
            }
        });
    }

    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = document.getElementById('settings-email').value.strip ? document.getElementById('settings-email').value.strip() : document.getElementById('settings-email').value;
        const oldPassword = document.getElementById('settings-old-password').value;
        const newPassword = newPwdInput.value;
        const confirmPassword = confirmPwdInput.value;
        const themePreference = settingsForm.querySelector('input[name="theme_preference"]:checked').value;

        // Validation checks
        if (newPassword) {
            if (newPassword.length < 6) {
                showToast('New password must be at least 6 characters.', 'warning');
                return;
            }
            if (newPassword !== confirmPassword) {
                showToast('Confirm password does not match new password.', 'warning');
                return;
            }
            if (!oldPassword) {
                showToast('Current password is required to change password settings.', 'warning');
                return;
            }
        }

        const submitBtn = settingsForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Saving settings... <i class="fas fa-spinner fa-spin"></i>';
        }

        fetch('/api/user/update-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                old_password: oldPassword,
                new_password: newPassword,
                theme_preference: themePreference
            })
        })
        .then(res => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Save Account Settings <i class="fas fa-save"></i>';
            }
            if (!res.ok) {
                return res.json().then(data => {
                    throw new Error(data.message || 'Update request failed.');
                });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                settingsForm.reset();
                if (gaugeContainer) gaugeContainer.style.display = 'none';
                
                // Switch light/dark class on body for interactive preview
                if (themePreference === 'light') {
                    document.body.classList.add('light-theme');
                } else {
                    document.body.classList.remove('light-theme');
                }
            } else {
                showToast('Settings Error: ' + data.message, 'error');
            }
        })
        .catch(err => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Save Account Settings <i class="fas fa-save"></i>';
            }
            showToast(err.message || 'An unexpected error occurred.', 'error');
        });
    });
}

// 5. Creations list manager (deletions)
function initCreationsManager() {
    document.querySelectorAll('.btn-delete-project').forEach(btn => {
        btn.addEventListener('click', () => {
            const projectId = btn.dataset.id;
            const card = btn.closest('.gallery-card');

            if (!confirm('Are you sure you want to permanently delete this creation? This cannot be undone.')) return;

            fetch(`/generate/delete/${projectId}`, {
                method: 'POST'
            })
            .then(res => {
                if (!res.ok) throw new Error('Deletion failed.');
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    card.remove();
                    
                    // Check if gallery is empty
                    const galleryGrid = document.querySelector('#tab-creations .gallery-grid');
                    if (galleryGrid && galleryGrid.querySelectorAll('.gallery-card').length === 0) {
                        const tabCreations = document.getElementById('tab-creations');
                        if (tabCreations) {
                            tabCreations.innerHTML = `
                                <div class="glass-panel panel-header" style="margin-bottom: 1.5rem; padding: 1.5rem;">
                                    <h2 class="panel-main-title"><i class="fas fa-magic" style="color: var(--gold-primary); margin-right: 0.5rem;"></i> My Creations</h2>
                                </div>
                                <div class="glass-panel" style="padding: 4rem; text-align: center;">
                                    <i class="fas fa-heart-broken" style="font-size: 3rem; color: var(--border-color); margin-bottom: 1.5rem;"></i>
                                    <h3>No Masterpieces Yet</h3>
                                    <p style="color: var(--text-muted); margin-bottom: 2rem;">Ready to create your first stunning AI couple artwork?</p>
                                    <a href="/dashboard" class="btn-premium">Go to Studio <i class="fas fa-magic"></i></a>
                                </div>
                            `;
                        }
                    }
                } else {
                    showToast('Delete failed: ' + data.message, 'error');
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Error occurred while deleting creation.', 'error');
            });
        });
    });
}

// 6. Favorites Style panel management
function initDashboardStyles() {
    const favoriteStylesButtons = document.querySelectorAll('.btn-toggle-favorite-dashboard');
    const noFavStylesMsg = document.getElementById('no-fav-styles-msg');
    
    favoriteStylesButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const styleId = btn.dataset.id;
            const card = btn.closest('.fav-style-card');
            
            fetch('/api/styles/favorite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ style_id: styleId })
            })
            .then(res => {
                if (!res.ok) throw new Error('Failed to toggle favorite');
                return res.json();
            })
            .then(data => {
                if (data.success && !data.favorited) {
                    // Remove card dynamically from Saved Styles view
                    card.remove();
                    
                    // Check if styles grid is empty
                    const stylesGrid = document.querySelector('.fav-styles-grid');
                    const activeCards = stylesGrid.querySelectorAll('.fav-style-card[style*="display: flex"], .fav-style-card:not([style*="display: none"])');
                    
                    if (activeCards.length === 0 && noFavStylesMsg) {
                        noFavStylesMsg.style.display = 'block';
                    }
                }
            })
            .catch(err => {
                console.error(err);
                showToast('Could not update favorite style.', 'error');
            });
        });
    });
}

// 7. User Activity Timeline Filter & Search
function initActivityTimeline() {
    const searchInput = document.getElementById('activity-search-input');
    const categoryFilter = document.getElementById('activity-category-filter');
    const timelineCards = document.querySelectorAll('#activity-timeline-list .timeline-item-card');
    const noResults = document.getElementById('no-activities-found');

    if (!searchInput || !categoryFilter) return;

    function filterActivities() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedCategory = categoryFilter.value;
        let visibleCount = 0;

        timelineCards.forEach(card => {
            const cardCategory = card.dataset.category;
            const searchText = card.dataset.searchText || '';
            
            const matchesCategory = (selectedCategory === 'all' || cardCategory === selectedCategory);
            const matchesSearch = (query === '' || searchText.includes(query));

            if (matchesCategory && matchesSearch) {
                card.style.display = 'flex';
                visibleCount++;
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            } else {
                card.style.display = 'none';
            }
        });

        if (noResults) {
            noResults.style.display = (visibleCount === 0 && timelineCards.length > 0) ? 'block' : 'none';
        }
        
        const timelineContainer = document.getElementById('activity-timeline-list');
        if (timelineContainer) {
            if (visibleCount === 0) {
                timelineContainer.classList.add('empty-timeline');
            } else {
                timelineContainer.classList.remove('empty-timeline');
            }
        }
    }

    searchInput.addEventListener('input', filterActivities);
    categoryFilter.addEventListener('change', filterActivities);
}

