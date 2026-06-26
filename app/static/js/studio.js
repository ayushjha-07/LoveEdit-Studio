document.addEventListener('DOMContentLoaded', () => {
    // Initialize studio creative canvas modules
    initStudioTabs();
    initStudioUploaders();
    initStudioSettings();
    initAmbientSynthesizer();
    loadGenerationHistory();
    initStyleRecommendations();
});

// Initialize all before/after sliders (generic setup used by viewport update)
function initBeforeAfterSliders() {
    const sliders = document.querySelectorAll('.slider-wrapper');
    
    sliders.forEach(slider => {
        const afterImg = slider.querySelector('.slider-after');
        const bar = slider.querySelector('.slider-bar');
        
        if (!afterImg || !bar) return;

        let isDragging = false;

        function updateSlider(percent) {
            percent = Math.max(0, Math.min(100, percent));
            bar.style.left = `${percent}%`;
            afterImg.style.clipPath = `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0% 100%)`;
        }

        // Mouse Events
        bar.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.preventDefault();
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = slider.getBoundingClientRect();
            const posX = e.clientX - rect.left;
            const percent = (posX / rect.width) * 100;
            updateSlider(percent);
        });

        // Touch Events for Mobile
        bar.addEventListener('touchstart', (e) => {
            isDragging = true;
        }, { passive: true });

        window.addEventListener('touchend', () => {
            isDragging = false;
        });

        window.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const rect = slider.getBoundingClientRect();
            const touch = e.touches[0];
            const posX = touch.clientX - rect.left;
            const percent = (posX / rect.width) * 100;
            updateSlider(percent);
        });

        // Click to move directly
        slider.addEventListener('click', (e) => {
            if (e.target.closest('.slider-bar') || e.target.closest('.slider-handle')) return;
            const rect = slider.getBoundingClientRect();
            const posX = e.clientX - rect.left;
            const percent = (posX / rect.width) * 100;
            updateSlider(percent);
        });
    });
}

// Drag & Drop Image Uploaders handler
function initStudioUploaders() {
    const uploadCards = document.querySelectorAll('.upload-card');
    
    uploadCards.forEach(card => {
        const inputId = card.dataset.inputId;
        const fileInput = document.getElementById(inputId);
        
        if (!fileInput) return;
 
        // Click triggers file selection
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-remove-preview')) return;
            fileInput.click();
        });
 
        // Drag & drop handlers
        ['dragenter', 'dragover'].forEach(eventName => {
            card.addEventListener(eventName, (e) => {
                e.preventDefault();
                card.classList.add('drag-over');
            }, false);
        });
 
        ['dragleave', 'drop'].forEach(eventName => {
            card.addEventListener(eventName, (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
            }, false);
        });
 
        card.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                const file = files[0];
                
                // Validate size (max 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    showToast('File size exceeds the 5MB limit. Please upload a smaller image.', 'error');
                    return;
                }
                
                // Validate format type
                const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if (!allowedTypes.includes(file.type)) {
                    showToast('File format not supported. Please upload a JPEG, PNG, WEBP, or GIF image.', 'error');
                    return;
                }
                
                fileInput.files = files;
                handleFileSelect(fileInput, card);
            }
        });
 
        // Traditional File Select Handler
        fileInput.addEventListener('change', () => {
            handleFileSelect(fileInput, card);
        });
    });
}
 
// Display selected file preview in uploader zone
function handleFileSelect(fileInput, card) {
    const file = fileInput.files[0];
    if (!file) return;
 
    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('File size exceeds the 5MB limit. Please upload a smaller image.', 'error');
        fileInput.value = '';
        return;
    }
 
    // Validate format type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        showToast('File format not supported. Please upload a JPEG, PNG, WEBP, or GIF image.', 'error');
        fileInput.value = '';
        return;
    }
 
    const reader = new FileReader();
    reader.onload = (e) => {
        const existingOverlay = card.querySelector('.preview-overlay');
        if (existingOverlay) existingOverlay.remove();
 
        const overlay = document.createElement('div');
        overlay.className = 'preview-overlay';
        
        const img = document.createElement('img');
        img.src = e.target.result;
        overlay.appendChild(img);
 
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove-preview';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        
        removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            fileInput.value = '';
            overlay.remove();
        });
        
        overlay.appendChild(removeBtn);
        card.appendChild(overlay);
        
        // Dispatch change event to trigger other file listeners (like AI matchmaker)
        fileInput.dispatchEvent(new Event('change'));
    };
    reader.readAsDataURL(file);
}

