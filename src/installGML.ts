import * as https from 'https';
import * as nativeFs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { log } from 'vortex-api';
import * as vortex from 'vortex-api';

type IExtensionApi = vortex.types.IExtensionApi;
type IDiscoveryResult = vortex.types.IDiscoveryResult;

const GML_API_URL = 'https://api.github.com/repos/NanobotZ/godot-mod-loader/releases/latest';
const USER_AGENT = 'vortex-coalllc-support';

/**
 * Maps the current Node.js platform to the GML release asset OS suffix.
 *
 * @returns `'Windows'`, `'Linux'`, or `null` when the platform is unsupported.
 */
function getOsPlatformName(): string | null {
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
function httpsGetJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const doRequest = (reqUrl: string, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            https.get(reqUrl, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    res.resume();
                    doRequest(res.headers.location!, redirectCount + 1);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} from ${reqUrl}`));
                    res.resume();
                    return;
                }

                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk: string) => { body += chunk; });
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(e); }
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
function downloadToFile(url: string, destPath: string, onProgress?: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const doRequest = (reqUrl: string, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            https.get(reqUrl, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    res.resume();
                    doRequest(res.headers.location!, redirectCount + 1);
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

                const stream = nativeFs.createWriteStream(destPath);

                res.on('data', (chunk: Buffer) => {
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
                stream.on('error', (err: Error) => {
                    nativeFs.unlink(destPath, () => undefined);
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
export async function installGML(api: IExtensionApi, discovery: IDiscoveryResult): Promise<void> {
    const NOTIF_ID = 'gml-install-progress';
    const gamePath = discovery.path!;
    let tempZip: string | undefined;

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
        const asset = (release.assets as any[])?.find((a: any) => a.name === assetName);

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

        tempZip = path.join(os.tmpdir(), `gml-install-${Date.now()}.zip`);
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
        await archive.extractAll!(gamePath);
        await archive.extractAll!(path.join(gamePath, 'Coal LLC'));

        api.dismissNotification?.(NOTIF_ID);
        api.dismissNotification?.('gml-missing');

        api.sendNotification?.({
            id: 'gml-install-success',
            type: 'success',
            title: 'Godot Mod Loader installed',
            message: `${release.tag_name} installed successfully.`,
            displayMS: 5000,
        });

    } catch (err: any) {
        log('error', 'Failed to install Godot Mod Loader', { message: err.message });
        api.dismissNotification?.(NOTIF_ID);
        api.showErrorNotification?.('Failed to install Godot Mod Loader', err);

    } finally {
        if (tempZip) {
            nativeFs.unlink(tempZip, () => undefined);
        }
    }
}
