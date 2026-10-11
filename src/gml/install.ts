import * as os from 'os';
import * as path from 'path';
import { fs, log, selectors, types } from 'vortex-api';
import { GML, GML_RELEASE, NOTIFICATION_IDS } from '../common/constants';
import { DownloadedFile, downloadFile } from '../common/http';
import { apiMakeCheckAndDismissFunction, apiMakeOpenUrlFunction } from '../common/notifications';
import { extractArchive } from '../common/sevenZip';
import { getDiscovery } from '../detection/discovery';
import { gmlFolders, isGmlInstalled, missingGmlFolders } from '../detection/gml';
import { fetchLatestGmlRelease, GmlAsset, GmlRelease } from './release';

/**
 * Warns that Godot Mod Loader is missing or incomplete, naming the folders it
 * is missing in, with buttons to install it, open its download page, or
 * re-check after a manual install.
 *
 * @param api - Vortex extension API.
 * @param discovery - The game discovery result from Vortex.
 */
export function notifyGmlMissing(api: types.IExtensionApi, discovery: types.IDiscoveryResult): void {
    api.sendNotification?.({
        id: NOTIFICATION_IDS.gmlMissing,
        type: 'warning',
        title: `${GML.name} not installed`,
        message: `Coal LLC mods need ${GML.name} in both game folders.`,
        actions: [
            {
                title: 'Install',
                action: (dismiss) => {
                    dismiss();
                    void installGml(api, discovery);
                },
            },
            apiMakeOpenUrlFunction('Download page', GML.releasesPage),
            apiMakeCheckAndDismissFunction('Check again', NOTIFICATION_IDS.gmlMissing, api, () => isGmlInstalled(discovery)),
        ],
    });
}

/**
 * Installs Godot Mod Loader again for the discovered game, e.g. to update it
 * or to repair a damaged install.
 *
 * @param api - Vortex extension API.
 */
export function reinstallGml(api: types.IExtensionApi): void {
    const discovery = getDiscovery(api);
    if (discovery?.path === undefined) {
        return;
    }
    void installGml(api, discovery);
}

/**
 * Downloads the latest Godot Mod Loader release, verifies it and extracts it
 * into both install folders. The files aren't managed by Vortex, so a purge
 * never removes the loader the patched game depends on.
 *
 * Never rejects: failures are shown to the user.
 *
 * @param api - Vortex extension API.
 * @param discovery - The game discovery result from Vortex.
 */
export async function installGml(api: types.IExtensionApi, discovery: types.IDiscoveryResult): Promise<void> {
    if (isInstallRunning(api)) {
        return;
    }
    const tempZip = tempZipPath();
    try {
        notifyProgress(api, 'Fetching the latest release...');
        const release = await fetchLatestGmlRelease();
        await downloadRelease(api, release, tempZip);
        notifyProgress(api, 'Extracting...');
        await extractGml(tempZip, discovery);
        api.dismissNotification?.(NOTIFICATION_IDS.gmlInstallProgress);
        api.dismissNotification?.(NOTIFICATION_IDS.gmlMissing);
        notifyGmlInstalled(api, release.tag);
    } catch (err) {
        log('error', `Failed to install ${GML.name}: ${err}`);
        api.dismissNotification?.(NOTIFICATION_IDS.gmlInstallProgress);
        api.showErrorNotification?.(`Failed to install ${GML.name}`, err, { allowReport: false });
        if (!isGmlInstalled(discovery)) {
            notifyGmlMissing(api, discovery);
        }
    } finally {
        await fs.removeAsync(tempZip).catch(() => undefined);
    }
}

/**
 * Checks whether an install is already running, so repeated clicks don't
 * start a second one.
 *
 * @param api - Vortex extension API.
 * @returns True while the install's progress notification is shown.
 */
function isInstallRunning(api: types.IExtensionApi): boolean {
    return selectors.notifications(api.getState())
        .some(notification => notification.id === NOTIFICATION_IDS.gmlInstallProgress);
}

