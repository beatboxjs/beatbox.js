import { Howler, Howl } from "howler";
import EventEmitter from "events";

export interface SoundReference {
	howl: Howl;
	sprite?: string;
}

export interface InstrumentWithParams {
	key: string;
	instrumentObj: SoundReference;
	volume: number;
}

export interface InstrumentReferenceObject {
	instrument: string;
	volume?: number;
}

export type InstrumentReference = string | InstrumentReferenceObject;

export interface HowlReference {
	time: number;
	instr: Howl;
	id: number;
}

export type Pattern = Array<Array<InstrumentReference> | undefined>;

function isPlaying(beatbox: Beatbox | PlayingBeatbox): beatbox is PlayingBeatbox {
	return beatbox.playing;
}

interface PlayingBeatbox {
	playing: true;
	_startTime: number;
	_referenceTime: number;
}

export class Beatbox extends EventEmitter {

	static _cacheInterval: number = 1000;
	static _cacheLength: number = 2500;
	static _instruments: { [instr: string]: SoundReference } = { };
	static _minOnBeatInterval = 100;
	static _whenOverride: number | null = null;

	playing: boolean = false;
	onplay?: () => void;
	onstop?: () => void;
	onbeat?: (position: number) => void;

	_pattern: Pattern;
	_strokeLength: number;
	_repeat: boolean;
	_upbeat: number;

	_fillCacheTimeout: number | null = null;
	_onBeatTimeout: number | null = null;

	/** Collection of Howl objects that the player has created */
	_players: HowlReference[] = [ ];

	/** If playing, the position innside the pattern until which the cache was filled. If not playing, the position where we should start playing next time. */
	_position: number = 0;

	/** The Howler.ctx.currentTime when the playing was started */
	_startTime: number | null = null;

	/** The Howler.ctx.currentTime of the start of the last bar that was created by the cache (excluding upbeat) */
	_referenceTime: number | null = null;

	/** Last Howl object of each instrument while filling the cache */
	_lastInstrumentStrokes: { [instr: string]: HowlReference } = { };

	constructor(pattern: Pattern, strokeLength: number, repeat: boolean, upbeat?: number) {
		super();

		if(!Howler.usingWebAudio)
			throw new Error("Cannot use beatbox.js without webaudio.");

		this._pattern = pattern;
		this._strokeLength = strokeLength;
		this._repeat = repeat;
		this._upbeat = upbeat || 0;

		this.on("play", () => {
			this.onplay && this.onplay();
		});
		this.on("beat", (pos) => {
			this.onbeat && this.onbeat(pos);
		});
		this.on("stop", () => {
			this.onstop && this.onstop();
		});
	}


	/**
	 * Add a new instrument that can be referred to by an instrument key in the pattern.
	 * @param key {String} The key that can be used to refer to this instrument in the pattern
	 * @param soundOptions {Object} Parameters to pass to the Howl constructor
	 * @param sprite {String?} Optional sprite parameter to use for Howl.play()
	 */
	static registerInstrument(key: string, soundOptions: IHowlProperties, sprite?: string): void {
		Beatbox._instruments[key] = { howl: new Howl(soundOptions), sprite: sprite };
	}


	static _playWhen(instrumentWithParams: InstrumentWithParams, when: number): number {
		Beatbox._whenOverride = when;

		const setTimeout = window.setTimeout;

		// Fix time for end timer
		window.setTimeout = function(func, millis) {
			return setTimeout(func, (millis || 0) + (when - Howler.ctx.currentTime)*1000);
		};

		try {
			return Beatbox._play(instrumentWithParams);
		} finally {
			Beatbox._whenOverride = null;
			window.setTimeout = setTimeout;
		}
	}


	static _stopWhen(howl: Howl, when: number, soundId: number) {
		for(let id of howl._getSoundIds(soundId)) {
			let sound = howl._soundById(id);

			if(sound && sound._node && sound._node.bufferSource) {
				if(typeof sound._node.bufferSource.stop === 'undefined')
					(sound._node.bufferSource as any).noteOff(when);
				else
					sound._node.bufferSource.stop(when);
			}
		}
	}


	static _play(instrumentWithParams: InstrumentWithParams): number {
		instrumentWithParams.instrumentObj.howl._volume = instrumentWithParams.volume;
		return instrumentWithParams.instrumentObj.howl.play(instrumentWithParams.instrumentObj.sprite);
	}


	static _getInstrumentWithParams(instr?: InstrumentReference): InstrumentWithParams | null {
		if(instr == null)
			return null;

		let key = typeof instr == "string" ? instr : instr.instrument;

		let ret = {
			key,
			instrumentObj : Beatbox._instruments[key],
			volume : typeof instr != "string" && instr.volume != null ? instr.volume : 1
		};

		return ret.instrumentObj ? ret : null;
	}


	play(): void {
		if(this.playing)
			return;

		this._ensureContext().then(() => {
			this.playing = true;

			this._playUsingWebAudio();

			this.emit("play");
		});
	}


	stop(reset: boolean = false): void {
		if(!this.playing)
			return;

		if(this._fillCacheTimeout) {
			clearTimeout(this._fillCacheTimeout);
			this._fillCacheTimeout = null;
		}

		if(this._onBeatTimeout) {
			clearTimeout(this._onBeatTimeout);
			this._onBeatTimeout = null;
		}

		this._position = reset ? 0 : this.getPosition();
		this._clearWebAudioCache();

		this.playing = false;

		this.emit("stop");
	}


