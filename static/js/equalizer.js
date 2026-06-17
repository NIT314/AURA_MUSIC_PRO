/*
  AURA ∞ MUSIC - Audio Engine (Equalizer & Sound Stage Effects)
  Powered by Web Audio API
*/

let audioCtx = null;
let sourceNode = null;
let bands = []; // 10-band BiquadFilterNodes
let analyserNode = null;
let preAmpNode = null; // The secret Auto-Gain volume controller

// Sound Stage Effects Nodes
let surroundDelayNode = null;
let surroundFeedbackGain = null;
let spatialPanner = null;
let reverbNode = null;
let stereoWidenerLeft = null;
let stereoWidenerRight = null;
let splitterNode = null;
let mergerNode = null;

// Presets maps: Safe Bass Boost (Subtractive method to prevent clipping)
const EQ_PRESETS = {
    normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bassboost: [3.5, 2.5, 1.5, 0, -1, -2, -2, -2, -2, -2], 
    vocalboost: [-2, -1.5, -1, 1, 3.5, 4.5, 4, 2, 1, 0],
    pop: [-1.5, -1, 0, 2, 4, 3.5, 2, 0, -1, -1.5],
    rock: [4, 3, 1.5, -1, -2, -1.5, 1, 2.5, 3.5, 4],
    jazz: [3, 2, 1, 1.5, -1, -1.5, 0, 1.5, 2.5, 3],
    classical: [3, 2.5, 2, 1.5, -1, -1, 0, 1.5, 2.5, 3.5]
};

function initEqualizer(audioElement) {
    if (audioCtx) return; // Already initialized

    // Create Context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // Create Analyser for Canvas visualizer
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;

    // Create Media Element Source
    sourceNode = audioCtx.createMediaElementSource(audioElement);

    // SPOTIFY FIX: Dynamic Pre-Amp Node
    preAmpNode = audioCtx.createGain();
    preAmpNode.gain.value = 1.0; 
    sourceNode.connect(preAmpNode);

    // Build the 10-band Biquad Filters
    const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    let prevNode = preAmpNode;

    frequencies.forEach((freq, idx) => {
        const filter = audioCtx.createBiquadFilter();
        if (idx === 0) {
            filter.type = 'lowshelf';
        } else if (idx === frequencies.length - 1) {
            filter.type = 'highshelf';
        } else {
            filter.type = 'peaking';
            filter.Q.value = 1.0; // Filter bandwidth width
        }
        
        filter.frequency.value = freq;
        filter.gain.value = 0; // Flat initial state
        bands.push(filter);
        
        // Chain nodes
        prevNode.connect(filter);
        prevNode = filter;
    });

    // Create Splitter and Merger for Surround/Stereo effects
    splitterNode = audioCtx.createChannelSplitter(2);
    mergerNode = audioCtx.createChannelMerger(2);

    // Surround Sound Node
    surroundDelayNode = audioCtx.createDelay(0.1);
    surroundDelayNode.delayTime.value = 0.025; 
    surroundFeedbackGain = audioCtx.createGain();
    surroundFeedbackGain.gain.value = 0.0; 

    // Spatial Audio (Panner Node)
    spatialPanner = audioCtx.createPanner();
    spatialPanner.panningModel = 'HRTF';
    spatialPanner.distanceModel = 'inverse';
    spatialPanner.positionX.value = 0;
    spatialPanner.positionY.value = 0;
    spatialPanner.positionZ.value = 0;

    // Stereo Widener
    stereoWidenerLeft = audioCtx.createGain();
    stereoWidenerRight = audioCtx.createGain();
    stereoWidenerLeft.gain.value = 1.0;
    stereoWidenerRight.gain.value = 1.0;

    // Reverb node
    reverbNode = audioCtx.createDelay(0.5);
    reverbNode.delayTime.value = 0.0; // Fixed reverb bug
    let reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.3; // Safe reverb volume
    
    // Connect EQ output to analyser
    prevNode.connect(analyserNode);

    // Connect standard flow
    analyserNode.connect(spatialPanner);

    // SOFT LIMITER: Prevents vocal pumping and distortion
    const masterLimiter = audioCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -1.0; 
    masterLimiter.knee.value = 0.0;
    masterLimiter.ratio.value = 20.0; 
    masterLimiter.attack.value = 0.005; 
    masterLimiter.release.value = 0.050;
    
    // Connect standard path to compressor
    spatialPanner.connect(masterLimiter);
    
    // Connect reverb loop safely
    spatialPanner.connect(reverbNode);
    reverbNode.connect(reverbGain);
    reverbGain.connect(masterLimiter);

    // Finally, send safe audio to speakers
    masterLimiter.connect(audioCtx.destination);
    
    spatialPanner.coneOuterGain = 0;
}

