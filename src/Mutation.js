const {
  inflate,
  performanceNow,
  requestAnimationFrame,
  cancelAnimationFrame,
} = require('./utils');

// ------ Mutation class --------

const getPartialValues = function(startValues, endValues, progress) {
  const target = {};
  for (const key in endValues) { // eslint-disable-line guard-for-in
    // skipping hasOwnProperty check for performance reasons - we shouldn't be passing any objects
    // in here that aren't plain objects anyway and this is a hot code path
    const endValue = endValues[key];
    const startValue = startValues[key];
    if (endValue >= 0) {
      target[key] = progress * (endValue - startValue) + startValue;
    } else {
      target[key] = getPartialValues(startValue, endValue, progress);
    }
  }
  return target;
};

const isAlreadyAtEnd = function(startValues, endValues) {
  for (const key in endValues) {
    if (endValues.hasOwnProperty(key)) {
      const endValue = endValues[key];
      const startValue = startValues[key];
      if (endValue >= 0) {
        if (endValue !== startValue) return false;
      } else if (!isAlreadyAtEnd(startValue, endValue)) {
        return false;
      }
    }
  }
  return true;
};

// from https://github.com/maxwellito/vivus
const ease = x => -Math.cos(x * Math.PI) / 2 + 0.5;

function Mutation(scope, values, options = {}) {
  this.scope = scope;
  this._values = inflate(scope, values);
  this._duration = options.duration || 0;
  this._force = options.force;
  this._tickBound = this._tick.bind(this);
}

Mutation.prototype.run = function(renderState) {
  if (this._duration === 0) renderState.updateState(this._values);
  if (this._duration === 0 || isAlreadyAtEnd(renderState.state, this._values)) {
    return Promise.resolve();
  }
  this._renderState = renderState;
  this._startState = renderState.state;
  this._startTime = performanceNow();
  this._frameHandle = requestAnimationFrame(this._tickBound);
  return new Promise((resolve) => {
    this._resolve = resolve;
  });
};

Mutation.prototype._tick = function(timing) {
  const progress = Math.min(1, (timing - this._startTime) / this._duration);
  const easedProgress = ease(progress);
  this._renderState.updateState(getPartialValues(this._startState, this._values, easedProgress));
  if (easedProgress === 1) {
    this._frameHandle = null;
    this.cancel(this._renderState);
  } else {
    this._frameHandle = requestAnimationFrame(this._tickBound);
  }
};

Mutation.prototype.cancel = function(renderState) {
  if (this._resolve) this._resolve();
  this._resolve = null;
  if (this._frameHandle) cancelAnimationFrame(this._frameHandle);
  this._frameHandle = null;
  if (this._force) renderState.updateState(this._values);
};

// ------ Mutation.Pause Class --------

function Pause(duration) {
  this._duration = duration;
}

Pause.prototype.run = function() {
  const timeoutPromise = new Promise((resolve) => {
    this._resolve = resolve;
  });
  this._timeout = setTimeout(() => this.cancel(), this._duration);
  return timeoutPromise;
};

Pause.prototype.cancel = function() {
  clearTimeout(this._timeout);
  if (this._resolve) this._resolve();
  this._resolve = false;
};

Mutation.Pause = Pause;

// -------------------------------------


module.exports = Mutation;