	getPosition(): number {
		if(isPlaying(this)) {
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


	setPosition(position: number): void {
		let playing = this.playing;
		if(playing)
			this.stop();
		this._position = (position != null ? position : 0);
		if (playing)
			this.play();
	}


	setPattern(pattern: Pattern): void {
		this._pattern = pattern;

		this._applyChanges();
	}


	setBeatLength(strokeLength: number): void {
		if(this.playing) {
			// Clear everything after the currently playing stroke. If the beat length has been increased, the clear call
			// in _fillWebAudioCache() would miss the old next stroke, which comes before the new next stroke.
			this._clearWebAudioCache(Howler.ctx.currentTime+0.000001);

			let now = (Howler.ctx.currentTime - (<PlayingBeatbox> this)._referenceTime)*1000 / this._strokeLength;
			while(now < 0)
				now += this._pattern.length - this._upbeat;
			this._referenceTime = Howler.ctx.currentTime - now * strokeLength / 1000;
		}

		this._strokeLength = strokeLength;

		this._applyChanges();
	}


	setRepeat(repeat: boolean): void {
		this._repeat = repeat;

		this._applyChanges();
	}


	setUpbeat(upbeat: number): void {
		if (this.playing) {
			(<PlayingBeatbox> this)._referenceTime += (upbeat - this._upbeat) * this._strokeLength / 1000;
		}
		this._upbeat = upbeat || 0;

		this._applyChanges();
	}


	_applyChanges(): void {
		if(isPlaying(this)) {
			this._position = this.getPosition()+1;

			while(this._referenceTime > Howler.ctx.currentTime) // Caching might be in a future repetition already
				this._referenceTime -= (this._pattern.length - this._upbeat) * this._strokeLength / 1000;

			if(this._referenceTime < this._startTime)
				this._referenceTime = this._startTime;

			this._clearWebAudioCache(Howler.ctx.currentTime+0.000001);
			this._fillWebAudioCache();
		}
	}


	async _ensureContext(): Promise<void> {
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
			await new Promise((resolve) => {
				Howler._howls[0].once("resume", resolve);
			});
		}

		// Hack Howler to support the "when" parameter of AudioBufferSourceNode.start()
		if(!Howler.ctx.createBufferSourceBkp) {
			Howler.ctx.createBufferSourceBkp = Howler.ctx.createBufferSource;
			Howler.ctx.createBufferSource = function() {
				let ret = Howler.ctx.createBufferSourceBkp();

				let startBkp = ret.start;
				ret.start = function() {
					if(Beatbox._whenOverride != null)
						arguments[0] = Beatbox._whenOverride;
					return (startBkp || (ret as any).noteGrainOn).apply(this, arguments as any);
				};

				return ret;
			};
		}
	}


	_playUsingWebAudio(): void {
		const t = this as PlayingBeatbox;

		this._startTime = this._referenceTime = Howler.ctx.currentTime - (this._position - this._upbeat) * this._strokeLength / 1000;

		let func = () => {
			if(this._fillWebAudioCache() === false) {
				this._fillCacheTimeout = window.setTimeout(() => {
					this.stop(true);
				}, t._referenceTime*1000 + this._strokeLength * (this._pattern.length - this._upbeat) - Howler.ctx.currentTime*1000);
			} else {
				this._fillCacheTimeout = window.setTimeout(func, Beatbox._cacheInterval);
			}
		};
		func();

		let onBeatFunc = () => {
			this.emit("beat", this.getPosition());
			let sinceBeat = (Howler.ctx.currentTime - t._referenceTime)*1000 % this._strokeLength;
			if(sinceBeat < 0)
				sinceBeat += this._strokeLength;

			this._onBeatTimeout = window.setTimeout(onBeatFunc, Math.max(Beatbox._minOnBeatInterval, this._strokeLength - sinceBeat));
		};
		onBeatFunc();
	}


	_fillWebAudioCache(): false | void {
		const t = this as PlayingBeatbox;

		let cacheUntil = Howler.ctx.currentTime + Beatbox._cacheLength/1000;
		while(t._referenceTime + (this._position-this._upbeat)*this._strokeLength/1000 <= cacheUntil) {
			if(this._position >= this._pattern.length) {
				if(this._repeat) {
					this._position = this._upbeat;
					this._referenceTime = t._referenceTime + this._strokeLength * (this._pattern.length - this._upbeat) / 1000;
				}
				else
					return false;
			}

			const part = this._pattern[this._position];
			if(part) {
				for(let strokeIdx=0; strokeIdx<part.length; strokeIdx++) {
					let instr = Beatbox._getInstrumentWithParams(part[strokeIdx]);
					if(instr) {
						let time = t._referenceTime + (this._position-this._upbeat)*this._strokeLength/1000;

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


	_clearWebAudioCache(from?: number): void {
		for(let i=0; i<this._players.length; i++) {
			if(from == null || this._players[i].time >= from) {
				this._players[i].instr.stop(this._players[i].id);
				this._players.splice(i, 1);
				i--;
			}
		}
	}
}

export default Beatbox;
