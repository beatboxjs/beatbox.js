import { defineConfig } from 'vite';
import dtsPlugin from 'vite-plugin-dts';
import autoExternalPlugin from 'rollup-plugin-auto-external';

export default defineConfig({
	plugins: [
		dtsPlugin(),
		autoExternalPlugin()
	],
	build: {
		sourcemap: true,
		minify: false,
		emptyOutDir: false,
		lib: {
			entry: `./src/beatbox.ts`,
			fileName: () => `beatbox.js`,
			formats: ['es']
		}
	},
	resolve: {
		alias: {
			'beatbox.js': '/src/beatbox.ts'
		}
	}
});
