Beatbox = function(pattern, strokeLength, repeat) {
	this.playing = false;

	this._pattern = pattern;
	this._strokeLength = strokeLength;
	this._repeat = repeat;

	this._timeout = null;
	this._timeout2 = null;
	this._players = [ ];
	this._position = 0;
	this._referenceTime = null;
};

Beatbox._cacheLength = 1200;
Beatbox._webAudio = Howler.usingWebAudio;
Beatbox._instruments = { };

Beatbox.registerInstrument = function(key, soundObj, sprite) {
	Beatbox._instruments[key] = { soundObj: soundObj, sprite: sprite };
};

Beatbox._playWhen = function(instrumentWithParams, when, callback) {
	Beatbox._whenOverride = when;
	try {
		Beatbox._play(instrumentWithParams, callback);

		// Clear end timer, as its time will be wrong and we don't really need it, but it fucks up the stop() function
		var timer = instrumentWithParams.instrumentObj.soundObj._onendTimer.pop();
		timer && clearTimeout(timer.timer);
	} finally {
		Beatbox._whenOverride = null;
	}
};

Beatbox._play = function(instrumentWithParams, callback) {
	instrumentWithParams.instrumentObj.soundObj._volume = instrumentWithParams.volume;
	instrumentWithParams.instrumentObj.soundObj.play(instrumentWithParams.instrumentObj.sprite, callback);
};

Beatbox._getInstrumentWithParams = function(instr) {
	if(instr == null)
		return null;

	var ret = {
		instrumentObj : Beatbox._instruments[typeof instr == "string" ? instr : instr.instrument],
		volume : instr.volume != null ? instr.volume : 1
	};

	return ret.instrumentObj ? ret : null;
};

Beatbox.prototype.play = function() {
	if(this.playing)
		return;

	this.playing = true;

	if(Beatbox._webAudio) {
		this._playUsingWebAudio();
	} else {
		this._playUsingTimeout();
	}

	this.onplay && this.onplay();
};

Beatbox.prototype.stop = function() {
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
};

Beatbox.prototype.getPosition = function() {
	if(Beatbox._webAudio && this.playing) {
		var ret = (Howler.ctx.currentTime - this._referenceTime)*1000 / this._strokeLength;
		while(ret < 0) { // In case the cache is already filling for the next repetition
			ret += this._pattern.length;
		}
		return Math.floor(ret);
	} else {
		return this._position;
	}
};

Beatbox.prototype.setPosition = function(position) {
	var playing = this.playing;
	if(playing)
		this.stop();
	this._position = (position != null ? position : 0);
	if (playing)
		this.play();
};

Beatbox.prototype.setPattern = function(pattern) {
	this._pattern = pattern;

	this._applyChanges();
};

Beatbox.prototype.setBeatLength = function(strokeLength) {
	if(Beatbox._webAudio) {
		// Clear everything after the currently playing stroke. If the beat length has been increased, the clear call
		// in _fillWebAudioCache() would miss the old next stroke, which comes before the new next stroke.
		this._clearWebAudioCache(Howler.ctx.currentTime+0.000001);

		var now = (Howler.ctx.currentTime - this._referenceTime)*1000 / this._strokeLength;
		while(now < 0)
			now += this._pattern.length;
		this._referenceTime = Howler.ctx.currentTime - now * strokeLength / 1000;
	}

	this._strokeLength = strokeLength;

	this._applyChanges();
};

Beatbox.prototype.setRepeat = function(repeat) {
	this._repeat = repeat;

	this._applyChanges();
};

Beatbox.prototype._applyChanges = function() {
	if(Beatbox._webAudio && this.playing) {
		this._position = this.getPosition()+1;
		while(this._referenceTime > Howler.ctx.currentTime) // Caching might be in a future repetition already
			this._referenceTime -= this._pattern.length * this._strokeLength / 1000;

		this._fillWebAudioCache();
	}
};

