const webpack = require("webpack");

module.exports = {
	entry: `expose-loader?Beatbox!${__dirname}/src/beatbox.js`,
	output: {
		filename: "beatbox.js",
		path: __dirname + "/demo/"
	},
	module: {
		rules: [
			{ test: require.resolve("howler"), loader: "expose-loader?howler" },
			{ test: /\.js$/, loader: "babel-loader?presets=env" },
		]
	},
	mode: "production",
	devtool: "source-map"
};
