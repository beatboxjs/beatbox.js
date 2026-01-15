import { EventEmitter } from "events";

export interface Instrument {
	key: string;
	audioBuffer: AudioBuffer;
	volume?: number;
	cut?: boolean;
}

export interface InstrumentReferenceObject {
	instrument: string;
	volume?: number;
	cut?: boolean;
}

export type InstrumentReference = string | InstrumentReferenceObject;

export interface ScheduledSound {
	instrument: Instrument;
	time: number;
	duration: number;
	source: AudioBufferSourceNode;
	stop(time?: number): Promise<void>;
}

export type Pattern = Array<Array<InstrumentReference> | undefined>;

/** A callback that receives a progress float between 0 and 1. */
export type BeatboxProgressCallback = (progress: number) => void;
export type BeatboxRecordOptions = {
	onProgress?: BeatboxProgressCallback;
	signal?: AbortSignal;
	channels?: number;
}

export type BeatboxSourceEvent = {
	time: number;
	source: AudioBufferSourceNode;
	instrument: Instrument;
	duration: number;
};

export interface BeatboxEvents {
	play: [];
	beat: [position: number];
	stopping: [];
	stop: [];
	source: [BeatboxSourceEvent];
}

function isPlaying(beatbox: Beatbox | PlayingBeatbox): beatbox is PlayingBeatbox {
	return beatbox.playing !== 0;
}

interface PlayingBeatbox {
	playing: 1 | 2;
	_audioContext: AudioContext;
	_startTime: number;
	_referenceTime: number;
}

const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
const OfflineAudioContext = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;

export class Beatbox extends EventEmitter<BeatboxEvents> {

	static _fadeOutDuration = 0.01;
	static _cacheInterval: number = 1000;
	static _cacheLength: number = 5000;
	static _instruments: { [instr: string]: Instrument } = { };
	static _minOnBeatInterval = 100;

	playing: 0 | 1 | 2 = 0;

	_pattern: Pattern;
	_strokeLength: number;
	_repeat: boolean;
	_upbeat: number;

	_audioContext: BaseAudioContext | null = null;
	_fillCacheTimeout: number | null = null;
	_onBeatTimeout: number | null = null;
	_onBeatLast: number | null = null;
	_scheduledSounds: ScheduledSound[] = [ ];

	/** If playing, the position innside the pattern until which the cache was filled. If not playing, the position where we should start playing next time. */
	_position: number = 0;

	/** The this._audioContext.currentTime when the playing was started */
	_startTime: number | null = null;

	/** The this._audioContext.currentTime of the start of the last bar that was created by the cache (excluding upbeat) */
	_referenceTime: number | null = null;

	constructor(pattern: Pattern, strokeLength: number, repeat: boolean, upbeat?: number) {
		super();

		this._pattern = pattern;
		this._strokeLength = strokeLength;
		this._repeat = repeat;
		this._upbeat = upbeat || 0;

		this.on("newListener", (eventName) => {
			if (eventName === "beat" && this.listenerCount("beat") === 0) {
				Promise.resolve().then(() => {
					this._scheduleOnBeat();
				});
			}
		});
	}


