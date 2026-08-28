/**
 * My Media Library - ExtendScript Host Script
 * Compatible with Adobe Premiere Pro (PPRO) & Adobe After Effects (AEFT)
 * Runs in ExtendScript ES3 engine
 */

// ─── Utility ────────────────────────────────────────────────────────────────

var MML_JSON = {
    stringify: function (obj) {
        var t = typeof obj;
        if (t === 'string') {
            return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
        }
        if (t === 'number' || t === 'boolean') return String(obj);
        if (obj === null) return 'null';
        if (obj instanceof Array) {
            var items = [];
            for (var i = 0; i < obj.length; i++) items.push(MML_JSON.stringify(obj[i]));
            return '[' + items.join(',') + ']';
        }
        if (t === 'object') {
            var pairs = [];
            for (var k in obj) {
                if (obj.hasOwnProperty(k)) {
                    pairs.push('"' + k + '":' + MML_JSON.stringify(obj[k]));
                }
            }
            return '{' + pairs.join(',') + '}';
        }
        return '""';
    },
    parse: function (str) {
        return eval('(' + str + ')');
    }
};

/**
 * Detect current host application.
 * @returns {string} 'PPRO' | 'AEFT' | 'UNKNOWN'
 */
function getHostApp() {
    try {
        if (typeof BridgeTalk !== 'undefined' && BridgeTalk.appName) {
            var btName = BridgeTalk.appName.toLowerCase();
            if (btName.indexOf('aftereffects') !== -1) return 'AEFT';
            if (btName.indexOf('premiere') !== -1) return 'PPRO';
        }
    } catch (e) {}

    try {
        if (typeof app !== 'undefined' && app.name) {
            var appName = app.name.toLowerCase();
            if (appName.indexOf('after effects') !== -1) return 'AEFT';
            if (appName.indexOf('premiere') !== -1) return 'PPRO';
        }
    } catch (e) {}

    // In After Effects, CompItem is defined in global scope
    try {
        if (typeof CompItem !== 'undefined') return 'AEFT';
    } catch (e) {}

    return 'PPRO'; // Default fallback
}

// ─── Permanent Disk Settings Storage ────────────────────────────────────────

/**
 * Save settings JSON directly to user's AppData disk storage.
 * Ensures folders and configuration are remembered forever across all sessions and hosts.
 */
function saveSettingsToDisk(settingsJsonStr) {
    try {
        var baseDir = Folder.userData;
        if (!baseDir.exists) {
            baseDir = Folder.myDocuments;
        }
        var mmlFolder = new Folder(baseDir.fsName + "/MyMediaLibrary");
        if (!mmlFolder.exists) {
            mmlFolder.create();
        }
        var settingsFile = new File(mmlFolder.fsName + "/settings.json");
        settingsFile.encoding = "UTF-8";
        if (settingsFile.open("w")) {
            settingsFile.write(settingsJsonStr);
            settingsFile.close();
            return MML_JSON.stringify({ success: true, path: settingsFile.fsName });
        } else {
            return MML_JSON.stringify({ success: false, error: "Cannot open file for writing" });
        }
    } catch (e) {
        return MML_JSON.stringify({ success: false, error: e.message });
    }
}

/**
 * Load settings JSON from user's AppData disk storage.
 */
function loadSettingsFromDisk() {
    try {
        var baseDir = Folder.userData;
        if (!baseDir.exists) {
            baseDir = Folder.myDocuments;
        }
        var settingsFile = new File(baseDir.fsName + "/MyMediaLibrary/settings.json");
        if (!settingsFile.exists) {
            return MML_JSON.stringify({ success: false, error: "Settings file not found" });
        }
        settingsFile.encoding = "UTF-8";
        if (settingsFile.open("r")) {
            var content = settingsFile.read();
            settingsFile.close();
            return MML_JSON.stringify({ success: true, data: content });
        } else {
            return MML_JSON.stringify({ success: false, error: "Cannot open file for reading" });
        }
    } catch (e) {
        return MML_JSON.stringify({ success: false, error: e.message });
    }
}

// ─── File System ─────────────────────────────────────────────────────────────

/**
 * Recursively scan a folder and return all files as a JSON array.
 * @param {string} folderPath - Absolute OS path to the folder
 * @param {number} maxDepth   - Max recursion depth (default: 4)
 * @returns {string} JSON string: { files: [{name, path, ext, size, parentFolder}] } | { error }
 */
function getFolderContents(folderPath, maxDepth) {
    try {
        maxDepth = (typeof maxDepth === 'number') ? maxDepth : 4;
        var folder = new Folder(folderPath);
        if (!folder.exists) {
            return MML_JSON.stringify({ error: 'Folder not found: ' + folderPath });
        }
        var files = [];
        _scanFolder(folder, files, 0, maxDepth);
        return MML_JSON.stringify({ files: files });
    } catch (e) {
        return MML_JSON.stringify({ error: 'ExtendScript scan error: ' + e.message });
    }
}