// Interactivity of parameters, style selector and generation trigger
function initStudioSettings() {
    // Style selection highlighting
    const styleOptions = document.querySelectorAll('.style-option');
    const selectedStyleInput = document.getElementById('selected-style');
    
    // Dynamic integration of Favorite style stars and pre-selected style
    const favStyles = window.favStyles || [];
    const selectedStyleId = window.selectedStyle || 'cinematic';

    styleOptions.forEach(opt => {
        const styleId = opt.dataset.styleId;
        
        // 1. Pre-select style if it matches selectedStyleId
        if (styleId === selectedStyleId) {
            styleOptions.forEach(o => {
                o.classList.remove('selected');
                o.setAttribute('aria-checked', 'false');
            });
            opt.classList.add('selected');
            opt.setAttribute('aria-checked', 'true');
            if (selectedStyleInput) {
                selectedStyleInput.value = styleId;
            }
            
            // Scroll to the selected style in selector container
            setTimeout(() => {
                opt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 150);
        }

        // 2. Append favorite star toggle
        const isFav = favStyles.includes(styleId);
        const favBtn = document.createElement('button');
        favBtn.type = 'button';
        favBtn.className = `btn-toggle-fav-studio ${isFav ? 'favorited' : ''}`;
        favBtn.title = isFav ? 'Remove from Favorites' : 'Add to Favorites';
        favBtn.style.position = 'absolute';
        favBtn.style.top = '4px';
        favBtn.style.right = '4px';
        favBtn.style.background = 'rgba(10,10,10,0.7)';
        favBtn.style.border = '1px solid rgba(255,255,255,0.1)';
        favBtn.style.width = '20px';
        favBtn.style.height = '20px';
        favBtn.style.borderRadius = '50%';
        favBtn.style.color = isFav ? 'var(--gold-primary)' : 'var(--text-muted)';
        favBtn.style.cursor = 'pointer';
        favBtn.style.display = 'flex';
        favBtn.style.alignItems = 'center';
        favBtn.style.justifyContent = 'center';
        favBtn.style.fontSize = '0.55rem';
        favBtn.style.transition = 'all 0.2s';
        favBtn.style.zIndex = '10';
        favBtn.innerHTML = `<i class="${isFav ? 'fas' : 'far'} fa-star"></i>`;
        
        opt.style.position = 'relative';
        opt.appendChild(favBtn);

        // Click handler for favorite button
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
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
                if (data.success) {
                    const icon = favBtn.querySelector('i');
                    if (data.favorited) {
                        favBtn.classList.add('favorited');
                        favBtn.style.color = 'var(--gold-primary)';
                        icon.className = 'fas fa-star';
                        favBtn.title = 'Remove from Favorites';
                    } else {
                        favBtn.classList.remove('favorited');
                        favBtn.style.color = 'var(--text-muted)';
                        icon.className = 'far fa-star';
                        favBtn.title = 'Add to Favorites';
                    }
                }
            })
            .catch(err => {
                console.error(err);
            });
        });
    });

    styleOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            styleOptions.forEach(o => {
                o.classList.remove('selected');
                o.setAttribute('aria-checked', 'false');
            });
            opt.classList.add('selected');
            opt.setAttribute('aria-checked', 'true');
            if (selectedStyleInput) {
                selectedStyleInput.value = opt.dataset.styleId;
            }
            updateParamsSummary();
        });
    });

    // Search & Category Filtering Logic
    const searchInput = document.getElementById('style-search');
    const categoryTabs = document.querySelectorAll('.category-tab');
    
    function filterStyles() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const activeTab = document.querySelector('.category-tab.active');
        const category = activeTab ? activeTab.dataset.category : 'all';
        
        styleOptions.forEach(opt => {
            const matchesQuery = opt.dataset.styleName.includes(query) || opt.dataset.styleDesc.includes(query);
            const matchesCategory = (category === 'all') || (opt.dataset.styleCategory === category);
            
            if (matchesQuery && matchesCategory) {
                opt.style.display = 'flex';
            } else {
                opt.style.display = 'none';
            }
        });
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', filterStyles);
    }
    
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            categoryTabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = 'rgba(255,255,255,0.05)';
                t.style.color = 'var(--text-muted)';
                t.style.borderColor = 'rgba(255,255,255,0.1)';
            });
            tab.classList.add('active');
            tab.style.background = 'var(--gold-primary)';
            tab.style.color = '#000';
            tab.style.borderColor = 'var(--gold-primary)';
            filterStyles();
        });
    });

    // Resolution selection highlighting
    const resBtns = document.querySelectorAll('.res-btn');
    const selectedResInput = document.getElementById('selected-resolution');
    
    resBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            resBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (selectedResInput) {
                selectedResInput.value = btn.dataset.res;
            }
        });
    });

    // Aspect ratio selection highlighting
    const aspectBtns = document.querySelectorAll('.aspect-btn');
    const selectedAspectInput = document.getElementById('selected-aspect');
    
    aspectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            aspectBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (selectedAspectInput) {
                selectedAspectInput.value = btn.dataset.aspect;
            }
            updateCanvasAspectPreview(btn.dataset.aspect);
            updateParamsSummary();
        });
    });

    // Preset Background selection highlighting
    const presetBgOptions = document.querySelectorAll('.preset-bg-option');
    const selectedPresetBgInput = document.getElementById('selected-preset-bg');
    
    presetBgOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const isSelected = opt.classList.contains('selected');
            presetBgOptions.forEach(o => {
                o.classList.remove('selected');
                o.setAttribute('aria-checked', 'false');
                o.querySelector('img').style.border = '2px solid transparent';
            });
            
            if (isSelected) {
                if (selectedPresetBgInput) selectedPresetBgInput.value = '';
            } else {
                opt.classList.add('selected');
                opt.setAttribute('aria-checked', 'true');
                opt.querySelector('img').style.border = '2px solid var(--gold-glow)';
                if (selectedPresetBgInput) {
                    selectedPresetBgInput.value = opt.dataset.bgId;
                }
                
                const customBgInput = document.getElementById('custom-bg-input');
                if (customBgInput) customBgInput.value = '';
                const uploaderCard = document.getElementById('upload-custom-bg');
                if (uploaderCard) {
                    const preview = uploaderCard.querySelector('.preview-overlay');
                    if (preview) preview.remove();
                }
            }
            updateParamsSummary();
        });
    });

    // Custom background upload action should clear preset background selection
    const customBgInput = document.getElementById('custom-bg-input');
    
    if (customBgInput) {
        customBgInput.addEventListener('change', () => {
            if (customBgInput.files.length > 0) {
                presetBgOptions.forEach(o => {
                    o.classList.remove('selected');
                    o.setAttribute('aria-checked', 'false');
                    o.querySelector('img').style.border = '2px solid transparent';
                });
                if (selectedPresetBgInput) selectedPresetBgInput.value = '';
                
                // Show a visual overlay preview for the uploaded backdrop
                const uploaderCard = document.getElementById('upload-custom-bg');
                if (uploaderCard) {
                    const file = customBgInput.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const existing = uploaderCard.querySelector('.preview-overlay');
                            if (existing) existing.remove();
                            
                            const overlay = document.createElement('div');
                            overlay.className = 'preview-overlay';
                            overlay.style.borderRadius = '6px';
                            
                            const img = document.createElement('img');
                            img.src = e.target.result;
                            img.style.width = '70px';
                            img.style.height = '44px';
                            img.style.objectFit = 'cover';
                            overlay.appendChild(img);
                            
                            const removeBtn = document.createElement('button');
                            removeBtn.className = 'btn-remove-preview';
                            removeBtn.innerHTML = '<i class="fas fa-times" style="font-size: 0.6rem;"></i>';
                            removeBtn.style.width = '16px';
                            removeBtn.style.height = '16px';
                            removeBtn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                customBgInput.value = '';
                                overlay.remove();
                                updateParamsSummary();
                            });
                            overlay.appendChild(removeBtn);
                            uploaderCard.appendChild(overlay);
                        };
                        reader.readAsDataURL(file);
                    }
                }
            }
            updateParamsSummary();
        });
    }

    // Additional listeners to update parameters summary dynamically
    const frameSelect = document.getElementById('frame-style-select');
    if (frameSelect) {
        frameSelect.addEventListener('change', updateParamsSummary);
    }

    const customTextInput = document.getElementById('custom-text-input');
    if (customTextInput) {
        customTextInput.addEventListener('input', updateParamsSummary);
    }

    // Initial state rendering
    updateParamsSummary();
    updateCanvasAspectPreview('3:2');

    // Form Submission & Asynchronous AI generation polling
    const studioForm = document.getElementById('studio-generator-form');
    const aiModal = document.getElementById('ai-loading-modal');
    
    if (!studioForm || !aiModal) return;

    studioForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const file1 = document.getElementById('photo-mine').files[0];
        const file2 = document.getElementById('photo-girlfriend').files[0];

        if (!file1 || !file2) {
            showToast('Please upload both photos (Yours and Your Girlfriend\'s) to proceed!', 'warning');
            return;
        }

        const formData = new FormData(studioForm);
        
        // Disable submit button to prevent double submissions
        const submitBtn = studioForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Initiating Render... <i class="fas fa-spinner fa-spin"></i>';
        }

        fetch('/generate', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Generate Romantic Edit <i class="fas fa-wand-magic-sparkles"></i>';
            }
            if (!response.ok) {
                throw new Error('Image generation failed. Please try again.');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Open the loading modal
                aiModal.style.display = 'flex';
                resetLoadingSteps();
                updateModalProgress(0, 'queued');

                const projectId = data.project_id;
                
                // Immediately load in-progress cards into history
                loadGenerationHistory();

                // Poll status endpoint every second
                const pollInterval = setInterval(() => {
                    fetch(`/generate/status/${projectId}`)
                    .then(res => {
                        if (!res.ok) throw new Error('Could not fetch status.');
                        return res.json();
                    })
                    .then(statusData => {
                        if (statusData.success) {
                            updateModalProgress(statusData.progress, statusData.status);

                            if (statusData.status === 'completed') {
                                clearInterval(pollInterval);
                                setTimeout(() => {
                                    aiModal.style.display = 'none';
                                    updateViewportWithResult(statusData);
                                    loadGenerationHistory(); // reload history panel
                                }, 800);
                            } else if (statusData.status === 'failed') {
                                clearInterval(pollInterval);
                                showToast('Render Error: ' + (statusData.error_message || 'The composite process failed. Please retry with cleaner faces.'), 'error');
                                aiModal.style.display = 'none';
                                loadGenerationHistory();
                            }
                        }
                    })
                    .catch(err => {
                        console.error('Polling status error:', err);
                    });
                }, 1000);

            } else {
                showToast('Generation Error: ' + data.message, 'error');
            }
        })
        .catch(err => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Generate Romantic Edit <i class="fas fa-wand-magic-sparkles"></i>';
            }
            showToast(err.message || 'An unexpected error occurred during rendering.', 'error');
        });
    });
}

