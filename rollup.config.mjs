import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/index.ts',
    output: {
        file: 'out/index.js',
        format: 'cjs',
        sourcemap: 'inline',
        exports: 'named',
    },
    external: [
        'bluebird',
        'fs',
        'https',
        'os',
        'path',
        'util',
        'vortex-api',
    ],
    plugins: [
        typescript({
            module: 'esnext',
            sourceMap: true,
            inlineSourceMap: false,
            inlineSources: true,
        }),
    ],
};