Beatbox.prototype._playUsingTimeout = function() {
	this.onbeat && this.onbeat(this._position);
	if(this._pattern[this._position]) {
		for(var i=0; i<this._pattern[this._position].length; i++) {
			var instr = Beatbox._getInstrumentWithParams(this._pattern[this._position][i]);
			if(instr)
				Beatbox._play(instr);
		}
	}

	var self = this;
	this._timeout = setTimeout(function() {
		if(++self._position >= self._pattern.length) {
			self._position = 0;
			if(!self._repeat) {
				self.onstop && self.onstop();
				return;
			}
		}

		self._playUsingTimeout();
	}, this._strokeLength);
};

Beatbox.prototype._playUsingWebAudio = function() {
	this._referenceTime = Howler.ctx.currentTime - this._position * this._strokeLength / 1000;

	var self = this;
	var func = function() {
		if(self._fillWebAudioCache() === false) {
			self._timeout = setTimeout(function() {
				self.stop();
				self._position = 0;
				self.onstop && self.onstop();
			}, self._referenceTime*1000 + self._strokeLength * self._pattern.length - Howler.ctx.currentTime*1000);
		} else {
			self._timeout = setTimeout(func, Beatbox._cacheLength*.8);
		}
	};
	func();

	if(this.onbeat) {
		var onBeatFunc = function() {
			self.onbeat(self.getPosition());
			var sinceBeat = (Howler.ctx.currentTime - self._referenceTime)*1000 % self._strokeLength;
			if(sinceBeat < 0)
				sinceBeat += self._strokeLength;

			self._timeout2 = setTimeout(onBeatFunc, self._strokeLength - sinceBeat);
		};
		onBeatFunc();
	}
};

Beatbox.prototype._fillWebAudioCache = function() {
	this._clearWebAudioCache(this._referenceTime + this._position*this._strokeLength/1000);

	var self = this;
	var strokes = Math.ceil(Beatbox._cacheLength/this._strokeLength);
	for(var i=0; i < strokes; i++,this._position++) {
		if(this._position >= this._pattern.length) {
			if(this._repeat) {
				this._position = 0;
				this._referenceTime = this._referenceTime + this._strokeLength * this._pattern.length / 1000;
			}
			else
				return false;
		}

		if(this._pattern[this._position]) {
			for(var strokeIdx=0; strokeIdx<this._pattern[this._position].length; strokeIdx++) { (function(){
				var instr = Beatbox._getInstrumentWithParams(self._pattern[self._position][strokeIdx]);
				if(instr) {
					var time = self._referenceTime + self._position*self._strokeLength/1000;

					var sound = Beatbox._playWhen(instr, time, function(id) {
						self._players.push({
							time: time,
							instr: instr.instrumentObj.soundObj,
							id: id
						});
					});
				}
			})(); }
		}
	}
};

Beatbox.prototype._clearWebAudioCache = function(from) {
	for(var i=0; i<this._players.length; i++) {
		if(from == null || this._players[i].time >= from) {
			this._players[i].instr.stop(this._players[i].id);
			this._players.splice(i, 1);
			i--;
		}
	}
};

// Hack Howler to support the "when" parameter of AudioBufferSourceNode.start()
setTimeout(function() {
	if(Beatbox._webAudio) {
		var createBufferSourceBkp = Howler.ctx.createBufferSource;
		Howler.ctx.createBufferSource = function() {
			var ret = createBufferSourceBkp.apply(this, arguments);
			var startBkp = ret.start;
			ret.start = function() {
				if(Beatbox._whenOverride != null)
					arguments[0] = Beatbox._whenOverride;
				return startBkp.apply(this, arguments);
			};
			return ret;
		};
	}
}, 0);

if(typeof define === 'function' && define.amd) {
	define([ "howler" ], function() {
		return Beatbox;
	});
}

if(typeof module !== 'undefined') {
	module.exports = Beatbox;
}