function resetLoadingSteps() {
    const steps = document.querySelectorAll('.loading-step');
    steps.forEach((step, idx) => {
        step.className = 'loading-step';
        const icons = ['fa-face-smile', 'fa-images', 'fa-wand-magic-sparkles', 'fa-lightbulb', 'fa-file-export'];
        step.querySelector('i').className = `fas ${icons[idx]}`;
    });
}

// Re-render editor viewport with new before/after dynamic comparison
function updateViewportWithResult(data) {
    const viewport = document.getElementById('viewport-container');
    if (!viewport) return;

    const sliderHTML = `
        <div class="viewport-slider">
            <div class="slider-wrapper">
                <img class="slider-img slider-before" src="${data.before_img_url}" alt="Original Blend" width="1024" height="1024" loading="lazy">
                <span class="slider-label label-before">Original Blend</span>
                
                <img class="slider-img slider-after" src="${data.after_img_url}" alt="AI Styled Result" width="1024" height="1024" loading="lazy">
                <span class="slider-label label-after">${data.style_name} Edit</span>
                
                <div class="slider-bar">
                    <div class="slider-handle">
                        <i class="fas fa-arrows-alt-h"></i>
                    </div>
                </div>
            </div>
        </div>
    `;

    viewport.innerHTML = sliderHTML;
    initBeforeAfterSliders();

    const exportActions = document.getElementById('export-actions-panel');
    const downloadLink = document.getElementById('download-result-link');
    
    if (exportActions && downloadLink) {
        exportActions.style.display = 'flex';
        updateDownloadUrl(data.project_id);
    }
}

