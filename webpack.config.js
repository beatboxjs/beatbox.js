module.exports = {
	entry: `expose-loader?Beatbox!${__dirname}/src/beatbox.js`,
	output: {
		filename: "beatbox.js",
		path: __dirname + "/demo/"
	},
	module: {
		rules: [
			{ test: require.resolve("howler"), loader: "expose-loader?howler" },
			{
				resource: { and: [ /\.js/, [
					__dirname + "/src/"
				] ] },
				loader: "babel-loader?presets=env"
			}
		]
	},
	mode: "production",
	devtool: "source-map"
};

if(process.env.WEBPACK_SERVE) {
	module.exports.serve = {
		dev: {
			publicPath: "/demo/"
		}
	};
}
