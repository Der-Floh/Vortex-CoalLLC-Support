# Coal LLC Support for [Vortex](https://www.nexusmods.com/about/vortex/)

## Description

This extension adds support for Coal LLC to [Vortex Mod Manager](https://www.nexusmods.com/about/vortex/), enabling you to easily automate installation of mods for Coal LLC without having to worry about where the files are supposed to go, etc.

## How to install

This extension requires Vortex. To install, simply search the game name in Vortex and click "manage". Alternatively, within Vortex, go to the Extensions tab, click "Find More" at the bottom of the tab, search for "Coal LLC" and then click Install.

You can also manually install it by downloading the archive file from the [Latest Release](https://github.com/Der-Floh/Vortex-CoalLLC-Support/releases/latest) and dragging it into the "drop zone" labelled "Drop File(s)" in the Extensions tab at the bottom right.

Afterwards, restart Vortex and you can begin installing supported Coal LLC mods with Vortex.

## Mod Loader

This extension requires you to install [GML](https://github.com/NanobotZ/godot-mod-loader) for the game. A guide on how to do that can be found [here](https://github.com/Der-Floh/coal-llc-mods#installation).

## How to build

To build the extension from source:

1. **Install prerequisites**
   - Make sure you have **Node.js** and **npm** installed.

2. **Clone the repository**
   ```bash
   git clone https://github.com/Der-Floh/Vortex-CoalLLC-Support.git
   cd Vortex-PvZRe-Support
   ```

3. **Install dependencies**
   You can either use the helper script:

   ```bash
   npm run install-deps
   ```

   or run the equivalent command directly:

   ```bash
   npm install --ignore-scripts
   ```

4. **Build the extension**
   ```bash
   npm run build
   ```

   This compiles the TypeScript source (including `index.ts`) into JavaScript and outputs it to `out/index.js`, which is the file Vortex uses.

5. **Package the extension (optional)**
   If you want a distributable `.zip` archive (like the ones used for releases), run:

   ```bash
   npm run package
   ```

   This will:

   - Build the project (if not already built),
   - Collect `out/index.js`, `gameart.jpg`, and `info.json` into a temporary `.pack` directory,
   - Create a zip file at the project root

     (the name is based on the `name` and `version` in `package.json`).

You can then use that `.zip` file as the extension archive in Vortex, or for publishing new releases.