function updateDownloadUrl(projectId) {
    const downloadLink = document.getElementById('download-result-link');
    const selectedResInput = document.getElementById('selected-resolution');
    const res = selectedResInput ? selectedResInput.value : 'HD';
    
    if (downloadLink) {
        downloadLink.href = `/download/${projectId}?res=${res}`;
        
        const resBtns = document.querySelectorAll('.res-btn');
        resBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const currentRes = btn.dataset.res;
                downloadLink.href = `/download/${projectId}?res=${currentRes}`;
            });
        });
    }
}

// Ambient Web Audio Synthesizer Loop
let audioCtx = null;
let synthInterval = null;
let isMusicPlaying = false;

function initAmbientSynthesizer() {
    const musicBtn = document.getElementById('ambient-music-toggle');
    if (!musicBtn) return;
    
    const chords = [
        [130.81, 164.81, 196.00, 246.94], // Cmaj7
        [110.00, 130.81, 164.81, 196.00], // Am7
        [87.31, 220.00, 261.63, 329.63],  // Fmaj7
        [98.00, 246.94, 293.66, 349.23]   // G7
    ];
    let currentChordIdx = 0;

    function playChord() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const chordFreqs = chords[currentChordIdx];
        
        chordFreqs.forEach(freq => {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.04, now + 1.0);
            gainNode.gain.setValueAtTime(0.04, now + 3.0);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 4.0);
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.start(now);
            osc.stop(now + 4.0);
        });
        
        currentChordIdx = (currentChordIdx + 1) % chords.length;
    }

    musicBtn.addEventListener('click', () => {
        if (!isMusicPlaying) {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            isMusicPlaying = true;
            musicBtn.innerHTML = '<i class="fas fa-pause"></i>';
            musicBtn.style.background = 'rgba(212, 175, 55, 0.4)';
            
            playChord();
            synthInterval = setInterval(playChord, 4000);
        } else {
            isMusicPlaying = false;
            musicBtn.innerHTML = '<i class="fas fa-music"></i>';
            musicBtn.style.background = 'rgba(212, 175, 55, 0.15)';
            if (synthInterval) {
                clearInterval(synthInterval);
                synthInterval = null;
            }
            if (audioCtx) {
                audioCtx.suspend();
            }
        }
    });
}

// Global set of project IDs currently being polled in the background history grid
const activeHistoryPolls = new Set();

