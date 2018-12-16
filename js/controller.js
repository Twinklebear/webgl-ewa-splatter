/* The controller can register callbacks for various events on a canvas:
 *
 * mousemove: function(prevMouse, curMouse, evt)
 *     receives both regular mouse events, and single-finger drags (sent as a left-click),
 *
 * wheel: function(amount)
 *     mouse wheel scrolling
 *
 * pinch: function(amount)
 *     two finger pinch, receives the distance change between the fingers
 *
 * twoFingerDrag: function(dragVector)
 *     two finger drag, receives the drag movement amount
 */
var Controller = function() {
	this.mousemove = null;
	this.wheel = null;
	this.twoFingerDrag = null;
	this.pinch = null;
}

Controller.prototype.registerForCanvas = function(canvas) {
	var prevMouse = null;
	var mouseState = [false, false];
	var self = this;
	canvas.addEventListener("mousemove", function(evt) {
		evt.preventDefault();
		var rect = canvas.getBoundingClientRect();
		var curMouse = [evt.clientX - rect.left, evt.clientY - rect.top];
		if (!prevMouse) {
			prevMouse = [evt.clientX - rect.left, evt.clientY - rect.top];
		} else {
			if (self.mousemove) {
				self.mousemove(prevMouse, curMouse, evt);
			}
		}
		prevMouse = curMouse;
	});

	canvas.addEventListener("wheel", function(evt) {
		evt.preventDefault();
		//camera.zoom(-evt.deltaY);
		if (self.wheel) {
			self.wheel(-evt.deltaY);
		}
	});

	canvas.oncontextmenu = function (evt) {
		evt.preventDefault();
	};

	var touches = {};
	canvas.addEventListener("touchstart", function(evt) {
		var rect = canvas.getBoundingClientRect();
		evt.preventDefault();
		for (var i = 0; i < evt.changedTouches.length; ++i) {
			var t = evt.changedTouches[i];
			touches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
		}
	});

	canvas.addEventListener("touchmove", function(evt) {
		evt.preventDefault();
		var rect = canvas.getBoundingClientRect();
		var numTouches = Object.keys(touches).length;
		// Single finger to rotate the camera
		if (numTouches == 1) {
			var t = evt.changedTouches[0];
			var prevTouch = touches[t.identifier];
			var curTouch = [t.clientX - rect.left, t.clientY - rect.top];
			// We send this as a fake left mouse click
			evt.buttons = 1;
			if (self.mousemove) {
				self.mousemove(prevTouch, curTouch, evt);
			}
		} else {
			var curTouches = {};
			for (var i = 0; i < evt.changedTouches.length; ++i) {
				var t = evt.changedTouches[i];
				curTouches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
			}

			// If some touches didn't change make sure we have them in
			// our curTouches list to compute the pinch distance
			// Also get the old touch points to compute the distance here
			var oldTouches = [];
			for (t in touches) {
				if (!(t in curTouches)) {
					curTouches[t] = touches[t];
				}
				oldTouches.push(touches[t]);
			}

			var newTouches = [];
			for (t in curTouches) {
				newTouches.push(curTouches[t]);
			}

			// Determine if the user is pinching or panning
			var motionVectors = [
				vec2.set(vec2.create(), newTouches[0][0] - oldTouches[0][0],
					newTouches[0][1] - oldTouches[0][1]),
				vec2.set(vec2.create(), newTouches[1][0] - oldTouches[1][0],
					newTouches[1][1] - oldTouches[1][1])
			];
			var motionDirs = [vec2.create(), vec2.create()];
			vec2.normalize(motionDirs[0], motionVectors[0]);
			vec2.normalize(motionDirs[1], motionVectors[1]);
			
			var pinchAxis = vec2.set(vec2.create(), oldTouches[1][0] - oldTouches[0][0],
				oldTouches[1][1] - oldTouches[0][1]);
			vec2.normalize(pinchAxis, pinchAxis);

			var panAxis = vec2.lerp(vec2.create(), motionVectors[0], motionVectors[1], 0.5);
			vec2.normalize(panAxis, panAxis);

			var pinchMotion = [
				vec2.dot(pinchAxis, motionDirs[0]),
				vec2.dot(pinchAxis, motionDirs[1])
			];
			var panMotion = [
				vec2.dot(panAxis, motionDirs[0]),
				vec2.dot(panAxis, motionDirs[1])
			];

			// If we're primarily moving along the pinching axis and in the opposite direction with
			// the fingers, then the user is zooming.
			// Otherwise, if the fingers are moving along the same direction they're panning
			if (Math.abs(pinchMotion[0]) > 0.5 && Math.abs(pinchMotion[1]) > 0.5
				&& Math.sign(pinchMotion[0]) != Math.sign(pinchMotion[1]))
			{
				// Pinch distance change for zooming
				var oldDist = pointDist(oldTouches[0], oldTouches[1]);
				var newDist = pointDist(newTouches[0], newTouches[1]);
				if (self.pinch) {
					self.pinch(newDist - oldDist);
				}
			} else if (Math.abs(panMotion[0]) > 0.5 && Math.abs(panMotion[1]) > 0.5
				&& Math.sign(panMotion[0]) == Math.sign(panMotion[1]))
			{
				// Pan by the average motion of the two fingers
				var panAmount = vec2.lerp(vec2.create(), motionVectors[0], motionVectors[1], 0.5);
				panAmount[1] = -panAmount[1];
				if (self.twoFingerDrag) {
					self.twoFingerDrag(panAmount);
				}
			}
		}

		// Update the existing list of touches with the current positions
		for (var i = 0; i < evt.changedTouches.length; ++i) {
			var t = evt.changedTouches[i];
			touches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
		}
	});

	var touchEnd = function(evt) {
		evt.preventDefault();
		for (var i = 0; i < evt.changedTouches.length; ++i) {
			var t = evt.changedTouches[i];
			delete touches[t.identifier];
		}
	}
	canvas.addEventListener("touchcancel", touchEnd);
	canvas.addEventListener("touchend", touchEnd);
}



