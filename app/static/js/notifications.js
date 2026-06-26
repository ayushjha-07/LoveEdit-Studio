/**
 * LoveEdit Studio - Interactive Notification Center Controller
 * Manages the premium glassmorphic dropdown tray, category filtering,
 * real-time polling, and AJAX updates for user alerts.
 */

document.addEventListener('DOMContentLoaded', () => {
    const bellBtn = document.getElementById('notification-bell-btn');
    const dropdown = document.getElementById('notification-dropdown');
    const itemsList = document.getElementById('notification-items-list');
    const unreadBadge = document.getElementById('notification-unread-badge');
    const summaryText = document.getElementById('notification-summary-text');
    const markAllReadBtn = document.getElementById('btn-mark-all-read');
    const clearAllBtn = document.getElementById('btn-clear-all-notif');
    const filterBtns = document.querySelectorAll('.notif-filter-btn');

    if (!bellBtn || !dropdown) {
        return; // Exit if notification elements are not present (e.g. user not logged in)
    }

    let localNotifications = [];
    let activeFilter = 'all';
    let pollInterval = null;

    // Type-specific styles for premium look & feel matching design system
    const typeStyles = {
        generation: {
            bg: 'rgba(229, 193, 88, 0.12)',
            color: '#e5c158',
            icon: 'fas fa-magic',
            borderColor: 'rgba(229, 193, 88, 0.2)'
        },
        subscription: {
            bg: 'rgba(255, 241, 197, 0.12)',
            color: '#fff1c5',
            icon: 'fas fa-crown',
            borderColor: 'rgba(255, 241, 197, 0.2)'
        },
        system: {
            bg: 'rgba(0, 180, 216, 0.12)',
            color: '#00b4d8',
            icon: 'fas fa-info-circle',
            borderColor: 'rgba(0, 180, 216, 0.2)'
        },
        promo: {
            bg: 'rgba(255, 133, 133, 0.12)',
            color: '#ff8585',
            icon: 'fas fa-tag',
            borderColor: 'rgba(255, 133, 133, 0.2)'
        },
        upload: {
            bg: 'rgba(255, 193, 7, 0.12)',
            color: '#ffc107',
            icon: 'fas fa-cloud-upload-alt',
            borderColor: 'rgba(255, 193, 7, 0.2)'
        },
        default: {
            bg: 'rgba(255, 255, 255, 0.08)',
            color: '#9c9993',
            icon: 'fas fa-bell',
            borderColor: 'rgba(255, 255, 255, 0.12)'
        }
    };

    // Helper: HTML escape to prevent XSS injection from malicious payloads
    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // Helper: Safely parse SQLite datetime strings (YYYY-MM-DD HH:MM:SS) in a cross-browser way
    function parseDate(dateStr) {
        let date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            const parts = dateStr.split(/[- :]/);
            if (parts.length >= 5) {
                date = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5] || 0);
            }
        }
        return date;
    }

    // Helper: Calculate relative time with robustness against UTC vs local clock discrepancies
    function timeAgo(dateString) {
        const date = parseDate(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        const now = new Date();
        let diffMs = now.getTime() - date.getTime();
        
        // Handle timezone discrepancies if server returns UTC and client compares to local
        if (diffMs < 0) {
            const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
            const diffMsUTC = utcNow.getTime() - date.getTime();
            if (Math.abs(diffMsUTC) < Math.abs(diffMs)) {
                diffMs = diffMsUTC;
            }
        }
        
        if (diffMs < 0) {
            return 'Just now';
        }
        
        const seconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (seconds < 60) {
            return 'Just now';
        } else if (minutes < 60) {
            return `${minutes}m ago`;
        } else if (hours < 24) {
            return `${hours}h ago`;
        } else if (days < 30) {
            return `${days}d ago`;
        } else {
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
    }

    // Dynamic rendering of the notifications dropdown list based on current active filter
    function renderNotifications() {
        if (!itemsList) return;

        // Filter the cached notifications in-memory
        const filtered = localNotifications.filter(notif => {
            if (activeFilter === 'all') return true;
            return notif.type === activeFilter;
        });

        if (filtered.length === 0) {
            itemsList.innerHTML = `
                <div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
                    <i class="far fa-bell" style="font-size: 1.6rem; margin-bottom: 0.6rem; display: block; opacity: 0.4; color: var(--gold-primary);"></i>
                    No ${activeFilter !== 'all' ? activeFilter + ' ' : ''}notifications
                </div>
            `;
            return;
        }

        itemsList.innerHTML = filtered.map(notif => {
            const styles = typeStyles[notif.type] || typeStyles.default;
            const unreadClass = notif.is_read ? '' : 'unread';
            
            // Render mark-as-read check button only if notification is currently unread
            const markReadButton = notif.is_read ? '' : `
                <button type="button" class="btn-notif-action mark-read-btn" data-id="${notif.id}" title="Mark as read">
                    <i class="fas fa-check"></i>
                </button>
            `;

            return `
                <div class="notif-item ${unreadClass}" data-id="${notif.id}">
                    <div class="notif-icon-circle" style="background: ${styles.bg}; color: ${styles.color}; border-color: ${styles.borderColor};">
                        <i class="${styles.icon}"></i>
                    </div>
                    <div class="notif-content-area">
                        <h6 class="notif-item-title">${escapeHTML(notif.title)}</h6>
                        <p class="notif-item-msg">${escapeHTML(notif.message)}</p>
                        <span class="notif-item-time">${timeAgo(notif.created_at)}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.35rem; align-self: center;">
                        ${markReadButton}
                        <button type="button" class="btn-notif-action delete-btn" data-id="${notif.id}" title="Clear notification">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Synchronize UI Badges and Counter text
    function updateBadgeAndSummary(unreadCount) {
        if (unreadBadge) {
            if (unreadCount > 0) {
                unreadBadge.textContent = unreadCount;
                unreadBadge.style.display = 'flex';
                // Trigger subtle pulse animation on badge updates
                unreadBadge.classList.add('pulse-glow');
            } else {
                unreadBadge.style.display = 'none';
                unreadBadge.classList.remove('pulse-glow');
            }
        }

        if (summaryText) {
            if (unreadCount > 0) {
                summaryText.textContent = `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}`;
                summaryText.style.color = 'var(--gold-primary)';
            } else {
                summaryText.textContent = 'All caught up';
                summaryText.style.color = 'var(--text-muted)';
            }
        }
    }

    // Core Fetch Dispatcher
    function fetchNotifications(forceRedraw = false) {
        fetch('/api/notifications')
            .then(res => {
                if (!res.ok) throw new Error('Failed to retrieve notifications');
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    const prevCount = localNotifications.length;
                    const prevUnread = (localNotifications.filter(n => !n.is_read)).length;

                    // Deep-compare local cache to prevent redraw jitter
                    const hasChanged = JSON.stringify(data.notifications) !== JSON.stringify(localNotifications);
                    
                    if (hasChanged || forceRedraw) {
                        localNotifications = data.notifications;
                        renderNotifications();
                        updateBadgeAndSummary(data.unread_count);

                        // Trigger toast notification if a new alert was received during active session
                        if (prevCount > 0 && data.notifications.length > prevCount) {
                            const newNotifs = data.notifications.filter(n => !localNotifications.some(old => old.id === n.id));
                            if (newNotifs.length > 0 && typeof window.showToast === 'function') {
                                window.showToast(`New Notification: ${newNotifs[0].title}`, 'info');
                            }
                        }
                    } else if (data.unread_count !== prevUnread) {
                        // Keep counts sync'd if unread states changed elsewhere
                        updateBadgeAndSummary(data.unread_count);
                    }
                }
            })
            .catch(err => {
                console.error('[Notification Polling Error]:', err);
            });
    }

    // Toggle Dropdown Action
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = dropdown.classList.contains('active');
        
        // Close other potential dropdowns here if any
        
        if (!isActive) {
            dropdown.classList.add('active');
            // Re-fetch immediately on open to ensure fresh timestamps
            fetchNotifications(true);
        } else {
            dropdown.classList.remove('active');
        }
    });

    // Close on outside clicks
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Handle filter pills clicks
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderNotifications();
        });
    });

    // Event delegation: mark single read & delete single notification
    if (itemsList) {
        itemsList.addEventListener('click', (e) => {
            // Locate nearest action buttons
            const markReadBtn = e.target.closest('.mark-read-btn');
            const deleteBtn = e.target.closest('.delete-btn');

            if (markReadBtn) {
                e.stopPropagation();
                const notifId = parseInt(markReadBtn.dataset.id, 10);
                
                // Optimistically update UI local memory
                const found = localNotifications.find(n => n.id === notifId);
                if (found) {
                    found.is_read = true;
                    renderNotifications();
                    const currentUnread = localNotifications.filter(n => !n.is_read).length;
                    updateBadgeAndSummary(currentUnread);
                }

                // Dispatch AJAX
                fetch('/api/notifications/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notification_id: notifId })
                })
                .then(res => res.json())
                .then(data => {
                    if (!data.success) {
                        fetchNotifications(true); // Rollback / sync on error
                    }
                })
                .catch(() => {
                    fetchNotifications(true);
                });
            }

            if (deleteBtn) {
                e.stopPropagation();
                const notifId = parseInt(deleteBtn.dataset.id, 10);
                const itemContainer = deleteBtn.closest('.notif-item');

                // Animate removal first for premium premium micro-interaction
                if (itemContainer) {
                    itemContainer.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    itemContainer.style.opacity = '0';
                    itemContainer.style.transform = 'translateX(25px)';
                    itemContainer.style.maxHeight = '0px';
                    itemContainer.style.padding = '0px';
                    itemContainer.style.borderBottom = 'none';
                }

                setTimeout(() => {
                    // Update cache
                    localNotifications = localNotifications.filter(n => n.id !== notifId);
                    renderNotifications();
                    const currentUnread = localNotifications.filter(n => !n.is_read).length;
                    updateBadgeAndSummary(currentUnread);

                    // Dispatch API clear
                    fetch('/api/notifications/clear', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notification_id: notifId })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            if (typeof window.showToast === 'function') {
                                window.showToast('Notification cleared', 'success');
                            }
                        } else {
                            fetchNotifications(true); // Sync on error
                        }
                    })
                    .catch(() => {
                        fetchNotifications(true);
                    });
                }, 280);
            }
        });
    }

    // Mark all notifications as read
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const unreadCount = localNotifications.filter(n => !n.is_read).length;
            if (unreadCount === 0) return;

            // Optimistic update
            localNotifications.forEach(n => n.is_read = true);
            renderNotifications();
            updateBadgeAndSummary(0);

            fetch('/api/notifications/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notification_id: 'all' })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (typeof window.showToast === 'function') {
                        window.showToast('All notifications marked as read', 'success');
                    }
                } else {
                    fetchNotifications(true);
                }
            })
            .catch(() => {
                fetchNotifications(true);
            });
        });
    }

    // Clear/delete all notifications
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (localNotifications.length === 0) return;

            if (confirm('Are you sure you want to clear all notifications?')) {
                // Optimistic clear
                localNotifications = [];
                renderNotifications();
                updateBadgeAndSummary(0);

                fetch('/api/notifications/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notification_id: 'all' })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        if (typeof window.showToast === 'function') {
                            window.showToast('All notifications cleared', 'success');
                        }
                    } else {
                        fetchNotifications(true);
                    }
                })
                .catch(() => {
                    fetchNotifications(true);
                });
            }
        });
    }

    // Load notifications on bootstrap
    fetchNotifications(true);

    // Setup polling: refresh every 10 seconds for real-time updates
    pollInterval = setInterval(() => {
        fetchNotifications();
    }, 10000);

    // Cleanup interval on page unload (optional but good practice)
    window.addEventListener('beforeunload', () => {
        if (pollInterval) {
            clearInterval(pollInterval);
        }
    });
});
