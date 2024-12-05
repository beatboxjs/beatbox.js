import { defineConfig } from 'vite';
import dtsPlugin from 'vite-plugin-dts';
import { isAbsolute } from "node:path";

export default defineConfig({
	plugins: [
		dtsPlugin()
	],
	build: {
		sourcemap: true,
		minify: false,
		emptyOutDir: false,
		lib: {
			entry: `./src/beatbox.ts`,
			fileName: () => `beatbox.js`,
			formats: ['es']
		},
		rollupOptions: {
			external: (id) => !id.startsWith("./") && !id.startsWith("../") && /* resolved internal modules */ !isAbsolute(id)
		}
	},
	resolve: {
		alias: {
			'beatbox.js': '/src/beatbox.ts'
		}
	}
});
