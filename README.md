# beatbox.js

__beatbox.js__ is a step sequencer library for JavaScript. It makes it easy to
create JavaScript-based drum machines that play a pattern of sounds.

beatbox.js relies on the Web Audio API to play the sounds. The
timers provided by the API play the patterns with highly accurate timing that
also works when playing in a background tab.


## Usage

```javascript
import Beatbox from "beatbox";

// Register some instruments that can be used in the pattern. The second parameter
// is the options to be passed to the Howl constructor. Refer to the Howler doc
// for the parameters.
const [snare, tom] = await Promise.all([
	fetch("snare.mp3").then((res) => res.arrayBuffer()),
	fetch("tom.mp3").then((res) => res.arrayBuffer())
]);
Beatbox.registerInstrument("snare", snare);
Beatbox.registerInstrument("tom", snare);

// Each array entry represents one beat. Its contents define which sounds are played
// on that beat. You can also create an empty array using new Array(length) and only
// set the entries where you want a sound to play.
const pattern = [
	[ "snare", "tom" ],
	[ "snare" ],
	[ "snare" ],
	[ "snare", "tom" ],
	[ "snare" ],
	[ "snare" ],
	[ "snare", "tom" ],
	[ "snare" ],
	[ "snare" ],
	[ { instrument: "snare", volume: 0.8 } ], // Extended syntax
	[ "snare", "tom" ],
	[ "snare" ],
	[ "snare", "tom" ],
	[ "snare" ],
	[ "snare" ],
	[ "snare" ]
];

// The duration of a beat in milliseconds. This example is the duration of a stroke in
// 4/4 time measurement at 100 bpm.
const beatLength = 60000/100/4;

// Repeat the pattern in an endless loop?
const repeat = false;

const player = new Beatbox(pattern, beatLength, repeat);

// Start playing the pattern (note that some browser only allow this as part of a user interaction)
player.play();

// Pause playing
player.stop();

// Get the current beat
player.getPosition();

// Set the position to the start of the pattern (works both while playing and when
// stopped)
player.setPosition(0);

// Find out if the player is currently playing
player.playing;

// Change the pattern (also works while playing)
player.setPattern(newPattern);

// Change the speed (also works while playing)
player.setBeatLength(newLength);

// Change repeating
player.setRepeat(false);

// This amount of beats is skipped from the beginning of the pattern when repeating
player.setUpbeat(2);

// Call a function when the player starts playing
player.on("play", () => {
});

// Call a function when a beat is played (not always guaranteed to be run for each beat)
player.on("beat", (beat) => {
});

// Call a function when the playing ends
player.on("stop", () => {
});
```

## Migrating from v1 to v2

beatbox.js 2.x does not rely on Howler.js anymore, but uses the WebAudio API directly. This means that the second argument to `Beatbox.registerInstrument()` does not accept a Howler configuration object anymore, but accepts an `ArrayBuffer` object with the contents of an audio file.

The `onplay`, `onbeat` and `onstop` properties are not supported anymore. Instead, register an event handler using `player.on()`.