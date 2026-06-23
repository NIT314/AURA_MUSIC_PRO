(function () {
  'use strict';

  window.addEventListener('DOMContentLoaded', function () {
    var audio = document.getElementById('audio-element');
    if (!audio) return;

    var ytPlayer = null;
    var ytReady = false;
    var isYtMode = false;
    var ytCurrentTime = 0;
    var ytDuration = 0;
    var ytPaused = true;
    var ytEnded = false;
    var ytVolume = 0.8;
    var timerInterval = null;
    var pendingPlay = false;
    var pendingSeek = null;

    // Hidden container for the iframe player
    var container = document.createElement('div');
    container.id = 'yt-shim-player';
    container.style.cssText = 'position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-999;overflow:hidden';
    document.body.appendChild(container);

    // Load YouTube IFrame API
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = function () {
      ytPlayer = new YT.Player('yt-shim-player', {
        width: '1',
        height: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1
        },
        events: {
          onReady: function () {
            ytReady = true;
            console.log('[YT Shim] Player ready');
          },
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.PLAYING) {
              ytPaused = false;
              ytEnded = false;
              ytDuration = ytPlayer.getDuration() || ytDuration;
              if (pendingSeek !== null) {
                ytPlayer.seekTo(pendingSeek, true);
                pendingSeek = null;
              }
              startTimer();
              audio.dispatchEvent(new Event('play'));
              audio.dispatchEvent(new Event('playing'));
            } else if (e.data === YT.PlayerState.PAUSED) {
              ytPaused = true;
              stopTimer();
              audio.dispatchEvent(new Event('pause'));
            } else if (e.data === YT.PlayerState.ENDED) {
              ytPaused = true;
              ytEnded = true;
              stopTimer();
              audio.dispatchEvent(new Event('ended'));
            } else if (e.data === YT.PlayerState.BUFFERING) {
              audio.dispatchEvent(new Event('waiting'));
            } else if (e.data === YT.PlayerState.CUED) {
              ytDuration = ytPlayer.getDuration() || 0;
              audio.dispatchEvent(new Event('loadedmetadata'));
              audio.dispatchEvent(new Event('canplay'));
              audio.dispatchEvent(new Event('canplaythrough'));
              if (pendingPlay) {
                pendingPlay = false;
                ytPlayer.setVolume(Math.round(ytVolume * 100));
                ytPlayer.playVideo();
              }
            }
          },
          onError: function (e) {
            console.error('[YT Shim] Player error code:', e.data);
            audio.dispatchEvent(new ErrorEvent('error', { message: 'YouTube error ' + e.data }));
          }
        }
      });
    };

    function startTimer() {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(function () {
        if (ytPlayer && isYtMode) {
          ytCurrentTime = ytPlayer.getCurrentTime() || 0;
          ytDuration = ytPlayer.getDuration() || ytDuration;
          audio.dispatchEvent(new Event('timeupdate'));
        }
      }, 250);
    }

    function stopTimer() {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    function loadVideo(videoId, autoplay) {
      pendingPlay = !!autoplay;
      if (ytReady && ytPlayer) {
        ytPlayer.cueVideoById(videoId);
      } else {
        var check = setInterval(function () {
          if (ytReady && ytPlayer) {
            clearInterval(check);
            ytPlayer.cueVideoById(videoId);
          }
        }, 200);
      }
    }

    // ─── Capture original native descriptors ───────────────────────────────
    var nativeSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    var nativeCT  = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    var nativeDur = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration');
    var nativePaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused');
    var nativeEnded  = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'ended');
    var nativeRS     = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState');
    var nativeVol    = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    var nativeRate   = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');

    // ─── src ───────────────────────────────────────────────────────────────
    Object.defineProperty(audio, 'src', {
      get: function () { return nativeSrc.get.call(this); },
      set: function (val) {
        if (val && val.includes('/api/stream?video_id=')) {
          try {
            var videoId = new URLSearchParams(val.split('?')[1]).get('video_id');
            if (videoId) {
              isYtMode = true;
              ytCurrentTime = 0;
              ytDuration = 0;
              ytPaused = true;
              ytEnded = false;
              pendingPlay = false;
              stopTimer();
              console.log('[YT Shim] Intercepted video_id:', videoId);
              loadVideo(videoId, false);
              // Don't actually set native src (would trigger a broken network request)
              return;
            }
          } catch (err) { /* fall through */ }
        }
        // For blob: URLs (offline cache) or clearing src, use native
        isYtMode = false;
        stopTimer();
        if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
          try { ytPlayer.stopVideo(); } catch (err) {}
        }
        ytPaused = true;
        ytEnded = false;
        ytCurrentTime = 0;
        ytDuration = 0;
        nativeSrc.set.call(this, val || '');
      },
      configurable: true
    });

    // ─── load() ────────────────────────────────────────────────────────────
    var origLoad = audio.load.bind(audio);
    audio.load = function () {
      if (isYtMode) return; // no-op
      return origLoad();
    };

    // ─── play() ────────────────────────────────────────────────────────────
    var origPlay = audio.play.bind(audio);
    audio.play = function () {
      if (isYtMode) {
        if (ytReady && ytPlayer) {
          ytPlayer.setVolume(Math.round(ytVolume * 100));
          ytPlayer.playVideo();
        } else {
          pendingPlay = true;
        }
        return Promise.resolve();
      }
      return origPlay();
    };

    // ─── pause() ───────────────────────────────────────────────────────────
    var origPause = audio.pause.bind(audio);
    audio.pause = function () {
      if (isYtMode) {
        if (ytPlayer) ytPlayer.pauseVideo();
        ytPaused = true;
        stopTimer();
        return;
      }
      return origPause();
    };

    // ─── currentTime ───────────────────────────────────────────────────────
    Object.defineProperty(audio, 'currentTime', {
      get: function () {
        if (isYtMode) return ytCurrentTime;
        return nativeCT.get.call(this);
      },
      set: function (val) {
        if (isYtMode) {
          ytCurrentTime = val;
          if (ytPlayer && !ytPaused) {
            ytPlayer.seekTo(val, true);
          } else {
            pendingSeek = val;
          }
          return;
        }
        nativeCT.set.call(this, val);
      },
      configurable: true
    });

    // ─── duration ──────────────────────────────────────────────────────────
    Object.defineProperty(audio, 'duration', {
      get: function () {
        if (isYtMode) return ytDuration > 0 ? ytDuration : NaN;
        return nativeDur.get.call(this);
      },
      configurable: true
    });

    // ─── paused ────────────────────────────────────────────────────────────
    Object.defineProperty(audio, 'paused', {
      get: function () {
        if (isYtMode) return ytPaused;
        return nativePaused.get.call(this);
      },
      configurable: true
    });

    // ─── ended ─────────────────────────────────────────────────────────────
    Object.defineProperty(audio, 'ended', {
      get: function () {
        if (isYtMode) return ytEnded;
        return nativeEnded.get.call(this);
      },
      configurable: true
    });

    // ─── readyState ────────────────────────────────────────────────────────
    Object.defineProperty(audio, 'readyState', {
      get: function () {
        if (isYtMode) return 4; // HAVE_ENOUGH_DATA
        return nativeRS.get.call(this);
      },
      configurable: true
    });

    // ─── volume ────────────────────────────────────────────────────────────
    Object.defineProperty(audio, 'volume', {
      get: function () {
        if (isYtMode) return ytVolume;
        return nativeVol.get.call(this);
      },
      set: function (val) {
        ytVolume = val;
        if (isYtMode && ytPlayer && ytPlayer.setVolume) {
          ytPlayer.setVolume(Math.round(val * 100));
        }
        try { nativeVol.set.call(this, val); } catch (err) {}
      },
      configurable: true
    });

    // ─── playbackRate ──────────────────────────────────────────────────────
    Object.defineProperty(audio, 'playbackRate', {
      get: function () {
        if (isYtMode && ytPlayer && ytPlayer.getPlaybackRate) return ytPlayer.getPlaybackRate();
        return nativeRate.get.call(this);
      },
      set: function (val) {
        if (isYtMode && ytPlayer && ytPlayer.setPlaybackRate) {
          ytPlayer.setPlaybackRate(val);
          return;
        }
        nativeRate.set.call(this, val);
      },
      configurable: true
    });

    console.log('[YT Shim] Audio element patched — songs will play via YouTube IFrame API');
  });
})();
