var gulp = require("gulp");
var uglify = require("gulp-uglify");
var concat = require("gulp-concat");

gulp.task("default", [ "resources", "minify" ]);

gulp.task("resources", function() {
	return gulp.src("src/**/*.js").pipe(concat("beatbox.js")).pipe(gulp.dest("dist"));
});

gulp.task("minify", [ "resources" ], function() {
	return gulp.src("dist/beatbox.js").pipe(uglify()).pipe(concat("beatbox.min.js")).pipe(gulp.dest("dist"));
});