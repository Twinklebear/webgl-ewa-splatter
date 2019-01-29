'use strict';

// Vertices for the quad we intance to make the splats
var splatVerts = [
	-0.5, -0.5, 0,
	-0.5, 0.5, 0,
	0.5, -0.5, 0,
	0.5, 0.5, 0,
];

// Positions and normals, interleaved
var splatVbo = [];

var gl = null;
var canvas = null;
var proj = null;
var camera = null;
var projView = null;
var frustum = null;

var vao = null;
var splatAttribVbo = null;

var tabFocused = true;
var newPointCloudUpload = true;
var splatShader = null;
var splatRenderTargets = null;
var splatAccumFbo = null
var normalizationPassShader = null;
var brushShader = null;

var kdTree = null;
var currentLevel = 0;
var activeLoadRequests = 0;
var wasLoadingData = false;

var splatRadiusSlider = null;
var levelSelectionSlider = null;
var mousePos = null;
var numSplatsElem = null
var traversalTimeElem = null
var uploadTimeElem = null
var renderTimeElem = null
var updateFrustum = true;

// For the render time targetting we could do progressive
// rendering of the splats, or render at a lower resolution
var targetFrameTime = 32;
var WIDTH = 640;
var HEIGHT = 480;
const center = vec3.set(vec3.create(), 0.0, 0.0, 0.0);

var pointClouds = {
	"Test": {
		url: "tools/build/living_room/0.srsf",
		testing: true,
		size: 100
	},
	"Dinosaur": {
		url: "e4l0qdy43ttvb87/dinosaur_kd.rsf",
		size: 2448388,
	},
	"Leo": {
		url: "k78e3vzl97tir7y/leo_kd.rsf",
		size: 2501144,
	},
	"Santa": {
		url: "8ktn1ac8v2dxhui/painted_santa_kd.rsf",
		size: 3265940,
	},
	"Igea": {
		url: "f7h4m35crhs4lnj/igea_kd.rsf",
		size: 5805644,
	},
	"Man": {
		url: "bwbhyri4iexxrvm/man_kd.rsf",
		size: 6345236,
	},
	"Sankt Johann": {
		url: "af12ofenxidqa67/Sankt_Johann_B2_kd.rsf",
		size: 10568784,
	},
	"Warnock Engineering Building": {
		url: "cd7trfzevc1s9js/utah_cs_bldg_kd.rsf",
		size: 12437888,
	}
};

var loadKdTree = function(dataset, onload) {
	activeLoadRequests += 1;
	if (!dataset.file) {
		var url = "https://www.dl.dropboxusercontent.com/s/" + dataset.url + "?dl=1";
		if (dataset.testing) {
			url = dataset.url;
		}
		var req = new XMLHttpRequest();

		req.open("GET", url, true);
		req.responseType = "arraybuffer";
		req.onload = function(evt) {
			activeLoadRequests -= 1;
			var buffer = req.response;
			if (buffer) {
				onload(dataset, buffer);
			} else {
				alert("Unable to load buffer properly from volume?");
				console.log("no buffer?");
			}
		};
		req.send();
	} else {
		var reader = new FileReader();
		reader.onload = function(evt) {
			var buffer = reader.result;
			if (buffer) {
				onload(dataset, buffer);
			} else {
				alert("Unable to load buffer properly from volume?");
				console.log("no buffer?");
			}
		};
		reader.readAsArrayBuffer(dataset.file);
	}
}