function _scanFolder(folder, files, depth, maxDepth) {
    if (depth > maxDepth) return;
    var items;
    try { 
        items = folder.getFiles(); 
    } catch (e) { 
        return; 
    }
    if (!items) return;

    for (var i = 0; i < items.length; i++) {
        try {
            var item = items[i];
            if (!item) continue;
            
            if (item instanceof Folder) {
                // Ignore hidden folders
                if (item.name.charAt(0) === '.') continue;
                _scanFolder(item, files, depth + 1, maxDepth);
            } else if (item instanceof File) {
                var name = item.name;
                if (name.charAt(0) === '.') continue;
                var dotIdx = name.lastIndexOf('.');
                var ext = (dotIdx > -1) ? name.substring(dotIdx + 1).toLowerCase() : '';
                files.push({
                    name:         name,
                    path:         item.fsName,
                    ext:          ext,
                    size:         item.length,
                    parentFolder: folder.fsName,
                    folderName:   folder.name
                });
            }
        } catch (e) {
            // Skip problematic files and keep scanning
        }
    }
}

/**
 * Check if a single file exists on disk.
 */
function fileExists(filePath) {
    var f = new File(filePath);
    return MML_JSON.stringify({ exists: f.exists });
}

// ─── Project Import (Dual Host: Premiere Pro & After Effects) ────────────────

/**
 * Import one or more files into the active project root/bins.
 * @param {string} filePaths - Delimited list ('||') of absolute file paths
 * @returns {string} JSON
 */
function importFilesToProject(filePaths) {
    var host = getHostApp();

    if (!app.project) {
        return MML_JSON.stringify({ success: false, error: 'No project is open.' });
    }

    try {
        var paths = filePaths.split('||');
        var importedCount = 0;

        if (host === 'AEFT') {
            // After Effects Import Logic
            app.beginUndoGroup("Import Media from Library");
            for (var i = 0; i < paths.length; i++) {
                var p = paths[i];
                if (!p) continue;
                var f = new File(p);
                if (f.exists) {
                    var io = new ImportOptions(f);
                    if (io.canImportAs(ImportAsType.FOOTAGE)) {
                        io.importAs = ImportAsType.FOOTAGE;
                    }
                    app.project.importFile(io);
                    importedCount++;
                }
            }
            app.endUndoGroup();
            return MML_JSON.stringify({ success: true, count: importedCount, host: 'AEFT' });
        } else {
            // Premiere Pro Import Logic
            app.project.importFiles(paths, false, app.project.rootItem, false);
            return MML_JSON.stringify({ success: true, count: paths.length, host: 'PPRO' });
        }
    } catch (e) {
        return MML_JSON.stringify({ success: false, error: e.message });
    }
}

// ─── Timeline / Composition Insertion ────────────────────────────────────────

/**
 * Import a file and insert it at the current playhead on the active sequence / composition.
 * @param {string} filePath - Absolute path to the media file
 * @returns {string} JSON
 */
function importFileToTimeline(filePath) {
    var host = getHostApp();

    if (!app.project) {
        return MML_JSON.stringify({ success: false, error: 'No project is open.' });
    }

    var fileName = filePath.replace(/\\/g, '/').split('/').pop();

    try {
        if (host === 'AEFT') {
            // After Effects Active Comp Layer Insertion
            var comp = app.project.activeItem;
            if (!comp || !(comp instanceof CompItem)) {
                return MML_JSON.stringify({
                    success: false,
                    error: 'No active composition. Please open or click a composition in After Effects first.'
                });
            }

            var f = new File(filePath);
            if (!f.exists) {
                return MML_JSON.stringify({ success: false, error: 'File not found on disk: ' + filePath });
            }

            app.beginUndoGroup("Add " + fileName + " to Comp");
            var io = new ImportOptions(f);
            if (io.canImportAs(ImportAsType.FOOTAGE)) {
                io.importAs = ImportAsType.FOOTAGE;
            }
            var footageItem = app.project.importFile(io);
            var layer = comp.layers.add(footageItem);
            layer.startTime = comp.time;
            app.endUndoGroup();

            return MML_JSON.stringify({ success: true, file: fileName, host: 'AEFT' });
        } else {
            // Premiere Pro Active Sequence Insertion
            var seq = app.project.activeSequence;
            if (!seq) {
                return MML_JSON.stringify({
                    success: false,
                    error: 'No active sequence. Please open or create a sequence first.'
                });
            }

            app.project.importFiles([filePath], false, app.project.rootItem, false);
            var projectItem = _findProjectItemByName(app.project.rootItem, fileName);
            if (!projectItem) {
                return MML_JSON.stringify({ success: false, error: 'Could not locate imported item in project: ' + fileName });
            }

            var playheadSecs = seq.getPlayerPosition().seconds.toString();

            var audioExts = { mp3:1, wav:1, aac:1, m4a:1, ogg:1, flac:1, aiff:1, aif:1 };
            var dotIdx    = filePath.lastIndexOf('.');
            var ext       = (dotIdx > -1) ? filePath.substring(dotIdx + 1).toLowerCase() : '';

            if (audioExts[ext]) {
                if (seq.audioTracks.numTracks < 1) {
                    return MML_JSON.stringify({ success: false, error: 'No audio tracks in sequence.' });
                }
                seq.audioTracks[0].insertClip(projectItem, playheadSecs);
            } else {
                if (seq.videoTracks.numTracks < 1) {
                    return MML_JSON.stringify({ success: false, error: 'No video tracks in sequence.' });
                }
                seq.videoTracks[0].insertClip(projectItem, playheadSecs);
            }

            return MML_JSON.stringify({ success: true, file: fileName, host: 'PPRO' });
        }
    } catch (e) {
        return MML_JSON.stringify({ success: false, error: e.message });
    }
}

