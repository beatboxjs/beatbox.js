const Howl = require('howler').Howl;
const Howler = require('howler').Howler;

class Beatbox {
	constructor(pattern, strokeLength, repeat, upbeat) {
		if(!Howler.usingWebAudio)
			throw new Error("Cannot use beatbox.js without webaudio.");

		this.playing = false;

		this._pattern = pattern;
		this._strokeLength = strokeLength;
		this._repeat = repeat;
		this._upbeat = upbeat || 0;

		this._fillCacheTimeout = null;
		this._onBeatTimeout = null;
		this._players = [ ]; // Collection of Howl objects that the player has created
		this._position = 0; // If playing, the position innside the pattern until which the cache was filled. If not playing, the position where we should start playing next time.
		this._startTime = null; // The Howler.ctx.currentTime when the playing was started
		this._referenceTime = null; // The Howler.ctx.currentTime of the start of the last bar that was created by the cache (excluding upbeat)
		this._lastInstrumentStrokes = { }; // Last Howl object of each instrument while filling the cache
	}


	/**
	 * Add a new instrument that can be referred to by an instrument key in the pattern.
	 * @param key {String} The key that can be used to refer to this instrument in the pattern
	 * @param soundOptions {Object} Parameters to pass to the Howl constructor
	 * @param sprite {String?} Optional sprite parameter to use for Howl.play()
	 */
	static registerInstrument(key, soundOptions, sprite) {
		Beatbox._instruments[key] = { howl: new Howl(soundOptions), sprite: sprite };
	}


	static _playWhen(instrumentWithParams, when) {
		Beatbox._whenOverride = when;

		// Fix time for end timer
		window.setTimeout = function(func, millis) {
			return Beatbox._setTimeout.call(null, func, millis + (when - Howler.ctx.currentTime)*1000);
		};

		try {
			return Beatbox._play(instrumentWithParams);
		} finally {
			Beatbox._whenOverride = null;
			window.setTimeout = Beatbox._setTimeout;
		}
	}


	static _stopWhen(howl, when, soundId) {
		for(let id of howl._getSoundIds(soundId)) {
			let sound = howl._soundById(id);

			if(sound && sound._node && sound._node.bufferSource) {
				if(typeof sound._node.bufferSource.stop === 'undefined')
					sound._node.bufferSource.noteOff(when);
				else
					sound._node.bufferSource.stop(when);
			}
		}
	}


	static _play(instrumentWithParams) {
		instrumentWithParams.instrumentObj.howl._volume = instrumentWithParams.volume;
		return instrumentWithParams.instrumentObj.howl.play(instrumentWithParams.instrumentObj.sprite);
	}


	static _getInstrumentWithParams(instr) {
		if(instr == null)
			return null;

		let key = typeof instr == "string" ? instr : instr.instrument;

		let ret = {
			key,
			instrumentObj : Beatbox._instruments[key],
			volume : instr.volume != null ? instr.volume : 1
		};

		return ret.instrumentObj ? ret : null;
	}


	play() {
		if(this.playing)
			return;

		this._ensureContext().then(() => {
			this.playing = true;

			this._playUsingWebAudio();

			this.onplay && this.onplay();
		});
	}


	stop() {
		if(!this.playing)
			return;

		clearTimeout(this._fillCacheTimeout);
		this._fillCacheTimeout = null;

		if(this._onBeatTimeout) {
			clearTimeout(this._onBeatTimeout);
			this._onBeatTimeout = null;
		}

		this._position = this.getPosition();
		this._clearWebAudioCache();

		this.playing = false;

		this.onstop && this.onstop();
	}


	getPosition() {
		if(this.playing) {
			let ret = (Howler.ctx.currentTime - this._referenceTime)*1000 / this._strokeLength + this._upbeat;
			let min = (Howler.ctx.currentTime < this._startTime) ? 0 : this._upbeat;
			while(ret < min) { // In case the cache is already filling for the next repetition
				ret += this._pattern.length - this._upbeat;
			}
			return Math.floor(ret);
		} else {
			return this._position;
		}
	}


	setPosition(position) {
		let playing = this.playing;
		if(playing)
			this.stop();
		this._position = (position != null ? position : 0);
		if (playing)
			this.play();
	}


	setPattern(pattern) {
		this._pattern = pattern;

		this._applyChanges();
	}


	setBeatLength(strokeLength) {
		if(this.playing) {
			// Clear everything after the currently playing stroke. If the beat length has been increased, the clear call
			// in _fillWebAudioCache() would miss the old next stroke, which comes before the new next stroke.
			this._clearWebAudioCache(Howler.ctx.currentTime+0.000001);

			let now = (Howler.ctx.currentTime - this._referenceTime)*1000 / this._strokeLength;
			while(now < 0)
				now += this._pattern.length - this._upbeat;
			this._referenceTime = Howler.ctx.currentTime - now * strokeLength / 1000;
		}

		this._strokeLength = strokeLength;

		this._applyChanges();
	}


