import "howler";

declare module "howler" {
	interface Howler {
		state: AudioContextState;
		_autoResume(): this;
		_howls: Howl[];
	}

	interface Howl {
		_getSoundIds(soundId?: number): number[];
		_soundById(id: number): Sound;
		_volume: number;
	}

	interface Sound {
		_node: GainNode & { bufferSource: AudioBufferSourceNode };
	}
}

declare global {
	interface AudioContext {
		createBufferSourceBkp(): AudioBufferSourceNode;
	}
}