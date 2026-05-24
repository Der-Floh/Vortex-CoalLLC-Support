'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var path = require('path');
var Bluebird = require('bluebird');
var vortexApi = require('vortex-api');
var https = require('https');
var nativeFs = require('fs');
var os = require('os');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var path__namespace = /*#__PURE__*/_interopNamespaceDefault(path);
var https__namespace = /*#__PURE__*/_interopNamespaceDefault(https);
var nativeFs__namespace = /*#__PURE__*/_interopNamespaceDefault(nativeFs);
var os__namespace = /*#__PURE__*/_interopNamespaceDefault(os);

const GML_API_URL = 'https://api.github.com/repos/NanobotZ/godot-mod-loader/releases/latest';
const USER_AGENT = 'vortex-coalllc-support';
/**
 * Maps the current Node.js platform to the GML release asset OS suffix.
 *
 * @returns `'Windows'`, `'Linux'`, or `null` when the platform is unsupported.
 */
function getOsPlatformName() {
    switch (process.platform) {
        case 'win32': return 'Windows';
        case 'linux': return 'Linux';
        default: return null;
    }
}
/**
 * Performs an HTTPS GET request to `url`, follows up to 5 redirects,
 * and resolves with the parsed JSON response body.
 *
 * @param url - Initial URL to request.
 * @returns Parsed JSON value from the response.
 */
function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const doRequest = (reqUrl, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }
            https__namespace.get(reqUrl, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    res.resume();
                    doRequest(res.headers.location, redirectCount + 1);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} from ${reqUrl}`));
                    res.resume();
                    return;
                }
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    }
                    catch (e) {
                        reject(e);
                    }
                });
                res.on('error', reject);
            }).on('error', reject);
        };
        doRequest(url);
    });
}
/**
 * Downloads the resource at `url` to a local file at `destPath`,
 * following up to 5 redirects.
 *
 * @param url - URL of the resource to download.
 * @param destPath - Absolute path where the downloaded file will be written.
 * @param onProgress - Optional callback receiving download progress as a
 *   percentage (0–100). Only called when the server supplies a
 *   `Content-Length` header.
 */
function downloadToFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const doRequest = (reqUrl, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }
            https__namespace.get(reqUrl, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    res.resume();
                    doRequest(res.headers.location, redirectCount + 1);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} downloading ${reqUrl}`));
                    res.resume();
                    return;
                }
                const totalBytes = parseInt(res.headers['content-length'] ?? '0', 10);
                let receivedBytes = 0;
                let lastReportedPct = -1;
                const stream = nativeFs__namespace.createWriteStream(destPath);
                res.on('data', (chunk) => {
                    receivedBytes += chunk.length;
                    if (onProgress && totalBytes > 0) {
                        const pct = Math.floor((receivedBytes / totalBytes) * 100);
                        // Only fire callback when the integer percentage changes
                        if (pct !== lastReportedPct) {
                            lastReportedPct = pct;
                            onProgress(pct);
                        }
                    }
                });
                res.pipe(stream);
                stream.on('finish', () => stream.close(() => resolve()));
                stream.on('error', (err) => {
                    nativeFs__namespace.unlink(destPath, () => undefined);
                    reject(err);
                });
            }).on('error', reject);
        };
        doRequest(url);
    });
}
/**
 * Downloads and installs the latest Godot Mod Loader release into the game
 * directory.
 *
 * Steps:
 * 1. Queries the GitHub releases API for the latest release.
 * 2. Selects the asset matching the current OS
 *    (`godot-mod-loader-Windows.zip` or `godot-mod-loader-Linux.zip`).
 * 3. Downloads the zip to a temporary file.
 * 4. Extracts it to `discovery.path` (game root) **and** to
 *    `discovery.path/Coal LLC` so that both paths required by GML are satisfied.
 * 5. Dismisses the "GML missing" warning notification on success.
 *
 * @param api - Vortex extension API.
 * @param discovery - Game discovery result containing the installation path.
 */
async function installGML(api, discovery) {
    const NOTIF_ID = 'gml-install-progress';
    const gamePath = discovery.path;
    let tempZip;
    try {
        const osPlatform = getOsPlatformName();
        if (!osPlatform) {
            throw new Error(`Unsupported platform: ${process.platform}`);
        }
        api.sendNotification?.({
            id: NOTIF_ID,
            type: 'activity',
            title: 'Installing Godot Mod Loader',
            message: 'Fetching latest release info...',
            noDismiss: true,
        });
        const release = await httpsGetJson(GML_API_URL);
        const assetName = `godot-mod-loader-${osPlatform}.zip`;
        const asset = release.assets?.find((a) => a.name === assetName);
        if (!asset) {
            throw new Error(`Asset "${assetName}" not found in latest release ${release.tag_name ?? '(unknown)'}`);
        }
        api.sendNotification?.({
            id: NOTIF_ID,
            type: 'activity',
            title: 'Installing Godot Mod Loader',
            message: `Downloading ${assetName} (${release.tag_name})...`,
            progress: 0,
            noDismiss: true,
        });
        tempZip = path__namespace.join(os__namespace.tmpdir(), `gml-install-${Date.now()}.zip`);
        await downloadToFile(asset.browser_download_url, tempZip, (pct) => {
            api.sendNotification?.({
                id: NOTIF_ID,
                type: 'activity',
                title: 'Installing Godot Mod Loader',
                message: `Downloading ${assetName} (${release.tag_name})...`,
                progress: pct,
                noDismiss: true,
            });
        });
        api.sendNotification?.({
            id: NOTIF_ID,
            type: 'activity',
            title: 'Installing Godot Mod Loader',
            message: 'Extracting...',
            noDismiss: true,
        });
        const archive = await api.openArchive(tempZip, {}, 'zip');
        await archive.extractAll(gamePath);
        await archive.extractAll(path__namespace.join(gamePath, 'Coal LLC'));
        api.dismissNotification?.(NOTIF_ID);
        api.dismissNotification?.('gml-missing');
        api.sendNotification?.({
            id: 'gml-install-success',
            type: 'success',
            title: 'Godot Mod Loader installed',
            message: `${release.tag_name} installed successfully.`,
            displayMS: 5000,
        });
    }
    catch (err) {
        vortexApi.log('error', 'Failed to install Godot Mod Loader', { message: err.message });
        api.dismissNotification?.(NOTIF_ID);
        api.showErrorNotification?.('Failed to install Godot Mod Loader', err);
    }
    finally {
        if (tempZip) {
            nativeFs__namespace.unlink(tempZip, () => undefined);
        }
    }
}

const GAME = {
    id: 'coalllc',
    name: 'Coal LLC',
    exe: 'Coal LLC.exe',
    steamAppId: '3361510',
    requiredFiles: [
        'Coal LLC.exe'
    ]
};
const GML = {
    modFile: '.zip',
    modDir: path__namespace.join('Coal LLC', 'mods'),
    hooksCache: path__namespace.join('Coal LLC', 'mod-hooks.zip'),
    requiredFiles: [
        path__namespace.join('addons', 'mod_loader', 'mod_loader.gd'),
        path__namespace.join('Coal LLC', 'addons', 'mod_loader', 'mod_loader.gd'),
    ]};
// -------------------------------------
//#region Register Game
// -------------------------------------
/**
 * Vortex extension entry point for the Game.
 *
 * Registers the game and sets up mod installers for Godot Mod Loader
 *
 * @param context - Vortex extension context supplied by the host.
 * @returns True if the extension initialized successfully.
 */
function main(context) {
    // Register game here
    context.registerGame({
        id: GAME.id,
        name: GAME.name,
        mergeMods: true,
        queryPath: () => Bluebird.resolve(findGame()),
        supportedTools: [],
        queryModPath: () => GML.modDir,
        logo: 'gameart.jpg',
        executable: () => GAME.exe,
        requiredFiles: GAME.requiredFiles,
        setup: (discovery) => Bluebird.resolve(prepareForModding(discovery, context.api)),
        environment: { SteamAPPId: GAME.steamAppId },
        details: { steamAppId: GAME.steamAppId },
    });
    // Register mod installer
    context.registerInstaller('coalllc-mod', 25, testSupportedContent, installContent);
    context.once(() => {
        // Delete the GML hooks cache after every deployment so the game regenerates it
        context.api.events?.on('did-deploy', (profileId) => {
            const state = context.api.getState();
            const profile = state.persistent?.profiles?.[profileId];
            if (!profile || profile.gameId !== GAME.id)
                return;
            const discovery = state.settings?.gameMode?.discovered?.[GAME.id];
            if (!discovery?.path)
                return;
            const hooksCachePath = path__namespace.join(discovery.path, GML.hooksCache);
            vortexApi.fs.removeAsync(hooksCachePath).catch(() => {
                context.api.sendNotification?.({
                    type: 'warning',
                    title: 'Failed to clear GML hooks cache',
                    message: `Could not delete "${hooksCachePath}". This may cause issues with mods not loading correctly. Please ensure this file is deleted before launching the game.`,
                    actions: [
                        apiMakeOpenUrlFunction('Open folder', path__namespace.dirname(hooksCachePath)),
                    ],
                });
            });
        });
    });
    return true;
}
/**
 * Locates the game installation directory.
 *
 * Uses Vortex's `GameStoreHelper` to find the game by its store app ID.
 *
 * @returns A promise that resolves to the game installation path.
 */
async function findGame() {
    const game = await vortexApi.util.GameStoreHelper.findByAppId([GAME.steamAppId]);
    return game.gamePath;
}
/**
 * Prepares the game installation for modding.
 *
 * Detects whether GML is installed
 * Detects whether the mods folder is writable
 *
 * @param discovery - The game discovery result from Vortex.
 * @param api - Vortex extension API.
 * @returns A promise that resolves once preparation is complete.
 */
async function prepareForModding(discovery, api) {
    if (!isGMLInstalled(discovery)) {
        api.sendNotification({
            id: 'gml-missing',
            type: 'warning',
            title: 'Godot Mod Loader not installed',
            message: 'Godot Mod Loader is required to mod Coal LLC.',
            actions: [
                {
                    title: 'Install',
                    action: (dismiss) => {
                        dismiss();
                        installGML(api, discovery).catch(() => undefined);
                    },
                },
                apiMakeCheckAndDismissFunction('Check again', 'gml-missing', api, () => isGMLInstalled(discovery)),
            ],
        });
        return;
    }
    await ensureWritableDirOrWarn(api, path__namespace.join(discovery.path, GML.modDir));
}
//#endregion
// -------------------------------------
//#region Mod installers
// -------------------------------------
/**
 * Test function for Godot Mod Loader archives.
 *
 * Conditions (in order):
 * - Only supports Coal LLC.
 * - Looks for `.gd` mod files.
 *
 * @param files - List of files contained in the archive.
 * @param gameId - ID of the game the archive is being installed for.
 * @returns A promise resolving to the support state and required files.
 * @function
 */
