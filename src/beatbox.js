import { Howler } from 'howler';

class Beatbox {
	constructor(pattern, strokeLength, repeat) {
		this.playing = false;

		this._pattern = pattern;
		this._strokeLength = strokeLength;
		this._repeat = repeat;

		this._timeout = null;
		this._timeout2 = null;
		this._players = [ ];
		this._position = 0;
		this._referenceTime = null;
	}

	static registerInstrument(key, soundObj, sprite) {
		Beatbox._instruments[key] = { soundObj: soundObj, sprite: sprite };
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

	static _play(instrumentWithParams) {
		instrumentWithParams.instrumentObj.soundObj._volume = instrumentWithParams.volume;
		return instrumentWithParams.instrumentObj.soundObj.play(instrumentWithParams.instrumentObj.sprite);
	}

	static _getInstrumentWithParams(instr) {
		if(instr == null)
			return null;

		let ret = {
			instrumentObj : Beatbox._instruments[typeof instr == "string" ? instr : instr.instrument],
			volume : instr.volume != null ? instr.volume : 1
		};

		return ret.instrumentObj ? ret : null;
	}

	play() {
		if(this.playing)
			return;

		this.playing = true;

		if(Beatbox._webAudio) {
			this._playUsingWebAudio();
		} else {
			this._playUsingTimeout();
		}

		this.onplay && this.onplay();
	}

	stop() {
		if(!this.playing)
			return;

		clearTimeout(this._timeout);
		this._timeout = null;

		if(this._timeout2) {
			clearTimeout(this._timeout2);
			this._timeout2 = null;
		}

		if(Beatbox._webAudio) {
			this._position = this.getPosition();
			this._clearWebAudioCache();
		}

		this.playing = false;

		this.onstop && this.onstop();
	}

	getPosition() {
		if(Beatbox._webAudio && this.playing) {
			let ret = (Howler.ctx.currentTime - this._referenceTime)*1000 / this._strokeLength;
			while(ret < 0) { // In case the cache is already filling for the next repetition
				ret += this._pattern.length;
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
		if(Beatbox._webAudio) {
			// Clear everything after the currently playing stroke. If the beat length has been increased, the clear call
			// in _fillWebAudioCache() would miss the old next stroke, which comes before the new next stroke.
			this._clearWebAudioCache(Howler.ctx.currentTime+0.000001);

			let now = (Howler.ctx.currentTime - this._referenceTime)*1000 / this._strokeLength;
			while(now < 0)
				now += this._pattern.length;
			this._referenceTime = Howler.ctx.currentTime - now * strokeLength / 1000;
		}

		this._strokeLength = strokeLength;

		this._applyChanges();
	}

	setRepeat(repeat) {
		this._repeat = repeat;

		this._applyChanges();
	}

	_applyChanges() {
		if(Beatbox._webAudio && this.playing) {
			this._position = this.getPosition()+1;
			while(this._referenceTime > Howler.ctx.currentTime) // Caching might be in a future repetition already
				this._referenceTime -= this._pattern.length * this._strokeLength / 1000;

			this._clearWebAudioCache(Howler.ctx.currentTime+0.000001);
			this._fillWebAudioCache();
		}
	}

	_playUsingTimeout() {
		this.onbeat && setTimeout(() => { this.onbeat(this._position); }, 0);
		if(this._pattern[this._position]) {
			for(let i=0; i<this._pattern[this._position].length; i++) {
				let instr = Beatbox._getInstrumentWithParams(this._pattern[this._position][i]);
				if(instr)
					Beatbox._play(instr);
			}
		}

		this._timeout = setTimeout(() => {
			if(++this._position >= this._pattern.length) {
				this._position = 0;
				if(!this._repeat) {
					this.playing = false;
					this.onstop && setTimeout(this.onstop, 0);
					return;
				}
			}

			this._playUsingTimeout();
		}, this._strokeLength);
	}

	_playUsingWebAudio() {
		new Promise((resolve) => {
			// If the context is suspended, resume it first. Otherwise play() will be called asynchronously and our
			// whenOverride will not work.

			if(Howler.state !== "running") {
				Howler._autoResume();
				Howler._howls[0].once("resume", resolve);
			} else {
				resolve();
			}
		}).then(() => {
			this._referenceTime = Howler.ctx.currentTime - this._position * this._strokeLength / 1000;

			let func = () => {
				if(this._fillWebAudioCache() === false) {
					this._timeout = setTimeout(() => {
						this.stop();
						this._position = 0;
						this.onstop && this.onstop();
					}, this._referenceTime*1000 + this._strokeLength * this._pattern.length - Howler.ctx.currentTime*1000);
				} else {
					this._timeout = setTimeout(func, Beatbox._cacheInterval);
				}
			};
			func();

			if(this.onbeat) {
				let onBeatFunc = () => {
					this.onbeat(this.getPosition());
					let sinceBeat = (Howler.ctx.currentTime - this._referenceTime)*1000 % this._strokeLength;
					if(sinceBeat < 0)
						sinceBeat += this._strokeLength;

					this._timeout2 = setTimeout(onBeatFunc, this._strokeLength - sinceBeat);
				};
				onBeatFunc();
			}
		});
	}

	_fillWebAudioCache() {
		let cacheUntil = Howler.ctx.currentTime + Beatbox._cacheLength/1000;
		while(this._referenceTime + this._position*this._strokeLength/1000 <= cacheUntil) {
			if(this._position >= this._pattern.length) {
				if(this._repeat) {
					this._position = 0;
					this._referenceTime = this._referenceTime + this._strokeLength * this._pattern.length / 1000;
				}
				else
					return false;
			}

			if(this._pattern[this._position]) {
				for(let strokeIdx=0; strokeIdx<this._pattern[this._position].length; strokeIdx++) {
					let instr = Beatbox._getInstrumentWithParams(this._pattern[this._position][strokeIdx]);
					if(instr) {
						let time = this._referenceTime + this._position*this._strokeLength/1000;

						let soundId = Beatbox._playWhen(instr, time);
						this._players.push({
							time: time,
							instr: instr.instrumentObj.soundObj,
							id: soundId
						});
					}
				}
			}

			this._position++
		}
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
Beatbox._webAudio = Howler.usingWebAudio;
Beatbox._instruments = { };
Beatbox._setTimeout = setTimeout;

// Hack Howler to support the "when" parameter of AudioBufferSourceNode.start()
setTimeout(() => {
	if(Beatbox._webAudio) {
		let createBufferSourceBkp = Howler.ctx.createBufferSource;
		Howler.ctx.createBufferSource = function() {
			let ret = createBufferSourceBkp.apply(this, arguments);
			let startBkp = ret.start;
			ret.start = function() {
				if(Beatbox._whenOverride != null)
					arguments[0] = Beatbox._whenOverride;
				return startBkp.apply(this, arguments);
			};
			return ret;
		};
	}
}, 0);

module.exports = Beatbox;
