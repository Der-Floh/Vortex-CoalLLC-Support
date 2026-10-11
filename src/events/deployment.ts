import * as path from 'path';
import { log, selectors, types } from 'vortex-api';
import { GAME, GML, NOTIFICATION_IDS } from '../common/constants';
import { apiMakeOpenUrlFunction } from '../common/notifications';
import { getDiscovery, resolveGamePath } from '../detection/discovery';
import { removeGmlCaches } from '../gml/caches';

/**
 * Handles `did-deploy` and `did-purge` for Coal LLC: the set of mods changed,
 * so Godot Mod Loader's caches are removed and rebuilt on the next start.
 *
 * Both events fire for every game, and errors are handled here because Vortex
 * would only report them as unhandled.
 *
 * @param api - Vortex extension API.
 * @param profileId - ID of the profile that was deployed or purged.
 * @returns A promise that resolves once the caches are removed.
 */
export async function onDeploymentChanged(api: types.IExtensionApi, profileId: string): Promise<void> {
    if (selectors.profileById(api.getState(), profileId)?.gameId !== GAME.id) {
        return;
    }
    const discovery = getDiscovery(api);
    if (discovery?.path === undefined) {
        return;
    }
    try {
        await removeGmlCaches(discovery);
    } catch (err) {
        log('warn', `Failed to remove ${GML.name} caches: ${err}`);
        notifyCachesNotRemoved(api, discovery);
    }
}

/**
 * Warns that the caches couldn't be deleted, with a button to open their folder.
 *
 * @param api - Vortex extension API.
 * @param discovery - The game discovery result from Vortex.
 */
function notifyCachesNotRemoved(api: types.IExtensionApi, discovery: types.IDiscoveryResult): void {
    const exeFolder = resolveGamePath(discovery, GAME.exeDir);
    const hookPack = path.relative(GAME.exeDir, GML.hookPack);
    const decompDir = path.relative(GAME.exeDir, GML.decompDir);
    api.sendNotification?.({
        id: NOTIFICATION_IDS.cachesNotRemoved,
        type: 'warning',
        title: `Failed to clear ${GML.name} caches`,
        message: `Could not delete "${hookPack}" and "${decompDir}" in "${exeFolder}". Close the game and delete them before starting it, or mods may not load correctly.`,
        actions: [
            apiMakeOpenUrlFunction('Open folder', exeFolder),
        ],
    });
}