	/**
	 * Add a new instrument that can be referred to by an instrument key in the pattern.
	 * @param key {String} The key that can be used to refer to this instrument in the pattern
	 * @param data {ArrayBuffer} An ArrayBuffer that contains the sound file
	 */
	static async registerInstrument(key: string, data: ArrayBuffer): Promise<void> {
		const audioContext = new AudioContext();
		const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
			audioContext.decodeAudioData(data, resolve, reject);
		});
		audioContext.close();
		Beatbox._instruments[key] = { audioBuffer, key };
	}


	static unregisterInstrument(key: string): void {
		delete Beatbox._instruments[key];
	}


	_scheduleSound(instrument: Instrument, time: number): ScheduledSound {
		const source = this._audioContext!.createBufferSource();
		source.buffer = instrument.audioBuffer;

		const gainNode = this._audioContext!.createGain();
		if (instrument.volume && instrument.volume != 1) {
			gainNode.gain.value = instrument.volume;
		}
		gainNode.connect(this._audioContext!.destination);
		source.connect(gainNode);

		const clear = () => {
			source.disconnect();
			const idx = this._scheduledSounds.indexOf(sound);
			if (idx != -1) {
				this._scheduledSounds.splice(idx, 1);
			}
		};

		source.addEventListener("ended", () => {
			clear();
		});

		const event: BeatboxSourceEvent = { time, source, instrument, duration: instrument.audioBuffer.duration };
		this.emit("source", event);
		const newTime = event.time;
		source.start(newTime);

		const stop = async (stopTime: number = this._audioContext!.currentTime) => {
			if (stopTime < newTime) {
				// Stop sound before it starts. This happens when the player is stopped or the pattern is updated and already scheduled sounds are discarded.
				// Clear sound synchronously, rather than waiting for the "ended" event handler to clear it. This is important so that when _applyChanges()
				// refills the cache, the scheduled sounds are already removed and not considered for calculating the end time of the current pattern.
				clear();
			} else {
				gainNode.gain.cancelScheduledValues(stopTime);
				gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
				gainNode.gain.linearRampToValueAtTime(0, stopTime + Beatbox._fadeOutDuration);
				source.stop(stopTime + Beatbox._fadeOutDuration);
				await new Promise<void>((resolve) => {
					source.addEventListener("ended", () => {
						resolve();
					});
				});
			}
		};

		const sound: ScheduledSound = {
			instrument,
			time: newTime,
			duration: instrument.audioBuffer.duration,
			source,
			stop
		};
		this._scheduledSounds.push(sound);
		return sound;
	}


	static _resolveInstrument(instr?: InstrumentReference): Instrument | null {
		if (instr == null)
			return null;

		const key = typeof instr !== "string" ? instr.instrument : instr.startsWith("-") ? instr.slice(1) : instr;
		if (!Beatbox._instruments[key]) {
			return null;
		}

		return {
			...Beatbox._instruments[key],
			...(typeof instr != "string" && instr.volume != null ? { volume: instr.volume } : {}),
			cut: typeof instr === "string" ? instr.startsWith("-") : !!instr.cut
		};
	}


	play(): void {
		if (this.playing === 1) {
			return;
		}

		if (!this._audioContext) {
			this._audioContext = new AudioContext();
		}
		this.playing = 1;
		this._startTime = this._referenceTime = this._audioContext.currentTime - (this._position - this._upbeat) * this._strokeLength / 1000;

		this._fillCache();
		this._scheduleOnBeat();

		this.emit("play");
	}

	/**
	 * The total length of the current pattern (including upbeat) in milliseconds.
	 */
	getLength(): number {
		return this._pattern.reduce((v, instrs, i) => (!instrs || instrs.length == 0 ? v : Math.max(v, (
			i * this._strokeLength + Math.max(...instrs.map((instr) => 1000 * (Beatbox._resolveInstrument(instr)?.audioBuffer?.duration ?? 0)))
		))), this._pattern.length * this._strokeLength);
	}

	async record({ channels = 2, onProgress, signal }: BeatboxRecordOptions = {}): Promise<AudioBuffer> {
		if (this.playing !== 0) {
			throw new Error("Cannot record while playing.");
		}

		signal?.throwIfAborted();

		const audioContext = new AudioContext();
		const sampleRate = audioContext.sampleRate;
		audioContext.close();

		const offlineContext = new OfflineAudioContext(channels, Math.max(1, this.getLength() * sampleRate / 1000), sampleRate);
		this._audioContext = offlineContext;
		this._fillCacheInternal();
		this._audioContext = null;
		this._scheduledSounds = [];

		signal?.throwIfAborted();

		if (onProgress) {
			(async () => {
				// Report the progress every audio second
				const length = this.getLength();
				const step = 1000;
				for (let progress = step; progress < length && !signal?.aborted; progress += step) {
					await offlineContext.suspend(progress / 1000);
					onProgress(progress / length);
					offlineContext.resume();
				}
			})();
		}

		const audioBuffer = await Promise.race<AudioBuffer>([
			offlineContext.startRendering(),
			new Promise((resolve, reject) => {
				// Right now we cannot abort the rendering in reaction to the abort signal, see https://github.com/WebAudio/web-audio-api/issues/2445
				// But at least we can reject the promise.
				if (signal?.aborted) {
					reject(signal.reason);
				}
				signal?.addEventListener("abort", () => {
					reject(signal.reason);
				});
			})
		]);

		signal?.throwIfAborted();
		onProgress?.(1);

		return audioBuffer;
	}

	async stop(reset: boolean = false): Promise<void> {
		if (this.playing !== 1) {
			return;
		}

		if (this._fillCacheTimeout) {
			clearTimeout(this._fillCacheTimeout);
			this._fillCacheTimeout = null;
		}

		this._position = reset ? 0 : this.getPosition();
		this.playing = 2;
		this._scheduleOnBeat(); // Cancel next beat event
		this.emit("stopping");

		await this._clearCache();

		if (this.playing !== 2) {
			// Player was started again in the meantime
			return;
		}

		(this._audioContext as AudioContext).close();
		this._audioContext = null;

		this.playing = 0;

		this.emit("stop");
	}


	_getCurrentTime(): number | undefined {
		if (isPlaying(this)) {
			const timestamp = this._audioContext.getOutputTimestamp();
			return timestamp.contextTime! + (performance.now() - timestamp.performanceTime!) / 1000;
		}
	}


	getPosition(): number {
		if (isPlaying(this)) {
			const currentTime = this._getCurrentTime()!;
			let ret = (currentTime - this._referenceTime) * 1000 / this._strokeLength + this._upbeat;
			let min = (currentTime < this._startTime) ? 0 : this._upbeat;
			while (ret < min) { // In case the cache is already filling for the next repetition
				ret += this._pattern.length - this._upbeat;
			}
			return Math.floor(ret);
		} else {
			return this._position;
		}
	}


	setPosition(position: number): void {
		let playing = this.playing;
		if (playing) {
			this.stop();
		}
		this._position = (position != null ? position : 0);
		if (playing) {
			this.play();
		}
	}


	setPattern(pattern: Pattern): void {
		this._pattern = pattern;

		this._applyChanges();
	}


	setBeatLength(strokeLength: number): void {
		if (isPlaying(this)) {
			// Clear everything after the currently playing stroke. If the beat length has been increased, the clear call
			// in _fillWebAudioCache() would miss the old next stroke, which comes before the new next stroke.
			this._clearCache(this._audioContext.currentTime + 0.000001);

			let now = (this._audioContext.currentTime - (this as PlayingBeatbox)._referenceTime) * 1000 / this._strokeLength;
			while (now < 0) {
				now += this._pattern.length - this._upbeat;
			}
			this._referenceTime = this._audioContext.currentTime - now * strokeLength / 1000;
		}

		this._strokeLength = strokeLength;

		this._applyChanges();
	}


	setRepeat(repeat: boolean): void {
		this._repeat = repeat;

		this._applyChanges();
	}


	setUpbeat(upbeat: number): void {
		if (isPlaying(this)) {
			this._referenceTime += (upbeat - this._upbeat) * this._strokeLength / 1000;
		}
		this._upbeat = upbeat || 0;

		this._applyChanges();
	}


	_applyChanges(): void {
		if (isPlaying(this)) {
			this._position = this.getPosition() + 1;
			const currentTime = this._getCurrentTime()!;

			while (this._referenceTime > currentTime) { // Caching might be in a future repetition already
				this._referenceTime -= (this._pattern.length - this._upbeat) * this._strokeLength / 1000;
			}

			if (this._referenceTime < this._startTime) {
				this._referenceTime = this._startTime;
			}

			this._clearCache(currentTime + 0.000001);
			this._fillCache();
		}
	}


	/**
	 * If the player is currently playing and there are any "beat" event listeners, sets up the repeated emission of a "beat" event, with the first event
	 * being emitted synchronously.
	 * Otherwise, discards the repeated emission of the event.
	 */
	_scheduleOnBeat(): void {
		if (this.playing === 1 && this.listenerCount("beat") > 0) {
			const position = this.getPosition();
			if (this._onBeatLast == null || position !== this._onBeatLast) {
				this.emit("beat", position);
			}
			this._onBeatLast = position;
			if (this._onBeatTimeout == null) {
				this._onBeatTimeout = requestAnimationFrame(() => {
					this._onBeatTimeout = null;
					this._scheduleOnBeat();
				});
			}
		} else if (this._onBeatTimeout != null) {
			cancelAnimationFrame(this._onBeatTimeout);
			this._onBeatTimeout = null;
		}
	}


	_fillCacheInternal(cacheUntil?: number): boolean {
		while (cacheUntil == null || this._referenceTime! + (this._position - this._upbeat) * this._strokeLength / 1000 <= cacheUntil) {
			if (this._position >= this._pattern.length) {
				if (cacheUntil != null && this._repeat) {
					this._position = this._upbeat;
					this._referenceTime = this._referenceTime! + this._strokeLength * (this._pattern.length - this._upbeat) / 1000;
				} else {
					return false;
				}
			}

			const part = this._pattern[this._position];
			if (part) {
				for (let strokeIdx = 0; strokeIdx < part.length; strokeIdx++) {
					const instr = Beatbox._resolveInstrument(part[strokeIdx]);
					if (instr && (instr.volume == null || instr.volume > 0)) {
						let time = this._referenceTime! + (this._position - this._upbeat) * this._strokeLength / 1000;

						if (!instr.cut) {
							this._scheduleSound(instr, time);
						} else {
							for (const sound of [...this._scheduledSounds]) {
								if (sound.instrument.key === instr.key && sound.time < time) {
									sound.stop(time);
								}
							}
						}
					}
				}
			}

			this._position++
		}

		return true;
	}


	_fillCache(): void {
		if (this._fillCacheTimeout) {
			window.clearTimeout(this._fillCacheTimeout);
		}

		const hasMore = this._fillCacheInternal(this._audioContext!.currentTime + Beatbox._cacheLength / 1000);

		if (hasMore) {
			this._fillCacheTimeout = window.setTimeout(() => { this._fillCache(); }, Beatbox._cacheInterval);
		} else {
			const endTime = Math.max(
				this._referenceTime! * 1000 + this._strokeLength * (this._pattern.length - this._upbeat),
				...this._scheduledSounds.map((sound) => (sound.time + sound.duration) * 1000)
			);
			this._fillCacheTimeout = window.setTimeout(() => {
				this.stop(true);
			}, endTime - this._audioContext!.currentTime * 1000);
		}
	}


	async _clearCache(from?: number): Promise<void> {
		if (this._fillCacheTimeout) {
			clearTimeout(this._fillCacheTimeout);
		}

		// Iterate over copy of _scheduledSounds as we are removing items from the array
		await Promise.all([...this._scheduledSounds].map(async (sound) => {
			if (from == null || sound.time >= from) {
				await sound.stop();
			}
		}));
	}
}

export default Beatbox;
