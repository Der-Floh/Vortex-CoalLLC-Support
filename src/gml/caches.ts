import { fs, types } from 'vortex-api';
import { GAME, GML } from '../common/constants';
import { modifiedTimeAsync } from '../common/files';
import { resolveGamePath } from '../detection/discovery';

/**
 * Deletes Godot Mod Loader's hook pack (`mod-hooks.zip`) and its cache of
 * decompiled game scripts, so it rebuilds both from the current game and mods
 * on the next start.
 *
 * @param discovery - The game discovery result from Vortex.
 */
export async function removeGmlCaches(discovery: types.IDiscoveryResult): Promise<void> {
    await fs.removeAsync(resolveGamePath(discovery, GML.hookPack));
    await fs.removeAsync(resolveGamePath(discovery, GML.decompDir));
}

/**
 * Deletes the caches if they may hold scripts of an older game version: when
 * the hook pack is missing or older than the game's pck, which Steam replaces
 * on every update.
 *
 * @param discovery - The game discovery result from Vortex.
 */
export async function removeStaleGmlCaches(discovery: types.IDiscoveryResult): Promise<void> {
    if (await isHookPackCurrent(discovery)) {
        return;
    }
    await removeGmlCaches(discovery);
}

/**
 * Checks whether the hook pack was built after the game's pck was last written.
 *
 * @param discovery - The game discovery result from Vortex.
 * @returns True if the hook pack exists and is at least as new as the pck.
 */
async function isHookPackCurrent(discovery: types.IDiscoveryResult): Promise<boolean> {
    const hookPackTime = await modifiedTimeAsync(resolveGamePath(discovery, GML.hookPack));
    const pckTime = await modifiedTimeAsync(resolveGamePath(discovery, GAME.pck));
    return hookPackTime !== undefined && pckTime !== undefined && hookPackTime >= pckTime;
}
