import * as path from 'path';

const EXE_DIR = 'Coal LLC';
const MOD_LOADER_DIR = path.join('addons', 'mod_loader');
const SCRIPT_ARGUMENT = '--script';
const SETUP_SCRIPT_RES_PATH = 'addons/mod_loader/mod_loader_setup.gd';

/**
 * Coal LLC as registered with Vortex. Paths are relative to the Steam folder,
 * which holds the game in a `Coal LLC` subfolder.
 */
export const GAME = {
    id: 'coalllc',
    name: 'Coal LLC',
    logo: 'gameart.jpg',
    steamAppId: '3361510',
    exeDir: EXE_DIR,
    exe: path.join(EXE_DIR, 'Coal LLC.exe'),
    pck: path.join(EXE_DIR, 'Coal LLC.pck'),
    requiredFiles: [
        path.join(EXE_DIR, 'Coal LLC.exe'),
    ],
};

/**
 * Godot Mod Loader (NanobotZ's fork), the mod loader all Coal LLC mods need.
 * Godot looks up its scripts relative to the working directory, which is the
 * Steam folder when Steam starts the game and the exe folder when Vortex does,
 * so it is installed into both.
 */
export const GML = {
    name: 'Godot Mod Loader',
    installDirs: ['.', EXE_DIR],
    detectionFiles: [
        path.join(MOD_LOADER_DIR, 'mod_loader.gd'),
        path.join(MOD_LOADER_DIR, 'mod_loader_setup.gd'),
        path.join(MOD_LOADER_DIR, 'vendor', 'GDRE', 'gdre_tools.exe'),
    ],
    setupScript: path.join(MOD_LOADER_DIR, 'mod_loader_setup.gd'),
    scriptArgument: SCRIPT_ARGUMENT,
    setupArgs: [SCRIPT_ARGUMENT, SETUP_SCRIPT_RES_PATH],
    steamLaunchOption: `${SCRIPT_ARGUMENT} "${SETUP_SCRIPT_RES_PATH}"`,
    modsDir: path.join(EXE_DIR, 'mods'),
    hookPack: path.join(EXE_DIR, 'mod-hooks.zip'),
    decompDir: path.join(EXE_DIR, MOD_LOADER_DIR, 'decomp'),
    releasesPage: 'https://github.com/NanobotZ/godot-mod-loader/releases/latest',
    installGuide: 'https://github.com/Der-Floh/coal-llc-mods#installation',
};

/**
 * The Godot Mod Loader release the extension installs. Coal LLC only ships for
 * Windows and Proton runs that build on Linux, so it is always the Windows asset.
 */
export const GML_RELEASE = {
    latestApiUrl: 'https://api.github.com/repos/NanobotZ/godot-mod-loader/releases/latest',
    assetName: 'godot-mod-loader-Windows.zip',
    digestPrefix: 'sha256:',
    tempFilePrefix: 'coalllc-gml-',
};

/**
 * Layout Godot Mod Loader expects in a mod zip: `mods-unpacked/<namespace>-<name>/`
 * holding `mod_main.gd` and `manifest.json`, optionally next to `.godot/`.
 */
export const MOD_LAYOUT = {
    unpackedDir: 'mods-unpacked',
    godotDir: '.godot',
    addonsDir: 'addons',
    mainFile: 'mod_main.gd',
    manifestFile: 'manifest.json',
    zipExtension: '.zip',
    loaderFile: path.join(MOD_LOADER_DIR, 'mod_loader.gd'),
};

/** Folders the unpacked-mods installer creates inside Vortex's extraction folder. */
export const REPACK = {
    workDir: '__coalllc_repack__',
    stagingDir: 'staging',
    zipsDir: 'zips',
};

/** 7-Zip switches for mod zips (zip format, UTF-8 entry names) and its success exit code. */
export const SEVEN_ZIP = {
    zipSwitches: ['-tzip', '-mcu=on'],
    successCode: 0,
};

/** Settings for the HTTPS requests to GitHub. */
export const HTTP = {
    userAgent: 'coalllc-support',
    acceptGithubJson: 'application/vnd.github+json',
    okStatus: 200,
    redirectStatuses: [301, 302, 303, 307, 308],
    rateLimitStatuses: [403, 429],
    rateLimitRemainingHeader: 'x-ratelimit-remaining',
    maxRedirects: 5,
    timeoutMs: 30000,
};

/** Installer ids and priorities; Vortex queries lower priorities first. */
export const INSTALLERS = {
    loaderArchive: { id: 'coalllc-gml-loader', priority: 10 },
    modZips: { id: 'coalllc-mod-zips', priority: 20 },
    unpackedMods: { id: 'coalllc-unpacked-mods', priority: 25 },
};

/** Start hook that adds the setup arguments; it runs after Vortex's pre-start deployment (priority 100). */
export const START_HOOK = {
    id: 'coalllc-gml-setup',
    priority: 200,
};

/** Mods page toolbar action that reinstalls Godot Mod Loader. */
export const REINSTALL_ACTION = {
    group: 'mod-icons',
    position: 300,
    icon: 'refresh',
    title: `Reinstall ${GML.name}`,
};

/** Ids of the notifications this extension sends or dismisses. */
export const NOTIFICATION_IDS = {
    directoryNotWritable: 'coalllc-writable-warning',
    gmlMissing: 'coalllc-gml-missing',
    gmlInstallProgress: 'coalllc-gml-install-progress',
    gmlInstalled: 'coalllc-gml-installed',
    cachesNotRemoved: 'coalllc-gml-caches-not-removed',
};
