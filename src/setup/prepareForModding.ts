import { log, types } from 'vortex-api';
import { GML, NOTIFICATION_IDS } from '../common/constants';
import { ensureWritableDirOrWarn } from '../common/notifications';
import { resolveGamePath } from '../detection/discovery';
import { isGmlInstalled } from '../detection/gml';
import { removeStaleGmlCaches } from '../gml/caches';
import { notifyGmlMissing } from '../gml/install';

/**
 * Prepares the game installation for modding. Vortex calls this every time
 * the game mode is activated.
 *
 * - Ensures the mods folder exists and is writable.
 * - Removes Godot Mod Loader caches left from an older game version.
 * - Warns if Godot Mod Loader is missing, and offers to install it.
 *
 * @param discovery - The game discovery result from Vortex.
 * @param api - Vortex extension API.
 * @returns A promise that resolves once preparation is complete.
 */
export async function prepareForModding(discovery: types.IDiscoveryResult, api: types.IExtensionApi): Promise<void> {
    await ensureWritableDirOrWarn(api, resolveGamePath(discovery, GML.modsDir));
    await removeStaleGmlCaches(discovery)
        .catch(err => log('warn', `Failed to remove stale ${GML.name} caches: ${err}`));

    if (isGmlInstalled(discovery)) {
        api.dismissNotification?.(NOTIFICATION_IDS.gmlMissing);
        return;
    }
    notifyGmlMissing(api, discovery);
}