/**
 * Downloads a release's asset and checks it against the size and SHA-256 GitHub reports.
 *
 * @param api - Vortex extension API.
 * @param release - The release to download.
 * @param destination - Absolute path the zip is written to.
 */
async function downloadRelease(api: types.IExtensionApi, release: GmlRelease, destination: string): Promise<void> {
    const message = `Downloading ${release.asset.name} (${release.tag})...`;
    notifyProgress(api, message, 0);
    const file = await downloadFile(release.asset.url, destination, percent => notifyProgress(api, message, percent));
    verifyDownload(file, release.asset);
}

/**
 * Throws if a download doesn't match its asset.
 *
 * @param file - The downloaded file.
 * @param asset - The asset it was downloaded from.
 */
function verifyDownload(file: DownloadedFile, asset: GmlAsset): void {
    if (file.bytes !== asset.size) {
        throw new Error(`The download of ${asset.name} is incomplete (${file.bytes} of ${asset.size} bytes). Please try again.`);
    }
    if (asset.sha256 === undefined) {
        log('warn', `GitHub reports no SHA-256 for ${asset.name}; skipping the hash check`);
        return;
    }
    if (file.sha256 !== asset.sha256) {
        throw new Error(`The download of ${asset.name} is damaged (SHA-256 mismatch). Please try again.`);
    }
}

/**
 * Extracts the release into both install folders and checks the result.
 *
 * @param zipPath - Absolute path of the downloaded release.
 * @param discovery - The game discovery result from Vortex.
 */
async function extractGml(zipPath: string, discovery: types.IDiscoveryResult): Promise<void> {
    for (const folder of gmlFolders(discovery)) {
        await extractArchive(zipPath, folder);
    }
    const missing = missingGmlFolders(discovery);
    if (missing.length > 0) {
        throw new Error(`The ${GML.name} release doesn't have the expected files; they are missing in: ${missing.join(', ')}`);
    }
}

/**
 * Shows or updates the install's progress notification.
 *
 * @param api - Vortex extension API.
 * @param message - What the install is doing.
 * @param progress - Progress in percent, if known.
 */
function notifyProgress(api: types.IExtensionApi, message: string, progress?: number): void {
    api.sendNotification?.({
        id: NOTIFICATION_IDS.gmlInstallProgress,
        type: 'activity',
        title: `Installing ${GML.name}`,
        message,
        progress,
        noDismiss: true,
    });
}

/**
 * Tells the user the install finished and how to start the game with mods.
 *
 * @param api - Vortex extension API.
 * @param tag - The installed release.
 */
function notifyGmlInstalled(api: types.IExtensionApi, tag: string): void {
    api.sendNotification?.({
        id: NOTIFICATION_IDS.gmlInstalled,
        type: 'success',
        title: `${GML.name} ${tag} installed`,
        message: 'Start Coal LLC from Vortex to finish the setup. To start it from Steam instead, add the Steam launch option.',
        actions: [
            { title: 'Steam launch option', action: () => showSteamLaunchOption(api) },
        ],
    });
}

/**
 * Shows the Steam launch option in a dialog the user can copy it from.
 *
 * @param api - Vortex extension API.
 */
function showSteamLaunchOption(api: types.IExtensionApi): void {
    void api.showDialog?.('info', 'Steam launch option', {
        text: `To start Coal LLC with mods from Steam, open the game's Properties in Steam and add this to its launch options. It runs the ${GML.name} setup again after game updates.`,
        message: GML.steamLaunchOption,
    }, [{ label: 'Close' }]);
}

/**
 * Builds a unique path for the downloaded release in the temp folder.
 *
 * @returns The absolute path.
 */
function tempZipPath(): string {
    return path.join(os.tmpdir(), `${GML_RELEASE.tempFilePrefix}${Date.now()}.zip`);
}
