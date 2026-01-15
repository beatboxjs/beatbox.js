# Changelog

## v5.0.0

* To avoid clicking, sounds are now faded out instead of cutting them off (#19).
	* **Breaking:** `player.stop()` is now asynchronous, as the player now stops with a small delay to have time to fade out all active sounds. It returns a promise that is resolved as soon as all sounds are faded out. The `stop` event is also emitted with a delay.

## v4.0.0

* **Breaking:** beatbox.js 4.x changes the signature of `player.record()`, which is a method used by beatbox.js-export.

## v3.0.0

* **Breaking:** beatbox.js 3.x exports an ES module instead of a UMD bundle. This means that to use it, you need to use a browser or bundler with ESM support.

## v2.0.0

* beatbox.js 2.x does not rely on Howler.js anymore, but uses the WebAudio API directly.
	* **Breaking:** The second argument to `Beatbox.registerInstrument()` does not accept a Howler configuration object anymore, but accepts an `ArrayBuffer` object with the contents of an audio file.
* **Breaking:** The `onplay`, `onbeat` and `onstop` properties are not supported anymore. Instead, register an event handler using `player.on()`.