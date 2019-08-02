interface HowlerGlobal {
	state: AudioContextState,
	_autoResume(): this,
	_howls: Howl[]
}

interface Howl {
	_getSoundIds(soundId?: number): number[];
	_soundById(id: number): HowlerSound,
	_volume: number
}

interface ExtendedGainNode extends GainNode {
	bufferSource: AudioBufferSourceNode
}

interface HowlerSound {
	_node: ExtendedGainNode
}

interface AudioContext {
	createBufferSourceBkp(): AudioBufferSourceNode;
}