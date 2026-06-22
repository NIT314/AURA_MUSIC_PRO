/*
  AURA ∞ MUSIC - Interactive Canvas Visualizers
  Includes AURA Wave (linear frequencies) and AURA Sphere (3D projected rotating core)
*/

let animationId = null;
let isVisualizerRequested = false; // Track karega ki gaana chal raha hai ya nahi

// Particles list for visual backgrounds
let particlesList = [];

function initVisualizers() {
    // Setup resize handlers
    window.addEventListener("resize", resizeVisualizerCanvases);
    resizeVisualizerCanvases();

    // 🔥 BATTERY SAVER: Page Visibility API
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            // App background mein hai
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        } else {
            // App wapas screen par aaya
            if (isVisualizerRequested) {
                startVisualizerLoop();
            }
        }
    });
}

function resizeVisualizerCanvases() {
    // No-op as canvas is removed
}

function startVisualizerLoop() {
    isVisualizerRequested = true;
}

function stopVisualizerLoop() {
    isVisualizerRequested = false;
}

// Global visualizer particle background (AURA Atmos)
function runAuraAtmosParticles() {
    const parent = document.getElementById("aura-particles");
    if (!parent) return;
    
    // We manipulate styling directly for simple performance
    let particleCount = 20;
    parent.innerHTML = '';
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.className = "atmos-particle";
        
        // Random placement parameters
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const size = Math.random() * 4 + 2;
        const duration = Math.random() * 10 + 10;
        const delay = Math.random() * -10;
        
        particle.style.cssText = `
            position: absolute;
            left: ${x}%;
            top: ${y}%;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, ${Math.random() * 0.15 + 0.05});
            pointer-events: none;
            animation: move-particle ${duration}s infinite linear;
            animation-delay: ${delay}s;
        `;
        parent.appendChild(particle);
    }
    
    // Append animations style directly
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes move-particle {
            0% { transform: translateY(0) translateX(0); opacity: 0.1; }
            50% { transform: translateY(-80px) translateX(30px); opacity: 0.6; }
            100% { transform: translateY(-160px) translateX(0); opacity: 0; }
        }
    `;
    document.head.appendChild(styleSheet);
}

// Export global symbols
window.initVisualizers = initVisualizers;
window.startVisualizerLoop = startVisualizerLoop;
window.stopVisualizerLoop = stopVisualizerLoop;
window.runAuraAtmosParticles = runAuraAtmosParticles;
