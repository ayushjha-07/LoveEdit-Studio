/**
 * LoveEdit Studio - Guided Onboarding Tour Engine
 * Natively drives step-by-step tour, handles automatic tab navigation,
 * and maintains completion status in localStorage.
 */

(function () {
    'use strict';

    // Steps configuration
    const steps = [
        {
            selector: '.active-params-bar',
            title: 'Welcome to LoveEdit Studio!',
            body: 'Let\'s take a quick 1-minute tour of your romantic art studio workspace where you can create stunning couple portraits.',
            placement: 'bottom'
        },
        {
            selector: '.upload-grid',
            title: 'Upload Your Photos',
            body: 'Drag & drop or click to upload your photos. To generate the best result, upload high-quality, clear face photos for both partners.',
            placement: 'bottom',
            tab: 'panel-style-media'
        },
        {
            selector: '.styles-selector',
            title: 'Choose a Creative Style',
            body: 'Select from 12+ premium AI romantic styles (e.g. Cinematic Wedding, Fairytale, Cyberpunk) or search for your favorite look.',
            placement: 'right',
            tab: 'panel-style-media'
        },
        {
            selector: 'button[data-target-panel="panel-backdrops"]',
            title: 'Custom Backdrops',
            body: 'Switch to this tab to select preset background settings or upload your own custom backgrounds for the AI to integrate.',
            placement: 'right',
            tab: 'panel-backdrops'
        },
        {
            selector: 'button[data-target-panel="panel-finetune"]',
            title: 'Fine-Tuning Options',
            body: 'Switch here to adjust skin retouching strength, add custom text/captions, choose lighting colors, or modify creative prompts.',
            placement: 'right',
            tab: 'panel-finetune'
        },
        {
            selector: '.studio-generate-btn',
            title: 'Start Generation',
            body: 'Click this button to submit your generation request to the AI queue. It usually takes less than 30 seconds to produce your masterpiece!',
            placement: 'top',
            tab: 'panel-style-media'
        },
        {
            selector: '#viewport-container',
            title: 'Interactive Viewport',
            body: 'View your generated creation here. Use the interactive slider to compare the before (source faces) and after (final art) versions in real-time.',
            placement: 'left'
        },
        {
            selector: '#history-panel',
            title: 'Creation History',
            body: 'Scroll down to access all your past creations. Download them in high resolution, upscale for print, or delete them anytime.',
            placement: 'top'
        }
    ];

    let currentStepIndex = -1;
    let overlayEl = null;
    let tooltipEl = null;
    let currentHighlightedEl = null;
    const LOCAL_STORAGE_KEY = 'loveedit_onboarding_completed';

    // Initialize the tour
    function init() {
        // Create trigger button event listener
        const startBtn = document.getElementById('btn-start-tour');
        if (startBtn) {
            startBtn.addEventListener('click', (e) => {
                e.preventDefault();
                startTour();
            });
        }

        // Add help indicators if the tour hasn't been completed yet
        const completed = localStorage.getItem(LOCAL_STORAGE_KEY) === 'true';
        if (!completed && startBtn) {
            startBtn.classList.add('btn-tour-indicator');
        }

        // Auto-start for first-time users after the page preloader has cleared
        if (!completed) {
            // Wait for preloader to fade out
            const checkPreloader = setInterval(() => {
                const preloader = document.getElementById('preloader');
                if (!preloader || preloader.classList.contains('fade-out')) {
                    clearInterval(checkPreloader);
                    setTimeout(() => {
                        startTour();
                    }, 1200); // 1.2s delay for visual comfort
                }
            }, 200);
        }
    }

    // Start the tour
    function startTour() {
        if (currentStepIndex !== -1) return; // Already running

        // Create overlay and tooltip DOM elements if they don't exist
        createTourElements();

        // Show overlay
        overlayEl.classList.add('visible');
        document.body.style.overflow = 'hidden'; // Lock scrolling during tour navigation

        currentStepIndex = 0;
        showStep(currentStepIndex);

        // Remove indicator from help button since user has seen it
        const startBtn = document.getElementById('btn-start-tour');
        if (startBtn) {
            startBtn.classList.remove('btn-tour-indicator');
        }

        // Track resize and scroll events to keep tooltip positioned correctly
        window.addEventListener('resize', repositionCurrentStep);
        window.addEventListener('scroll', repositionCurrentStep);
    }

    // End/Clean up the tour
    function endTour() {
        if (currentStepIndex === -1) return;

        currentStepIndex = -1;
        
        if (overlayEl) {
            overlayEl.classList.remove('visible');
        }
        if (tooltipEl) {
            tooltipEl.classList.remove('visible');
        }
        
        removeCurrentHighlight();
        document.body.style.overflow = ''; // Restore scroll

        window.removeEventListener('resize', repositionCurrentStep);
        window.removeEventListener('scroll', repositionCurrentStep);
    }

    // Mark tour as completed in localStorage
    function completeTour() {
        localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
        endTour();
        window.showToast?.('Onboarding tour completed! You\'re ready to create!', 'success');
    }

    // Mark tour as skipped
    function skipTour() {
        localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
        endTour();
        window.showToast?.('Tour skipped. You can restart it anytime by clicking the (?) button.', 'info');
    }

    // Create DOM structures for overlay and tooltip
    function createTourElements() {
        if (!overlayEl) {
            overlayEl = document.createElement('div');
            overlayEl.className = 'tour-overlay';
            document.body.appendChild(overlayEl);
        }

        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'tour-tooltip';
            tooltipEl.innerHTML = `
                <div class="tour-tooltip-title">
                    <span class="tour-title-text"></span>
                    <span class="tour-step-badge" style="font-size: 0.7rem; opacity: 0.75; font-weight: normal; margin-left: auto; background: rgba(212,175,55,0.15); padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid rgba(212,175,55,0.25);"></span>
                </div>
                <div class="tour-tooltip-body"></div>
                <div class="tour-progress-bar-container">
                    <div class="tour-progress-bar"></div>
                </div>
                <div class="tour-footer">
                    <button type="button" class="btn-tour-skip">Skip</button>
                    <div class="tour-buttons">
                        <button type="button" class="btn-tour-back">Back</button>
                        <button type="button" class="btn-tour-next">Next</button>
                    </div>
                </div>
                <div class="tour-tooltip-arrow"></div>
            `;
            document.body.appendChild(tooltipEl);

            // Bind events
            tooltipEl.querySelector('.btn-tour-skip').addEventListener('click', skipTour);
            tooltipEl.querySelector('.btn-tour-back').addEventListener('click', prevStep);
            tooltipEl.querySelector('.btn-tour-next').addEventListener('click', nextStep);
        }
    }

    // Remove highlight class from current target
    function removeCurrentHighlight() {
        if (currentHighlightedEl) {
            currentHighlightedEl.classList.remove('tour-highlight');
            currentHighlightedEl = null;
        }
    }

    // Navigate to next step
    function nextStep() {
        if (currentStepIndex < steps.length - 1) {
            currentStepIndex++;
            showStep(currentStepIndex);
        } else {
            completeTour();
        }
    }

    // Navigate to previous step
    function prevStep() {
        if (currentStepIndex > 0) {
            currentStepIndex--;
            showStep(currentStepIndex);
        }
    }

    // Display a specific step
    function showStep(index) {
        if (index < 0 || index >= steps.length) return;

        const step = steps[index];
        
        // Remove previous highlight
        removeCurrentHighlight();

        // 1. Programmatically switch tabs if defined
        if (step.tab) {
            const tabBtn = document.querySelector(`button[data-target-panel="${step.tab}"]`);
            if (tabBtn && !tabBtn.classList.contains('active')) {
                tabBtn.click();
            }
        }

        // Wait for tab transition layout settling before finding element and positioning
        setTimeout(() => {
            const targetEl = document.querySelector(step.selector);
            if (!targetEl) {
                console.warn(`Tour target not found: ${step.selector}`);
                // If element is not found, skip to next step safely
                nextStep();
                return;
            }

            // Scroll target element into viewport smoothly
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Apply highlight class
            currentHighlightedEl = targetEl;
            currentHighlightedEl.classList.add('tour-highlight');

            // Update tooltip text and state
            tooltipEl.querySelector('.tour-title-text').textContent = step.title;
            tooltipEl.querySelector('.tour-tooltip-body').textContent = step.body;
            tooltipEl.querySelector('.tour-step-badge').textContent = `Step ${index + 1}/${steps.length}`;
            
            // Update progress bar width
            const percent = ((index + 1) / steps.length) * 100;
            tooltipEl.querySelector('.tour-progress-bar').style.width = `${percent}%`;

            // Adjust navigation button labels
            const backBtn = tooltipEl.querySelector('.btn-tour-back');
            const nextBtn = tooltipEl.querySelector('.btn-tour-next');

            if (index === 0) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = 'block';
            }

            if (index === steps.length - 1) {
                nextBtn.textContent = 'Finish';
            } else {
                nextBtn.textContent = 'Next';
            }

            // Position the tooltip relative to the highlighted target element
            // Wait slightly for scroll to complete or settle before doing layout calculations
            setTimeout(() => {
                positionTooltip(targetEl, step.placement);
                tooltipEl.classList.add('visible');
            }, 200);

        }, 150);
    }

    // Recalculate position for current step (e.g. on resize or scroll)
    function repositionCurrentStep() {
        if (currentStepIndex === -1 || !currentHighlightedEl) return;
        const step = steps[currentStepIndex];
        positionTooltip(currentHighlightedEl, step.placement);
    }

    // Position the tooltip element
    function positionTooltip(targetEl, placement) {
        if (!tooltipEl) return;

        const rect = targetEl.getBoundingClientRect();
        
        // Handle mobile responsive viewport
        if (window.innerWidth < 768) {
            tooltipEl.style.position = 'fixed';
            tooltipEl.style.top = 'auto';
            tooltipEl.style.bottom = '20px';
            tooltipEl.style.left = '50%';
            tooltipEl.style.transform = 'translateX(-50%)';
            tooltipEl.style.width = 'calc(100% - 32px)';
            tooltipEl.style.maxWidth = '360px';
            
            tooltipEl.setAttribute('data-placement', 'bottom');
            const arrow = tooltipEl.querySelector('.tour-tooltip-arrow');
            if (arrow) arrow.style.display = 'none';
            return;
        }

        // Desktop positioning
        tooltipEl.style.position = 'absolute';
        tooltipEl.style.bottom = 'auto';
        tooltipEl.style.width = '320px';
        tooltipEl.style.maxWidth = '';
        tooltipEl.style.transform = '';
        
        const arrow = tooltipEl.querySelector('.tour-tooltip-arrow');
        if (arrow) arrow.style.display = 'block';

        const tooltipRect = tooltipEl.getBoundingClientRect();
        
        let top = 0;
        let left = 0;
        
        const targetTop = rect.top + window.scrollY;
        const targetLeft = rect.left + window.scrollX;

        if (placement === 'top') {
            top = targetTop - tooltipRect.height - 12;
            left = targetLeft + (rect.width - tooltipRect.width) / 2;
        } else if (placement === 'bottom') {
            top = targetTop + rect.height + 12;
            left = targetLeft + (rect.width - tooltipRect.width) / 2;
        } else if (placement === 'left') {
            top = targetTop + (rect.height - tooltipRect.height) / 2;
            left = targetLeft - tooltipRect.width - 12;
        } else if (placement === 'right') {
            top = targetTop + (rect.height - tooltipRect.height) / 2;
            left = targetLeft + rect.width + 12;
        }

        // Boundary safety: prevent tooltip from overflowing the viewport boundaries
        const margin = 16;
        if (left < margin) {
            left = margin;
        } else if (left + tooltipRect.width > window.innerWidth - margin) {
            left = window.innerWidth - tooltipRect.width - margin;
        }

        if (top < margin) {
            top = margin;
        }

        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.setAttribute('data-placement', placement);

        // Position arrow to point to target center
        if (arrow) {
            if (placement === 'top' || placement === 'bottom') {
                const arrowLeft = (targetLeft + rect.width / 2) - left;
                arrow.style.left = `${Math.max(12, Math.min(tooltipRect.width - 12, arrowLeft))}px`;
                arrow.style.transform = 'translateX(-50%)';
                arrow.style.top = '';
                arrow.style.right = '';
            } else {
                const arrowTop = (targetTop + rect.height / 2) - top;
                arrow.style.top = `${Math.max(12, Math.min(tooltipRect.height - 12, arrowTop))}px`;
                arrow.style.transform = 'translateY(-50%)';
                arrow.style.left = '';
                arrow.style.right = '';
            }
        }
    }

    // Initialize when DOM content is fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
