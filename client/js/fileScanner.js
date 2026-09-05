/**
 * fileScanner.js — File System Scanner
 * Communicates with the ExtendScript host to scan folders and
 * return structured file metadata to the app.
 *
 * All ExtendScript calls go through CSInterface.evalScript().
 * Results are returned via callback with parsed JSON.
 */

'use strict';

var FileScanner = (function () {

  // ── File type definitions ─────────────────────────────────────────────────

  var FILE_TYPES = {
    audio: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'aiff', 'aif', 'wma', 'opus', 'alac'],
    video: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'webm', 'm4v', 'mxf', 'mpg', 'mpeg', 'flv', 'ts', 'r3d', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'psd', 'ai', 'tif', 'tiff', 'exr'],
    fx:    ['mogrt', 'cube', '3dl', 'look', 'mga', 'epr', 'prfpset', 'ffx', 'aep', 'prproj', 'preset']
  };

  // Extensions that can be previewed in the browser
  var PREVIEWABLE_AUDIO = { mp3:1, wav:1, aac:1, m4a:1, ogg:1, flac:1, aiff:1, aif:1 };
  var PREVIEWABLE_VIDEO = { mp4:1, mov:1, webm:1, m4v:1, png:1, jpg:1, jpeg:1, gif:1, svg:1 };

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Scan multiple folder paths and return all files categorised by type.
   * @param {CSInterface} cs        - CSInterface instance
   * @param {string[]}    folders   - Array of absolute folder paths
   * @param {Function}    callback  - Called with { allFiles, byType, byFolder }
   */
  function normalizePath(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  /**
   * Scan multiple folder paths and return all files categorised by type.
   * @param {CSInterface} cs        - CSInterface instance
   * @param {string[]}    folders   - Array of absolute folder paths
   * @param {Function}    callback  - Called with { allFiles, byType, byFolder }
   */
  function scanFolders(cs, folders, callback) {
    if (!folders || folders.length === 0) {
      callback({ allFiles: [], byType: { audio: [], video: [], fx: [] }, byFolder: {} });
      return;
    }

    var remaining = folders.length;
    var allFiles  = [];
    var byFolder  = {};

    folders.forEach(function (folderPath) {
      var normRoot = normalizePath(folderPath);
      var script = 'getFolderContents(' + JSON.stringify(normRoot) + ', 4)';
      cs.evalScript(script, function (result) {
        if (result === "EvalScript error.") {
          remaining--;
          byFolder[normRoot] = [];
          if (remaining === 0) { callback({ allFiles: allFiles, byType: groupByType(allFiles), byFolder: byFolder }); }
          return;
        }
        try {
          var parsed = JSON.parse(result);
          if (parsed && parsed.files && parsed.files.length > 0) {
            var enriched = parsed.files.map(function (f) {
              return enrichFile(f);
            });
            var typed = enriched.filter(function (f) { return f.mediaType !== null; });
            allFiles = allFiles.concat(typed);
            byFolder[normRoot] = typed;
          } else {
            byFolder[normRoot] = [];
          }
        } catch (e) {
          console.error('[FileScanner] Parse error for', normRoot, ':', e);
          byFolder[normRoot] = [];
        }

        remaining--;
        if (remaining === 0) {
          callback({
            allFiles:  allFiles,
            byType:    groupByType(allFiles),
            byFolder:  byFolder
          });
        }
      });
    });
  }

  // ── Internal Helpers ─────────────────────────────────────────────────────

  /**
   * Determine a file's media type and add preview capability flags.
   */
  function enrichFile(fileObj) {
    var ext        = (fileObj.ext || '').toLowerCase();
    var type       = getMediaType(ext);
    var canAudio   = !!PREVIEWABLE_AUDIO[ext];
    var canVideo   = !!PREVIEWABLE_VIDEO[ext];
    var normPath   = normalizePath(fileObj.path);
    var normParent = normalizePath(fileObj.parentFolder);

    return {
      name:         fileObj.name,
      path:         normPath,
      ext:          ext,
      size:         fileObj.size || 0,
      parentFolder: normParent,
      folderName:   fileObj.folderName || '',
      mediaType:    type,          // 'audio' | 'video' | 'fx' | null
      canPreview:   canAudio || canVideo || (type === 'fx'),
      canAudio:     canAudio,
      canVideo:     canVideo,
      isFavorite:   false,         // set by app.js from state.favorites
      id:           buildId(normPath)
    };
  }

  function getMediaType(ext) {
    if (FILE_TYPES.audio.indexOf(ext) !== -1) return 'audio';
    if (FILE_TYPES.video.indexOf(ext) !== -1) return 'video';
    if (FILE_TYPES.fx.indexOf(ext) !== -1)    return 'fx';
    return null;
  }

  function groupByType(files) {
    var result = { audio: [], video: [], fx: [] };
    files.forEach(function (f) {
      if (result[f.mediaType]) result[f.mediaType].push(f);
    });
    return result;
  }

  /**
   * Create a deterministic string ID from a file path.
   */
  function buildId(filePath) {
    var h = 0;
    for (var i = 0; i < filePath.length; i++) {
      h = ((h << 5) - h) + filePath.charCodeAt(i);
      h = h & h; // 32-bit int
    }
    return 'f' + Math.abs(h).toString(36);
  }

  // ── Utilities exposed to app ──────────────────────────────────────────────

  /**
   * Format a file size (bytes) into a human-readable string.
   */
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '';
    if (bytes < 1024)      return bytes + ' B';
    if (bytes < 1048576)   return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }

  /**
   * Get the display label for an FX file type.
   */
  function getFXLabel(ext) {
    var labels = {
      mogrt:   'MOGRT',
      cube:    'LUT',
      '3dl':   'LUT',
      look:    'LUT',
      mga:     'LUT',
      epr:     'Preset',
      prfpset: 'Preset',
      ffx:     'AE Preset',
      aep:     'AE Project',
      prproj:  'PR Project',
      preset:  'Preset'
    };
    return labels[ext] || ext.toUpperCase();
  }

  /**
   * Returns SVG icon markup for a given media type.
   */
  function getTypeIcon(mediaType, size) {
    size = size || 28;
    if (mediaType === 'audio') {
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    }
    if (mediaType === 'video') {
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
    }
    if (mediaType === 'fx') {
      return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    }
    return '';
  }

  // Public interface
  return {
    scanFolders:  scanFolders,
    formatSize:   formatSize,
    getFXLabel:   getFXLabel,
    getTypeIcon:  getTypeIcon,
    getMediaType: function (ext) { return getMediaType(ext); }
  };

})();