var selectPointCloud = function() {
	var selection = document.getElementById("datasets").value;
	history.replaceState(history.state, "#" + selection, "#" + selection);

	loadKdTree(pointClouds[selection], function(dataset, dataBuffer) {
		kdTree = new KdTree(dataBuffer);

		var firstUpload = !splatAttribVbo;
		if (firstUpload) {
			splatAttribVbo = [gl.createBuffer(), gl.createBuffer()]; 
		}

		var query = kdTree.queryLevel(0);

		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo[0]);
		// Is the length in bytes or in elements?
		gl.bufferData(gl.ARRAY_BUFFER, query.pos.buffer, gl.DYNAMIC_DRAW,
			0, query.pos.len);

		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 4, gl.HALF_FLOAT, false, sizeofSurfel, 0);
		gl.vertexAttribDivisor(1, 1);

		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.HALF_FLOAT, false, sizeofSurfel, 8);
		gl.vertexAttribDivisor(2, 1);

		gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo[1]);
		gl.bufferData(gl.ARRAY_BUFFER, query.color.buffer, gl.DYNAMIC_DRAW,
			0, query.color.len);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, 0);
		gl.vertexAttribDivisor(3, 1);
		
		newPointCloudUpload = true;
		var numSurfels = query.pos.len / (sizeofSurfel / 2);
		numSplatsElem.innerHTML = numSurfels;

		if (firstUpload) {
			setInterval(function() {
				// Save them some battery if they're not viewing the tab
				if (document.hidden) {
					return;
				}
				var startTime = new Date();

				gl.enable(gl.DEPTH_TEST);
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.ONE, gl.ONE);

				gl.clearDepth(1.0);
				gl.clearColor(0.0, 0.0, 0.0, 0.0);

				// Reset the sampling rate and camera for new volumes
				if (newPointCloudUpload) {
					camera = new ArcballCamera(center, 100, [WIDTH, HEIGHT]);
					camera.zoom(-30);
				}

				projView = mat4.mul(projView, proj, camera.camera);

				var startTraversal = new Date();
				treeLevel.innerHTML = levelSelectionSlider.value;
				currentLevel = levelSelectionSlider.value;

				query.pos.clear();
				query.color.clear();
				frustum = new Frustum(projView);
				query = kdTree.queryFrustum(frustum, camera.eyePos(), [WIDTH, HEIGHT],
					currentLevel, query);

				wasLoadingData = activeLoadRequests > 0;
				var endTraversal = new Date();
				if (query.len != 0) {
					var startUpload = new Date();
					gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo[0]);
					gl.bufferData(gl.ARRAY_BUFFER, query.pos.buffer, gl.DYNAMIC_DRAW,
						0, query.pos.len);

					gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo[1]);
					gl.bufferData(gl.ARRAY_BUFFER, query.color.buffer, gl.DYNAMIC_DRAW,
						0, query.color.len);

					var endUpload = new Date();

					numSurfels = query.pos.len / (sizeofSurfel / 2);
					numSplatsElem.innerHTML = numSurfels;

					traversalTimeElem.innerHTML = endTraversal - startTraversal;
					uploadTimeElem.innerHTML = endUpload - startUpload;
				}

				splatShader.use();
				gl.uniformMatrix4fv(splatShader.uniforms["proj_view"], false, projView);
				gl.uniform3fv(splatShader.uniforms["eye_pos"], camera.eyePos());
				gl.uniform1f(splatShader.uniforms["radius_scale"], splatRadiusSlider.value);

				// Render depth prepass to filter occluded splats
				gl.uniform1i(splatShader.uniforms["depth_prepass"], 1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, splatAccumFbo);
				gl.depthMask(true);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				gl.colorMask(false, false, false, false);
				gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, splatVerts.length / 3, numSurfels);

				// Render splat pass to accumulate splats for each pixel
				gl.uniform1i(splatShader.uniforms["depth_prepass"], 0);
				gl.colorMask(true, true, true, true);
				gl.depthMask(false);
				gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, splatVerts.length / 3, numSurfels);

				// Render normalization full screen shader pass to produce final image
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				gl.disable(gl.BLEND);
				normalizationPassShader.use();
				var eyeDir = camera.eyeDir();
				gl.uniform3fv(normalizationPassShader.uniforms["eye_dir"], eyeDir);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// Wait for rendering to actually finish so we can time it
				gl.finish();
				var endTime = new Date();
				var renderTime = endTime - startTime;
				renderTimeElem.innerHTML = renderTime;
				// TODO: If we have a nicer LOD ordering of the point cloud,
				// we can adjust to keep the frame-rate constant by rendering
				// a subset of the points. Or I could implement some acceleration
				// structure and this can adjust how much we render from it
				var targetSamplingRate = renderTime / targetFrameTime;

				newPointCloudUpload = false;
				startTime = endTime;
			}, targetFrameTime);
		}
	});
}

