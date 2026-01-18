# Changelog

## v5.0.1

* Fix calling `setPosition()` right after `stop()`.

## v5.0.0

* To avoid clicking, sounds are now faded out instead of cutting them off (#19).
	* **Breaking:** `player.stop()` is now asynchronous, as the player now stops with a small delay to have time to fade out all active sounds. It returns a promise that is resolved as soon as all sounds are faded out. A new `stopping` event is emitted synchronously, the `stop` event is now emitted with a delay.
	* **Breaking:** `player.playing` is now a number instead of a boolean. `0` means stopped, `1` means playing, `2` means stopping.
* Previously, playing an instrument always cut off the previous sound of the same instrument. This behaviour can now be controlled.
	* **Breaking:** By default, sounds will not be cut off anymore when the same instrument plays another sound. Instead, the sounds will overlap each other.
	* Specifying an instrument prefixed by a `-` (for example `"-snare"`) will cut off that instrument instead of playing it. In the extended syntax, this can be specified as `{ instrument: "snare", cut: true }`. An instrument can also be cut and played in the same beat to achieve the behaviour before v5 (`["-snare", "snare"]` or `[{ instrument: "snare", cut: true }, { instrument: "snare" }]`.
* Add TypeScript types for events
* Make emission of `beat` event more precise
* Add `source` event (#18)

## v4.0.0

* **Breaking:** beatbox.js 4.x changes the signature of `player.record()`, which is a method used by beatbox.js-export.

## v3.0.0

* **Breaking:** beatbox.js 3.x exports an ES module instead of a UMD bundle. This means that to use it, you need to use a browser or bundler with ESM support.

## v2.0.0

* beatbox.js 2.x does not rely on Howler.js anymore, but uses the WebAudio API directly.
	* **Breaking:** The second argument to `Beatbox.registerInstrument()` does not accept a Howler configuration object anymore, but accepts an `ArrayBuffer` object with the contents of an audio file.
* **Breaking:** The `onplay`, `onbeat` and `onstop` properties are not supported anymore. Instead, register an event handler using `player.on()`.