	setRepeat(repeat) {
		this._repeat = repeat;

		this._applyChanges();
	}


	setUpbeat(upbeat) {
		this._referenceTime += (upbeat - this._upbeat) * this._strokeLength / 1000;
		this._upbeat = upbeat || 0;

		this._applyChanges();
	}


	_applyChanges() {
		if(this.playing) {
			this._position = this.getPosition()+1;

			while(this._referenceTime > Howler.ctx.currentTime) // Caching might be in a future repetition already
				this._referenceTime -= (this._pattern.length - this._upbeat) * this._strokeLength / 1000;

			if(this._referenceTime < this._startTime)
				this._referenceTime = this._startTime;

			this._clearWebAudioCache(Howler.ctx.currentTime+0.000001);
			this._fillWebAudioCache();
		}
	}


	_ensureContext() {
		return new Promise((resolve) => {
			// If the context is suspended, resume it first. Otherwise play() will be called asynchronously and our
			// whenOverride will not work.

			if(!Howler.ctx) {
				new Howl({
					src: [ "#" ],
					preload: false
				});
			}

			if(Howler.state !== "running") {
				Howler._autoResume();
				Howler._howls[0].once("resume", resolve);
			} else {
				resolve();
			}
		}).then(() => {
			// Hack Howler to support the "when" parameter of AudioBufferSourceNode.start()
			if(!Howler.ctx.createBufferSourceBkp) {
				Howler.ctx.createBufferSourceBkp = Howler.ctx.createBufferSource;
				Howler.ctx.createBufferSource = function() {
					let ret = Howler.ctx.createBufferSourceBkp(...arguments);

					let startBkp = ret.start;
					ret.start = function() {
						if(Beatbox._whenOverride != null)
							arguments[0] = Beatbox._whenOverride;
						return (startBkp || ret.noteGrainOn).apply(this, arguments);
					};

					return ret;
				};
			}
		});
	}


	_playUsingWebAudio() {
		this._startTime = this._referenceTime = Howler.ctx.currentTime - (this._position - this._upbeat) * this._strokeLength / 1000;

		let func = () => {
			if(this._fillWebAudioCache() === false) {
				this._fillCacheTimeout = setTimeout(() => {
					this.stop();
					this._position = 0;
					this.onstop && this.onstop();
				}, this._referenceTime*1000 + this._strokeLength * (this._pattern.length - this._upbeat) - Howler.ctx.currentTime*1000);
			} else {
				this._fillCacheTimeout = setTimeout(func, Beatbox._cacheInterval);
			}
		};
		func();

		if(this.onbeat) {
			let onBeatFunc = () => {
				this.onbeat(this.getPosition());
				let sinceBeat = (Howler.ctx.currentTime - this._referenceTime)*1000 % this._strokeLength;
				if(sinceBeat < 0)
					sinceBeat += this._strokeLength;

				this._onBeatTimeout = setTimeout(onBeatFunc, Math.max(Beatbox._minOnBeatInterval, this._strokeLength - sinceBeat));
			};
			onBeatFunc();
		}
	}


	_fillWebAudioCache() {
		let cacheUntil = Howler.ctx.currentTime + Beatbox._cacheLength/1000;
		while(this._referenceTime + (this._position-this._upbeat)*this._strokeLength/1000 <= cacheUntil) {
			if(this._position >= this._pattern.length) {
				if(this._repeat) {
					this._position = this._upbeat;
					this._referenceTime = this._referenceTime + this._strokeLength * (this._pattern.length - this._upbeat) / 1000;
				}
				else
					return false;
			}

			if(this._pattern[this._position]) {
				for(let strokeIdx=0; strokeIdx<this._pattern[this._position].length; strokeIdx++) {
					let instr = Beatbox._getInstrumentWithParams(this._pattern[this._position][strokeIdx]);
					if(instr) {
						let time = this._referenceTime + (this._position-this._upbeat)*this._strokeLength/1000;

						if(this._lastInstrumentStrokes[instr.key])
							Beatbox._stopWhen(this._lastInstrumentStrokes[instr.key].instr, time, this._lastInstrumentStrokes[instr.key].id);

						this._players.push(this._lastInstrumentStrokes[instr.key] = {
							time: time,
							instr: instr.instrumentObj.howl,
							id: Beatbox._playWhen(instr, time)
						});
					}
				}
			}

			this._position++
		}

		// TODO: Clear old players
	}


	_clearWebAudioCache(from) {
		for(let i=0; i<this._players.length; i++) {
			if(from == null || this._players[i].time >= from) {
				this._players[i].instr.stop(this._players[i].id);
				this._players.splice(i, 1);
				i--;
			}
		}
	}
}

Beatbox._cacheInterval = 1000;
Beatbox._cacheLength = 2500;
Beatbox._instruments = { };
Beatbox._setTimeout = setTimeout;
Beatbox._minOnBeatInterval = 100;

module.exports = Beatbox;