const testSupportedContent = (files, gameId) => {
    // Make sure we're able to support this mod.
    if (gameId !== GAME.id) {
        return Bluebird.resolve({ supported: false, requiredFiles: [] });
    }
    const filesIncludeModFile = files.some(file => path__namespace.extname(file).toLowerCase() === GML.modFile);
    return Bluebird.resolve({ supported: filesIncludeModFile, requiredFiles: [] });
};
/**
 * Installer implementation for Godot Mod Loader mods.
 *
 * Copies the mod zip file from the archive into the game's mods directory.
 * The `mod-hooks.zip` cache is deleted post-deployment via a `did-deploy` event
 * so that GML regenerates it on the next game launch.
 *
 * @param files - Files contained in the archive.
 * @returns A promise resolving to installer instructions.
 * @function
 */
const installContent = (files) => {
    const modZips = files.filter(file => !file.endsWith(path__namespace.sep) &&
        path__namespace.extname(file).toLowerCase() === GML.modFile);
    const instructions = modZips.map(file => ({
        type: 'copy',
        source: file,
        destination: path__namespace.basename(file),
    }));
    return Bluebird.resolve({ instructions });
};
//#endregion
// -------------------------------------
//#region Utils
// -------------------------------------
/**
 * Checks if MelonLoader is installed for a given discovery.
 *
 * Looks for all MelonLoader required files under the game directory.
 *
 * @param discovery - The game discovery result from Vortex.
 * @returns True if all required Godot Mod Loader files exist; otherwise false.
 */
function isGMLInstalled(discovery) {
    for (const reqFile of GML.requiredFiles) {
        try {
            vortexApi.fs.statSync(path__namespace.join(discovery.path, reqFile));
        }
        catch {
            return false;
        }
    }
    return true;
}
/**
 * Ensures that a directory exists and is writable, otherwise warns the user.
 *
 * If the directory is not writable, an error is logged and a Vortex notification
 * is shown describing the problem and offering to open the folder.
 *
 * @param api - Vortex extension API.
 * @param absPath - Absolute path of the directory to check.
 * @returns A promise resolving to true if the directory is writable, false otherwise.
 */
async function ensureWritableDirOrWarn(api, absPath) {
    try {
        await vortexApi.fs.ensureDirWritableAsync(absPath);
        return true;
    }
    catch (err) {
        vortexApi.log('error', `Directory "${absPath}" is not writable: ${err}`);
        api.sendNotification?.({
            id: 'vs-support-writable-warning',
            type: 'warning',
            title: 'Directory Permissions Warning',
            message: `Directory "${absPath}" is not writable. Please ensure you have the necessary permissions to write to this directory.`,
            actions: [
                apiMakeOpenUrlFunction('Open folder', absPath),
            ],
        });
        return false;
    }
}
/**
 * Creates a Vortex notification action that opens a URL using `util.opn`.
 *
 * @param title - Display title of the action button.
 * @param url - URL to open when the action is invoked.
 * @returns A notification action descriptor.
 */
function apiMakeOpenUrlFunction(title, url) {
    return {
        title,
        action: () => vortexApi.util.opn(url).catch(() => undefined),
    };
}
/**
 * Creates a Vortex notification action that re-checks a condition and
 * dismisses a notification if the condition is now satisfied.
 *
 * Typically used to allow the user to click "Check again" after installing
 * a mod loader manually.
 *
 * @param title - Display title of the action button.
 * @param notificationId - ID of the notification to potentially dismiss.
 * @param api - Vortex extension API.
 * @param checkFunction - Function that returns true when the condition is satisfied.
 * @returns A notification action descriptor.
 */
function apiMakeCheckAndDismissFunction(title, notificationId, api, checkFunction) {
    return {
        title,
        action: () => apiCheckAndDismissFunction(notificationId, api, checkFunction),
    };
}
/**
 * Checks a condition and dismisses the specified notification if it holds.
 *
 * @param notificationId - ID of the notification to dismiss.
 * @param api - Vortex extension API.
 * @param checkFunction - Condition function; if it returns true, the notification is dismissed.
 */
function apiCheckAndDismissFunction(notificationId, api, checkFunction) {
    if (checkFunction()) {
        api.dismissNotification?.(notificationId);
    }
}