function _findProjectItemByName(parentItem, name) {
    if (!parentItem || !parentItem.children) return null;
    for (var i = 0; i < parentItem.children.numItems; i++) {
        var child = parentItem.children[i];
        if (child.name === name) return child;
        if (child.children && child.children.numItems > 0) {
            var found = _findProjectItemByName(child, name);
            if (found) return found;
        }
    }
    return null;
}

// ─── Sequence / Composition Status Info ───────────────────────────────────────

/**
 * Return info about the currently active sequence or composition.
 */
function getActiveSequenceInfo() {
    var host = getHostApp();

    if (!app.project) {
        return MML_JSON.stringify({ hasProject: false, hasSequence: false, host: host });
    }

    try {
        if (host === 'AEFT') {
            var comp = app.project.activeItem;
            var prjName = (app.project.file) ? app.project.file.name : 'Untitled Project';
            if (!comp || !(comp instanceof CompItem)) {
                return MML_JSON.stringify({
                    hasProject:  true,
                    hasSequence: false,
                    projectName: prjName,
                    host:        'AEFT'
                });
            }
            return MML_JSON.stringify({
                hasProject:  true,
                hasSequence: true,
                host:        'AEFT',
                projectName: prjName,
                seqName:     comp.name,
                duration:    comp.duration,
                playhead:    comp.time,
                frameRate:   comp.frameRate
            });
        } else {
            var seq = app.project.activeSequence;
            if (!seq) {
                return MML_JSON.stringify({
                    hasProject:  true,
                    hasSequence: false,
                    projectName: app.project.name || 'Untitled Project',
                    host:        'PPRO'
                });
            }
            return MML_JSON.stringify({
                hasProject:  true,
                hasSequence: true,
                host:        'PPRO',
                projectName: app.project.name,
                seqName:     seq.name,
                duration:    seq.end.seconds,
                playhead:    seq.getPlayerPosition().seconds,
                frameRate:   seq.timebase
            });
        }
    } catch (e) {
        return MML_JSON.stringify({ hasProject: true, hasSequence: false, host: host, error: e.message });
    }
}

// ─── Shell / OS ───────────────────────────────────────────────────────────────

/**
 * Open the parent folder of a file in Windows Explorer / macOS Finder.
 */
function revealInExplorer(filePath) {
    try {
        var f = new File(filePath);
        if (f.exists) {
            f.parent.execute();
            return MML_JSON.stringify({ success: true });
        }
        return MML_JSON.stringify({ success: false, error: 'File does not exist' });
    } catch (e) {
        return MML_JSON.stringify({ success: false, error: e.message });
    }
}

/**
 * Reveal a folder in the OS explorer/finder.
 */
function revealFolder(folderPath) {
    try {
        var f = new Folder(folderPath);
        if (f.exists) {
            f.execute();
            return MML_JSON.stringify({ success: true });
        }
        return MML_JSON.stringify({ success: false, error: 'Folder not found.' });
    } catch (e) {
        return MML_JSON.stringify({ success: false, error: e.message });
    }
}

/**
 * Open a file using the OS default application.
 */
function openWithDefaultApp(filePath) {
    try {
        var f = new File(filePath);
        f.execute();
        return MML_JSON.stringify({ success: true });
    } catch (e) {
        return MML_JSON.stringify({ success: false, error: e.message });
    }
}

/**
 * Open a native OS folder selection dialog and return the chosen path.
 * @returns {string} JSON
 */
function selectLocalFolder() {
    var folder = Folder.selectDialog("Select a media folder to watch");
    if (folder) {
        return MML_JSON.stringify({ success: true, path: folder.fsName });
    }
    return MML_JSON.stringify({ success: false });
}
