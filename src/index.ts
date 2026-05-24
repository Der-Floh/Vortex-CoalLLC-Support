import * as vortex from 'vortex-api';
import * as path from 'path';
import Bluebird from 'bluebird';
import { fs, log, util } from 'vortex-api';
import { installGML } from './installGML';

type IExtensionContext = vortex.types.IExtensionContext;
type IExtensionApi = vortex.types.IExtensionApi;
type IDiscoveryResult = vortex.types.IDiscoveryResult;
type TestSupported = vortex.types.TestSupported;
type InstallFunc = vortex.types.InstallFunc;
type IInstruction = vortex.types.IInstruction;

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
    name: 'Godot Mod Loader',
    modFile: '.zip',
    modDir: path.join('Coal LLC', 'mods'),
    hooksCache: path.join('Coal LLC', 'mod-hooks.zip'),
    requiredFiles: [
        path.join('addons', 'mod_loader', 'mod_loader.gd'),
        path.join('Coal LLC', 'addons', 'mod_loader', 'mod_loader.gd'),
    ],
    modPage: 'https://github.com/NanobotZ/godot-mod-loader',
    downloadPage: 'https://github.com/NanobotZ/godot-mod-loader/releases/latest',
};


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
function main(context: IExtensionContext): boolean {
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
        context.api.events?.on('did-deploy', (profileId: string) => {
            const state = context.api.getState() as any;
            const profile = state.persistent?.profiles?.[profileId];
            if (!profile || profile.gameId !== GAME.id) return;

            const discovery = state.settings?.gameMode?.discovered?.[GAME.id];
            if (!discovery?.path) return;

            const hooksCachePath = path.join(discovery.path as string, GML.hooksCache);
            fs.removeAsync(hooksCachePath).catch(() => {
                context.api.sendNotification?.({
                    type: 'warning',
                    title: 'Failed to clear GML hooks cache',
                    message: `Could not delete "${hooksCachePath}". This may cause issues with mods not loading correctly. Please ensure this file is deleted before launching the game.`,
                    actions: [
                        apiMakeOpenUrlFunction('Open folder', path.dirname(hooksCachePath)),
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
async function findGame(): Promise<string> {
    const game = await util.GameStoreHelper.findByAppId([GAME.steamAppId]);
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
async function prepareForModding(discovery: IDiscoveryResult, api: IExtensionApi): Promise<void> {
    if (!isGMLInstalled(discovery)) {
        api.sendNotification!({
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

    await ensureWritableDirOrWarn(api, path.join(discovery.path!, GML.modDir));
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
const testSupportedContent: TestSupported = (files, gameId) => {
    // Make sure we're able to support this mod.
    if (gameId !== GAME.id) {
        return Bluebird.resolve({ supported: false, requiredFiles: [] });
    }

    const filesIncludeModFile = files.some(file => path.extname(file).toLowerCase() === GML.modFile);

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
const installContent: InstallFunc = (files) => {
    const modZips = files.filter(file =>
        !file.endsWith(path.sep) &&
        path.extname(file).toLowerCase() === GML.modFile
    );

    const instructions: IInstruction[] = modZips.map(file => ({
        type: 'copy',
        source: file,
        destination: path.basename(file),
    }));

    return Bluebird.resolve({ instructions });
};
//#endregion

// -------------------------------------
//#region Utils
// -------------------------------------

/**
 * Checks if GML is installed for a given discovery.
 *
 * Looks for all GML required files under the game directory.
 *
 * @param discovery - The game discovery result from Vortex.
 * @returns True if all required Godot Mod Loader files exist; otherwise false.
 */
function isGMLInstalled(discovery: IDiscoveryResult) {
    for (const reqFile of GML.requiredFiles) {
        try {
            fs.statSync(path.join(discovery.path!, reqFile));
        } catch {
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
async function ensureWritableDirOrWarn(api: IExtensionApi, absPath: string) {
    try {
        await fs.ensureDirWritableAsync(absPath);
        return true;
    } catch (err: any) {
        log('error', `Directory "${absPath}" is not writable: ${err}`);
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
function apiMakeOpenUrlFunction(title: string, url: string) {
    return {
        title,
        action: () => util.opn(url).catch(() => undefined),
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
function apiMakeCheckAndDismissFunction(title: string, notificationId: string, api: IExtensionApi, checkFunction: () => boolean) {
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
function apiCheckAndDismissFunction(notificationId: string, api: IExtensionApi, checkFunction: () => boolean) {
    if (checkFunction()) {
        api.dismissNotification?.(notificationId);
    }
}

//#endregion

// export only for typedoc
export {
    // Register / setup
    main,
    findGame,
    prepareForModding,

    // Installers & helpers
    testSupportedContent,
    installContent,

    // Mod loader detection
    isGMLInstalled,

    // Utility functions
    ensureWritableDirOrWarn,
    apiMakeOpenUrlFunction,
    apiMakeCheckAndDismissFunction,
    apiCheckAndDismissFunction,
};

export default main;
