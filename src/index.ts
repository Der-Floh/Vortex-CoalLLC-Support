import { selectors, types, util } from 'vortex-api';
import { GAME, GML, INSTALLERS, REINSTALL_ACTION, START_HOOK } from './common/constants';
import { findGame } from './detection/discovery';
import { onDeploymentChanged } from './events/deployment';
import { prepareGameLaunch } from './events/gameLaunch';
import { reinstallGml } from './gml/install';
import { installLoaderArchive, testSupportedLoaderArchive } from './installers/loaderArchive';
import { installModZips, testSupportedModZips } from './installers/modZips';
import { installUnpackedMods, testSupportedUnpackedMods } from './installers/unpackedMods';
import { prepareForModding } from './setup/prepareForModding';

/**
 * Vortex extension entry point for Coal LLC.
 *
 * Registers the game, the installers for Godot Mod Loader mods, a start hook
 * that runs the loader's setup when Vortex starts the game, a Mods page action
 * to reinstall the loader, and handlers that clear the loader's caches after
 * deployments.
 *
 * Vortex also calls this with a stub context while it installs or updates the
 * extension, so `context.api` may only be used inside callbacks and `once`.
 *
 * @param context - Vortex extension context supplied by the host.
 * @returns True if the extension initialized successfully.
 */
function main(context: types.IExtensionContext): boolean {
    context.registerGame({
        id: GAME.id,
        name: GAME.name,
        mergeMods: true,
        queryPath: util.toBlue(findGame),
        supportedTools: [],
        queryModPath: () => GML.modsDir,
        logo: GAME.logo,
        executable: () => GAME.exe,
        requiredFiles: GAME.requiredFiles,
        setup: util.toBlue((discovery: types.IDiscoveryResult) => prepareForModding(discovery, context.api)),
        environment: { SteamAPPId: GAME.steamAppId },
        details: { steamAppId: GAME.steamAppId },
    });

    context.registerInstaller(INSTALLERS.loaderArchive.id, INSTALLERS.loaderArchive.priority, testSupportedLoaderArchive, installLoaderArchive);
    context.registerInstaller(INSTALLERS.modZips.id, INSTALLERS.modZips.priority, testSupportedModZips, installModZips);
    context.registerInstaller(INSTALLERS.unpackedMods.id, INSTALLERS.unpackedMods.priority, testSupportedUnpackedMods, installUnpackedMods);

    context.registerStartHook(START_HOOK.priority, START_HOOK.id,
        util.toBlue((call: types.IRunParameters) => prepareGameLaunch(context.api, call)));

    context.registerAction(REINSTALL_ACTION.group, REINSTALL_ACTION.position, REINSTALL_ACTION.icon, {}, REINSTALL_ACTION.title,
        () => reinstallGml(context.api),
        () => selectors.activeGameId(context.api.getState()) === GAME.id);

    context.once(() => {
        context.api.onAsync('did-deploy', (profileId: string) => onDeploymentChanged(context.api, profileId));
        context.api.onAsync('did-purge', (profileId: string) => onDeploymentChanged(context.api, profileId));
    });

    return true;
}

export default main;