function setBandGain(index, gainValue) {
    if (!audioCtx) return;
    const idx = parseInt(index);
    if (idx >= 0 && idx < bands.length) {
        bands[idx].gain.value = parseFloat(gainValue);
    }

    // ⭐ AUTO-GAIN COMPENSATION ENGINE ⭐
    let maxBoost = 0;
    bands.forEach(band => {
        if (band.gain.value > maxBoost) maxBoost = band.gain.value;
    });

    if (preAmpNode) {
        if (maxBoost > 0) {
            // Agar slider upar gaya hai, toh main volume apne aap safe ho jayega
            let safeGain = Math.pow(10, -(maxBoost * 0.85) / 20); 
            preAmpNode.gain.setTargetAtTime(safeGain, audioCtx.currentTime, 0.1);
        } else {
            // Normal volume
            preAmpNode.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.1);
        }
    }
}

function setPreset(presetName) {
    if (!audioCtx) return;
    const values = EQ_PRESETS[presetName.toLowerCase()];
    if (values) {
        values.forEach((val, idx) => {
            setBandGain(idx, val); // Using setBandGain to trigger Auto-Gain
            // Update UI sliders dynamically
            if (window.updateEQSliderUI) {
                window.updateEQSliderUI(idx, val);
            }
        });
    }
}

function toggleSurround(enabled) {
    if (!audioCtx) return;
    if (enabled) {
        surroundFeedbackGain.gain.value = 0.45;
        spatialPanner.positionX.value = -0.5;
        spatialPanner.positionZ.value = -0.5;
    } else {
        surroundFeedbackGain.gain.value = 0.0;
        spatialPanner.positionX.value = 0;
        spatialPanner.positionZ.value = 0;
    }
}

function toggleSpatial(enabled) {
    if (!audioCtx) return;
    if (enabled) {
        startSpatialOrbit();
    } else {
        stopSpatialOrbit();
    }
}

let orbitTimer = null;
function startSpatialOrbit() {
    let angle = 0;
    if (orbitTimer) clearInterval(orbitTimer);
    orbitTimer = setInterval(() => {
        if (!audioCtx) return;
        angle += 0.05;
        spatialPanner.positionX.value = Math.sin(angle) * 1.5;
        spatialPanner.positionZ.value = Math.cos(angle) * 1.5;
    }, 100);
}

function stopSpatialOrbit() {
    if (orbitTimer) {
        clearInterval(orbitTimer);
        orbitTimer = null;
    }
    if (audioCtx) {
        spatialPanner.positionX.value = 0;
        spatialPanner.positionZ.value = 0;
    }
}

function toggleWidener(enabled) {
    if (!audioCtx) return;
    if (enabled) {
        stereoWidenerLeft.gain.value = 1.35;
        stereoWidenerRight.gain.value = 1.35;
    } else {
        stereoWidenerLeft.gain.value = 1.0;
        stereoWidenerRight.gain.value = 1.0;
    }
}

function toggleReverb(enabled) {
    if (!audioCtx) return;
    if (enabled) {
        reverbNode.delayTime.value = 0.22;
    } else {
        reverbNode.delayTime.value = 0.0;
    }
}

function getAnalyser() {
    return analyserNode;
}

function resumeAudioContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Export functions to global scope
window.initEqualizer = initEqualizer;
window.setBandGain = setBandGain;
window.setPreset = setPreset;
window.toggleSurround = toggleSurround;
window.toggleSpatial = toggleSpatial;
window.toggleWidener = toggleWidener;
window.toggleReverb = toggleReverb;
window.getAnalyser = getAnalyser;
window.resumeAudioContext = resumeAudioContext;