// Helper to format SQLite timestamp into relative text
function formatRelativeTime(dateString) {
    if (!dateString) return '';
    // Normalize SQLite format (YYYY-MM-DD HH:MM:SS) to ISO format by replacing space with T
    const normalizedDate = dateString.replace(' ', 'T');
    const date = new Date(normalizedDate);
    const now = new Date();
    
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 0) {
        return 'Just now';
    } else if (diffSecs < 60) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins}m ago`;
    } else if (diffHours < 24) {
        return `${diffHours}h ago`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else {
        return `${diffDays}d ago`;
    }
}

// Update modal progress bar and active steps
function updateModalProgress(progress, status) {
    const progressBar = document.getElementById('ai-progress-bar');
    const progressText = document.getElementById('ai-progress-text');
    if (progressBar) progressBar.style.width = progress + '%';
    if (progressText) {
        if (status === 'queued') {
            progressText.innerText = 'Queued in line...';
        } else if (status === 'failed') {
            progressText.innerText = 'Render failed';
        } else {
            progressText.innerText = progress + '% Completed';
        }
    }

    const steps = document.querySelectorAll('.loading-step');
    const icons = ['fa-face-smile', 'fa-images', 'fa-wand-magic-sparkles', 'fa-lightbulb', 'fa-file-export'];
    
    steps.forEach((step, idx) => {
        const stepPercents = [15, 40, 60, 80, 95];
        const targetPercent = stepPercents[idx];
        const icon = step.querySelector('i');
        
        if (progress >= targetPercent) {
            step.className = 'loading-step completed';
            if (icon) icon.className = 'fas fa-check-circle';
        } else if (status !== 'queued' && (idx === 0 || progress >= stepPercents[idx - 1])) {
            step.className = 'loading-step active';
            if (icon) icon.className = 'fas fa-spinner fa-spin';
        } else {
            step.className = 'loading-step';
            if (icon) icon.className = `fas ${icons[idx]}`;
        }
    });
}

// Fetch and render the user's generation history panel
function loadGenerationHistory() {
    const historyContainer = document.getElementById('history-container');
    if (!historyContainer) return;

    fetch('/generate/history')
    .then(response => {
        if (!response.ok) throw new Error('Failed to load history');
        return response.json();
    })
    .then(data => {
        if (!data.success) {
            historyContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.85rem;">Failed to load history.</div>`;
            return;
        }

        if (data.history.length === 0) {
            historyContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.85rem;">No generations yet. Create your first romantic portrait!</div>`;
            return;
        }

        historyContainer.innerHTML = '';
        data.history.forEach(item => {
            const card = document.createElement('div');
            card.dataset.id = item.id;
            
            if (item.status === 'completed') {
                card.className = 'history-item completed';
                card.tabIndex = 0;
                card.setAttribute('role', 'button');
                card.setAttribute('aria-label', `Load ${item.style} creation`);
                
                card.innerHTML = `
                    <img src="${item.after_img_url}" alt="${item.style}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
                    <div class="history-overlay">
                        <span style="font-size:0.7rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
                        <span style="font-size:0.55rem; color:var(--gold-primary);">${item.style}</span>
                        <span style="font-size:0.5rem; color:var(--text-muted);">${formatRelativeTime(item.created_at)}</span>
                    </div>
                    <button class="btn-delete-history" title="Delete creation" aria-label="Delete creation">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;

                // Load to viewport on click
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-delete-history')) return;
                    selectHistoryItem(item.id, card);
                });

                // Keydown handler
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        card.click();
                    }
                });

                // Delete click handler
                const delBtn = card.querySelector('.btn-delete-history');
                if (delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteHistoryItem(item.id, card);
                    });
                }

            } else if (item.status === 'failed') {
                card.className = 'history-item history-progress-card failed';
                card.tabIndex = 0;
                card.style.borderColor = '#ff8585';
                card.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="color:#ff8585; font-size:1.3rem; margin-bottom:0.25rem;"></i>
                    <div style="font-size:0.7rem; color:#ff8585; font-weight:600;">Failed</div>
                    <span style="font-size:0.6rem; color:var(--text-muted); display:block; text-align:center; padding:0 0.2rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${item.style}
                    </span>
                    <button class="btn-delete-history" title="Delete record" aria-label="Delete record" style="opacity: 1;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;

                const delBtn = card.querySelector('.btn-delete-history');
                if (delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteHistoryItem(item.id, card);
                    });
                }

            } else {
                // queued or processing
                card.className = 'history-item history-progress-card';
                card.tabIndex = 0;
                card.innerHTML = `
                    <div class="loader-spinner" style="width:35px; height:35px; margin-bottom:0.25rem;">
                        <div class="loader-circle" style="border-width:1.5px;"></div>
                        <div class="loader-circle-inner" style="border-width:1.5px; top:3px; left:3px; right:3px; bottom:3px;"></div>
                        <i class="fas fa-heart loader-heart" style="font-size:0.6rem;"></i>
                    </div>
                    <div class="history-progress-ring" id="progress-ring-${item.id}">
                        ${item.status === 'queued' ? 'Queued' : item.progress + '%'}
                    </div>
                    <span style="font-size:0.6rem; color:var(--text-muted); display:block; text-align:center; padding:0 0.2rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${item.style}
                    </span>
                    <button class="btn-delete-history" title="Cancel creation" aria-label="Cancel creation" style="opacity: 1;">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                const delBtn = card.querySelector('.btn-delete-history');
                if (delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteHistoryItem(item.id, card);
                    });
                }

                // Poll status in background if we aren't already polling it
                if (!activeHistoryPolls.has(item.id)) {
                    activeHistoryPolls.add(item.id);
                    pollHistoryJobStatus(item.id, card);
                }
            }

            historyContainer.appendChild(card);
        });
    })
    .catch(err => {
        console.error('Error loading history:', err);
        historyContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.85rem;">Failed to load generation history.</div>`;
    });
}

