/**
 * CSInterface.js — Adobe Creative Suite Extension Interface Library
 * Provides communication between the CEP panel (HTML/JS) and the host app (Premiere Pro).
 *
 * This is a trimmed, self-contained implementation covering all methods
 * used by My Media Library. Based on the open-source Adobe CEP library.
 * Full source: https://github.com/Adobe-CEP/CEP-Resources
 */

(function () {
  'use strict';

  // ── Environment Detection ────────────────────────────────────────────────

  var IS_CEP_ENV = (typeof window.__adobe_cep__ !== 'undefined');

  // ── CSInterface Constructor ──────────────────────────────────────────────

  function CSInterface() {
    this.hostEnvironment = IS_CEP_ENV
      ? JSON.parse(window.__adobe_cep__.getHostEnvironment())
      : null;
  }

  // ── Version Info ─────────────────────────────────────────────────────────

  CSInterface.CEP_VERSION = '11.0';
  CSInterface.prototype.VERSION = '11.0';

  // ── evalScript ───────────────────────────────────────────────────────────
  /**
   * Evaluate an ExtendScript expression and call back with the result.
   * @param {string}   script    - ExtendScript code to evaluate
   * @param {Function} callback  - Called with result string or error
   */
  CSInterface.prototype.evalScript = function (script, callback) {
    if (!IS_CEP_ENV) {
      console.warn('[CSInterface] evalScript: not in CEP environment. Script:', script);
      if (typeof callback === 'function') callback('[NOT IN CEP ENV]');
      return;
    }
    if (typeof callback === 'function') {
      window.__adobe_cep__.evalScript(script, callback);
    } else {
      window.__adobe_cep__.evalScript(script);
    }
  };

  // ── Event System ─────────────────────────────────────────────────────────

  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    if (!IS_CEP_ENV) return;
    window.__adobe_cep__.addEventListener(type, listener, obj);
  };

  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    if (!IS_CEP_ENV) return;
    window.__adobe_cep__.removeEventListener(type, listener, obj);
  };

  CSInterface.prototype.dispatchEvent = function (event) {
    if (!IS_CEP_ENV) return;
    if (typeof event.data === 'object') {
      event.data = JSON.stringify(event.data);
    }
    window.__adobe_cep__.dispatchEvent(event);
  };

  // ── Host Environment ─────────────────────────────────────────────────────

  CSInterface.prototype.getHostEnvironment = function () {
    return IS_CEP_ENV
      ? JSON.parse(window.__adobe_cep__.getHostEnvironment())
      : { appName: 'PPRO', appVersion: '22.0', appLocale: 'en_US', hostName: 'Premiere Pro' };
  };

  CSInterface.prototype.getApplicationID = function () {
    var env = this.getHostEnvironment();
    return env ? env.appId : 'PPRO';
  };

  // ── Extension Info ────────────────────────────────────────────────────────

  CSInterface.prototype.getExtensionID = function () {
    return IS_CEP_ENV ? window.__adobe_cep__.getExtensionID() : 'com.mylibrary.mediabrowser.panel';
  };

  CSInterface.prototype.closeExtension = function () {
    if (IS_CEP_ENV) window.__adobe_cep__.closeExtension();
  };

  // ── System Path ───────────────────────────────────────────────────────────

  CSInterface.prototype.getSystemPath = function (pathType) {
    if (!IS_CEP_ENV) return '';
    return window.__adobe_cep__.getSystemPath(pathType);
  };

  // ── Theme ─────────────────────────────────────────────────────────────────

  CSInterface.prototype.getHostEnvironment = function () {
    if (!IS_CEP_ENV) {
      return {
        appName: 'PPRO',
        appVersion: '22.0',
        appLocale: 'en_US',
        hostName: 'Premiere Pro'
      };
    }
    return JSON.parse(window.__adobe_cep__.getHostEnvironment());
  };

  // ── Open Extension ────────────────────────────────────────────────────────

  CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    if (IS_CEP_ENV) window.__adobe_cep__.requestOpenExtension(extensionId, params || '');
  };

  // ── Context Menu ─────────────────────────────────────────────────────────

  CSInterface.prototype.setContextMenuByJSON = function (menu, callback) {
    if (!IS_CEP_ENV) return;
    window.__adobe_cep__.setContextMenuByJSON(menu, callback);
  };

  // ── Fly-out Menu ─────────────────────────────────────────────────────────

  CSInterface.prototype.setPanelFlyoutMenu = function (menu) {
    if (!IS_CEP_ENV) return;
    window.__adobe_cep__.setPanelFlyoutMenu(menu);
  };

  // ── Panel Size ────────────────────────────────────────────────────────────

  CSInterface.prototype.resizeContent = function (width, height) {
    if (!IS_CEP_ENV) return;
    window.__adobe_cep__.resizeContent(width, height);
  };

  // ── Persistent Data ───────────────────────────────────────────────────────

  CSInterface.prototype.setPersistentData = function (key, value) {
    if (!IS_CEP_ENV) return;
    window.__adobe_cep__.setPersistentData(key, value);
  };

  CSInterface.prototype.getPersistentData = function (key) {
    if (!IS_CEP_ENV) return '';
    return window.__adobe_cep__.getPersistentData(key);
  };

  // ── Export ────────────────────────────────────────────────────────────────

  window.CSInterface = CSInterface;

  // ── CSEvent ──────────────────────────────────────────────────────────────
  /**
   * @param {string} type      - Event type
   * @param {string} scope     - 'GLOBAL' or 'APPLICATION'
   * @param {string} appId     - Application identifier
   * @param {string} extensionId - Extension identifier
   */
  function CSEvent(type, scope, appId, extensionId) {
    this.type        = type;
    this.scope       = scope || 'APPLICATION';
    this.appId       = appId || '';
    this.extensionId = extensionId || '';
    this.data        = '';
  }
  window.CSEvent = CSEvent;

  // ── SystemPath Constants ──────────────────────────────────────────────────
  var SystemPath = {
    USER_DATA:      'userData',
    COMMON_FILES:   'commonFiles',
    MY_DOCUMENTS:   'myDocuments',
    APPLICATION:    'application',
    EXTENSION:      'extension',
    HOST_APPLICATION: 'hostApplication'
  };
  window.SystemPath = SystemPath;

  // ── ColorType Constants ────────────────────────────────────────────────────
  var ColorType = { CUSTOM: 'custom', NONE: 'none' };
  window.ColorType = ColorType;

})();
