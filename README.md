__beatbox.js__ is a step sequencer library for JavaScript. It makes it easy to
create JavaScript-based drum machines that play a pattern of sounds.

beatbox.js relies on [howler.js](https://github.com/goldfire/howler.js) to play
the sounds. In browsers where the Web Audio API is not supported, it schedules
the sounds using JavaScript timeouts. Where the Web Audio API is supported, the
timers provided by the API are used instead, which plays the patterns with highly
accurate timing that also works when playing in a background tab.

Usage
=====

```javascript
// Register some instruments that can be used in the pattern. Refer to the Howler doc
// for the parameters.
Beatbox.registerInstrument("snare", new Howl(urls: [ "snare.mp3", "snare.ogg" ]));
Beatbox.registerInstrument("tom", new Howl(urls: [ "tom.mp3", "tom.ogg" ]));

// Each array entry represents one beat. Its contents define which sounds are played
// on that beat.
var pattern = [
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

// The duration of a beat in milliseconds. This is the duration of a stroke in 4/4
// time measurement at 100 bpm.
var beatLength = 60000/100/4;

// Repeat the pattern in an endless loop?
var repeat = false;

var player = new Beatbox(pattern, beatLength, repeat);

// Start playing the pattern
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

// Call a function when the player starts playing
player.onplay = function() {
};

// Call a function when a beat is played (not always guaranteed to be run for each beat)
player.onbeat = function(beat) {
};

// Call a function when the playing ends
player.onstop = function() {
};
```