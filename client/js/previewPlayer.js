/**
 * previewPlayer.js — In-Panel Audio & Video Preview
 * Handles all playback functionality using HTML5 <audio> and <video> elements.
 * Audio playback includes real-time waveform visualization via Web Audio API.
 */

'use strict';

var PreviewPlayer = (function () {

  // ── State ────────────────────────────────────────────────────────────────
  var _currentFile  = null;
  var _audioCtx     = null;
  var _analyser     = null;
  var _sourceNode   = null;
  var _animFrame    = null;
  var _isDragging   = false;
  var _isPlaying    = false;
  var _onCloseCallback = null;
  var _currentBlobURL = null;

  // ── DOM references ────────────────────────────────────────────────────────
  var els = {};

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    els = {
      player:       document.getElementById('preview-player'),
      // Audio
      audioUI:      document.getElementById('audio-player-ui'),
      audioEl:      document.getElementById('audio-element'),
      waveCanvas:   document.getElementById('waveform-canvas'),
      audioTitle:   document.getElementById('audio-title'),
      audioMeta:    document.getElementById('audio-meta'),
      btnPlay:      document.getElementById('btn-audio-play'),
      btnBack:      document.getElementById('btn-audio-back'),
      btnFwd:       document.getElementById('btn-audio-fwd'),
      icoPlay:      document.getElementById('ico-play'),
      icoPause:     document.getElementById('ico-pause'),
      audioTime:    document.getElementById('audio-time'),
      audioVol:     document.getElementById('audio-volume'),
      audioProgress:document.getElementById('audio-progress-bar'),
      audioFill:    document.getElementById('audio-progress-fill'),
      audioThumb:   document.getElementById('audio-progress-thumb'),
      btnClosePlayer: document.getElementById('btn-close-player'),
      // Video
      videoUI:      document.getElementById('video-player-ui'),
      videoEl:      document.getElementById('video-element'),
      videoTitle:   document.getElementById('video-title'),
      videoMeta:    document.getElementById('video-meta'),
      btnVideoPlay: document.getElementById('btn-video-play'),
      icoVideoPlay: document.getElementById('ico-video-play'),
      icoVideoPause:document.getElementById('ico-video-pause'),
      videoTime:    document.getElementById('video-time'),
      videoVol:     document.getElementById('video-volume'),
      videoProgress:document.getElementById('video-progress-bar'),
      videoFill:    document.getElementById('video-progress-fill'),
      videoThumb:   document.getElementById('video-progress-thumb'),
      btnCloseVideo:document.getElementById('btn-close-video-player'),
      videoOverlay: document.getElementById('btn-video-overlay-play'),
      btnFullscreen:document.getElementById('btn-video-fullscreen')
    };

    _bindAudioEvents();
    _bindVideoEvents();
    _initPlayerResize();

    // Keyboard shortcuts (Space, Arrow keys)
    document.addEventListener('keydown', _onKeyDown);
  }

  var _customAudioHeight = null;
  var _customVideoHeight = null;

  function _initPlayerResize() {
    var handle = document.getElementById('player-handle');
    if (!handle) return;

    var isDragging = false;
    var startY = 0;
    var startHeight = 0;

    handle.addEventListener('mousedown', function (e) {
      isDragging = true;
      handle.classList.add('active');
      document.body.style.cursor = 'row-resize';
      startY = e.clientY;
      startHeight = els.player.offsetHeight;
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      
      var deltaY = startY - e.clientY;
      var newHeight = startHeight + deltaY;
      var isAudio = els.audioUI.style.display !== 'none';
      
      if (isAudio) {
        newHeight = Math.max(70, Math.min(newHeight, 300));
        _customAudioHeight = newHeight;
      } else {
        newHeight = Math.max(150, Math.min(newHeight, 550));
        _customVideoHeight = newHeight;
      }

      els.player.style.height = newHeight + 'px';
      els.player.style.maxHeight = 'none';
    });

    document.addEventListener('mouseup', function () {
      if (isDragging) {
        isDragging = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        
        // Save to localStorage only on mouseup to prevent drag lag
        var isAudio = els.audioUI.style.display !== 'none';
        if (isAudio && _customAudioHeight) {
          localStorage.setItem('mml_player_audio_height', _customAudioHeight);
        } else if (!isAudio && _customVideoHeight) {
          localStorage.setItem('mml_player_video_height', _customVideoHeight);
        }
      }
    });

    // Load initial values
    var savedAudioH = localStorage.getItem('mml_player_audio_height');
    if (savedAudioH) _customAudioHeight = parseInt(savedAudioH, 10);
    
    var savedVideoH = localStorage.getItem('mml_player_video_height');
    if (savedVideoH) _customVideoHeight = parseInt(savedVideoH, 10);
  }

  // ── Public: Open Audio ────────────────────────────────────────────────────

  /**
   * Load and begin previewing an audio file.
   * @param {Object} file - Enriched file object from fileScanner
   */
  function openAudio(file) {
    _currentFile = file;
    _closeVideo();

    // Revoke previous blob URL if exists
    if (_currentBlobURL) {
      try { URL.revokeObjectURL(_currentBlobURL); } catch (e) {}
      _currentBlobURL = null;
    }

    // Use Blob URL if Node.js is available (bypasses cross-origin file:// blocks), fallback to file://
    var url = _filePathToURL(file.path, true);
    if (url.indexOf('blob:') === 0) {
      _currentBlobURL = url;
    }
    els.audioEl.src = url;
    els.audioTitle.textContent = file.name;
    els.audioMeta.textContent = (file.ext.toUpperCase()) + ' • ' + FileScanner.formatSize(file.size);

    // Show player
    els.player.className = 'preview-player open-audio';
    els.audioUI.style.display = '';
    els.videoUI.style.display = 'none';

    // Set custom/default height
    var h = _customAudioHeight || 95;
    els.player.style.height = h + 'px';
    els.player.style.maxHeight = 'none';

    // Set volume
    els.audioEl.volume = parseFloat(els.audioVol.value);

    // Reset progress
    _setAudioProgress(0);
    _updateAudioTime(0, 0);

    // Connect Web Audio API for waveform
    _connectAudioAnalyser();

    // Auto-play
    els.audioEl.play().catch(function (e) {
      console.warn('[Player] Audio autoplay blocked:', e.message);
    });

    _isPlaying = true;
    _updatePlayState(true);
  }

  // ── Public: Open Video ────────────────────────────────────────────────────

  function openVideo(file) {
    _currentFile = file;
    _pauseAudio();
    _cancelWaveform();

    var url = _filePathToURL(file.path);
    els.videoEl.src = url;
    els.videoTitle.textContent = file.name;
    els.videoMeta.textContent = (file.ext.toUpperCase()) + ' • ' + FileScanner.formatSize(file.size);

    els.player.className = 'preview-player open-video';
    els.videoUI.style.display = '';
    els.audioUI.style.display = 'none';

    // Set custom/default height
    var h = _customVideoHeight || 240;
    els.player.style.height = h + 'px';
    els.player.style.maxHeight = 'none';

    els.videoEl.volume = parseFloat(els.videoVol.value);
    _setVideoProgress(0);
    _updateVideoTime(0, 0);

    els.videoOverlay.classList.remove('hidden');

    els.videoEl.play().catch(function () {});
    _isPlaying = true;
    _updateVideoPlayState(true);
  }

  // ── Public: Close ─────────────────────────────────────────────────────────

  function close() {
    _pauseAudio();
    _closeVideo();
    _cancelWaveform();
    if (_currentBlobURL) {
      try { URL.revokeObjectURL(_currentBlobURL); } catch (e) {}
      _currentBlobURL = null;
    }
    _currentFile = null;
    _isPlaying   = false;
    els.player.className = 'preview-player collapsed';
    els.player.style.height = '';
    els.player.style.maxHeight = '';
    setTimeout(function () {
      els.audioUI.style.display = 'none';
      els.videoUI.style.display = 'none';
    }, 400);
    if (_onCloseCallback) {
      _onCloseCallback();
    }
  }

  // ── Audio Events ──────────────────────────────────────────────────────────

  function _bindAudioEvents() {
    var a = els.audioEl;

    els.btnPlay.addEventListener('click', function () {
      if (a.paused) { a.play(); _isPlaying = true; _updatePlayState(true); }
      else          { a.pause(); _isPlaying = false; _updatePlayState(false); }
    });

    els.btnBack.addEventListener('click', function () { a.currentTime = Math.max(0, a.currentTime - 5); });
    els.btnFwd.addEventListener('click',  function () { a.currentTime = Math.min(a.duration || 0, a.currentTime + 5); });

    a.addEventListener('timeupdate', function () {
      if (!_isDragging) {
        var pct = a.duration ? (a.currentTime / a.duration) : 0;
        _setAudioProgress(pct);
        _updateAudioTime(a.currentTime, a.duration);
      }
    });

    a.addEventListener('ended', function () { _isPlaying = false; _updatePlayState(false); });

    a.addEventListener('play',  function () { _isPlaying = true;  _updatePlayState(true);  _startWaveformLoop(); });
    a.addEventListener('pause', function () { _isPlaying = false; _updatePlayState(false); });

    // Volume
    els.audioVol.addEventListener('input', function () { a.volume = parseFloat(this.value); });

    // Progress scrubbing
    _bindProgressScrub(els.audioProgress, function (pct) {
      if (a.duration) a.currentTime = pct * a.duration;
      _setAudioProgress(pct);
    });

    if (els.waveCanvas) {
      _bindProgressScrub(els.waveCanvas, function (pct) {
        if (a.duration) a.currentTime = pct * a.duration;
        _setAudioProgress(pct);
      });
    }

    // Error handling
    a.addEventListener('error', function () {
      if (!a.src || a.src === window.location.href || !_currentFile || _currentFile.mediaType !== 'audio') {
        return;
      }
      var err = a.error;
      var msg = 'Audio playback error';
      if (err) {
        if (err.code === 1) msg = 'Playback aborted by user';
        else if (err.code === 2) msg = 'Network error loading audio';
        else if (err.code === 3) msg = 'Audio decoding failed (unsupported format)';
        else if (err.code === 4) msg = 'Audio file not found or inaccessible';
      }
      console.error('[Player] Audio error:', err);
      if (window.showToast) {
        window.showToast('✗ ' + msg, 4000, 'error');
      } else {
        alert('Playback Error: ' + msg + '\nSource: ' + a.src);
      }
    });

    els.btnClosePlayer.addEventListener('click', close);
  }

  // ── Video Events ──────────────────────────────────────────────────────────

  function _bindVideoEvents() {
    var v = els.videoEl;

    els.btnVideoPlay.addEventListener('click', _toggleVideo);
    els.videoOverlay.addEventListener('click', _toggleVideo);

    v.addEventListener('timeupdate', function () {
      if (!_isDragging) {
        var pct = v.duration ? (v.currentTime / v.duration) : 0;
        _setVideoProgress(pct);
        _updateVideoTime(v.currentTime, v.duration);
      }
    });

    v.addEventListener('play',  function () {
      _isPlaying = true;
      _updateVideoPlayState(true);
      els.videoOverlay.classList.add('hidden');
    });
    v.addEventListener('pause', function () {
      _isPlaying = false;
      _updateVideoPlayState(false);
      els.videoOverlay.classList.remove('hidden');
    });
    v.addEventListener('ended', function () {
      _isPlaying = false;
      _updateVideoPlayState(false);
      els.videoOverlay.classList.remove('hidden');
    });

    els.videoVol.addEventListener('input', function () { v.volume = parseFloat(this.value); });

    _bindProgressScrub(els.videoProgress, function (pct) {
      if (v.duration) v.currentTime = pct * v.duration;
      _setVideoProgress(pct);
    });

    // Error handling
    v.addEventListener('error', function () {
      if (!v.src || v.src === window.location.href || !_currentFile || _currentFile.mediaType !== 'video') {
        return;
      }
      var err = v.error;
      var msg = 'Video playback error';
      if (err) {
        if (err.code === 1) msg = 'Playback aborted';
        else if (err.code === 2) msg = 'Network error loading video';
        else if (err.code === 3) msg = 'Video decoding failed (unsupported format)';
        else if (err.code === 4) msg = 'Video file not supported or not found';
      }
      console.error('[Player] Video error:', err);
      if (window.showToast) {
        window.showToast('✗ ' + msg, 4000, 'error');
      } else {
        alert('Playback Error: ' + msg + '\nSource: ' + v.src);
      }
    });

    els.btnCloseVideo.addEventListener('click', close);

    els.btnFullscreen.addEventListener('click', function () {
      if (v.requestFullscreen)       v.requestFullscreen();
      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    });
  }

  function _toggleVideo() {
    var v = els.videoEl;
    if (v.paused) v.play().catch(function () {});
    else          v.pause();
  }

  // ── Progress Scrubbing ────────────────────────────────────────────────────

  function _bindProgressScrub(barEl, onScrub) {
    function getPercent(e) {
      var rect = barEl.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    }

    barEl.addEventListener('mousedown', function (e) {
      _isDragging = true;
      onScrub(getPercent(e));
    });
    document.addEventListener('mousemove', function (e) {
      if (_isDragging) onScrub(getPercent(e));
    });
    document.addEventListener('mouseup', function () { _isDragging = false; });
  }

  // ── Waveform Visualizer ───────────────────────────────────────────────────

  function _connectAudioAnalyser() {
    _cancelWaveform();
    try {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (_audioCtx.state === 'suspended') {
        _audioCtx.resume();
      }
      if (!_sourceNode) {
        _sourceNode = _audioCtx.createMediaElementSource(els.audioEl);
      }
      if (!_analyser) {
        _analyser = _audioCtx.createAnalyser();
        _analyser.fftSize = 128;
        _sourceNode.connect(_analyser);
        _analyser.connect(_audioCtx.destination);
      }
      _startWaveformLoop();
    } catch (e) {
      // Web Audio not available — skip waveform
      console.warn('[Player] Web Audio API unavailable:', e.message);
    }
  }

  function _startWaveformLoop() {
    if (_animFrame) return;
    _drawWaveform();
  }

  function _drawWaveform() {
    _animFrame = requestAnimationFrame(_drawWaveform);
    var canvas = els.waveCanvas;
    if (!canvas || !_analyser) return;

    var ctx    = canvas.getContext('2d');
    var W      = canvas.offsetWidth;
    var H      = canvas.height;
    
    // Optimize: only set canvas.width if it has actually changed, to prevent expensive DOM layout thrashing
    if (canvas.width !== W) {
      canvas.width = W;
    }

    var bufLen = _analyser.frequencyBinCount;
    var dataArr = new Uint8Array(bufLen);
    _analyser.getByteFrequencyData(dataArr);

    ctx.clearRect(0, 0, W, H);

    var barW   = (W / bufLen) * 2;
    var x      = 0;
    var pct    = els.audioEl.duration ? (els.audioEl.currentTime / els.audioEl.duration) : 0;
    var splitX = W * pct;

    for (var i = 0; i < bufLen; i++) {
      var barH = (dataArr[i] / 255) * H * 0.85;
      if (barH < 3) barH = 3; // Minimal ambient bar height
      var cx   = x + barW * 0.5;

      if (cx < splitX) {
        // Played portion — Apple vibrant blue-to-emerald gradient
        var grad = ctx.createLinearGradient(0, H, 0, H - barH);
        grad.addColorStop(0, '#0a84ff');
        grad.addColorStop(1, '#30d158');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      }

      var gap = Math.max(1, barW * 0.25);
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, H - barH, barW - gap, barH, 2);
      } else {
        ctx.rect(x, H - barH, barW - gap, barH);
      }
      ctx.fill();

      x += barW;
    }
  }

  function _cancelWaveform() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  }

  // ── State Helpers ─────────────────────────────────────────────────────────

  function _updatePlayState(playing) {
    els.icoPlay.style.display  = playing ? 'none' : '';
    els.icoPause.style.display = playing ? '' : 'none';
  }
  function _updateVideoPlayState(playing) {
    els.icoVideoPlay.style.display  = playing ? 'none' : '';
    els.icoVideoPause.style.display = playing ? '' : 'none';
  }

  function _setAudioProgress(pct) {
    var p = (Math.min(1, Math.max(0, pct)) * 100).toFixed(2) + '%';
    els.audioFill.style.width  = p;
    els.audioThumb.style.left  = p;
  }
  function _setVideoProgress(pct) {
    var p = (Math.min(1, Math.max(0, pct)) * 100).toFixed(2) + '%';
    els.videoFill.style.width  = p;
    els.videoThumb.style.left  = p;
  }

  function _updateAudioTime(current, total) {
    els.audioTime.textContent = _fmt(current) + ' / ' + _fmt(total || 0);
  }
  function _updateVideoTime(current, total) {
    els.videoTime.textContent = _fmt(current) + ' / ' + _fmt(total || 0);
  }

  function _fmt(secs) {
    secs = secs || 0;
    var m = Math.floor(secs / 60);
    var s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function _pauseAudio() {
    if (els.audioEl && !els.audioEl.paused) els.audioEl.pause();
  }
  function _closeVideo() {
    if (els.videoEl) {
      els.videoEl.pause();
      els.videoEl.src = '';
    }
  }

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────

  function _onKeyDown(e) {
    if (!_currentFile) return;
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    var isAudio = els.audioUI.style.display !== 'none';
    var el      = isAudio ? els.audioEl : els.videoEl;

    if (e.code === 'Space') {
      e.preventDefault();
      if (el.paused) el.play().catch(function(){});
      else           el.pause();
    }
    if (e.code === 'ArrowRight') { e.preventDefault(); el.currentTime += 5; }
    if (e.code === 'ArrowLeft')  { e.preventDefault(); el.currentTime = Math.max(0, el.currentTime - 5); }
    if (e.code === 'ArrowUp')    { e.preventDefault(); el.volume = Math.min(1, el.volume + 0.1); }
    if (e.code === 'ArrowDown')  { e.preventDefault(); el.volume = Math.max(0, el.volume - 0.1); }
  }

  // ── File URL Helper ───────────────────────────────────────────────────────

  function _filePathToURL(fsPath, isAudio) {
    try {
      if (typeof require !== 'undefined' && isAudio) {
        var fs = require('fs');
        var path = require('path');
        if (fs.existsSync(fsPath)) {
          var stats = fs.statSync(fsPath);
          // Only use Blob URL for files under 30MB to prevent memory bloat
          if (stats.size < 30 * 1024 * 1024) {
            var ext = path.extname(fsPath).toLowerCase().replace('.', '');
            var mime = 'audio/wav';
            if (ext === 'mp3') mime = 'audio/mpeg';
            else if (ext === 'm4a') mime = 'audio/mp4';
            else if (ext === 'aac') mime = 'audio/aac';
            else if (ext === 'ogg') mime = 'audio/ogg';
            else if (ext === 'flac') mime = 'audio/flac';
            
            var buffer = fs.readFileSync(fsPath);
            var blob = new Blob([buffer], { type: mime });
            return URL.createObjectURL(blob);
          }
        }
      }
    } catch (e) {
      console.warn('[Player] Node.js fs fallback failed, using file:// protocol:', e.message);
    }

    // Convert Windows backslashes and encode spaces/special characters
    var normalized = fsPath.replace(/\\/g, '/');
    if (normalized.charAt(0) !== '/') normalized = '/' + normalized;
    var url = 'file://' + normalized;
    // URL-encode spaces, hashes (#), and question marks (?) so browser can load files cleanly
    return encodeURI(url).replace(/#/g, '%23').replace(/\?/g, '%3F');
  }

  function pause() {
    _pauseAudio();
    _cancelWaveform();
  }

  // ── Public Interface ──────────────────────────────────────────────────────

  return {
    init:       init,
    openAudio:  openAudio,
    openVideo:  openVideo,
    pause:      pause,
    close:      close,
    onClose:    function (cb) { _onCloseCallback = cb; },
    isOpen:     function () { return _currentFile !== null; },
    getFile:    function () { return _currentFile; }
  };

})();
