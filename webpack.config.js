const nodeExternals = require('webpack-node-externals');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = (env, argv) => {

	const isDev = argv.mode == "development";

	const base = {
		entry: `${__dirname}/src/beatbox.ts`,
		resolve: {
			extensions: [ ".js", ".ts" ]
		},
		mode: isDev ? "development" : "production",
		devtool: isDev ? "cheap-eval-source-map" : "source-map",
		module: {
			rules: [
				{
					resource: { and: [ /\.ts/, [
						__dirname + "/src/"
					] ] },
					use: [
						{
							loader: "babel-loader",
							options: {
								presets: [
									[
										"@babel/preset-env",
										{
											useBuiltIns: "usage",
											corejs: 3
										}
									]
								]
							}
						},
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
				libraryExport: "default"
			},
			module: {
				rules: [
					...base.module.rules,
					{ test: require.resolve("howler"), loader: "expose-loader?howler" }
				]
			},
			devServer: {
				publicPath: "/demo/"
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
