import nodeExternals from "webpack-node-externals";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import { Configuration } from "webpack";
import "webpack-dev-server";

export default (env: any, argv: any): Configuration[] => {

	const isDev = argv.mode == "development";

	const base: Configuration = {
		entry: `${__dirname}/src/beatbox.ts`,
		resolve: {
			extensions: [ ".js", ".ts" ]
		},
		mode: isDev ? "development" : "production",
		devtool: isDev ? "eval-cheap-source-map" : "source-map",
		module: {
			rules: [
				{
					resource: { and: [/\.ts/, [__dirname + "/src/"]] },
					use: [
						'ts-loader'
					]
				}
			]
		}
	};

	return [
		{
			...base,
			name: "demo",
			output: {
				filename: "beatbox.js",
				path: __dirname + "/demo/",
				library: "Beatbox",
				libraryExport: "default",
				libraryTarget: "umd"
			},
			devServer: {
				static: {
					directory: `${__dirname}/demo`
				},
				allowedHosts: "all",
				port: 8081,
			}
		},
		{
			...base,
			name: "umd",
			output: {
				filename: "beatbox.js",
				path: __dirname + "/dist/",
				library: "Beatbox",
				libraryTarget: "umd"
			},
			externals: [ nodeExternals() ],
			plugins: [
				//new BundleAnalyzerPlugin()
			]
		}
	];
};
