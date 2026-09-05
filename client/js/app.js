/**
 * app.js — My Media Library — Apple & Notion Minimal Motion Application
 * Supports Adobe Premiere Pro (PPRO) & Adobe After Effects (AEFT)
 * Features disk-level persistent storage, instant search, responsive playback,
 * and seamless dual-host project/timeline integration.
 */

'use strict';

(function () {

  // ══════════════════════════════════════════════════════════════════════════
  // ── Helpers ───────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function normalizePath(p) {
    if (!p) return '';
    return String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── State ─────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  var cs = new CSInterface();

  var state = {
    host:             'UNKNOWN', // 'PPRO' | 'AEFT'
    folders:          [],        // string[] — normalized folder paths
    allFiles:         [],        // enriched file objects
    selectedFile:     null,      // currently selected file for preview
    byType:           { audio: [], video: [], fx: [] },
    byFolder:         {},
    favorites:        {},        // { fileId: true }
    activeTab:        'all',
    activeFolder:     null,      // folder path filter, null = all
    searchQuery:      '',
    viewMode:         'grid',    // 'grid' | 'list'
    isLoading:        false,
    contextFile:      null,      // file shown in context menu
    contextFolderNode: null,     // folder node shown in folder context menu
    seqInfo:          null,
    expandedFolders:  {},        // path -> boolean
    sidebarCollapsed: false
  };

  var STORAGE_KEYS = {
    folders:          'mml_folders',
    favorites:        'mml_favorites',
    viewMode:         'mml_viewmode',
    expandedFolders:  'mml_expanded_folders',
    sidebarCollapsed: 'mml_sidebar_collapsed',
    activeFolder:     'mml_active_folder'
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ── DOM Refs ────────────────────────────────══════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════

  var $ = function (id) { return document.getElementById(id); };

  var dom = {
    hostBadge:     $('host-badge'),
    emptyState:    $('empty-state'),
    loadingState:  $('loading-state'),
    noResults:     $('no-results'),
    fileGrid:      $('file-grid'),
    searchInput:   $('search-input'),
    clearSearch:   $('btn-clear-search'),
    fileCount:     $('file-count'),
    seqInfo:       $('seq-info'),
    sidebarPanel:  $('sidebar-panel'),
    folderTree:    $('folder-tree'),
    sidebarToggle: $('btn-sidebar-toggle'),
    sidebarAdd:    $('btn-sidebar-add'),
    folderModal:   $('folder-modal'),
    folderList:    $('folder-list'),
    folderInput:   $('folder-path-input'),
    btnBrowseAdd:  $('btn-browse-add'),
    btnAddPath:    $('btn-add-path'),
    contextMenu:   $('context-menu'),
    folderContextMenu: $('folder-context-menu'),
    toast:         $('toast'),
    viewToggle:    $('btn-view-toggle'),
    iconGrid:      $('icon-grid'),
    iconList:      $('icon-list')
  };

  // ══════════════════════════════════════════════════════════════════════════
  // ── Init ──────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function init() {
    _bindEvents();
    _restoreViewMode();
    _restoreSidebar();
    _initSidebarResize();

    PreviewPlayer.init();
    PreviewPlayer.onClose(function () {
      state.selectedFile = null;
      var activeCards = dom.fileGrid.querySelectorAll('.file-card.active');
      for (var i = 0; i < activeCards.length; i++) {
        activeCards[i].classList.remove('active');
      }
    });

    // Dynamically sync theme with host skin
    syncThemeWithHost();
    try {
      cs.addEventListener("com.adobe.csxs.events.ThemeChanged", syncThemeWithHost);
    } catch (e) {}

    // 1. Instantly restore from localStorage so UI displays immediately
    _loadFromLocalStorage();
    if (state.folders.length > 0) {
      _renderFolderTree();
    }

    // 2. Load disk storage & connect to ExtendScript host
    _loadHostAndSettings();
    _pollSequenceInfo();
  }

  function _loadFromLocalStorage() {
    try {
      var f = localStorage.getItem(STORAGE_KEYS.folders);
      var foldersArr = f ? JSON.parse(f) : [];
      if (foldersArr && foldersArr.length > 0) {
        state.folders = foldersArr.map(normalizePath).filter(Boolean);
      }
      var fav = localStorage.getItem(STORAGE_KEYS.favorites);
      if (fav) state.favorites = JSON.parse(fav);
      var vm = localStorage.getItem(STORAGE_KEYS.viewMode);
      if (vm) state.viewMode = vm;
      var exp = localStorage.getItem(STORAGE_KEYS.expandedFolders);
      if (exp) state.expandedFolders = JSON.parse(exp);
      var side = localStorage.getItem(STORAGE_KEYS.sidebarCollapsed);
      if (side !== null) state.sidebarCollapsed = side === 'true';
      var act = localStorage.getItem(STORAGE_KEYS.activeFolder);
      if (act) state.activeFolder = normalizePath(act);
    } catch (e) {
      console.warn("LocalStorage read error:", e);
    }
  }

  function _loadHostAndSettings() {
    try {
      var extensionPath = cs.getSystemPath(SystemPath.EXTENSION).replace(/\\/g, '/');
      var jsxPath = extensionPath + "/host/index.jsx";
      cs.evalScript('$.evalFile(File("' + jsxPath.replace(/"/g, '\\"') + '"))', function () {
        _detectHostApp();
        _loadPersistentSettings(function () {
          if (state.folders.length > 0) {
            scanLibrary();
          } else {
            _showEmptyState();
          }
        });
      });
    } catch (e) {
      console.error("Host load error:", e);
      _detectHostApp();
      _loadPersistentSettings(function () {
        if (state.folders.length > 0) {
          scanLibrary();
        } else {
          _showEmptyState();
        }
      });
    }
  }

  function _detectHostApp() {
    try {
      cs.evalScript('getHostApp()', function (host) {
        if (host && host !== 'EvalScript error.') {
          state.host = host.replace(/"/g, '').trim();
          if (dom.hostBadge) {
            dom.hostBadge.textContent = (state.host === 'AEFT' ? 'After Effects' : 'Premiere Pro');
          }
        }
      });
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Multi-Tier Permanent Storage (Fix for Session Wipe Bug) ───────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _loadPersistentSettings(callback) {
    // 1. Try loading from ExtendScript permanent disk storage
    cs.evalScript('loadSettingsFromDisk()', function (res) {
      var loadedFromDisk = false;
      try {
        if (res && res !== 'EvalScript error.') {
          var parsed = JSON.parse(res);
          if (parsed && parsed.success && parsed.data) {
            var rawData = parsed.data;
            var jsonStr = rawData;
            // Decode if URI-encoded or parse directly
            try {
              if (rawData.indexOf('%7B') === 0 || rawData.indexOf('%7b') === 0 || rawData.indexOf('%') !== -1) {
                jsonStr = decodeURIComponent(rawData);
              }
            } catch (decErr) {}

            var diskData = JSON.parse(jsonStr);
            if (diskData && diskData.folders && diskData.folders.length > 0) {
              state.folders          = diskData.folders.map(normalizePath).filter(Boolean);
              state.favorites        = diskData.favorites || {};
              state.viewMode         = diskData.viewMode || 'grid';
              state.expandedFolders  = diskData.expandedFolders || {};
              state.sidebarCollapsed = !!diskData.sidebarCollapsed;
              state.activeFolder     = diskData.activeFolder ? normalizePath(diskData.activeFolder) : null;
              loadedFromDisk = true;
            }
          }
        }
      } catch (e) {
        console.warn("[Storage] ExtendScript disk read error:", e);
      }

      // 2. Node.js local storage fallback if ExtendScript disk file wasn't found
      if (!loadedFromDisk) {
        try {
          if (typeof require !== 'undefined') {
            var fs = require('fs');
            var path = require('path');
            var appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
            var settingsFilePath = path.join(appData, 'MyMediaLibrary', 'settings.json');
            if (fs.existsSync(settingsFilePath)) {
              var raw = fs.readFileSync(settingsFilePath, 'utf8');
              var nodeData = JSON.parse(raw);
              if (nodeData && nodeData.folders && nodeData.folders.length > 0) {
                state.folders          = nodeData.folders.map(normalizePath).filter(Boolean);
                state.favorites        = nodeData.favorites || {};
                state.viewMode         = nodeData.viewMode || 'grid';
                state.expandedFolders  = nodeData.expandedFolders || {};
                state.sidebarCollapsed = !!nodeData.sidebarCollapsed;
                state.activeFolder     = nodeData.activeFolder ? normalizePath(nodeData.activeFolder) : null;
                loadedFromDisk = true;
              }
            }
          }
        } catch (e) {
          console.warn("[Storage] Node.js settings read error:", e);
        }
      }

      // 3. If loaded from disk, sync to localStorage; if not loaded from disk but localStorage had items, migrate to disk
      if (loadedFromDisk) {
        _syncToLocalStorage();
      } else if (state.folders.length > 0) {
        _saveAllSettings();
      }

      _restoreViewMode();
      _restoreSidebar();

      if (callback) callback();
    });
  }

  function _syncToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.folders,          JSON.stringify(state.folders));
      localStorage.setItem(STORAGE_KEYS.favorites,        JSON.stringify(state.favorites));
      localStorage.setItem(STORAGE_KEYS.viewMode,         state.viewMode);
      localStorage.setItem(STORAGE_KEYS.expandedFolders,  JSON.stringify(state.expandedFolders));
      localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, state.sidebarCollapsed ? 'true' : 'false');
      if (state.activeFolder) {
        localStorage.setItem(STORAGE_KEYS.activeFolder, normalizePath(state.activeFolder));
      } else {
        localStorage.removeItem(STORAGE_KEYS.activeFolder);
      }
    } catch (e) {}
  }

  function _saveAllSettings() {
    // Deduplicate and normalize
    var uniqueFolders = [];
    state.folders.forEach(function (f) {
      var n = normalizePath(f);
      if (n && uniqueFolders.indexOf(n) === -1) uniqueFolders.push(n);
    });
    state.folders = uniqueFolders;

    var payload = {
      folders:          state.folders,
      favorites:        state.favorites,
      viewMode:         state.viewMode,
      expandedFolders:  state.expandedFolders,
      sidebarCollapsed: state.sidebarCollapsed,
      activeFolder:     state.activeFolder ? normalizePath(state.activeFolder) : null,
      updatedAt:        new Date().toISOString()
    };

    var jsonString = JSON.stringify(payload);

    // 1. Save to localStorage
    _syncToLocalStorage();

    // 2. Save to ExtendScript Disk file (URI-encoded to prevent ANY quote/backslash escaping bug)
    try {
      var encoded = encodeURIComponent(jsonString);
      cs.evalScript('saveSettingsToDisk("' + encoded + '")', function () {});
    } catch (e) {}

    // 3. Save via Node.js fs if available
    try {
      if (typeof require !== 'undefined') {
        var fs = require('fs');
        var path = require('path');
        var appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
        var dir = path.join(appData, 'MyMediaLibrary');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'settings.json'), jsonString, 'utf8');
      }
    } catch (e) {}
  }

  function _saveFolders()          { _saveAllSettings(); }
  function _saveFavorites()        { _saveAllSettings(); }
  function _saveViewMode()         { _saveAllSettings(); }
  function _saveExpandedFolders()  { _saveAllSettings(); }
  function _saveSidebarCollapsed() { _saveAllSettings(); }
  function _saveActiveFolder()     { _saveAllSettings(); }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Library Scanning ──────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function scanLibrary() {
    if (state.folders.length === 0) { _showEmptyState(); return; }
    _showLoading();

    FileScanner.scanFolders(cs, state.folders, function (result) {
      // Merge favorite state
      result.allFiles.forEach(function (f) {
        f.isFavorite = !!state.favorites[f.id];
      });

      state.allFiles = result.allFiles;
      state.byType   = result.byType;
      state.byFolder = result.byFolder;

      // Auto-expand roots if not set
      state.folders.forEach(function (fp) {
        var n = normalizePath(fp);
        if (state.expandedFolders[n] === undefined) {
          state.expandedFolders[n] = true;
        }
      });
      _saveExpandedFolders();

      _renderFolderTree();
      _renderLibrary();
      _updateFolderListModal();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Rendering ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _renderLibrary() {
    var files = _getFilteredFiles();

    dom.emptyState.style.display   = 'none';
    dom.loadingState.style.display = 'none';
    dom.fileGrid.style.display     = '';

    if (files.length === 0) {
      dom.noResults.style.display  = state.folders.length === 0 ? 'none' : 'flex';
      dom.emptyState.style.display = state.folders.length === 0 ? 'flex' : 'none';
      dom.fileGrid.style.display   = 'none';
      dom.fileCount.textContent    = '0 files';
      return;
    }

    dom.noResults.style.display  = 'none';
    dom.fileCount.textContent    = files.length + ' item' + (files.length !== 1 ? 's' : '');

    dom.fileGrid.innerHTML = '';
    var frag = document.createDocumentFragment();
    files.forEach(function (file) {
      frag.appendChild(_buildCard(file));
    });
    dom.fileGrid.appendChild(frag);
  }

  function _getFilteredFiles() {
    var pool;
    switch (state.activeTab) {
      case 'audio':     pool = state.byType.audio; break;
      case 'video':     pool = state.byType.video; break;
      case 'fx':        pool = state.byType.fx;    break;
      case 'favorites': pool = state.allFiles.filter(function (f) { return f.isFavorite; }); break;
      default:          pool = state.allFiles;
    }

    // Folder filter
    if (state.activeFolder) {
      var actNorm = normalizePath(state.activeFolder);
      pool = pool.filter(function (f) {
        var pNorm = normalizePath(f.parentFolder);
        return pNorm === actNorm || pNorm.indexOf(actNorm + '/') === 0;
      });
    }

    // Search filter
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      pool = pool.filter(function (f) { return f.name.toLowerCase().indexOf(q) !== -1; });
    }

    return pool;
  }

  // ── Card Builder (Apple Squircle Card) ────────────────────────────────────

  function _buildCard(file) {
    var el   = document.createElement('div');
    var type = file.mediaType; // 'audio' | 'video' | 'fx'

    el.className = 'file-card';
    if (state.selectedFile && state.selectedFile.id === file.id) {
      el.className += ' active';
    }
    el.dataset.id   = file.id;
    el.dataset.path = file.path;
    el.dataset.type = type;
    el.title = file.name + '\n' + file.path;

    var badgeClass = 'badge-' + type;
    var icon       = FileScanner.getTypeIcon(type, 26);
    var overlayPlayClass = 'play-overlay ' + type + '-type';
    var sizeStr    = FileScanner.formatSize(file.size);
    var extLabel   = type === 'fx' ? FileScanner.getFXLabel(file.ext) : file.ext.toUpperCase();

    el.innerHTML = [
      '<div class="card-thumb">',
        '<div class="type-icon" style="color:var(--accent-' + type + ')">' + icon + '</div>',
        '<div class="card-overlay">',
          '<button class="overlay-btn ' + overlayPlayClass + '" data-action="preview" title="Preview">',
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
          '</button>',
          '<button class="overlay-btn" data-action="timeline" title="Insert to Playhead (Timeline/Comp)">',
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
          '</button>',
          '<button class="overlay-btn" data-action="import" title="Import to Project">',
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
          '</button>',
        '</div>',
      '</div>',
      '<button class="card-fav' + (file.isFavorite ? ' is-fav' : '') + '" data-action="favorite" title="Favorite">',
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="' + (file.isFavorite ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
          '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
        '</svg>',
      '</button>',
      '<div class="card-info">',
        '<div class="card-name">' + _escapeHTML(file.name) + '</div>',
        '<div class="card-meta">',
          '<span class="card-ext-badge ' + badgeClass + '">' + extLabel + '</span>',
          (sizeStr ? '<span>' + sizeStr + '</span>' : ''),
        '</div>',
      '</div>'
    ].join('');

    // Events
    el.addEventListener('click',       function (e) { _onCardClick(e, file); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); _showContextMenu(e, file); });
    el.addEventListener('dblclick',    function (e) { e.preventDefault(); _importToTimeline(file); });

    // Hover autoplay for audio files
    if (type === 'audio') {
      el.addEventListener('mouseenter', function () {
        PreviewPlayer.openAudio(file);
      });
      el.addEventListener('mouseleave', function () {
        if (PreviewPlayer.getFile() && PreviewPlayer.getFile().id === file.id) {
          if (!state.selectedFile || state.selectedFile.id !== file.id) {
            PreviewPlayer.pause();
          }
        }
      });
    }

    // Drag & Drop to Timeline / Project for Premiere Pro and After Effects
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', function (e) {
      var nativePath = file.path.replace(/\//g, '\\');
      e.dataTransfer.setData('com.adobe.cep.dnd.file.0', nativePath);
      e.dataTransfer.setData('text/plain', nativePath);

      // Create a clean Apple-style drag preview pill
      var dragGhost = document.createElement('div');
      dragGhost.style.position = 'absolute';
      dragGhost.style.top = '-1000px';
      dragGhost.style.left = '-1000px';
      dragGhost.style.background = '#1e1e22';
      dragGhost.style.color = '#ffffff';
      dragGhost.style.padding = '5px 10px';
      dragGhost.style.border = '1px solid #0a84ff';
      dragGhost.style.borderRadius = '8px';
      dragGhost.style.fontSize = '11px';
      dragGhost.style.fontFamily = 'inherit';
      dragGhost.style.display = 'flex';
      dragGhost.style.alignItems = 'center';
      dragGhost.style.gap = '6px';
      dragGhost.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      dragGhost.style.pointerEvents = 'none';
      dragGhost.style.zIndex = '10000';

      dragGhost.innerHTML = '<span>' + _escapeHTML(file.name) + '</span>';
      document.body.appendChild(dragGhost);
      e.dataTransfer.setDragImage(dragGhost, 10, 10);

      setTimeout(function () {
        if (dragGhost.parentNode) dragGhost.parentNode.removeChild(dragGhost);
      }, 0);
    });

    return el;
  }

  // ── Card Click Handler ────────────────────────────────────────────────────

  function _onCardClick(e, file) {
    var action = e.target.closest('[data-action]');
    if (!action || action.dataset.action === 'preview') {
      var activeCards = dom.fileGrid.querySelectorAll('.file-card.active');
      for (var i = 0; i < activeCards.length; i++) {
        activeCards[i].classList.remove('active');
      }
      var cardEl = e.currentTarget;
      if (cardEl) cardEl.classList.add('active');

      state.selectedFile = file;
      _previewFile(file);
      return;
    }
    var a = action.dataset.action;
    if (a === 'import')   { e.stopPropagation(); _importToProject(file); }
    if (a === 'timeline') { e.stopPropagation(); _importToTimeline(file); }
    if (a === 'favorite') { e.stopPropagation(); _toggleFavorite(file); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Preview ───────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _previewFile(file) {
    if (file.canAudio) {
      PreviewPlayer.openAudio(file);
    } else if (file.canVideo) {
      PreviewPlayer.openVideo(file);
    } else if (file.mediaType === 'fx') {
      PreviewPlayer.close();
      showToast('⚡ ' + FileScanner.getFXLabel(file.ext) + ': ' + file.name + ' — double-click to add', 3500);
    } else {
      PreviewPlayer.close();
      showToast('Preview not available for .' + file.ext + ' files', 2000);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Host Actions (Premiere Pro & After Effects) ───────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _importToProject(file) {
    var safePath = file.path.replace(/'/g, "\\'");
    var script = "importFilesToProject('" + safePath + "')";
    cs.evalScript(script, function (result) {
      try {
        var r = JSON.parse(result);
        if (r.success) showToast('✓ Imported to project: ' + file.name, 2000, 'success');
        else           showToast('✗ ' + (r.error || 'Import failed'), 3000, 'error');
      } catch(e) { showToast('✗ Import failed', 2000, 'error'); }
    });
  }

  function _importToTimeline(file) {
    var safePath = file.path.replace(/'/g, "\\'");
    var script = "importFileToTimeline('" + safePath + "')";
    cs.evalScript(script, function (result) {
      try {
        var r = JSON.parse(result);
        if (r.success) {
          var targetName = state.host === 'AEFT' ? 'composition' : 'timeline';
          showToast('🎯 Added to ' + targetName + ': ' + file.name, 2200, 'success');
        } else {
          showToast('✗ ' + (r.error || 'Timeline insert failed'), 3500, 'error');
        }
      } catch(e) { showToast('✗ Timeline insert failed', 2000, 'error'); }
    });
  }

  function _revealInExplorer(file) {
    var safePath = file.path.replace(/'/g, "\\'");
    cs.evalScript("revealInExplorer('" + safePath + "')", function () {});
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Favorites ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _toggleFavorite(file) {
    file.isFavorite = !file.isFavorite;
    if (file.isFavorite) state.favorites[file.id] = true;
    else                 delete state.favorites[file.id];
    _saveFavorites();
    _refreshCard(file);
    if (state.activeTab === 'favorites') _renderLibrary();
  }

  function _refreshCard(file) {
    var card = dom.fileGrid.querySelector('[data-id="' + file.id + '"]');
    if (!card) return;
    var favBtn = card.querySelector('.card-fav');
    if (!favBtn) return;
    if (file.isFavorite) favBtn.classList.add('is-fav');
    else                 favBtn.classList.remove('is-fav');
    var heartSVG = favBtn.querySelector('path');
    if (heartSVG) heartSVG.setAttribute('fill', file.isFavorite ? 'currentColor' : 'none');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Folder Management ─────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _triggerAddFolder() {
    cs.evalScript('selectLocalFolder()', function (result) {
      if (result === "EvalScript error.") {
        try {
          var extensionPath = cs.getSystemPath(SystemPath.EXTENSION).replace(/\\/g, '/');
          var jsxPath = extensionPath + "/host/index.jsx";
          cs.evalScript('$.evalFile(File("' + jsxPath.replace(/"/g, '\\"') + '"))', function () {
            cs.evalScript('selectLocalFolder()', function (retryResult) {
              _handleSelectFolderResult(retryResult);
            });
          });
        } catch (e) {
          showToast("Error loading host script: " + e.message, 4000, "error");
        }
      } else {
        _handleSelectFolderResult(result);
      }
    });
  }

  function _handleSelectFolderResult(result) {
    try {
      var r = JSON.parse(result);
      if (r && r.success && r.path) {
        var norm = normalizePath(r.path);
        if (dom.folderInput && dom.folderModal.style.display !== 'none') {
          dom.folderInput.value = norm;
        } else {
          _addFolder(norm);
        }
      }
    } catch (e) {
      console.error("Select folder result error:", e);
    }
  }

  function _addFolder(path) {
    path = normalizePath(path);
    if (!path) return;
    if (state.folders.indexOf(path) !== -1) {
      showToast('Folder already in library', 1800);
      return;
    }
    state.folders.push(path);
    _saveFolders();
    if (dom.folderInput) dom.folderInput.value = '';
    showToast('✓ Folder added and memorised', 2000, 'success');
    scanLibrary();
    _updateFolderListModal();
  }

  function _removeFolder(path) {
    path = normalizePath(path);
    if (!confirm("Remove this watch folder from your library?\n\n" + path)) {
      return;
    }
    state.folders = state.folders.filter(function (f) { return normalizePath(f) !== path; });
    _saveFolders();

    // Clean up cache
    state.allFiles = state.allFiles.filter(function (f) {
      var pf = normalizePath(f.parentFolder);
      return pf !== path && pf.indexOf(path + '/') !== 0;
    });
    state.byType.audio = state.byType.audio.filter(function (f) {
      var pf = normalizePath(f.parentFolder);
      return pf !== path && pf.indexOf(path + '/') !== 0;
    });
    state.byType.video = state.byType.video.filter(function (f) {
      var pf = normalizePath(f.parentFolder);
      return pf !== path && pf.indexOf(path + '/') !== 0;
    });
    state.byType.fx = state.byType.fx.filter(function (f) {
      var pf = normalizePath(f.parentFolder);
      return pf !== path && pf.indexOf(path + '/') !== 0;
    });
    delete state.byFolder[path];

    delete state.expandedFolders[path];
    Object.keys(state.expandedFolders).forEach(function (k) {
      if (k.indexOf(path + '/') === 0) delete state.expandedFolders[k];
    });
    _saveExpandedFolders();

    if (state.activeFolder && (normalizePath(state.activeFolder) === path || normalizePath(state.activeFolder).indexOf(path + '/') === 0)) {
      state.activeFolder = null;
      _saveActiveFolder();
    }

    _renderFolderTree();
    _renderLibrary();
    _updateFolderListModal();
    showToast('Folder removed', 1800);
  }

  function _updateFolderListModal() {
    dom.folderList.innerHTML = '';
    if (state.folders.length === 0) {
      dom.folderList.innerHTML = '<p style="font-size:11px;color:var(--text-muted);padding:8px 0">No folders added yet.</p>';
      return;
    }
    state.folders.forEach(function (rawPath) {
      var fp       = normalizePath(rawPath);
      var parts    = fp.split('/');
      var name     = parts[parts.length - 1] || fp;
      var count    = state.byFolder[fp] ? state.byFolder[fp].length : '…';
      var el       = document.createElement('div');
      el.className = 'folder-item';
      el.innerHTML = [
        '<div class="folder-item-icon">',
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        '</div>',
        '<div class="folder-item-info">',
          '<span class="folder-item-name">' + _escapeHTML(name) + '</span>',
          '<span class="folder-item-path" title="' + _escapeHTML(fp) + '">' + _escapeHTML(fp) + '</span>',
          '<span class="folder-item-count">' + count + ' items</span>',
        '</div>',
        '<button class="btn-remove-folder" data-path="' + _escapeHTML(fp) + '" title="Remove folder">',
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        '</button>'
      ].join('');
      el.querySelector('.btn-remove-folder').addEventListener('click', function () {
        _removeFolder(fp);
      });
      dom.folderList.appendChild(el);
    });
  }

  // ── Folder Tree (Finder / Notion Style) ───────────────────────────────────

  function _renderFolderTree() {
    if (state.folders.length === 0) {
      dom.folderTree.innerHTML = '<div style="font-size:10.5px;color:var(--text-muted);padding:8px 8px">No watch folders.</div>';
      return;
    }

    dom.folderTree.innerHTML = '';
    var tree = _buildTreeData(state.folders, state.allFiles);
    var frag = document.createDocumentFragment();

    // "All Directories" node
    var allRow = document.createElement('div');
    allRow.className = 'tree-row' + (state.activeFolder === null ? ' active' : '');
    allRow.innerHTML = [
      '<div class="tree-toggle empty"></div>',
      '<div class="tree-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>',
      '<div class="tree-label">All Directories</div>'
    ].join('');
    allRow.addEventListener('click', function () {
      _selectFolder(null);
    });
    frag.appendChild(allRow);

    // Root nodes
    state.folders.forEach(function (rawRoot) {
      var rootPath = normalizePath(rawRoot);
      if (tree[rootPath]) {
        _renderTreeNode(tree[rootPath], 0, frag);
      }
    });

    dom.folderTree.appendChild(frag);
  }

  function _buildTreeData(watchedRoots, allFiles) {
    var tree = {};
    watchedRoots.forEach(function (rawRoot) {
      var rootPath = normalizePath(rawRoot);
      var parts = rootPath.split('/');
      var name = parts[parts.length - 1] || rootPath;
      tree[rootPath] = {
        path: rootPath,
        name: name,
        children: {},
        isRoot: true
      };
    });

    allFiles.forEach(function (file) {
      var parentPath = normalizePath(file.parentFolder);
      var matchedRoot = null;
      watchedRoots.forEach(function (rawRoot) {
        var root = normalizePath(rawRoot);
        if (parentPath === root || parentPath.indexOf(root + '/') === 0) {
          matchedRoot = root;
        }
      });

      if (!matchedRoot) return;

      var relPath = parentPath.substring(matchedRoot.length);
      if (relPath.charAt(0) === '/') relPath = relPath.substring(1);
      if (!relPath) return;

      var segments = relPath.split('/');
      var current = tree[matchedRoot];
      var currentPath = matchedRoot;

      segments.forEach(function (segment) {
        currentPath += '/' + segment;
        if (!current.children[segment]) {
          current.children[segment] = {
            path: currentPath,
            name: segment,
            children: {}
          };
        }
        current = current.children[segment];
      });
    });

    return tree;
  }

  function _renderTreeNode(node, depth, container) {
    var hasChildren = Object.keys(node.children).length > 0;
    var nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node';

    var rowEl = document.createElement('div');
    var isCurrentActive = state.activeFolder && (normalizePath(state.activeFolder) === normalizePath(node.path));
    rowEl.className = 'tree-row' + (isCurrentActive ? ' active' : '');
    
    // Indentation
    for (var i = 0; i < depth; i++) {
      var spacer = document.createElement('div');
      spacer.className = 'tree-indent';
      rowEl.appendChild(spacer);
    }

    // Disclosure toggle chevron
    var toggleBtn = document.createElement('div');
    toggleBtn.className = 'tree-toggle';
    if (hasChildren) {
      var isExpanded = !!state.expandedFolders[node.path];
      toggleBtn.innerHTML = isExpanded ? '▼' : '▶';
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _toggleFolderExpand(node.path);
      });
    } else {
      toggleBtn.classList.add('empty');
    }
    rowEl.appendChild(toggleBtn);

    // Icon
    var iconEl = document.createElement('div');
    iconEl.className = 'tree-icon';
    iconEl.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    rowEl.appendChild(iconEl);

    // Label
    var labelEl = document.createElement('div');
    labelEl.className = 'tree-label';
    labelEl.textContent = node.name;
    rowEl.appendChild(labelEl);

    rowEl.addEventListener('click', function () {
      _selectFolder(node.path);
    });

    rowEl.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      _showFolderContextMenu(e, node);
    });

    nodeEl.appendChild(rowEl);

    if (hasChildren) {
      var childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      var isExpanded = !!state.expandedFolders[node.path];
      if (isExpanded) childrenContainer.classList.add('expanded');

      var sortedKeys = Object.keys(node.children).sort();
      sortedKeys.forEach(function (key) {
        _renderTreeNode(node.children[key], depth + 1, childrenContainer);
      });

      nodeEl.appendChild(childrenContainer);
    }

    container.appendChild(nodeEl);
  }

  function _toggleFolderExpand(folderPath) {
    var norm = normalizePath(folderPath);
    state.expandedFolders[norm] = !state.expandedFolders[norm];
    _saveExpandedFolders();
    _renderFolderTree();
  }

  function _selectFolder(folderPath) {
    state.activeFolder = folderPath ? normalizePath(folderPath) : null;
    _saveActiveFolder();
    _renderFolderTree();
    _renderLibrary();
  }

  function _restoreSidebar() {
    var storedWidth = localStorage.getItem('mml_sidebar_width');
    if (storedWidth) {
      dom.sidebarPanel.style.width = storedWidth + 'px';
      dom.sidebarPanel.style.minWidth = storedWidth + 'px';
    }
    if (state.sidebarCollapsed) {
      dom.sidebarPanel.classList.add('collapsed');
    } else {
      dom.sidebarPanel.classList.remove('collapsed');
    }
  }

  function _initSidebarResize() {
    var resizer = $('sidebar-resizer');
    var sidebar = $('sidebar-panel');
    if (!resizer || !sidebar) return;

    var isDragging = false;

    resizer.addEventListener('mousedown', function (e) {
      isDragging = true;
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    var currentWidth = 0;

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var containerRect = sidebar.parentElement.getBoundingClientRect();
      var newWidth = e.clientX - containerRect.left;
      newWidth = Math.max(110, Math.min(newWidth, Math.min(420, containerRect.width - 150)));
      sidebar.style.width = newWidth + 'px';
      sidebar.style.minWidth = newWidth + 'px';
      currentWidth = newWidth;
    });

    document.addEventListener('mouseup', function () {
      if (isDragging) {
        isDragging = false;
        resizer.classList.remove('active');
        document.body.style.cursor = '';
        if (currentWidth) {
          localStorage.setItem('mml_sidebar_width', currentWidth);
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Context Menus ─────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _showContextMenu(e, file) {
    state.contextFile = file;
    var menu = dom.contextMenu;

    var x = e.clientX;
    var y = e.clientY;
    if (x + 190 > window.innerWidth)  x = window.innerWidth - 195;
    if (y + 170 > window.innerHeight) y = window.innerHeight - 175;

    menu.style.left    = x + 'px';
    menu.style.top     = y + 'px';
    menu.style.display = '';

    var previewBtn = $('ctx-preview');
    var canPrev    = file.canAudio || file.canVideo;
    previewBtn.style.opacity       = canPrev ? '1' : '0.4';
    previewBtn.style.pointerEvents = canPrev ? '' : 'none';
  }

  function _hideContextMenu() {
    dom.contextMenu.style.display = 'none';
  }

  function _showFolderContextMenu(e, node) {
    state.contextFolderNode = node;
    var menu = dom.folderContextMenu;
    if (!menu) return;

    var removeBtn = $('ctx-folder-remove');
    if (removeBtn) removeBtn.style.display = node.isRoot ? '' : 'none';

    var x = e.clientX;
    var y = e.clientY;
    if (x + 190 > window.innerWidth)  x = window.innerWidth - 195;
    if (y + 110 > window.innerHeight) y = window.innerHeight - 115;

    menu.style.left    = x + 'px';
    menu.style.top     = y + 'px';
    menu.style.display = '';
  }

  function _hideFolderContextMenu() {
    if (dom.folderContextMenu) dom.folderContextMenu.style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Sequence / Composition Status Polling ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _pollSequenceInfo() {
    cs.evalScript('getActiveSequenceInfo()', function (result) {
      try {
        var r = JSON.parse(result);
        state.seqInfo = r;
        _updateSeqStatus(r);
      } catch (e) {}
    });
    setTimeout(_pollSequenceInfo, 4000);
  }

  function _updateSeqStatus(info) {
    if (!info || !info.hasSequence) {
      dom.seqInfo.innerHTML = '';
      return;
    }
    dom.seqInfo.innerHTML =
      '<span class="seq-dot"></span>' +
      '<span>' + _escapeHTML(info.seqName || '') + '</span>';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Toast Notifications ───────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  var _toastTimeout = null;

  function showToast(msg, duration, type) {
    var t = dom.toast;
    t.textContent = msg;
    t.className   = 'apple-toast' + (type ? ' toast-' + type : '');
    t.style.display = '';
    if (_toastTimeout) clearTimeout(_toastTimeout);
    _toastTimeout = setTimeout(function () { t.style.display = 'none'; }, duration || 2200);
  }
  window.showToast = showToast;

  // ══════════════════════════════════════════════════════════════════════════
  // ── View Mode ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _restoreViewMode() {
    _applyViewMode(state.viewMode);
  }

  function _applyViewMode(mode) {
    state.viewMode = mode;
    if (mode === 'list') {
      dom.fileGrid.classList.add('list-view');
      dom.iconGrid.style.display = '';
      dom.iconList.style.display = 'none';
    } else {
      dom.fileGrid.classList.remove('list-view');
      dom.iconGrid.style.display = 'none';
      dom.iconList.style.display = '';
    }
    _saveViewMode();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── UI States ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _showEmptyState() {
    dom.emptyState.style.display   = 'flex';
    dom.loadingState.style.display = 'none';
    dom.noResults.style.display    = 'none';
    dom.fileGrid.style.display     = 'none';
    dom.fileCount.textContent      = '0 files';
  }

  function _showLoading() {
    dom.emptyState.style.display   = 'none';
    dom.loadingState.style.display = 'flex';
    dom.noResults.style.display    = 'none';
    dom.fileGrid.style.display     = 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Event Binding ─────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _bindEvents() {
    // Segmented Tabs
    document.querySelectorAll('.seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.activeTab = btn.dataset.tab;
        _renderLibrary();
      });
    });

    // Search
    dom.searchInput.addEventListener('input', function () {
      state.searchQuery = this.value.trim();
      dom.clearSearch.style.display = state.searchQuery ? '' : 'none';
      _renderLibrary();
    });
    dom.clearSearch.addEventListener('click', function () {
      dom.searchInput.value = '';
      state.searchQuery = '';
      this.style.display = 'none';
      _renderLibrary();
    });

    // Add Folder triggers
    $('btn-add-folder').addEventListener('click', function () { _openFolderModal(false); });
    $('btn-empty-add').addEventListener('click',  function () { _openFolderModal(true); });
    if (dom.sidebarAdd) {
      dom.sidebarAdd.addEventListener('click', function () { _openFolderModal(false); });
    }
    $('btn-close-modal').addEventListener('click', _closeFolderModal);
    $('folder-modal').addEventListener('click', function (e) {
      if (e.target === this) _closeFolderModal();
    });

    if (dom.btnBrowseAdd) {
      dom.btnBrowseAdd.addEventListener('click', _triggerAddFolder);
    }
    if (dom.btnAddPath) {
      dom.btnAddPath.addEventListener('click', function () {
        if (dom.folderInput) _addFolder(dom.folderInput.value);
      });
    }
    if (dom.folderInput) {
      dom.folderInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') _addFolder(this.value);
      });
    }
    $('btn-scan-all').addEventListener('click', function () {
      _closeFolderModal();
      scanLibrary();
    });

    // Refresh
    $('btn-refresh').addEventListener('click', scanLibrary);

    // Sidebar toggle
    dom.sidebarToggle.addEventListener('click', function () {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      _saveSidebarCollapsed();
      _restoreSidebar();
    });

    // View toggle
    dom.viewToggle.addEventListener('click', function () {
      _applyViewMode(state.viewMode === 'grid' ? 'list' : 'grid');
      _renderLibrary();
    });

    // Card Context menu actions
    $('ctx-preview').addEventListener('click', function () {
      if (state.contextFile) _previewFile(state.contextFile);
      _hideContextMenu();
    });
    $('ctx-import').addEventListener('click', function () {
      if (state.contextFile) _importToProject(state.contextFile);
      _hideContextMenu();
    });
    $('ctx-timeline').addEventListener('click', function () {
      if (state.contextFile) _importToTimeline(state.contextFile);
      _hideContextMenu();
    });
    $('ctx-favorite').addEventListener('click', function () {
      if (state.contextFile) _toggleFavorite(state.contextFile);
      _hideContextMenu();
    });
    $('ctx-reveal').addEventListener('click', function () {
      if (state.contextFile) _revealInExplorer(state.contextFile);
      _hideContextMenu();
    });

    // Folder context menu actions
    $('ctx-folder-remove').addEventListener('click', function () {
      if (state.contextFolderNode && state.contextFolderNode.isRoot) {
        _removeFolder(state.contextFolderNode.path);
      }
      _hideFolderContextMenu();
    });
    $('ctx-folder-reveal').addEventListener('click', function () {
      if (state.contextFolderNode) {
        var safePath = state.contextFolderNode.path.replace(/'/g, "\\'");
        cs.evalScript("revealFolder('" + safePath + "')", function () {});
      }
      _hideFolderContextMenu();
    });

    // Close popovers on click outside
    document.addEventListener('click', function (e) {
      if (dom.contextMenu && !dom.contextMenu.contains(e.target)) _hideContextMenu();
      if (dom.folderContextMenu && !dom.folderContextMenu.contains(e.target)) _hideFolderContextMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { 
        _hideContextMenu(); 
        _hideFolderContextMenu(); 
        _closeFolderModal(); 
      }
    });
  }

  function _openFolderModal(triggerBrowse) {
    _updateFolderListModal();
    dom.folderModal.style.display = 'flex';
    if (dom.folderInput) {
      setTimeout(function () { dom.folderInput.focus(); }, 100);
    }
    if (triggerBrowse === true) {
      _triggerAddFolder();
    }
  }

  function _closeFolderModal() {
    dom.folderModal.style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── Utilities ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  function _escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syncThemeWithHost() {
    try {
      var hostEnv = cs.getHostEnvironment();
      if (hostEnv && hostEnv.appSkinInfo) {
        var skin = hostEnv.appSkinInfo;
        var bg = skin.panelBackgroundColor.color;
        var bgR = Math.round(bg.red);
        var bgG = Math.round(bg.green);
        var bgB = Math.round(bg.blue);

        var root = document.documentElement;
        if (bgR > 128) {
          // Light theme adaptation
          root.style.setProperty('--bg-base', '#f5f5f7');
          root.style.setProperty('--bg-surface', '#ffffff');
          root.style.setProperty('--bg-card', 'rgba(0,0,0,0.03)');
          root.style.setProperty('--bg-card-hover', 'rgba(0,0,0,0.06)');
          root.style.setProperty('--bg-modal', '#ffffff');
          root.style.setProperty('--border', 'rgba(0,0,0,0.1)');
          root.style.setProperty('--text-primary', '#1d1d1f');
          root.style.setProperty('--text-secondary', '#86868b');
          root.style.setProperty('--text-muted', '#a1a1a6');
        }
      }
    } catch(e) {}
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

