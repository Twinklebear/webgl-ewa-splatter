var splatVerts = [
	-0.5, -0.5, 0,
	-0.5, 0.5, 0,
	0.5, -0.5, 0,
	0.5, 0.5, 0,
];

// Positions and normals, interleaved
var splatVbo = [];

var vertShader =
"#version 300 es\n" +
"layout(location=0) in vec3 pos;" +
"layout(location=1) in vec3 splat_pos;" +
"layout(location=2) in vec3 splat_normal;" +

"uniform highp vec3 eye_pos;" +
"uniform mat4 proj_view;" +
"uniform float splat_radius;" +

"out highp vec2 uv;" +
"out highp vec3 normal;" +

"mat3 rotation_matrix(vec3 a, float angle) {" +
	"float c = cos(angle);" +
	"float sub_c = 1.0 - c;" +
	"float s = sin(angle);" +
	"return mat3(" +
		"vec3(c + pow(a.x, 2.0) * sub_c," +
			"a.y * a.x * sub_c + a.z * s," +
			"a.z * a.x * sub_c - a.y * s)," +
		"vec3(a.x * a.y * sub_c - a.z * s," +
			"c+ pow(a.y, 2.0) * sub_c," +
			"a.z * a.y * sub_c + a.x * s)," +
		"vec3(a.x * a.z * sub_c + a.y * s," +
			"a.y * a.z * sub_c - a.x * s," +
			"c + pow(a.z, 2.0) * sub_c));" +
"}" +

// Note that splat_normal must be normalized
"void main(void) {" +
	"mat3 rot_mat = mat3(1.0);" +
	"vec3 quad_normal = vec3(0, 0, 1);" +
	"if (abs(splat_normal) != quad_normal) {" +
		"vec3 rot_axis = normalize(cross(quad_normal, splat_normal));" +
		"float rot_angle = acos(dot(quad_normal, splat_normal));" +
		"rot_mat = rotation_matrix(rot_axis, rot_angle);" +
	"}" +
	"uv = 2.0 * pos.xy;" +
	"normal = splat_normal;" +
	"gl_Position = proj_view * vec4(rot_mat * splat_radius * pos + splat_pos, 1);" +
"}";

var fragShader =
"#version 300 es\n" +
"#define M_PI 3.1415926535897932384626433832795\n" +
"out highp vec4 color;" +
"in highp vec2 uv;" +
"in highp vec3 normal;" +
"void main(void) {" +
	"highp float len = length(uv);" +
	"if (len > 1.0) {" +
		"discard;" +
	"}" +
	"highp float opacity = 1.0 / sqrt(2.0 * M_PI) * exp(-pow(len, 2.0)/2.0);" +
	"color = vec4(0, 0, 1, opacity);" +
"}";

var gl = null;
var proj = null;
var camera = null;
var projView = null;
var projViewLoc = null;
var eyePosLoc = null;
var tabFocused = true;
var newPointCloudUpload = true;
// For the render time targetting we could do progressive
// rendering of the splats, or render at a lower resolution
var targetFrameTime = 32;
var WIDTH = 640;
var HEIGHT = 480;
const center = vec3.set(vec3.create(), 0.0, 0.0, 0.0);

var pointClouds = {
	"Test Sphere": "test-sphere",
};

// Generate points on a sphere with some radius, taking nphi samples
// long phi and ntheta samples along theta
var generateTestSphere = function(radius, nphi, ntheta) {
	for (var i = 0; i < nphi; ++i) {
		for (var j = 0; j <= ntheta; ++j) {
			var phi = (i / nphi) * 2.0 * Math.PI;
			var theta = (j / ntheta) * Math.PI;
			var x = Math.sin(theta) * Math.cos(phi);
			var y = Math.sin(theta) * Math.sin(phi);
			var z = Math.cos(theta);
			splatVbo.push(radius * x, radius * y, radius * z);
			splatVbo.push(x, y, z);
		}
	}
}

var loadPointCloud = function(file, onload) {
	/*
	var m = file.match(fileRegex);
	var volDims = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
	
	var url = "https://www.dl.dropboxusercontent.com/s/" + file + "?dl=1";
	var req = new XMLHttpRequest();
	var loadingProgressText = document.getElementById("loadingText");
	var loadingProgressBar = document.getElementById("loadingProgressBar");

	loadingProgressText.innerHTML = "Loading Volume";
	loadingProgressBar.setAttribute("style", "width: 0%");

	req.open("GET", url, true);
	req.responseType = "arraybuffer";
	req.onprogress = function(evt) {
		var vol_size = volDims[0] * volDims[1] * volDims[2];
		var percent = evt.loaded / vol_size * 100;
		loadingProgressBar.setAttribute("style", "width: " + percent.toFixed(2) + "%");
	};
	req.onerror = function(evt) {
		loadingProgressText.innerHTML = "Error Loading Volume";
		loadingProgressBar.setAttribute("style", "width: 0%");
	};
	req.onload = function(evt) {
		loadingProgressText.innerHTML = "Loaded Volume";
		loadingProgressBar.setAttribute("style", "width: 100%");
		var dataBuffer = req.response;
		if (dataBuffer) {
			dataBuffer = new Uint8Array(dataBuffer);
			onload(file, dataBuffer);
		} else {
			alert("Unable to load buffer properly from volume?");
			console.log("no buffer?");
		}
	};
	req.send();
	*/
}

