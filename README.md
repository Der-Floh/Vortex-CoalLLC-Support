[![Coal LLC Support Code Documentation](https://img.shields.io/badge/Coal_LLC_Support-Code_Documentation-green.svg)](https://der-floh.github.io/Vortex-CoalLLC-Support/)

# Coal LLC Support for [Vortex](https://www.nexusmods.com/about/vortex/)

## Description

This extension adds support for Coal LLC to [Vortex Mod Manager](https://www.nexusmods.com/about/vortex/), enabling you to easily automate installation of mods for Coal LLC without having to worry about where the files are supposed to go, etc.

Coal LLC mods need [Godot Mod Loader](https://github.com/NanobotZ/godot-mod-loader) (GML) by NanobotZ. You can find mods for example in the [Coal LLC Mods](https://github.com/Der-Floh/coal-llc-mods) collection.

### Features

- Finds Coal LLC in your Steam library.
- Installs Godot Mod Loader for you: it downloads the latest release, checks it against the SHA-256 GitHub publishes, and copies its `addons` folder into both game folders that need it (see [Godot Mod Loader](#godot-mod-loader)).
- Installs mods the way Godot Mod Loader loads them: as zips in `Coal LLC/mods/`.
  - Mod zips (like the ones from the [Coal LLC Mods releases](https://github.com/Der-Floh/coal-llc-mods/releases/latest)) are zipped again as `<namespace>-<name>.zip`, because Vortex extracts every archive it installs. This also works when the mod is inside a wrapper folder, or when one archive holds several mods.
  - Archives that contain mod zips (a zip inside a zip, or a folder of mod zips) install those zips unchanged.
- Starts the game with Godot Mod Loader's setup when you start it from Vortex, so mods keep working after game updates.
- Deletes `mod-hooks.zip` and the loader's cache of decompiled game scripts after every deployment, after purging, and after game updates, so Godot Mod Loader rebuilds them for your current mods and game version.

## Requirements

- Vortex (tested with 2.7.1)
- Coal LLC on Steam (Windows; running Vortex on Linux with Proton is untested)
- An internet connection to download Godot Mod Loader

## How to install

This extension requires Vortex. To install, simply search the game name in Vortex and click "manage". Alternatively, within Vortex, go to the Extensions tab, click "Find More" at the bottom of the tab, search for "Coal LLC" and then click Install.

You can also manually install it by downloading the archive file from the [Latest Release](https://github.com/Der-Floh/Vortex-CoalLLC-Support/releases/latest) and dragging it into the "drop zone" labelled "Drop File(s)" in the Extensions tab at the bottom right.

Afterwards, restart Vortex and you can begin installing supported Coal LLC mods with Vortex.

## Getting started

1. Manage Coal LLC in Vortex. If Vortex asks you for the game folder, pick `steamapps/common/Coal LLC`, not the `Coal LLC` folder inside it.
2. Click "Install" on the "Godot Mod Loader not installed" notification.
3. Install mods by dragging their zips into Vortex or with the "Mod Manager Download" button on Nexus Mods, and enable them.
4. Start the game from Vortex. The first start sets up Godot Mod Loader: confirm its popup, and the game restarts with "(Modded)" in its title.

## Godot Mod Loader

Godot Mod Loader isn't installed as a Vortex mod, so purging your mods never removes the loader the game depends on. It lives in two `addons` folders, because the game looks for it relative to the folder it was started from: Steam starts the game from `steamapps/common/Coal LLC`, Vortex from `steamapps/common/Coal LLC/Coal LLC`.

To update or repair the loader, use "Reinstall Godot Mod Loader" in the toolbar of the Mods page.

To install it by hand instead, download `godot-mod-loader-Windows.zip` from the [latest release](https://github.com/NanobotZ/godot-mod-loader/releases/latest), copy its `addons` folder into both `steamapps/common/Coal LLC/` and `steamapps/common/Coal LLC/Coal LLC/`, and click "Check again" on the notification. See also the [installation guide](https://github.com/Der-Floh/coal-llc-mods#installation) of the Coal LLC Mods.

## Starting the game

- **From Vortex:** the extension adds `--script addons/mod_loader/mod_loader_setup.gd` to the start, which sets up Godot Mod Loader whenever it's needed (for example after a game update) and does nothing otherwise.
- **From Steam:** open Coal LLC's properties in Steam and add this to the launch options: `--script "addons/mod_loader/mod_loader_setup.gd"`. After a game update, open Vortex before starting the game from Steam, or delete `Coal LLC/mod-hooks.zip` yourself.

## Troubleshooting

- **"New mods will be applied after a restart." and the buttons don't respond:** close the game with Alt+F4 and start it again. This popup appears on the first start after your mods changed.
- **Mods don't load:** check that the window title says "(Modded)", and look at `%APPDATA%\Godot\app_userdata\Coal LLC\logs\modloader.log`.
- **The game doesn't start from Steam with the launch option:** Godot Mod Loader is missing in `steamapps/common/Coal LLC/addons`. Use "Reinstall Godot Mod Loader".
- **Godot Mod Loader can't set itself up:** some antivirus programs quarantine `addons/mod_loader/vendor/GDRE/gdre_tools.exe`, which the setup needs. Allow it and reinstall Godot Mod Loader.
- **The Godot Mod Loader download fails:** GitHub only allows a limited number of requests per hour without an account. Try again later or install it by hand.
- **"Failed to clear Godot Mod Loader caches":** close the game and deploy again, or delete the files the notification names.

## Removing Godot Mod Loader

1. Purge your mods in Vortex.
2. In Steam, verify the integrity of the game files. This replaces the `Coal LLC.pck` Godot Mod Loader patched; afterwards you can delete `Coal LLC-vanilla.pck`.
3. Delete both `addons` folders, the `Coal LLC/mods` folder and `Coal LLC/mod-hooks.zip`.
4. Remove the Steam launch option if you added it.

## For mod authors

Godot Mod Loader loads mods from zips in the game's `mods/` folder. A mod zip holds exactly one mod, in this layout, with `/` as the path separator:

```txt
|--> mods-unpacked
  |--> <namespace>-<name>
    |--> manifest.json
    |--> mod_main.gd
    |--> ...
```

The folder name must match `namespace` and `name` in `manifest.json` (letters, digits and `_`, at least 3 characters each). If the mod has imported assets, put the `.godot` folder next to `mods-unpacked`. Some zip tools, such as `Compress-Archive` in Windows PowerShell 5.1, write `\` as the separator instead, which Godot Mod Loader can't read.

Upload the mod zip as it is. Vortex installs it as `<namespace>-<name>.zip`, so two versions of a mod show up as a file conflict instead of both being loaded.

## How to build

To build the extension from source:

1. **Install prerequisites**
   - Make sure you have **Node.js** and **npm** installed.

2. **Clone the repository**

   ```bash
   git clone https://github.com/Der-Floh/Vortex-CoalLLC-Support.git
   cd Vortex-CoalLLC-Support
   ```

3. **Install dependencies**

   ```bash
   npm run install-deps
   ```

4. **Build the extension**

   ```bash
   npm run build
   ```

   This bundles the TypeScript sources from `src/` into `.pack/index.js`, adds `gameart.jpg`, and generates `info.json` from `package.json`. `.pack/` is exactly what Vortex loads.

5. **Package the extension (optional)**

   ```bash
   npm run package
   ```

   This type checks and builds the extension, then zips `.pack/` into `dist/coalllc-support-<version>.zip`, the archive used for releases.

`npm run typecheck` checks the types only, and `npm run docs` builds the [code documentation](https://der-floh.github.io/Vortex-CoalLLC-Support/) into `docs/`. In VS Code, Ctrl+Shift+B runs `npm run build`.

[!["Buy me a Floppy Disk"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/der_floh)