exports.apiCheckAndDismissFunction = apiCheckAndDismissFunction;
exports.apiMakeCheckAndDismissFunction = apiMakeCheckAndDismissFunction;
exports.apiMakeOpenUrlFunction = apiMakeOpenUrlFunction;
exports.default = main;
exports.ensureWritableDirOrWarn = ensureWritableDirOrWarn;
exports.findGame = findGame;
exports.installContent = installContent;
exports.isGMLInstalled = isGMLInstalled;
exports.main = main;
exports.prepareForModding = prepareForModding;
exports.testSupportedContent = testSupportedContent;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9pbnN0YWxsR01MLnRzIiwiLi4vLi4vc3JjL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGh0dHBzIGZyb20gJ2h0dHBzJztcbmltcG9ydCAqIGFzIG5hdGl2ZUZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmltcG9ydCB7IGxvZyB9IGZyb20gJ3ZvcnRleC1hcGknO1xuaW1wb3J0ICogYXMgdm9ydGV4IGZyb20gJ3ZvcnRleC1hcGknO1xuXG50eXBlIElFeHRlbnNpb25BcGkgPSB2b3J0ZXgudHlwZXMuSUV4dGVuc2lvbkFwaTtcbnR5cGUgSURpc2NvdmVyeVJlc3VsdCA9IHZvcnRleC50eXBlcy5JRGlzY292ZXJ5UmVzdWx0O1xuXG5jb25zdCBHTUxfQVBJX1VSTCA9ICdodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL05hbm9ib3RaL2dvZG90LW1vZC1sb2FkZXIvcmVsZWFzZXMvbGF0ZXN0JztcbmNvbnN0IFVTRVJfQUdFTlQgPSAndm9ydGV4LWNvYWxsbGMtc3VwcG9ydCc7XG5cbi8qKlxuICogTWFwcyB0aGUgY3VycmVudCBOb2RlLmpzIHBsYXRmb3JtIHRvIHRoZSBHTUwgcmVsZWFzZSBhc3NldCBPUyBzdWZmaXguXG4gKlxuICogQHJldHVybnMgYCdXaW5kb3dzJ2AsIGAnTGludXgnYCwgb3IgYG51bGxgIHdoZW4gdGhlIHBsYXRmb3JtIGlzIHVuc3VwcG9ydGVkLlxuICovXG5mdW5jdGlvbiBnZXRPc1BsYXRmb3JtTmFtZSgpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBzd2l0Y2ggKHByb2Nlc3MucGxhdGZvcm0pIHtcbiAgICAgICAgY2FzZSAnd2luMzInOiByZXR1cm4gJ1dpbmRvd3MnO1xuICAgICAgICBjYXNlICdsaW51eCc6IHJldHVybiAnTGludXgnO1xuICAgICAgICBkZWZhdWx0OiByZXR1cm4gbnVsbDtcbiAgICB9XG59XG5cbi8qKlxuICogUGVyZm9ybXMgYW4gSFRUUFMgR0VUIHJlcXVlc3QgdG8gYHVybGAsIGZvbGxvd3MgdXAgdG8gNSByZWRpcmVjdHMsXG4gKiBhbmQgcmVzb2x2ZXMgd2l0aCB0aGUgcGFyc2VkIEpTT04gcmVzcG9uc2UgYm9keS5cbiAqXG4gKiBAcGFyYW0gdXJsIC0gSW5pdGlhbCBVUkwgdG8gcmVxdWVzdC5cbiAqIEByZXR1cm5zIFBhcnNlZCBKU09OIHZhbHVlIGZyb20gdGhlIHJlc3BvbnNlLlxuICovXG5mdW5jdGlvbiBodHRwc0dldEpzb24odXJsOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IGRvUmVxdWVzdCA9IChyZXFVcmw6IHN0cmluZywgcmVkaXJlY3RDb3VudCA9IDApID0+IHtcbiAgICAgICAgICAgIGlmIChyZWRpcmVjdENvdW50ID4gNSkge1xuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ1RvbyBtYW55IHJlZGlyZWN0cycpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGh0dHBzLmdldChyZXFVcmwsIHsgaGVhZGVyczogeyAnVXNlci1BZ2VudCc6IFVTRVJfQUdFTlQgfSB9LCAocmVzKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAzMDEgfHwgcmVzLnN0YXR1c0NvZGUgPT09IDMwMikge1xuICAgICAgICAgICAgICAgICAgICByZXMucmVzdW1lKCk7XG4gICAgICAgICAgICAgICAgICAgIGRvUmVxdWVzdChyZXMuaGVhZGVycy5sb2NhdGlvbiEsIHJlZGlyZWN0Q291bnQgKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChyZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEhUVFAgJHtyZXMuc3RhdHVzQ29kZX0gZnJvbSAke3JlcVVybH1gKSk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5yZXN1bWUoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGxldCBib2R5ID0gJyc7XG4gICAgICAgICAgICAgICAgcmVzLnNldEVuY29kaW5nKCd1dGY4Jyk7XG4gICAgICAgICAgICAgICAgcmVzLm9uKCdkYXRhJywgKGNodW5rOiBzdHJpbmcpID0+IHsgYm9keSArPSBjaHVuazsgfSk7XG4gICAgICAgICAgICAgICAgcmVzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IHJlc29sdmUoSlNPTi5wYXJzZShib2R5KSk7IH1cbiAgICAgICAgICAgICAgICAgICAgY2F0Y2ggKGUpIHsgcmVqZWN0KGUpOyB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmVzLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgICAgICAgICB9KS5vbignZXJyb3InLCByZWplY3QpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGRvUmVxdWVzdCh1cmwpO1xuICAgIH0pO1xufVxuXG4vKipcbiAqIERvd25sb2FkcyB0aGUgcmVzb3VyY2UgYXQgYHVybGAgdG8gYSBsb2NhbCBmaWxlIGF0IGBkZXN0UGF0aGAsXG4gKiBmb2xsb3dpbmcgdXAgdG8gNSByZWRpcmVjdHMuXG4gKlxuICogQHBhcmFtIHVybCAtIFVSTCBvZiB0aGUgcmVzb3VyY2UgdG8gZG93bmxvYWQuXG4gKiBAcGFyYW0gZGVzdFBhdGggLSBBYnNvbHV0ZSBwYXRoIHdoZXJlIHRoZSBkb3dubG9hZGVkIGZpbGUgd2lsbCBiZSB3cml0dGVuLlxuICogQHBhcmFtIG9uUHJvZ3Jlc3MgLSBPcHRpb25hbCBjYWxsYmFjayByZWNlaXZpbmcgZG93bmxvYWQgcHJvZ3Jlc3MgYXMgYVxuICogICBwZXJjZW50YWdlICgw4oCTMTAwKS4gT25seSBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIHN1cHBsaWVzIGFcbiAqICAgYENvbnRlbnQtTGVuZ3RoYCBoZWFkZXIuXG4gKi9cbmZ1bmN0aW9uIGRvd25sb2FkVG9GaWxlKHVybDogc3RyaW5nLCBkZXN0UGF0aDogc3RyaW5nLCBvblByb2dyZXNzPzogKHBjdDogbnVtYmVyKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgZG9SZXF1ZXN0ID0gKHJlcVVybDogc3RyaW5nLCByZWRpcmVjdENvdW50ID0gMCkgPT4ge1xuICAgICAgICAgICAgaWYgKHJlZGlyZWN0Q291bnQgPiA1KSB7XG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignVG9vIG1hbnkgcmVkaXJlY3RzJykpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaHR0cHMuZ2V0KHJlcVVybCwgeyBoZWFkZXJzOiB7ICdVc2VyLUFnZW50JzogVVNFUl9BR0VOVCB9IH0sIChyZXMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDMwMSB8fCByZXMuc3RhdHVzQ29kZSA9PT0gMzAyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5yZXN1bWUoKTtcbiAgICAgICAgICAgICAgICAgICAgZG9SZXF1ZXN0KHJlcy5oZWFkZXJzLmxvY2F0aW9uISwgcmVkaXJlY3RDb3VudCArIDEpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgSFRUUCAke3Jlcy5zdGF0dXNDb2RlfSBkb3dubG9hZGluZyAke3JlcVVybH1gKSk7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5yZXN1bWUoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHRvdGFsQnl0ZXMgPSBwYXJzZUludChyZXMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA/PyAnMCcsIDEwKTtcbiAgICAgICAgICAgICAgICBsZXQgcmVjZWl2ZWRCeXRlcyA9IDA7XG4gICAgICAgICAgICAgICAgbGV0IGxhc3RSZXBvcnRlZFBjdCA9IC0xO1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RyZWFtID0gbmF0aXZlRnMuY3JlYXRlV3JpdGVTdHJlYW0oZGVzdFBhdGgpO1xuXG4gICAgICAgICAgICAgICAgcmVzLm9uKCdkYXRhJywgKGNodW5rOiBCdWZmZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVjZWl2ZWRCeXRlcyArPSBjaHVuay5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGlmIChvblByb2dyZXNzICYmIHRvdGFsQnl0ZXMgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwY3QgPSBNYXRoLmZsb29yKChyZWNlaXZlZEJ5dGVzIC8gdG90YWxCeXRlcykgKiAxMDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gT25seSBmaXJlIGNhbGxiYWNrIHdoZW4gdGhlIGludGVnZXIgcGVyY2VudGFnZSBjaGFuZ2VzXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocGN0ICE9PSBsYXN0UmVwb3J0ZWRQY3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0UmVwb3J0ZWRQY3QgPSBwY3Q7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb25Qcm9ncmVzcyhwY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICByZXMucGlwZShzdHJlYW0pO1xuICAgICAgICAgICAgICAgIHN0cmVhbS5vbignZmluaXNoJywgKCkgPT4gc3RyZWFtLmNsb3NlKCgpID0+IHJlc29sdmUoKSkpO1xuICAgICAgICAgICAgICAgIHN0cmVhbS5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBuYXRpdmVGcy51bmxpbmsoZGVzdFBhdGgsICgpID0+IHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkub24oJ2Vycm9yJywgcmVqZWN0KTtcbiAgICAgICAgfTtcblxuICAgICAgICBkb1JlcXVlc3QodXJsKTtcbiAgICB9KTtcbn1cblxuLyoqXG4gKiBEb3dubG9hZHMgYW5kIGluc3RhbGxzIHRoZSBsYXRlc3QgR29kb3QgTW9kIExvYWRlciByZWxlYXNlIGludG8gdGhlIGdhbWVcbiAqIGRpcmVjdG9yeS5cbiAqXG4gKiBTdGVwczpcbiAqIDEuIFF1ZXJpZXMgdGhlIEdpdEh1YiByZWxlYXNlcyBBUEkgZm9yIHRoZSBsYXRlc3QgcmVsZWFzZS5cbiAqIDIuIFNlbGVjdHMgdGhlIGFzc2V0IG1hdGNoaW5nIHRoZSBjdXJyZW50IE9TXG4gKiAgICAoYGdvZG90LW1vZC1sb2FkZXItV2luZG93cy56aXBgIG9yIGBnb2RvdC1tb2QtbG9hZGVyLUxpbnV4LnppcGApLlxuICogMy4gRG93bmxvYWRzIHRoZSB6aXAgdG8gYSB0ZW1wb3JhcnkgZmlsZS5cbiAqIDQuIEV4dHJhY3RzIGl0IHRvIGBkaXNjb3ZlcnkucGF0aGAgKGdhbWUgcm9vdCkgKiphbmQqKiB0b1xuICogICAgYGRpc2NvdmVyeS5wYXRoL0NvYWwgTExDYCBzbyB0aGF0IGJvdGggcGF0aHMgcmVxdWlyZWQgYnkgR01MIGFyZSBzYXRpc2ZpZWQuXG4gKiA1LiBEaXNtaXNzZXMgdGhlIFwiR01MIG1pc3NpbmdcIiB3YXJuaW5nIG5vdGlmaWNhdGlvbiBvbiBzdWNjZXNzLlxuICpcbiAqIEBwYXJhbSBhcGkgLSBWb3J0ZXggZXh0ZW5zaW9uIEFQSS5cbiAqIEBwYXJhbSBkaXNjb3ZlcnkgLSBHYW1lIGRpc2NvdmVyeSByZXN1bHQgY29udGFpbmluZyB0aGUgaW5zdGFsbGF0aW9uIHBhdGguXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbnN0YWxsR01MKGFwaTogSUV4dGVuc2lvbkFwaSwgZGlzY292ZXJ5OiBJRGlzY292ZXJ5UmVzdWx0KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgTk9USUZfSUQgPSAnZ21sLWluc3RhbGwtcHJvZ3Jlc3MnO1xuICAgIGNvbnN0IGdhbWVQYXRoID0gZGlzY292ZXJ5LnBhdGghO1xuICAgIGxldCB0ZW1wWmlwOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBvc1BsYXRmb3JtID0gZ2V0T3NQbGF0Zm9ybU5hbWUoKTtcbiAgICAgICAgaWYgKCFvc1BsYXRmb3JtKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHBsYXRmb3JtOiAke3Byb2Nlc3MucGxhdGZvcm19YCk7XG4gICAgICAgIH1cblxuICAgICAgICBhcGkuc2VuZE5vdGlmaWNhdGlvbj8uKHtcbiAgICAgICAgICAgIGlkOiBOT1RJRl9JRCxcbiAgICAgICAgICAgIHR5cGU6ICdhY3Rpdml0eScsXG4gICAgICAgICAgICB0aXRsZTogJ0luc3RhbGxpbmcgR29kb3QgTW9kIExvYWRlcicsXG4gICAgICAgICAgICBtZXNzYWdlOiAnRmV0Y2hpbmcgbGF0ZXN0IHJlbGVhc2UgaW5mby4uLicsXG4gICAgICAgICAgICBub0Rpc21pc3M6IHRydWUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHJlbGVhc2UgPSBhd2FpdCBodHRwc0dldEpzb24oR01MX0FQSV9VUkwpO1xuICAgICAgICBjb25zdCBhc3NldE5hbWUgPSBgZ29kb3QtbW9kLWxvYWRlci0ke29zUGxhdGZvcm19LnppcGA7XG4gICAgICAgIGNvbnN0IGFzc2V0ID0gKHJlbGVhc2UuYXNzZXRzIGFzIGFueVtdKT8uZmluZCgoYTogYW55KSA9PiBhLm5hbWUgPT09IGFzc2V0TmFtZSk7XG5cbiAgICAgICAgaWYgKCFhc3NldCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBc3NldCBcIiR7YXNzZXROYW1lfVwiIG5vdCBmb3VuZCBpbiBsYXRlc3QgcmVsZWFzZSAke3JlbGVhc2UudGFnX25hbWUgPz8gJyh1bmtub3duKSd9YCk7XG4gICAgICAgIH1cblxuICAgICAgICBhcGkuc2VuZE5vdGlmaWNhdGlvbj8uKHtcbiAgICAgICAgICAgIGlkOiBOT1RJRl9JRCxcbiAgICAgICAgICAgIHR5cGU6ICdhY3Rpdml0eScsXG4gICAgICAgICAgICB0aXRsZTogJ0luc3RhbGxpbmcgR29kb3QgTW9kIExvYWRlcicsXG4gICAgICAgICAgICBtZXNzYWdlOiBgRG93bmxvYWRpbmcgJHthc3NldE5hbWV9ICgke3JlbGVhc2UudGFnX25hbWV9KS4uLmAsXG4gICAgICAgICAgICBwcm9ncmVzczogMCxcbiAgICAgICAgICAgIG5vRGlzbWlzczogdHJ1ZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGVtcFppcCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgYGdtbC1pbnN0YWxsLSR7RGF0ZS5ub3coKX0uemlwYCk7XG4gICAgICAgIGF3YWl0IGRvd25sb2FkVG9GaWxlKGFzc2V0LmJyb3dzZXJfZG93bmxvYWRfdXJsLCB0ZW1wWmlwLCAocGN0KSA9PiB7XG4gICAgICAgICAgICBhcGkuc2VuZE5vdGlmaWNhdGlvbj8uKHtcbiAgICAgICAgICAgICAgICBpZDogTk9USUZfSUQsXG4gICAgICAgICAgICAgICAgdHlwZTogJ2FjdGl2aXR5JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0luc3RhbGxpbmcgR29kb3QgTW9kIExvYWRlcicsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogYERvd25sb2FkaW5nICR7YXNzZXROYW1lfSAoJHtyZWxlYXNlLnRhZ19uYW1lfSkuLi5gLFxuICAgICAgICAgICAgICAgIHByb2dyZXNzOiBwY3QsXG4gICAgICAgICAgICAgICAgbm9EaXNtaXNzOiB0cnVlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGFwaS5zZW5kTm90aWZpY2F0aW9uPy4oe1xuICAgICAgICAgICAgaWQ6IE5PVElGX0lELFxuICAgICAgICAgICAgdHlwZTogJ2FjdGl2aXR5JyxcbiAgICAgICAgICAgIHRpdGxlOiAnSW5zdGFsbGluZyBHb2RvdCBNb2QgTG9hZGVyJyxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdFeHRyYWN0aW5nLi4uJyxcbiAgICAgICAgICAgIG5vRGlzbWlzczogdHJ1ZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgYXJjaGl2ZSA9IGF3YWl0IGFwaS5vcGVuQXJjaGl2ZSh0ZW1wWmlwLCB7fSwgJ3ppcCcpO1xuICAgICAgICBhd2FpdCBhcmNoaXZlLmV4dHJhY3RBbGwhKGdhbWVQYXRoKTtcbiAgICAgICAgYXdhaXQgYXJjaGl2ZS5leHRyYWN0QWxsIShwYXRoLmpvaW4oZ2FtZVBhdGgsICdDb2FsIExMQycpKTtcblxuICAgICAgICBhcGkuZGlzbWlzc05vdGlmaWNhdGlvbj8uKE5PVElGX0lEKTtcbiAgICAgICAgYXBpLmRpc21pc3NOb3RpZmljYXRpb24/LignZ21sLW1pc3NpbmcnKTtcblxuICAgICAgICBhcGkuc2VuZE5vdGlmaWNhdGlvbj8uKHtcbiAgICAgICAgICAgIGlkOiAnZ21sLWluc3RhbGwtc3VjY2VzcycsXG4gICAgICAgICAgICB0eXBlOiAnc3VjY2VzcycsXG4gICAgICAgICAgICB0aXRsZTogJ0dvZG90IE1vZCBMb2FkZXIgaW5zdGFsbGVkJyxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGAke3JlbGVhc2UudGFnX25hbWV9IGluc3RhbGxlZCBzdWNjZXNzZnVsbHkuYCxcbiAgICAgICAgICAgIGRpc3BsYXlNUzogNTAwMCxcbiAgICAgICAgfSk7XG5cbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICBsb2coJ2Vycm9yJywgJ0ZhaWxlZCB0byBpbnN0YWxsIEdvZG90IE1vZCBMb2FkZXInLCB7IG1lc3NhZ2U6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICBhcGkuZGlzbWlzc05vdGlmaWNhdGlvbj8uKE5PVElGX0lEKTtcbiAgICAgICAgYXBpLnNob3dFcnJvck5vdGlmaWNhdGlvbj8uKCdGYWlsZWQgdG8gaW5zdGFsbCBHb2RvdCBNb2QgTG9hZGVyJywgZXJyKTtcblxuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGlmICh0ZW1wWmlwKSB7XG4gICAgICAgICAgICBuYXRpdmVGcy51bmxpbmsodGVtcFppcCwgKCkgPT4gdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCAqIGFzIHZvcnRleCBmcm9tICd2b3J0ZXgtYXBpJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgQmx1ZWJpcmQgZnJvbSAnYmx1ZWJpcmQnO1xuaW1wb3J0IHsgZnMsIGxvZywgdXRpbCB9IGZyb20gJ3ZvcnRleC1hcGknO1xuaW1wb3J0IHsgaW5zdGFsbEdNTCB9IGZyb20gJy4vaW5zdGFsbEdNTCc7XG5cbnR5cGUgSUV4dGVuc2lvbkNvbnRleHQgPSB2b3J0ZXgudHlwZXMuSUV4dGVuc2lvbkNvbnRleHQ7XG50eXBlIElFeHRlbnNpb25BcGkgPSB2b3J0ZXgudHlwZXMuSUV4dGVuc2lvbkFwaTtcbnR5cGUgSURpc2NvdmVyeVJlc3VsdCA9IHZvcnRleC50eXBlcy5JRGlzY292ZXJ5UmVzdWx0O1xudHlwZSBUZXN0U3VwcG9ydGVkID0gdm9ydGV4LnR5cGVzLlRlc3RTdXBwb3J0ZWQ7XG50eXBlIEluc3RhbGxGdW5jID0gdm9ydGV4LnR5cGVzLkluc3RhbGxGdW5jO1xudHlwZSBJSW5zdHJ1Y3Rpb24gPSB2b3J0ZXgudHlwZXMuSUluc3RydWN0aW9uO1xuXG5jb25zdCBHQU1FID0ge1xuICAgIGlkOiAnY29hbGxsYycsXG4gICAgbmFtZTogJ0NvYWwgTExDJyxcbiAgICBleGU6ICdDb2FsIExMQy5leGUnLFxuICAgIHN0ZWFtQXBwSWQ6ICczMzYxNTEwJyxcbiAgICByZXF1aXJlZEZpbGVzOiBbXG4gICAgICAgICdDb2FsIExMQy5leGUnXG4gICAgXVxufTtcblxuY29uc3QgR01MID0ge1xuICAgIG5hbWU6ICdHb2RvdCBNb2QgTG9hZGVyJyxcbiAgICBtb2RGaWxlOiAnLnppcCcsXG4gICAgbW9kRGlyOiBwYXRoLmpvaW4oJ0NvYWwgTExDJywgJ21vZHMnKSxcbiAgICBob29rc0NhY2hlOiBwYXRoLmpvaW4oJ0NvYWwgTExDJywgJ21vZC1ob29rcy56aXAnKSxcbiAgICByZXF1aXJlZEZpbGVzOiBbXG4gICAgICAgIHBhdGguam9pbignYWRkb25zJywgJ21vZF9sb2FkZXInLCAnbW9kX2xvYWRlci5nZCcpLFxuICAgICAgICBwYXRoLmpvaW4oJ0NvYWwgTExDJywgJ2FkZG9ucycsICdtb2RfbG9hZGVyJywgJ21vZF9sb2FkZXIuZ2QnKSxcbiAgICBdLFxuICAgIG1vZFBhZ2U6ICdodHRwczovL2dpdGh1Yi5jb20vTmFub2JvdFovZ29kb3QtbW9kLWxvYWRlcicsXG4gICAgZG93bmxvYWRQYWdlOiAnaHR0cHM6Ly9naXRodWIuY29tL05hbm9ib3RaL2dvZG90LW1vZC1sb2FkZXIvcmVsZWFzZXMvbGF0ZXN0Jyxcbn07XG5cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8jcmVnaW9uIFJlZ2lzdGVyIEdhbWVcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBWb3J0ZXggZXh0ZW5zaW9uIGVudHJ5IHBvaW50IGZvciB0aGUgR2FtZS5cbiAqXG4gKiBSZWdpc3RlcnMgdGhlIGdhbWUgYW5kIHNldHMgdXAgbW9kIGluc3RhbGxlcnMgZm9yIEdvZG90IE1vZCBMb2FkZXJcbiAqXG4gKiBAcGFyYW0gY29udGV4dCAtIFZvcnRleCBleHRlbnNpb24gY29udGV4dCBzdXBwbGllZCBieSB0aGUgaG9zdC5cbiAqIEByZXR1cm5zIFRydWUgaWYgdGhlIGV4dGVuc2lvbiBpbml0aWFsaXplZCBzdWNjZXNzZnVsbHkuXG4gKi9cbmZ1bmN0aW9uIG1haW4oY29udGV4dDogSUV4dGVuc2lvbkNvbnRleHQpOiBib29sZWFuIHtcbiAgICAvLyBSZWdpc3RlciBnYW1lIGhlcmVcbiAgICBjb250ZXh0LnJlZ2lzdGVyR2FtZSh7XG4gICAgICAgIGlkOiBHQU1FLmlkLFxuICAgICAgICBuYW1lOiBHQU1FLm5hbWUsXG4gICAgICAgIG1lcmdlTW9kczogdHJ1ZSxcbiAgICAgICAgcXVlcnlQYXRoOiAoKSA9PiBCbHVlYmlyZC5yZXNvbHZlKGZpbmRHYW1lKCkpLFxuICAgICAgICBzdXBwb3J0ZWRUb29sczogW10sXG4gICAgICAgIHF1ZXJ5TW9kUGF0aDogKCkgPT4gR01MLm1vZERpcixcbiAgICAgICAgbG9nbzogJ2dhbWVhcnQuanBnJyxcbiAgICAgICAgZXhlY3V0YWJsZTogKCkgPT4gR0FNRS5leGUsXG4gICAgICAgIHJlcXVpcmVkRmlsZXM6IEdBTUUucmVxdWlyZWRGaWxlcyxcbiAgICAgICAgc2V0dXA6IChkaXNjb3ZlcnkpID0+IEJsdWViaXJkLnJlc29sdmUocHJlcGFyZUZvck1vZGRpbmcoZGlzY292ZXJ5LCBjb250ZXh0LmFwaSkpLFxuICAgICAgICBlbnZpcm9ubWVudDogeyBTdGVhbUFQUElkOiBHQU1FLnN0ZWFtQXBwSWQgfSxcbiAgICAgICAgZGV0YWlsczogeyBzdGVhbUFwcElkOiBHQU1FLnN0ZWFtQXBwSWQgfSxcbiAgICB9KTtcblxuICAgIC8vIFJlZ2lzdGVyIG1vZCBpbnN0YWxsZXJcbiAgICBjb250ZXh0LnJlZ2lzdGVySW5zdGFsbGVyKCdjb2FsbGxjLW1vZCcsIDI1LCB0ZXN0U3VwcG9ydGVkQ29udGVudCwgaW5zdGFsbENvbnRlbnQpO1xuXG4gICAgY29udGV4dC5vbmNlKCgpID0+IHtcbiAgICAgICAgLy8gRGVsZXRlIHRoZSBHTUwgaG9va3MgY2FjaGUgYWZ0ZXIgZXZlcnkgZGVwbG95bWVudCBzbyB0aGUgZ2FtZSByZWdlbmVyYXRlcyBpdFxuICAgICAgICBjb250ZXh0LmFwaS5ldmVudHM/Lm9uKCdkaWQtZGVwbG95JywgKHByb2ZpbGVJZDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGNvbnRleHQuYXBpLmdldFN0YXRlKCkgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgcHJvZmlsZSA9IHN0YXRlLnBlcnNpc3RlbnQ/LnByb2ZpbGVzPy5bcHJvZmlsZUlkXTtcbiAgICAgICAgICAgIGlmICghcHJvZmlsZSB8fCBwcm9maWxlLmdhbWVJZCAhPT0gR0FNRS5pZCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBkaXNjb3ZlcnkgPSBzdGF0ZS5zZXR0aW5ncz8uZ2FtZU1vZGU/LmRpc2NvdmVyZWQ/LltHQU1FLmlkXTtcbiAgICAgICAgICAgIGlmICghZGlzY292ZXJ5Py5wYXRoKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IGhvb2tzQ2FjaGVQYXRoID0gcGF0aC5qb2luKGRpc2NvdmVyeS5wYXRoIGFzIHN0cmluZywgR01MLmhvb2tzQ2FjaGUpO1xuICAgICAgICAgICAgZnMucmVtb3ZlQXN5bmMoaG9va3NDYWNoZVBhdGgpLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICBjb250ZXh0LmFwaS5zZW5kTm90aWZpY2F0aW9uPy4oe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnd2FybmluZycsXG4gICAgICAgICAgICAgICAgICAgIHRpdGxlOiAnRmFpbGVkIHRvIGNsZWFyIEdNTCBob29rcyBjYWNoZScsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3QgZGVsZXRlIFwiJHtob29rc0NhY2hlUGF0aH1cIi4gVGhpcyBtYXkgY2F1c2UgaXNzdWVzIHdpdGggbW9kcyBub3QgbG9hZGluZyBjb3JyZWN0bHkuIFBsZWFzZSBlbnN1cmUgdGhpcyBmaWxlIGlzIGRlbGV0ZWQgYmVmb3JlIGxhdW5jaGluZyB0aGUgZ2FtZS5gLFxuICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICBhcGlNYWtlT3BlblVybEZ1bmN0aW9uKCdPcGVuIGZvbGRlcicsIHBhdGguZGlybmFtZShob29rc0NhY2hlUGF0aCkpLFxuICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRydWU7XG59XG5cbi8qKlxuICogTG9jYXRlcyB0aGUgZ2FtZSBpbnN0YWxsYXRpb24gZGlyZWN0b3J5LlxuICpcbiAqIFVzZXMgVm9ydGV4J3MgYEdhbWVTdG9yZUhlbHBlcmAgdG8gZmluZCB0aGUgZ2FtZSBieSBpdHMgc3RvcmUgYXBwIElELlxuICpcbiAqIEByZXR1cm5zIEEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBnYW1lIGluc3RhbGxhdGlvbiBwYXRoLlxuICovXG5hc3luYyBmdW5jdGlvbiBmaW5kR2FtZSgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGdhbWUgPSBhd2FpdCB1dGlsLkdhbWVTdG9yZUhlbHBlci5maW5kQnlBcHBJZChbR0FNRS5zdGVhbUFwcElkXSk7XG4gICAgcmV0dXJuIGdhbWUuZ2FtZVBhdGg7XG59XG5cbi8qKlxuICogUHJlcGFyZXMgdGhlIGdhbWUgaW5zdGFsbGF0aW9uIGZvciBtb2RkaW5nLlxuICpcbiAqIERldGVjdHMgd2hldGhlciBHTUwgaXMgaW5zdGFsbGVkXG4gKiBEZXRlY3RzIHdoZXRoZXIgdGhlIG1vZHMgZm9sZGVyIGlzIHdyaXRhYmxlXG4gKlxuICogQHBhcmFtIGRpc2NvdmVyeSAtIFRoZSBnYW1lIGRpc2NvdmVyeSByZXN1bHQgZnJvbSBWb3J0ZXguXG4gKiBAcGFyYW0gYXBpIC0gVm9ydGV4IGV4dGVuc2lvbiBBUEkuXG4gKiBAcmV0dXJucyBBIHByb21pc2UgdGhhdCByZXNvbHZlcyBvbmNlIHByZXBhcmF0aW9uIGlzIGNvbXBsZXRlLlxuICovXG5hc3luYyBmdW5jdGlvbiBwcmVwYXJlRm9yTW9kZGluZyhkaXNjb3Zlcnk6IElEaXNjb3ZlcnlSZXN1bHQsIGFwaTogSUV4dGVuc2lvbkFwaSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghaXNHTUxJbnN0YWxsZWQoZGlzY292ZXJ5KSkge1xuICAgICAgICBhcGkuc2VuZE5vdGlmaWNhdGlvbiEoe1xuICAgICAgICAgICAgaWQ6ICdnbWwtbWlzc2luZycsXG4gICAgICAgICAgICB0eXBlOiAnd2FybmluZycsXG4gICAgICAgICAgICB0aXRsZTogJ0dvZG90IE1vZCBMb2FkZXIgbm90IGluc3RhbGxlZCcsXG4gICAgICAgICAgICBtZXNzYWdlOiAnR29kb3QgTW9kIExvYWRlciBpcyByZXF1aXJlZCB0byBtb2QgQ29hbCBMTEMuJyxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIHRpdGxlOiAnSW5zdGFsbCcsXG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogKGRpc21pc3MpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc21pc3MoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluc3RhbGxHTUwoYXBpLCBkaXNjb3ZlcnkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBhcGlNYWtlQ2hlY2tBbmREaXNtaXNzRnVuY3Rpb24oJ0NoZWNrIGFnYWluJywgJ2dtbC1taXNzaW5nJywgYXBpLCAoKSA9PiBpc0dNTEluc3RhbGxlZChkaXNjb3ZlcnkpKSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgZW5zdXJlV3JpdGFibGVEaXJPcldhcm4oYXBpLCBwYXRoLmpvaW4oZGlzY292ZXJ5LnBhdGghLCBHTUwubW9kRGlyKSk7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vI3JlZ2lvbiBNb2QgaW5zdGFsbGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFRlc3QgZnVuY3Rpb24gZm9yIEdvZG90IE1vZCBMb2FkZXIgYXJjaGl2ZXMuXG4gKlxuICogQ29uZGl0aW9ucyAoaW4gb3JkZXIpOlxuICogLSBPbmx5IHN1cHBvcnRzIENvYWwgTExDLlxuICogLSBMb29rcyBmb3IgYC5nZGAgbW9kIGZpbGVzLlxuICpcbiAqIEBwYXJhbSBmaWxlcyAtIExpc3Qgb2YgZmlsZXMgY29udGFpbmVkIGluIHRoZSBhcmNoaXZlLlxuICogQHBhcmFtIGdhbWVJZCAtIElEIG9mIHRoZSBnYW1lIHRoZSBhcmNoaXZlIGlzIGJlaW5nIGluc3RhbGxlZCBmb3IuXG4gKiBAcmV0dXJucyBBIHByb21pc2UgcmVzb2x2aW5nIHRvIHRoZSBzdXBwb3J0IHN0YXRlIGFuZCByZXF1aXJlZCBmaWxlcy5cbiAqIEBmdW5jdGlvblxuICovXG5jb25zdCB0ZXN0U3VwcG9ydGVkQ29udGVudDogVGVzdFN1cHBvcnRlZCA9IChmaWxlcywgZ2FtZUlkKSA9PiB7XG4gICAgLy8gTWFrZSBzdXJlIHdlJ3JlIGFibGUgdG8gc3VwcG9ydCB0aGlzIG1vZC5cbiAgICBpZiAoZ2FtZUlkICE9PSBHQU1FLmlkKSB7XG4gICAgICAgIHJldHVybiBCbHVlYmlyZC5yZXNvbHZlKHsgc3VwcG9ydGVkOiBmYWxzZSwgcmVxdWlyZWRGaWxlczogW10gfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZXNJbmNsdWRlTW9kRmlsZSA9IGZpbGVzLnNvbWUoZmlsZSA9PiBwYXRoLmV4dG5hbWUoZmlsZSkudG9Mb3dlckNhc2UoKSA9PT0gR01MLm1vZEZpbGUpO1xuXG4gICAgcmV0dXJuIEJsdWViaXJkLnJlc29sdmUoeyBzdXBwb3J0ZWQ6IGZpbGVzSW5jbHVkZU1vZEZpbGUsIHJlcXVpcmVkRmlsZXM6IFtdIH0pO1xufTtcblxuLyoqXG4gKiBJbnN0YWxsZXIgaW1wbGVtZW50YXRpb24gZm9yIEdvZG90IE1vZCBMb2FkZXIgbW9kcy5cbiAqXG4gKiBDb3BpZXMgdGhlIG1vZCB6aXAgZmlsZSBmcm9tIHRoZSBhcmNoaXZlIGludG8gdGhlIGdhbWUncyBtb2RzIGRpcmVjdG9yeS5cbiAqIFRoZSBgbW9kLWhvb2tzLnppcGAgY2FjaGUgaXMgZGVsZXRlZCBwb3N0LWRlcGxveW1lbnQgdmlhIGEgYGRpZC1kZXBsb3lgIGV2ZW50XG4gKiBzbyB0aGF0IEdNTCByZWdlbmVyYXRlcyBpdCBvbiB0aGUgbmV4dCBnYW1lIGxhdW5jaC5cbiAqXG4gKiBAcGFyYW0gZmlsZXMgLSBGaWxlcyBjb250YWluZWQgaW4gdGhlIGFyY2hpdmUuXG4gKiBAcmV0dXJucyBBIHByb21pc2UgcmVzb2x2aW5nIHRvIGluc3RhbGxlciBpbnN0cnVjdGlvbnMuXG4gKiBAZnVuY3Rpb25cbiAqL1xuY29uc3QgaW5zdGFsbENvbnRlbnQ6IEluc3RhbGxGdW5jID0gKGZpbGVzKSA9PiB7XG4gICAgY29uc3QgbW9kWmlwcyA9IGZpbGVzLmZpbHRlcihmaWxlID0+XG4gICAgICAgICFmaWxlLmVuZHNXaXRoKHBhdGguc2VwKSAmJlxuICAgICAgICBwYXRoLmV4dG5hbWUoZmlsZSkudG9Mb3dlckNhc2UoKSA9PT0gR01MLm1vZEZpbGVcbiAgICApO1xuXG4gICAgY29uc3QgaW5zdHJ1Y3Rpb25zOiBJSW5zdHJ1Y3Rpb25bXSA9IG1vZFppcHMubWFwKGZpbGUgPT4gKHtcbiAgICAgICAgdHlwZTogJ2NvcHknLFxuICAgICAgICBzb3VyY2U6IGZpbGUsXG4gICAgICAgIGRlc3RpbmF0aW9uOiBwYXRoLmJhc2VuYW1lKGZpbGUpLFxuICAgIH0pKTtcblxuICAgIHJldHVybiBCbHVlYmlyZC5yZXNvbHZlKHsgaW5zdHJ1Y3Rpb25zIH0pO1xufTtcbi8vI2VuZHJlZ2lvblxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyNyZWdpb24gVXRpbHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBDaGVja3MgaWYgTWVsb25Mb2FkZXIgaXMgaW5zdGFsbGVkIGZvciBhIGdpdmVuIGRpc2NvdmVyeS5cbiAqXG4gKiBMb29rcyBmb3IgYWxsIE1lbG9uTG9hZGVyIHJlcXVpcmVkIGZpbGVzIHVuZGVyIHRoZSBnYW1lIGRpcmVjdG9yeS5cbiAqXG4gKiBAcGFyYW0gZGlzY292ZXJ5IC0gVGhlIGdhbWUgZGlzY292ZXJ5IHJlc3VsdCBmcm9tIFZvcnRleC5cbiAqIEByZXR1cm5zIFRydWUgaWYgYWxsIHJlcXVpcmVkIEdvZG90IE1vZCBMb2FkZXIgZmlsZXMgZXhpc3Q7IG90aGVyd2lzZSBmYWxzZS5cbiAqL1xuZnVuY3Rpb24gaXNHTUxJbnN0YWxsZWQoZGlzY292ZXJ5OiBJRGlzY292ZXJ5UmVzdWx0KSB7XG4gICAgZm9yIChjb25zdCByZXFGaWxlIG9mIEdNTC5yZXF1aXJlZEZpbGVzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy5zdGF0U3luYyhwYXRoLmpvaW4oZGlzY292ZXJ5LnBhdGghLCByZXFGaWxlKSk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIEVuc3VyZXMgdGhhdCBhIGRpcmVjdG9yeSBleGlzdHMgYW5kIGlzIHdyaXRhYmxlLCBvdGhlcndpc2Ugd2FybnMgdGhlIHVzZXIuXG4gKlxuICogSWYgdGhlIGRpcmVjdG9yeSBpcyBub3Qgd3JpdGFibGUsIGFuIGVycm9yIGlzIGxvZ2dlZCBhbmQgYSBWb3J0ZXggbm90aWZpY2F0aW9uXG4gKiBpcyBzaG93biBkZXNjcmliaW5nIHRoZSBwcm9ibGVtIGFuZCBvZmZlcmluZyB0byBvcGVuIHRoZSBmb2xkZXIuXG4gKlxuICogQHBhcmFtIGFwaSAtIFZvcnRleCBleHRlbnNpb24gQVBJLlxuICogQHBhcmFtIGFic1BhdGggLSBBYnNvbHV0ZSBwYXRoIG9mIHRoZSBkaXJlY3RvcnkgdG8gY2hlY2suXG4gKiBAcmV0dXJucyBBIHByb21pc2UgcmVzb2x2aW5nIHRvIHRydWUgaWYgdGhlIGRpcmVjdG9yeSBpcyB3cml0YWJsZSwgZmFsc2Ugb3RoZXJ3aXNlLlxuICovXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVXcml0YWJsZURpck9yV2FybihhcGk6IElFeHRlbnNpb25BcGksIGFic1BhdGg6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGZzLmVuc3VyZURpcldyaXRhYmxlQXN5bmMoYWJzUGF0aCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIGxvZygnZXJyb3InLCBgRGlyZWN0b3J5IFwiJHthYnNQYXRofVwiIGlzIG5vdCB3cml0YWJsZTogJHtlcnJ9YCk7XG4gICAgICAgIGFwaS5zZW5kTm90aWZpY2F0aW9uPy4oe1xuICAgICAgICAgICAgaWQ6ICd2cy1zdXBwb3J0LXdyaXRhYmxlLXdhcm5pbmcnLFxuICAgICAgICAgICAgdHlwZTogJ3dhcm5pbmcnLFxuICAgICAgICAgICAgdGl0bGU6ICdEaXJlY3RvcnkgUGVybWlzc2lvbnMgV2FybmluZycsXG4gICAgICAgICAgICBtZXNzYWdlOiBgRGlyZWN0b3J5IFwiJHthYnNQYXRofVwiIGlzIG5vdCB3cml0YWJsZS4gUGxlYXNlIGVuc3VyZSB5b3UgaGF2ZSB0aGUgbmVjZXNzYXJ5IHBlcm1pc3Npb25zIHRvIHdyaXRlIHRvIHRoaXMgZGlyZWN0b3J5LmAsXG4gICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgYXBpTWFrZU9wZW5VcmxGdW5jdGlvbignT3BlbiBmb2xkZXInLCBhYnNQYXRoKSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBWb3J0ZXggbm90aWZpY2F0aW9uIGFjdGlvbiB0aGF0IG9wZW5zIGEgVVJMIHVzaW5nIGB1dGlsLm9wbmAuXG4gKlxuICogQHBhcmFtIHRpdGxlIC0gRGlzcGxheSB0aXRsZSBvZiB0aGUgYWN0aW9uIGJ1dHRvbi5cbiAqIEBwYXJhbSB1cmwgLSBVUkwgdG8gb3BlbiB3aGVuIHRoZSBhY3Rpb24gaXMgaW52b2tlZC5cbiAqIEByZXR1cm5zIEEgbm90aWZpY2F0aW9uIGFjdGlvbiBkZXNjcmlwdG9yLlxuICovXG5mdW5jdGlvbiBhcGlNYWtlT3BlblVybEZ1bmN0aW9uKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdGl0bGUsXG4gICAgICAgIGFjdGlvbjogKCkgPT4gdXRpbC5vcG4odXJsKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpLFxuICAgIH07XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIFZvcnRleCBub3RpZmljYXRpb24gYWN0aW9uIHRoYXQgcmUtY2hlY2tzIGEgY29uZGl0aW9uIGFuZFxuICogZGlzbWlzc2VzIGEgbm90aWZpY2F0aW9uIGlmIHRoZSBjb25kaXRpb24gaXMgbm93IHNhdGlzZmllZC5cbiAqXG4gKiBUeXBpY2FsbHkgdXNlZCB0byBhbGxvdyB0aGUgdXNlciB0byBjbGljayBcIkNoZWNrIGFnYWluXCIgYWZ0ZXIgaW5zdGFsbGluZ1xuICogYSBtb2QgbG9hZGVyIG1hbnVhbGx5LlxuICpcbiAqIEBwYXJhbSB0aXRsZSAtIERpc3BsYXkgdGl0bGUgb2YgdGhlIGFjdGlvbiBidXR0b24uXG4gKiBAcGFyYW0gbm90aWZpY2F0aW9uSWQgLSBJRCBvZiB0aGUgbm90aWZpY2F0aW9uIHRvIHBvdGVudGlhbGx5IGRpc21pc3MuXG4gKiBAcGFyYW0gYXBpIC0gVm9ydGV4IGV4dGVuc2lvbiBBUEkuXG4gKiBAcGFyYW0gY2hlY2tGdW5jdGlvbiAtIEZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0cnVlIHdoZW4gdGhlIGNvbmRpdGlvbiBpcyBzYXRpc2ZpZWQuXG4gKiBAcmV0dXJucyBBIG5vdGlmaWNhdGlvbiBhY3Rpb24gZGVzY3JpcHRvci5cbiAqL1xuZnVuY3Rpb24gYXBpTWFrZUNoZWNrQW5kRGlzbWlzc0Z1bmN0aW9uKHRpdGxlOiBzdHJpbmcsIG5vdGlmaWNhdGlvbklkOiBzdHJpbmcsIGFwaTogSUV4dGVuc2lvbkFwaSwgY2hlY2tGdW5jdGlvbjogKCkgPT4gYm9vbGVhbikge1xuICAgIHJldHVybiB7XG4gICAgICAgIHRpdGxlLFxuICAgICAgICBhY3Rpb246ICgpID0+IGFwaUNoZWNrQW5kRGlzbWlzc0Z1bmN0aW9uKG5vdGlmaWNhdGlvbklkLCBhcGksIGNoZWNrRnVuY3Rpb24pLFxuICAgIH07XG59XG5cbi8qKlxuICogQ2hlY2tzIGEgY29uZGl0aW9uIGFuZCBkaXNtaXNzZXMgdGhlIHNwZWNpZmllZCBub3RpZmljYXRpb24gaWYgaXQgaG9sZHMuXG4gKlxuICogQHBhcmFtIG5vdGlmaWNhdGlvbklkIC0gSUQgb2YgdGhlIG5vdGlmaWNhdGlvbiB0byBkaXNtaXNzLlxuICogQHBhcmFtIGFwaSAtIFZvcnRleCBleHRlbnNpb24gQVBJLlxuICogQHBhcmFtIGNoZWNrRnVuY3Rpb24gLSBDb25kaXRpb24gZnVuY3Rpb247IGlmIGl0IHJldHVybnMgdHJ1ZSwgdGhlIG5vdGlmaWNhdGlvbiBpcyBkaXNtaXNzZWQuXG4gKi9cbmZ1bmN0aW9uIGFwaUNoZWNrQW5kRGlzbWlzc0Z1bmN0aW9uKG5vdGlmaWNhdGlvbklkOiBzdHJpbmcsIGFwaTogSUV4dGVuc2lvbkFwaSwgY2hlY2tGdW5jdGlvbjogKCkgPT4gYm9vbGVhbikge1xuICAgIGlmIChjaGVja0Z1bmN0aW9uKCkpIHtcbiAgICAgICAgYXBpLmRpc21pc3NOb3RpZmljYXRpb24/Lihub3RpZmljYXRpb25JZCk7XG4gICAgfVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8gZXhwb3J0IG9ubHkgZm9yIHR5cGVkb2NcbmV4cG9ydCB7XG4gICAgLy8gUmVnaXN0ZXIgLyBzZXR1cFxuICAgIG1haW4sXG4gICAgZmluZEdhbWUsXG4gICAgcHJlcGFyZUZvck1vZGRpbmcsXG5cbiAgICAvLyBJbnN0YWxsZXJzICYgaGVscGVyc1xuICAgIHRlc3RTdXBwb3J0ZWRDb250ZW50LFxuICAgIGluc3RhbGxDb250ZW50LFxuXG4gICAgLy8gTW9kIGxvYWRlciBkZXRlY3Rpb25cbiAgICBpc0dNTEluc3RhbGxlZCxcblxuICAgIC8vIFV0aWxpdHkgZnVuY3Rpb25zXG4gICAgZW5zdXJlV3JpdGFibGVEaXJPcldhcm4sXG4gICAgYXBpTWFrZU9wZW5VcmxGdW5jdGlvbixcbiAgICBhcGlNYWtlQ2hlY2tBbmREaXNtaXNzRnVuY3Rpb24sXG4gICAgYXBpQ2hlY2tBbmREaXNtaXNzRnVuY3Rpb24sXG59O1xuXG5leHBvcnQgZGVmYXVsdCBtYWluO1xuIl0sIm5hbWVzIjpbImh0dHBzIiwibmF0aXZlRnMiLCJwYXRoIiwib3MiLCJsb2ciLCJmcyIsInV0aWwiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVdBLE1BQU0sV0FBVyxHQUFHLHdFQUF3RTtBQUM1RixNQUFNLFVBQVUsR0FBRyx3QkFBd0I7QUFFM0M7Ozs7QUFJRztBQUNILFNBQVMsaUJBQWlCLEdBQUE7QUFDdEIsSUFBQSxRQUFRLE9BQU8sQ0FBQyxRQUFRO0FBQ3BCLFFBQUEsS0FBSyxPQUFPLEVBQUUsT0FBTyxTQUFTO0FBQzlCLFFBQUEsS0FBSyxPQUFPLEVBQUUsT0FBTyxPQUFPO0FBQzVCLFFBQUEsU0FBUyxPQUFPLElBQUk7O0FBRTVCO0FBRUE7Ozs7OztBQU1HO0FBQ0gsU0FBUyxZQUFZLENBQUMsR0FBVyxFQUFBO0lBQzdCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxLQUFJO1FBQ25DLE1BQU0sU0FBUyxHQUFHLENBQUMsTUFBYyxFQUFFLGFBQWEsR0FBRyxDQUFDLEtBQUk7QUFDcEQsWUFBQSxJQUFJLGFBQWEsR0FBRyxDQUFDLEVBQUU7QUFDbkIsZ0JBQUEsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQ3ZDO1lBQ0o7QUFFQSxZQUFBQSxnQkFBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSTtBQUNqRSxnQkFBQSxJQUFJLEdBQUcsQ0FBQyxVQUFVLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxVQUFVLEtBQUssR0FBRyxFQUFFO29CQUNsRCxHQUFHLENBQUMsTUFBTSxFQUFFO29CQUNaLFNBQVMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFFBQVMsRUFBRSxhQUFhLEdBQUcsQ0FBQyxDQUFDO29CQUNuRDtnQkFDSjtBQUVBLGdCQUFBLElBQUksR0FBRyxDQUFDLFVBQVUsS0FBSyxHQUFHLEVBQUU7QUFDeEIsb0JBQUEsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUEsS0FBQSxFQUFRLEdBQUcsQ0FBQyxVQUFVLENBQUEsTUFBQSxFQUFTLE1BQU0sQ0FBQSxDQUFFLENBQUMsQ0FBQztvQkFDMUQsR0FBRyxDQUFDLE1BQU0sRUFBRTtvQkFDWjtnQkFDSjtnQkFFQSxJQUFJLElBQUksR0FBRyxFQUFFO0FBQ2IsZ0JBQUEsR0FBRyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUM7QUFDdkIsZ0JBQUEsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFhLEtBQUksRUFBRyxJQUFJLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JELGdCQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLE1BQUs7QUFDZixvQkFBQSxJQUFJO3dCQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUFFO29CQUNqQyxPQUFPLENBQUMsRUFBRTt3QkFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUFFO0FBQzNCLGdCQUFBLENBQUMsQ0FBQztBQUNGLGdCQUFBLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztZQUMzQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztBQUMxQixRQUFBLENBQUM7UUFFRCxTQUFTLENBQUMsR0FBRyxDQUFDO0FBQ2xCLElBQUEsQ0FBQyxDQUFDO0FBQ047QUFFQTs7Ozs7Ozs7O0FBU0c7QUFDSCxTQUFTLGNBQWMsQ0FBQyxHQUFXLEVBQUUsUUFBZ0IsRUFBRSxVQUFrQyxFQUFBO0lBQ3JGLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxLQUFJO1FBQ25DLE1BQU0sU0FBUyxHQUFHLENBQUMsTUFBYyxFQUFFLGFBQWEsR0FBRyxDQUFDLEtBQUk7QUFDcEQsWUFBQSxJQUFJLGFBQWEsR0FBRyxDQUFDLEVBQUU7QUFDbkIsZ0JBQUEsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQ3ZDO1lBQ0o7QUFFQSxZQUFBQSxnQkFBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSTtBQUNqRSxnQkFBQSxJQUFJLEdBQUcsQ0FBQyxVQUFVLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxVQUFVLEtBQUssR0FBRyxFQUFFO29CQUNsRCxHQUFHLENBQUMsTUFBTSxFQUFFO29CQUNaLFNBQVMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFFBQVMsRUFBRSxhQUFhLEdBQUcsQ0FBQyxDQUFDO29CQUNuRDtnQkFDSjtBQUVBLGdCQUFBLElBQUksR0FBRyxDQUFDLFVBQVUsS0FBSyxHQUFHLEVBQUU7QUFDeEIsb0JBQUEsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUEsS0FBQSxFQUFRLEdBQUcsQ0FBQyxVQUFVLENBQUEsYUFBQSxFQUFnQixNQUFNLENBQUEsQ0FBRSxDQUFDLENBQUM7b0JBQ2pFLEdBQUcsQ0FBQyxNQUFNLEVBQUU7b0JBQ1o7Z0JBQ0o7QUFFQSxnQkFBQSxNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEdBQUcsRUFBRSxFQUFFLENBQUM7Z0JBQ3JFLElBQUksYUFBYSxHQUFHLENBQUM7QUFDckIsZ0JBQUEsSUFBSSxlQUFlLEdBQUcsRUFBRTtnQkFFeEIsTUFBTSxNQUFNLEdBQUdDLG1CQUFRLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDO2dCQUVuRCxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLEtBQWEsS0FBSTtBQUM3QixvQkFBQSxhQUFhLElBQUksS0FBSyxDQUFDLE1BQU07QUFDN0Isb0JBQUEsSUFBSSxVQUFVLElBQUksVUFBVSxHQUFHLENBQUMsRUFBRTtBQUM5Qix3QkFBQSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsYUFBYSxHQUFHLFVBQVUsSUFBSSxHQUFHLENBQUM7O0FBRTFELHdCQUFBLElBQUksR0FBRyxLQUFLLGVBQWUsRUFBRTs0QkFDekIsZUFBZSxHQUFHLEdBQUc7NEJBQ3JCLFVBQVUsQ0FBQyxHQUFHLENBQUM7d0JBQ25CO29CQUNKO0FBQ0osZ0JBQUEsQ0FBQyxDQUFDO0FBRUYsZ0JBQUEsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7QUFDaEIsZ0JBQUEsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sT0FBTyxFQUFFLENBQUMsQ0FBQztnQkFDeEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxHQUFVLEtBQUk7b0JBQzlCQSxtQkFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsTUFBTSxTQUFTLENBQUM7b0JBQzFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7QUFDZixnQkFBQSxDQUFDLENBQUM7WUFDTixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQztBQUMxQixRQUFBLENBQUM7UUFFRCxTQUFTLENBQUMsR0FBRyxDQUFDO0FBQ2xCLElBQUEsQ0FBQyxDQUFDO0FBQ047QUFFQTs7Ozs7Ozs7Ozs7Ozs7O0FBZUc7QUFDSSxlQUFlLFVBQVUsQ0FBQyxHQUFrQixFQUFFLFNBQTJCLEVBQUE7SUFDNUUsTUFBTSxRQUFRLEdBQUcsc0JBQXNCO0FBQ3ZDLElBQUEsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLElBQUs7QUFDaEMsSUFBQSxJQUFJLE9BQTJCO0FBRS9CLElBQUEsSUFBSTtBQUNBLFFBQUEsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLEVBQUU7UUFDdEMsSUFBSSxDQUFDLFVBQVUsRUFBRTtZQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsQ0FBQSxzQkFBQSxFQUF5QixPQUFPLENBQUMsUUFBUSxDQUFBLENBQUUsQ0FBQztRQUNoRTtRQUVBLEdBQUcsQ0FBQyxnQkFBZ0IsR0FBRztBQUNuQixZQUFBLEVBQUUsRUFBRSxRQUFRO0FBQ1osWUFBQSxJQUFJLEVBQUUsVUFBVTtBQUNoQixZQUFBLEtBQUssRUFBRSw2QkFBNkI7QUFDcEMsWUFBQSxPQUFPLEVBQUUsaUNBQWlDO0FBQzFDLFlBQUEsU0FBUyxFQUFFLElBQUk7QUFDbEIsU0FBQSxDQUFDO0FBRUYsUUFBQSxNQUFNLE9BQU8sR0FBRyxNQUFNLFlBQVksQ0FBQyxXQUFXLENBQUM7QUFDL0MsUUFBQSxNQUFNLFNBQVMsR0FBRyxDQUFBLGlCQUFBLEVBQW9CLFVBQVUsTUFBTTtBQUN0RCxRQUFBLE1BQU0sS0FBSyxHQUFJLE9BQU8sQ0FBQyxNQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDLENBQU0sS0FBSyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQztRQUUvRSxJQUFJLENBQUMsS0FBSyxFQUFFO0FBQ1IsWUFBQSxNQUFNLElBQUksS0FBSyxDQUFDLENBQUEsT0FBQSxFQUFVLFNBQVMsQ0FBQSw4QkFBQSxFQUFpQyxPQUFPLENBQUMsUUFBUSxJQUFJLFdBQVcsQ0FBQSxDQUFFLENBQUM7UUFDMUc7UUFFQSxHQUFHLENBQUMsZ0JBQWdCLEdBQUc7QUFDbkIsWUFBQSxFQUFFLEVBQUUsUUFBUTtBQUNaLFlBQUEsSUFBSSxFQUFFLFVBQVU7QUFDaEIsWUFBQSxLQUFLLEVBQUUsNkJBQTZCO0FBQ3BDLFlBQUEsT0FBTyxFQUFFLENBQUEsWUFBQSxFQUFlLFNBQVMsS0FBSyxPQUFPLENBQUMsUUFBUSxDQUFBLElBQUEsQ0FBTTtBQUM1RCxZQUFBLFFBQVEsRUFBRSxDQUFDO0FBQ1gsWUFBQSxTQUFTLEVBQUUsSUFBSTtBQUNsQixTQUFBLENBQUM7QUFFRixRQUFBLE9BQU8sR0FBR0MsZUFBSSxDQUFDLElBQUksQ0FBQ0MsYUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLGVBQWUsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFBLElBQUEsQ0FBTSxDQUFDO1FBQ2pFLE1BQU0sY0FBYyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxPQUFPLEVBQUUsQ0FBQyxHQUFHLEtBQUk7WUFDOUQsR0FBRyxDQUFDLGdCQUFnQixHQUFHO0FBQ25CLGdCQUFBLEVBQUUsRUFBRSxRQUFRO0FBQ1osZ0JBQUEsSUFBSSxFQUFFLFVBQVU7QUFDaEIsZ0JBQUEsS0FBSyxFQUFFLDZCQUE2QjtBQUNwQyxnQkFBQSxPQUFPLEVBQUUsQ0FBQSxZQUFBLEVBQWUsU0FBUyxLQUFLLE9BQU8sQ0FBQyxRQUFRLENBQUEsSUFBQSxDQUFNO0FBQzVELGdCQUFBLFFBQVEsRUFBRSxHQUFHO0FBQ2IsZ0JBQUEsU0FBUyxFQUFFLElBQUk7QUFDbEIsYUFBQSxDQUFDO0FBQ04sUUFBQSxDQUFDLENBQUM7UUFFRixHQUFHLENBQUMsZ0JBQWdCLEdBQUc7QUFDbkIsWUFBQSxFQUFFLEVBQUUsUUFBUTtBQUNaLFlBQUEsSUFBSSxFQUFFLFVBQVU7QUFDaEIsWUFBQSxLQUFLLEVBQUUsNkJBQTZCO0FBQ3BDLFlBQUEsT0FBTyxFQUFFLGVBQWU7QUFDeEIsWUFBQSxTQUFTLEVBQUUsSUFBSTtBQUNsQixTQUFBLENBQUM7QUFFRixRQUFBLE1BQU0sT0FBTyxHQUFHLE1BQU0sR0FBRyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQztBQUN6RCxRQUFBLE1BQU0sT0FBTyxDQUFDLFVBQVcsQ0FBQyxRQUFRLENBQUM7QUFDbkMsUUFBQSxNQUFNLE9BQU8sQ0FBQyxVQUFXLENBQUNELGVBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBRTFELFFBQUEsR0FBRyxDQUFDLG1CQUFtQixHQUFHLFFBQVEsQ0FBQztBQUNuQyxRQUFBLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxhQUFhLENBQUM7UUFFeEMsR0FBRyxDQUFDLGdCQUFnQixHQUFHO0FBQ25CLFlBQUEsRUFBRSxFQUFFLHFCQUFxQjtBQUN6QixZQUFBLElBQUksRUFBRSxTQUFTO0FBQ2YsWUFBQSxLQUFLLEVBQUUsNEJBQTRCO0FBQ25DLFlBQUEsT0FBTyxFQUFFLENBQUEsRUFBRyxPQUFPLENBQUMsUUFBUSxDQUFBLHdCQUFBLENBQTBCO0FBQ3RELFlBQUEsU0FBUyxFQUFFLElBQUk7QUFDbEIsU0FBQSxDQUFDO0lBRU47SUFBRSxPQUFPLEdBQVEsRUFBRTtBQUNmLFFBQUFFLGFBQUcsQ0FBQyxPQUFPLEVBQUUsb0NBQW9DLEVBQUUsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQzVFLFFBQUEsR0FBRyxDQUFDLG1CQUFtQixHQUFHLFFBQVEsQ0FBQztRQUNuQyxHQUFHLENBQUMscUJBQXFCLEdBQUcsb0NBQW9DLEVBQUUsR0FBRyxDQUFDO0lBRTFFO1lBQVU7UUFDTixJQUFJLE9BQU8sRUFBRTtZQUNUSCxtQkFBUSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsTUFBTSxTQUFTLENBQUM7UUFDN0M7SUFDSjtBQUNKOztBQ3hOQSxNQUFNLElBQUksR0FBRztBQUNULElBQUEsRUFBRSxFQUFFLFNBQVM7QUFDYixJQUFBLElBQUksRUFBRSxVQUFVO0FBQ2hCLElBQUEsR0FBRyxFQUFFLGNBQWM7QUFDbkIsSUFBQSxVQUFVLEVBQUUsU0FBUztBQUNyQixJQUFBLGFBQWEsRUFBRTtRQUNYO0FBQ0g7Q0FDSjtBQUVELE1BQU0sR0FBRyxHQUFHO0FBQ1IsSUFDQSxPQUFPLEVBQUUsTUFBTTtJQUNmLE1BQU0sRUFBRUMsZUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDO0lBQ3JDLFVBQVUsRUFBRUEsZUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsZUFBZSxDQUFDO0FBQ2xELElBQUEsYUFBYSxFQUFFO1FBQ1hBLGVBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFlBQVksRUFBRSxlQUFlLENBQUM7UUFDbERBLGVBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsZUFBZSxDQUFDO0FBQ2pFLE1BR0o7QUFHRDtBQUNBO0FBQ0E7QUFFQTs7Ozs7OztBQU9HO0FBQ0gsU0FBUyxJQUFJLENBQUMsT0FBMEIsRUFBQTs7SUFFcEMsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUNqQixFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUU7UUFDWCxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7QUFDZixRQUFBLFNBQVMsRUFBRSxJQUFJO1FBQ2YsU0FBUyxFQUFFLE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztBQUM3QyxRQUFBLGNBQWMsRUFBRSxFQUFFO0FBQ2xCLFFBQUEsWUFBWSxFQUFFLE1BQU0sR0FBRyxDQUFDLE1BQU07QUFDOUIsUUFBQSxJQUFJLEVBQUUsYUFBYTtBQUNuQixRQUFBLFVBQVUsRUFBRSxNQUFNLElBQUksQ0FBQyxHQUFHO1FBQzFCLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYTtBQUNqQyxRQUFBLEtBQUssRUFBRSxDQUFDLFNBQVMsS0FBSyxRQUFRLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDakYsUUFBQSxXQUFXLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRTtBQUM1QyxRQUFBLE9BQU8sRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFO0FBQzNDLEtBQUEsQ0FBQzs7SUFHRixPQUFPLENBQUMsaUJBQWlCLENBQUMsYUFBYSxFQUFFLEVBQUUsRUFBRSxvQkFBb0IsRUFBRSxjQUFjLENBQUM7QUFFbEYsSUFBQSxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQUs7O0FBRWQsUUFBQSxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsWUFBWSxFQUFFLENBQUMsU0FBaUIsS0FBSTtZQUN2RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBUztZQUMzQyxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsVUFBVSxFQUFFLFFBQVEsR0FBRyxTQUFTLENBQUM7WUFDdkQsSUFBSSxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxFQUFFO2dCQUFFO0FBRTVDLFlBQUEsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsVUFBVSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDakUsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJO2dCQUFFO0FBRXRCLFlBQUEsTUFBTSxjQUFjLEdBQUdBLGVBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQWMsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDO1lBQzFFRyxZQUFFLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFLO0FBQ3RDLGdCQUFBLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEdBQUc7QUFDM0Isb0JBQUEsSUFBSSxFQUFFLFNBQVM7QUFDZixvQkFBQSxLQUFLLEVBQUUsaUNBQWlDO29CQUN4QyxPQUFPLEVBQUUsQ0FBQSxrQkFBQSxFQUFxQixjQUFjLENBQUEsdUhBQUEsQ0FBeUg7QUFDckssb0JBQUEsT0FBTyxFQUFFO3dCQUNMLHNCQUFzQixDQUFDLGFBQWEsRUFBRUgsZUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUN0RSxxQkFBQTtBQUNKLGlCQUFBLENBQUM7QUFDTixZQUFBLENBQUMsQ0FBQztBQUNOLFFBQUEsQ0FBQyxDQUFDO0FBQ04sSUFBQSxDQUFDLENBQUM7QUFFRixJQUFBLE9BQU8sSUFBSTtBQUNmO0FBRUE7Ozs7OztBQU1HO0FBQ0gsZUFBZSxRQUFRLEdBQUE7QUFDbkIsSUFBQSxNQUFNLElBQUksR0FBRyxNQUFNSSxjQUFJLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN0RSxPQUFPLElBQUksQ0FBQyxRQUFRO0FBQ3hCO0FBRUE7Ozs7Ozs7OztBQVNHO0FBQ0gsZUFBZSxpQkFBaUIsQ0FBQyxTQUEyQixFQUFFLEdBQWtCLEVBQUE7QUFDNUUsSUFBQSxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxFQUFFO1FBQzVCLEdBQUcsQ0FBQyxnQkFBaUIsQ0FBQztBQUNsQixZQUFBLEVBQUUsRUFBRSxhQUFhO0FBQ2pCLFlBQUEsSUFBSSxFQUFFLFNBQVM7QUFDZixZQUFBLEtBQUssRUFBRSxnQ0FBZ0M7QUFDdkMsWUFBQSxPQUFPLEVBQUUsK0NBQStDO0FBQ3hELFlBQUEsT0FBTyxFQUFFO0FBQ0wsZ0JBQUE7QUFDSSxvQkFBQSxLQUFLLEVBQUUsU0FBUztBQUNoQixvQkFBQSxNQUFNLEVBQUUsQ0FBQyxPQUFPLEtBQUk7QUFDaEIsd0JBQUEsT0FBTyxFQUFFO0FBQ1Qsd0JBQUEsVUFBVSxDQUFDLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxTQUFTLENBQUM7b0JBQ3JELENBQUM7QUFDSixpQkFBQTtBQUNELGdCQUFBLDhCQUE4QixDQUFDLGFBQWEsRUFBRSxhQUFhLEVBQUUsR0FBRyxFQUFFLE1BQU0sY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3JHLGFBQUE7QUFDSixTQUFBLENBQUM7UUFDRjtJQUNKO0FBRUEsSUFBQSxNQUFNLHVCQUF1QixDQUFDLEdBQUcsRUFBRUosZUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM5RTtBQUVBO0FBR0E7QUFDQTtBQUNBO0FBRUE7Ozs7Ozs7Ozs7O0FBV0c7QUFDSCxNQUFNLG9CQUFvQixHQUFrQixDQUFDLEtBQUssRUFBRSxNQUFNLEtBQUk7O0FBRTFELElBQUEsSUFBSSxNQUFNLEtBQUssSUFBSSxDQUFDLEVBQUUsRUFBRTtBQUNwQixRQUFBLE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQ3BFO0lBRUEsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSUEsZUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyxHQUFHLENBQUMsT0FBTyxDQUFDO0FBRWhHLElBQUEsT0FBTyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsU0FBUyxFQUFFLG1CQUFtQixFQUFFLGFBQWEsRUFBRSxFQUFFLEVBQUUsQ0FBQztBQUNsRjtBQUVBOzs7Ozs7Ozs7O0FBVUc7QUFDSCxNQUFNLGNBQWMsR0FBZ0IsQ0FBQyxLQUFLLEtBQUk7QUFDMUMsSUFBQSxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksSUFDN0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDQSxlQUFJLENBQUMsR0FBRyxDQUFDO0FBQ3hCLFFBQUFBLGVBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssR0FBRyxDQUFDLE9BQU8sQ0FDbkQ7SUFFRCxNQUFNLFlBQVksR0FBbUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUs7QUFDdEQsUUFBQSxJQUFJLEVBQUUsTUFBTTtBQUNaLFFBQUEsTUFBTSxFQUFFLElBQUk7QUFDWixRQUFBLFdBQVcsRUFBRUEsZUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7QUFDbkMsS0FBQSxDQUFDLENBQUM7SUFFSCxPQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxZQUFZLEVBQUUsQ0FBQztBQUM3QztBQUNBO0FBRUE7QUFDQTtBQUNBO0FBRUE7Ozs7Ozs7QUFPRztBQUNILFNBQVMsY0FBYyxDQUFDLFNBQTJCLEVBQUE7QUFDL0MsSUFBQSxLQUFLLE1BQU0sT0FBTyxJQUFJLEdBQUcsQ0FBQyxhQUFhLEVBQUU7QUFDckMsUUFBQSxJQUFJO0FBQ0EsWUFBQUcsWUFBRSxDQUFDLFFBQVEsQ0FBQ0gsZUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3BEO0FBQUUsUUFBQSxNQUFNO0FBQ0osWUFBQSxPQUFPLEtBQUs7UUFDaEI7SUFDSjtBQUNBLElBQUEsT0FBTyxJQUFJO0FBQ2Y7QUFFQTs7Ozs7Ozs7O0FBU0c7QUFDSCxlQUFlLHVCQUF1QixDQUFDLEdBQWtCLEVBQUUsT0FBZSxFQUFBO0FBQ3RFLElBQUEsSUFBSTtBQUNBLFFBQUEsTUFBTUcsWUFBRSxDQUFDLHNCQUFzQixDQUFDLE9BQU8sQ0FBQztBQUN4QyxRQUFBLE9BQU8sSUFBSTtJQUNmO0lBQUUsT0FBTyxHQUFRLEVBQUU7UUFDZkQsYUFBRyxDQUFDLE9BQU8sRUFBRSxDQUFBLFdBQUEsRUFBYyxPQUFPLENBQUEsbUJBQUEsRUFBc0IsR0FBRyxDQUFBLENBQUUsQ0FBQztRQUM5RCxHQUFHLENBQUMsZ0JBQWdCLEdBQUc7QUFDbkIsWUFBQSxFQUFFLEVBQUUsNkJBQTZCO0FBQ2pDLFlBQUEsSUFBSSxFQUFFLFNBQVM7QUFDZixZQUFBLEtBQUssRUFBRSwrQkFBK0I7WUFDdEMsT0FBTyxFQUFFLENBQUEsV0FBQSxFQUFjLE9BQU8sQ0FBQSwrRkFBQSxDQUFpRztBQUMvSCxZQUFBLE9BQU8sRUFBRTtBQUNMLGdCQUFBLHNCQUFzQixDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUM7QUFDakQsYUFBQTtBQUNKLFNBQUEsQ0FBQztBQUNGLFFBQUEsT0FBTyxLQUFLO0lBQ2hCO0FBQ0o7QUFFQTs7Ozs7O0FBTUc7QUFDSCxTQUFTLHNCQUFzQixDQUFDLEtBQWEsRUFBRSxHQUFXLEVBQUE7SUFDdEQsT0FBTztRQUNILEtBQUs7QUFDTCxRQUFBLE1BQU0sRUFBRSxNQUFNRSxjQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLFNBQVMsQ0FBQztLQUNyRDtBQUNMO0FBRUE7Ozs7Ozs7Ozs7OztBQVlHO0FBQ0gsU0FBUyw4QkFBOEIsQ0FBQyxLQUFhLEVBQUUsY0FBc0IsRUFBRSxHQUFrQixFQUFFLGFBQTRCLEVBQUE7SUFDM0gsT0FBTztRQUNILEtBQUs7UUFDTCxNQUFNLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFLGFBQWEsQ0FBQztLQUMvRTtBQUNMO0FBRUE7Ozs7OztBQU1HO0FBQ0gsU0FBUywwQkFBMEIsQ0FBQyxjQUFzQixFQUFFLEdBQWtCLEVBQUUsYUFBNEIsRUFBQTtJQUN4RyxJQUFJLGFBQWEsRUFBRSxFQUFFO0FBQ2pCLFFBQUEsR0FBRyxDQUFDLG1CQUFtQixHQUFHLGNBQWMsQ0FBQztJQUM3QztBQUNKOzs7Ozs7Ozs7Ozs7OzsifQ==