var selectPointCloud = function() {
	var selection = document.getElementById("datasets").value;

	setInterval(function() {
		// Save them some battery if they're not viewing the tab
		if (document.hidden) {
			return;
		}
		var startTime = new Date();
		gl.clearColor(0.0, 0.0, 0.0, 0.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		// Reset the sampling rate and camera for new volumes
		if (newPointCloudUpload) {
			camera = new ArcballCamera(center, 2, [WIDTH, HEIGHT]);
		}
		projView = mat4.mul(projView, proj, camera.camera);
		gl.uniformMatrix4fv(projViewLoc, false, projView);

		var eye = [camera.invCamera[12], camera.invCamera[13], camera.invCamera[14]];
		gl.uniform3fv(eyePosLoc, eye);

		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, splatVerts.length / 3, splatVbo.length / 6);

		// Wait for rendering to actually finish so we can time it
		gl.finish();
		var endTime = new Date();
		var renderTime = endTime - startTime;
		var targetSamplingRate = renderTime / targetFrameTime;

		newPointCloudUpload = false;
		startTime = endTime;
	}, targetFrameTime);
}

window.onload = function(){
	fillDatasetSelector();

	var canvas = document.getElementById("glcanvas");
	gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("Unable to initialize WebGL2. Your browser may not support it");
		return;
	}
	WIDTH = canvas.getAttribute("width");
	HEIGHT = canvas.getAttribute("height");

	proj = mat4.perspective(mat4.create(), 60 * Math.PI / 180.0,
		WIDTH / HEIGHT, 0.1, 100);

	camera = new ArcballCamera(center, 2, [WIDTH, HEIGHT]);

	// Register mouse and touch listeners
	registerEventHandlers(canvas);

	var vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	// Create the instanced quad buffer we'll use to make the transformed splats
	var vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(splatVerts), gl.STATIC_DRAW);

	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	// Create the splat attribute buffer for the per-splat instance data
	generateTestSphere(3.0, 12, 12);
	var splatAttribVbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(splatVbo), gl.STATIC_DRAW);

	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 6 * 4, 0);
	gl.vertexAttribDivisor(1, 1);

	gl.enableVertexAttribArray(2);
	gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 6 * 4, 3 * 4);
	gl.vertexAttribDivisor(2, 1);

	var shader = compileShader(vertShader, fragShader);
	gl.useProgram(shader);

	eyePosLoc = gl.getUniformLocation(shader, "eye_pos");
	projViewLoc = gl.getUniformLocation(shader, "proj_view");
	projView = mat4.create();

	gl.uniform1f(gl.getUniformLocation(shader, "splat_radius"), 0.5);

	// Setup required OpenGL state for drawing the back faces and
	// composting with the background color
	gl.enable(gl.DEPTH_TEST);

	//gl.enable(gl.BLEND);
	//gl.blendFunc(gl.ONE, gl.ONE);

	selectPointCloud();
}

var fillDatasetSelector = function() {
	var selector = document.getElementById("datasets");
	for (v in pointClouds) {
		var opt = document.createElement("option");
		opt.value = v;
		opt.innerHTML = v;
		selector.appendChild(opt);
	}
}

// This can likely be part of the camera code itself
var registerEventHandlers = function(canvas) {
	var prevMouse = null;
	var mouseState = [false, false];
	canvas.addEventListener("mousemove", function(evt) {
		evt.preventDefault();
		var rect = canvas.getBoundingClientRect();
		var curMouse = [evt.clientX - rect.left, evt.clientY - rect.top];
		if (!prevMouse) {
			prevMouse = [evt.clientX - rect.left, evt.clientY - rect.top];
		} else {
			if (evt.buttons == 1) {
				camera.rotate(prevMouse, curMouse);
			} else if (evt.buttons == 2) {
				camera.pan([curMouse[0] - prevMouse[0], prevMouse[1] - curMouse[1]]);
			}
		}
		prevMouse = curMouse;
	});

	canvas.addEventListener("wheel", function(evt) {
		evt.preventDefault();
		camera.zoom(-evt.deltaY);
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
			camera.rotate(prevTouch, [t.clientX - rect.left, t.clientY - rect.top]);
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
				camera.zoom(newDist - oldDist);
			} else if (Math.abs(panMotion[0]) > 0.5 && Math.abs(panMotion[1]) > 0.5
				&& Math.sign(panMotion[0]) == Math.sign(panMotion[1]))
			{
				// Pan by the average motion of the two fingers
				var panAmount = vec2.lerp(vec2.create(), motionVectors[0], motionVectors[1], 0.5);
				panAmount[1] = -panAmount[1];
				camera.pan(panAmount);
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

var pointDist = function(a, b) {
	var v = [b[0] - a[0], b[1] - a[1]];
	return Math.sqrt(Math.pow(v[0], 2.0) + Math.pow(v[1], 2.0));
}

// Compile and link the shaders vert and frag. vert and frag should contain
// the shader source code for the vertex and fragment shaders respectively
// Returns the compiled and linked program, or null if compilation or linking failed
var compileShader = function(vert, frag){
	var vs = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vs, vert);
	gl.compileShader(vs);
	if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)){
		alert("Vertex shader failed to compile, see console for log");
		console.log(gl.getShaderInfoLog(vs));
		return null;
	}

	var fs = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fs, frag);
	gl.compileShader(fs);
	if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)){
		alert("Fragment shader failed to compile, see console for log");
		console.log(gl.getShaderInfoLog(fs));
		return null;
	}

	var program = gl.createProgram();
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)){
		alert("Shader failed to link, see console for log");
		console.log(gl.getProgramInfoLog(program));
		return null;
	}
	return program;
}