window.onload = function() {
	fillDatasetSelector();

	splatRadiusSlider = document.getElementById("splatRadiusSlider");
	splatRadiusSlider.value = 2.0;

	levelSelectionSlider = document.getElementById("levelSelectionSlider");
	levelSelectionSlider.value = 0;
	treeLevel = document.getElementById("treeLevel");
	treeLevel.innerHTML = levelSelectionSlider.value;

	numSplatsElem = document.getElementById("numSplats");
	traversalTimeElem = document.getElementById("traversalTime");
	uploadTimeElem = document.getElementById("uploadTime");
	renderTimeElem = document.getElementById("renderTime");

	canvas = document.getElementById("glcanvas");
	gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("Unable to initialize WebGL2. Your browser may not support it");
		return;
	}
	if (!getGLExtension("OES_texture_float_linear") || !getGLExtension("EXT_color_buffer_float")) {
		alert("Required WebGL extensions missing, aborting");
		return;
	}

	document.addEventListener("keydown", function(evt) {
		if (evt.key == "Control") {
			updateFrustum = !updateFrustum;
			console.log("updateFrustum = " + updateFrustum);
		}
	});

	WIDTH = canvas.width;
	HEIGHT = canvas.height;

	proj = mat4.perspective(mat4.create(), 60 * Math.PI / 180.0,
		WIDTH / HEIGHT, 0.1, 500);
	projView = mat4.create();

	camera = new ArcballCamera(center, 2, [WIDTH, HEIGHT]);

	// Register mouse and touch listeners
	var controller = new Controller();

	controller.mousemove = function(prev, cur, evt) {
		mousePos = cur;
		if (evt.buttons == 1) {
			camera.rotate(prev, cur);
		} else if (evt.buttons == 2) {
			camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
		}
	};
	controller.wheel = function(amt) { camera.zoom(amt); };
	controller.pinch = controller.wheel;
	controller.twoFingerDrag = function(drag) { camera.pan(drag); };

	controller.registerForCanvas(canvas);

	vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	// Create the instanced quad buffer we'll use to make the transformed splats
	var vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(splatVerts), gl.STATIC_DRAW);

	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	splatShader = new Shader(vertShader, fragShader);

	normalizationPassShader = new Shader(quadVertShader, normalizationFragShader);
	normalizationPassShader.use();
	gl.uniform1i(normalizationPassShader.uniforms["splat_colors"], 0)
	gl.uniform1i(normalizationPassShader.uniforms["splat_normals"], 1)

	brushShader = new Shader(brushVertShader, brushFragShader);

	// Setup the render targets for the splat rendering pass
	splatRenderTargets = [gl.createTexture(), gl.createTexture(), gl.createTexture()];
	for (var i = 0; i < 2; ++i) {
		gl.bindTexture(gl.TEXTURE_2D, splatRenderTargets[i]);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, WIDTH, HEIGHT);
	}
	gl.bindTexture(gl.TEXTURE_2D, splatRenderTargets[2]);
	gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, WIDTH, HEIGHT);

	for (var i = 0; i < 3; ++i) {
		gl.bindTexture(gl.TEXTURE_2D, splatRenderTargets[i]);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}
	// Setup the bindings for the normalization pass shader
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, splatRenderTargets[0]);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, splatRenderTargets[1]);

	splatAccumFbo = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, splatAccumFbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D, splatRenderTargets[0], 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
		gl.TEXTURE_2D, splatRenderTargets[1], 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D, splatRenderTargets[2], 0);
	gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

	// See if we were linked to a datset
	if (window.location.hash) {
		var linkedDataset = decodeURI(window.location.hash.substr(1));
		if (linkedDataset in pointClouds) {
			document.getElementById("datasets").value = linkedDataset;
		}
	}
	selectPointCloud();
}

var fillDatasetSelector = function() {
	var selector = document.getElementById("datasets");
	for (var v in pointClouds) {
		var opt = document.createElement("option");
		opt.value = v;
		opt.innerHTML = v;
		selector.appendChild(opt);
	}
}