// Poll in-progress tasks in history
function pollHistoryJobStatus(id, card) {
    const interval = setInterval(() => {
        fetch(`/generate/status/${id}`)
        .then(res => {
            if (!res.ok) throw new Error('Status check failed');
            return res.json();
        })
        .then(statusData => {
            if (statusData.success) {
                // Find target card if DOM was updated
                const currentCard = document.querySelector(`.history-item[data-id="${id}"]`) || card;
                
                if (statusData.status === 'completed' || statusData.status === 'failed') {
                    clearInterval(interval);
                    activeHistoryPolls.delete(id);
                    loadGenerationHistory();
                } else {
                    const progressRing = currentCard.querySelector('.history-progress-ring');
                    if (progressRing) {
                        progressRing.innerText = statusData.status === 'queued' ? 'Queued' : statusData.progress + '%';
                    }
                }
            }
        })
        .catch(err => {
            console.error(`Error polling background status for project ${id}:`, err);
            const currentCard = document.querySelector(`.history-item[data-id="${id}"]`);
            if (!currentCard) {
                clearInterval(interval);
                activeHistoryPolls.delete(id);
            }
        });
    }, 2000);
}

// Delete project from database and filesystem
function deleteHistoryItem(id, card) {
    const isPending = card.classList.contains('history-progress-card') && !card.classList.contains('failed');
    const confirmMsg = isPending 
        ? 'Are you sure you want to cancel and delete this active generation?' 
        : 'Are you sure you want to permanently delete this creation?';
        
    if (!confirm(confirmMsg)) return;

    fetch(`/generate/delete/${id}`, {
        method: 'POST'
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed to delete creation');
        return res.json();
    })
    .then(data => {
        if (data.success) {
            card.remove();
            activeHistoryPolls.delete(id);
            
            const container = document.getElementById('history-container');
            if (container && container.children.length === 0) {
                container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.85rem;">No generations yet. Create your first romantic portrait!</div>`;
            }
            
            // Clear viewport if currently displayed item is deleted
            const downloadLink = document.getElementById('download-result-link');
            if (downloadLink && downloadLink.href.includes(`/download/${id}`)) {
                const viewport = document.getElementById('viewport-container');
                if (viewport) {
                    viewport.innerHTML = `
                        <div class="viewport-placeholder">
                            <i class="fas fa-magic"></i>
                            <h3>Romantic Studio Viewport</h3>
                            <p>Your beautiful couple portrait will render here.<br>Upload your photos on the left and hit generate to begin.</p>
                        </div>
                    `;
                }
                const exportActions = document.getElementById('export-actions-panel');
                if (exportActions) exportActions.style.display = 'none';
            }
        } else {
            showToast('Delete failed: ' + data.message, 'error');
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        showToast(err.message || 'Error occurred while trying to delete creation.', 'error');
    });
}

// Select a completed history item to show in viewport
function selectHistoryItem(projectId, card) {
    const allHistoryItems = document.querySelectorAll('.history-item');
    allHistoryItems.forEach(item => item.classList.remove('active'));
    card.classList.add('active');

    fetch(`/generate/status/${projectId}`)
    .then(res => {
        if (!res.ok) throw new Error('Failed to load project details');
        return res.json();
    })
    .then(data => {
        if (data.success && data.status === 'completed') {
            updateViewportWithResult(data);
            
            // Sync UI aspect selection and guidelines crop box
            if (data.aspect_ratio) {
                const aspectBtns = document.querySelectorAll('.aspect-btn');
                const selectedAspectInput = document.getElementById('selected-aspect');
                
                aspectBtns.forEach(btn => {
                    if (btn.dataset.aspect === data.aspect_ratio) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                
                if (selectedAspectInput) {
                    selectedAspectInput.value = data.aspect_ratio;
                }
                
                updateCanvasAspectPreview(data.aspect_ratio);
            }
        } else {
            showToast('Could not load project viewport. State is ' + (data.status || 'unknown'), 'error');
        }
    })
    .catch(err => {
        console.error('Error loading history project:', err);
        showToast('An error occurred while loading this creation.', 'error');
    });
}

// Sidebar Tab selection logic
function initStudioTabs() {
    const tabBtns = document.querySelectorAll('.sidebar-tab-btn');
    const tabPanels = document.querySelectorAll('.sidebar-tab-panel');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPanelId = btn.dataset.targetPanel;
            
            // Deactivate all buttons & panels
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            tabPanels.forEach(p => {
                p.classList.remove('active');
            });
            
            // Activate clicked button & its target panel
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            const targetPanel = document.getElementById(targetPanelId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

// Update aspect ratio preview dimensions dynamically
function updateCanvasAspectPreview(aspect) {
    const guideOverlay = document.getElementById('canvas-guidelines-overlay');
    const aspectLabel = document.getElementById('canvas-aspect-label');
    const resolutionLabel = document.getElementById('canvas-resolution-label');
    
    if (!guideOverlay) return;
    
    // Reset aspect classes
    guideOverlay.classList.remove('aspect-3-2', 'aspect-1-1', 'aspect-9-16');
    
    // Add current aspect class
    const aspectClass = 'aspect-' + aspect.replace(':', '-');
    guideOverlay.classList.add(aspectClass);
    
    // Update labels
    let aspectText = '3:2 Landscape';
    let resolutionText = 'Active Canvas: 1200 x 800px';
    
    if (aspect === '1:1') {
        aspectText = '1:1 Square';
        resolutionText = 'Active Canvas: 1000 x 1000px';
    } else if (aspect === '9:16') {
        aspectText = '9:16 Story';
        resolutionText = 'Active Canvas: 800 x 1420px';
    }
    
    if (aspectLabel) aspectLabel.innerText = aspectText;
    if (resolutionLabel) resolutionLabel.innerText = resolutionText;
}

// Update parameters summary status bar dynamically
function updateParamsSummary() {
    // 1. Style name
    const activeStyleOption = document.querySelector('.style-option.selected h5');
    const summaryStyle = document.getElementById('param-summary-style');
    if (summaryStyle && activeStyleOption) {
        summaryStyle.innerText = activeStyleOption.innerText;
    }
    
    // 2. Backdrop name
    const summaryBackdrop = document.getElementById('param-summary-backdrop');
    if (summaryBackdrop) {
        const selectedPresetBgInput = document.getElementById('selected-preset-bg');
        const customBgInput = document.getElementById('custom-bg-input');
        
        if (customBgInput && customBgInput.files && customBgInput.files.length > 0) {
            summaryBackdrop.innerText = 'Custom Image';
        } else if (selectedPresetBgInput && selectedPresetBgInput.value) {
            const activePresetOption = document.querySelector(`.preset-bg-option[data-bg-id="${selectedPresetBgInput.value}"] span`);
            if (activePresetOption) {
                const parentOption = activePresetOption.closest('.preset-bg-option');
                if (parentOption && parentOption.classList.contains('library-bg-option')) {
                    summaryBackdrop.innerText = 'Vault Backdrop';
                } else {
                    summaryBackdrop.innerText = activePresetOption.innerText;
                }
            } else {
                summaryBackdrop.innerText = 'Preset: ' + selectedPresetBgInput.value;
            }
        } else {
            summaryBackdrop.innerText = 'Default Style Backdrop';
        }
    }
    
    // 3. Caption / Text
    const summaryText = document.getElementById('param-summary-text');
    if (summaryText) {
        const customTextInput = document.getElementById('custom-text-input');
        if (customTextInput && customTextInput.value.trim() !== '') {
            summaryText.innerText = customTextInput.value.trim();
        } else {
            summaryText.innerText = 'None';
        }
    }
    
    // 4. Frame style
    const summaryFrame = document.getElementById('param-summary-frame');
    if (summaryFrame) {
        const frameSelect = document.getElementById('frame-style-select');
        if (frameSelect) {
            summaryFrame.innerText = frameSelect.options[frameSelect.selectedIndex].text;
        }
    }
}

// AI Style Recommendations System
function initStyleRecommendations() {
    const photoMine = document.getElementById('photo-mine');
    const photoGirlfriend = document.getElementById('photo-girlfriend');
    const promptCard = document.getElementById('ai-recs-prompt-card');
    const resultsPanel = document.getElementById('ai-recs-results-panel');
    const runBtn = document.getElementById('btn-run-recs');
    const retryBtn = document.getElementById('btn-run-recs-retry');
    const cardsContainer = document.getElementById('ai-recs-cards-container');

    if (!photoMine || !photoGirlfriend || !promptCard || !resultsPanel) return;

    function checkPhotos() {
        if (photoMine.files.length > 0 && photoGirlfriend.files.length > 0) {
            promptCard.style.display = 'flex';
        } else {
            promptCard.style.display = 'none';
            resultsPanel.style.display = 'none';
        }
    }

    // Attach listeners
    photoMine.addEventListener('change', checkPhotos);
    photoGirlfriend.addEventListener('change', checkPhotos);

    // Call on load in case photos are already populated
    checkPhotos();

    // Trigger analysis
    async function runAnalysis() {
        if (photoMine.files.length === 0 || photoGirlfriend.files.length === 0) return;

        // Visual loading state
        runBtn.disabled = true;
        runBtn.innerHTML = 'Analyzing Images... <i class="fas fa-spinner fa-spin"></i>';

        const formData = new FormData();
        formData.append('photo_mine', photoMine.files[0]);
        formData.append('photo_girlfriend', photoGirlfriend.files[0]);

        try {
            const response = await fetch('/api/styles/recommend', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Analysis failed.');
            const data = await response.json();

            if (data.success) {
                renderRecommendations(data.recommendations);
                promptCard.style.display = 'none';
                resultsPanel.style.display = 'flex';
            } else {
                showToast(data.message || 'Error executing AI style matching.', 'error');
            }
        } catch (err) {
            showToast('Failed to analyze photos. Ensure valid formats are uploaded.', 'error');
        } finally {
            runBtn.disabled = false;
            runBtn.innerHTML = 'Analyze & Recommend <i class="fas fa-sparkles"></i>';
        }
    }

    runBtn.addEventListener('click', runAnalysis);
    if (retryBtn) {
        retryBtn.addEventListener('click', runAnalysis);
    }

    function renderRecommendations(recommendations) {
        cardsContainer.innerHTML = '';

        recommendations.forEach((rec, idx) => {
            const card = document.createElement('div');
            card.className = 'ai-rec-card glass-panel';
            card.style.cssText = `
                display: flex;
                gap: 0.75rem;
                padding: 0.65rem;
                border-color: rgba(255,255,255,0.05);
                background: rgba(255,255,255,0.01);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                animation: fadeInUp 0.4s ease forwards;
                animation-delay: ${idx * 0.1}s;
                opacity: 0;
            `;

            // Hover effects via JS since it's dynamic
            card.addEventListener('mouseenter', () => {
                card.style.borderColor = 'var(--gold-primary)';
                card.style.background = 'rgba(212, 175, 55, 0.04)';
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = '0 5px 15px rgba(212, 175, 55, 0.1)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.borderColor = 'rgba(255,255,255,0.05)';
                card.style.background = 'rgba(255,255,255,0.01)';
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = 'none';
            });

            card.innerHTML = `
                <div style="position: relative; width: 60px; height: 60px; flex-shrink: 0; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                    <img src="${rec.thumbnail}" alt="${rec.name}" style="width: 100%; height: 100%; object-fit: cover;">
                    <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.8); color: var(--gold-primary); font-size: 0.55rem; font-weight: 700; text-align: center; padding: 0.1rem 0;">
                        ${rec.confidence}% Match
                    </div>
                </div>
                <div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                        <h6 style="margin: 0; font-size: 0.75rem; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${rec.name}</h6>
                        <span style="font-size: 0.5rem; background: rgba(212,175,55,0.15); color: var(--gold-primary); padding: 0.05rem 0.3rem; border-radius: 4px; font-weight: 600; text-transform: uppercase;">
                            ${rec.category}
                        </span>
                    </div>
                    <p style="margin: 0.2rem 0 0; font-size: 0.65rem; color: var(--text-muted); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                        ${rec.reasoning}
                    </p>
                </div>
            `;

            // Click applies style
            card.addEventListener('click', () => {
                applyStyleRecommendation(rec.style_id);
            });

            cardsContainer.appendChild(card);
        });
    }

    function applyStyleRecommendation(styleId) {
        const styleOptions = document.querySelectorAll('.style-option');
        const selectedStyleInput = document.getElementById('selected-style');

        styleOptions.forEach(opt => {
            if (opt.dataset.styleId === styleId) {
                // Remove previous selected classes
                styleOptions.forEach(o => {
                    o.classList.remove('selected');
                    o.setAttribute('aria-checked', 'false');
                });

                // Apply selected style
                opt.classList.add('selected');
                opt.setAttribute('aria-checked', 'true');
                if (selectedStyleInput) {
                    selectedStyleInput.value = styleId;
                }

                // Update params summary
                if (typeof updateParamsSummary === 'function') {
                    updateParamsSummary();
                }

                // Scroll element smoothly
                opt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // Apply dynamic selector visual flash confirmation
                opt.style.transition = 'all 0.1s ease';
                opt.style.boxShadow = '0 0 20px var(--gold-primary)';
                setTimeout(() => {
                    opt.style.transition = 'all 0.25s ease';
                    opt.style.boxShadow = 'none';
                }, 400);

                showToast(`Applied style: ${opt.querySelector('h5').innerText}!`, 'success');
            }
        });
    }
}
