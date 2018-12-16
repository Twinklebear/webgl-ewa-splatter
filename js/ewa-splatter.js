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
var proj = null;
var camera = null;
var projView = null;

var vao = null;
var splatAttribVbo = null;

var tabFocused = true;
var newPointCloudUpload = true;
var splatShader = null;
var splatRenderTargets = null;
var splatAccumFbo = null
var normalizationPassShader = null;

var surfelBuffer = null;
var surfelDataset = null;

var splatRadiusSlider = null;

// For the render time targetting we could do progressive
// rendering of the splats, or render at a lower resolution
var targetFrameTime = 32;
var WIDTH = 640;
var HEIGHT = 480;
const center = vec3.set(vec3.create(), 0.0, 0.0, 0.0);

var pointClouds = {
	"Dinosaur": {
		url: "erx9893x0olqbfq/dinosaur.rsf",
		scale: 1.0/30.0,
		size: 2697312,
		zoom_start: -40,
	},
	"Man": {
		url: "yfk9l8rweuk2m51/male.rsf",
		scale: 1.0/30.0,
		size: 7110624,
		zoom_start: -40,
	},
	"Santa": {
		url: "m6yri2u10qs31pm/painted_santa.rsf",
		scale: 1.0/30.0,
		size: 3637488,
		zoom_start: -30,
	},
	"Igea": {
		url: "v0xl67jgo4x5pxd/igea.rsf",
		scale: 1.0/40.0,
		size: 6448560,
		zoom_start: -50,
	},
	"Sankt Johann": {
		url: "7db4xlbhnl2muzv/Sankt_Johann_B2.rsf",
		scale: 1.0/200.0,
		size: 11576112,
		zoom_start: -40,
	},
	"Warnock Engineering Building": {
		url: "xxkw3lp3m3rnn9g/utah_cs_bldg.rsf",
		scale: 1.0/10.0,
		size: 13677168,
		zoom_start: -50,
	}
};

var loadPointCloud = function(dataset, onload) {
	var url = "https://www.dl.dropboxusercontent.com/s/" + dataset.url + "?dl=1";
	if (dataset.testing) {
		url = dataset.url;
	}
	var req = new XMLHttpRequest();
	var loadingProgressText = document.getElementById("loadingText");
	var loadingProgressBar = document.getElementById("loadingProgressBar");

	loadingProgressText.innerHTML = "Loading Dataset";
	loadingProgressBar.setAttribute("style", "width: 0%");

	req.open("GET", url, true);
	req.responseType = "arraybuffer";
	req.onprogress = function(evt) {
		var percent = evt.loaded / dataset.size * 100;
		loadingProgressBar.setAttribute("style", "width: " + percent.toFixed(2) + "%");
	};
	req.onerror = function(evt) {
		loadingProgressText.innerHTML = "Error Loading Dataset";
		loadingProgressBar.setAttribute("style", "width: 0%");
	};
	req.onload = function(evt) {
		loadingProgressText.innerHTML = "Loaded Dataset";
		loadingProgressBar.setAttribute("style", "width: 100%");
		var dataBuffer = req.response;
		if (dataBuffer) {
			dataBuffer = new Uint8Array(dataBuffer);
			onload(dataset, dataBuffer);
		} else {
			alert("Unable to load buffer properly from volume?");
			console.log("no buffer?");
		}
	};
	req.send();
}

var selectPointCloud = function() {
	var selection = document.getElementById("datasets").value;
	window.location.hash = "#" + selection;

	loadPointCloud(pointClouds[selection], function(dataset, dataBuffer) {
		gl.bindVertexArray(vao);
		var firstUpload = !splatAttribVbo;
		if (firstUpload) {
			splatAttribVbo = gl.createBuffer();
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo);
		gl.bufferData(gl.ARRAY_BUFFER, dataBuffer, gl.STATIC_DRAW);

		var sizeofSurfel = 48;
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 4, gl.FLOAT, false, sizeofSurfel, 0);
		gl.vertexAttribDivisor(1, 1);

		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.FLOAT, false, sizeofSurfel, 16);
		gl.vertexAttribDivisor(2, 1);

		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 4, gl.FLOAT, false, sizeofSurfel, 32);
		gl.vertexAttribDivisor(3, 1);

		
		document.getElementById("numSplats").innerHTML = dataBuffer.length / sizeofSurfel;
		newPointCloudUpload = true;
		surfelBuffer = dataBuffer;
		surfelDataset = dataset;

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
					camera.zoom(surfelDataset.zoom_start);
					// Pan the man down some
					if (surfelDataset.url == pointClouds["Man"].url) {
						camera.pan([0, -HEIGHT/2]);
					}
				}
				projView = mat4.mul(projView, proj, camera.camera);

				splatShader.use();
				gl.uniform1f(splatShader.uniforms["scaling"], surfelDataset.scale);
				gl.uniformMatrix4fv(splatShader.uniforms["proj_view"], false, projView);
				gl.uniform3fv(splatShader.uniforms["eye_pos"], camera.eyePos());
				gl.uniform1f(splatShader.uniforms["radius_scale"], splatRadiusSlider.value);

				// Render depth prepass to filter occluded splats
				gl.uniform1i(splatShader.uniforms["depth_prepass"], 1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, splatAccumFbo);
				gl.depthMask(true);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				gl.colorMask(false, false, false, false);
				gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0,
					splatVerts.length / 3, surfelBuffer.length / sizeofSurfel);

				// Render splat pass to accumulate splats for each pixel
				gl.uniform1i(splatShader.uniforms["depth_prepass"], 0);
				gl.colorMask(true, true, true, true);
				gl.depthMask(false);
				gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0,
					splatVerts.length / 3, surfelBuffer.length / sizeofSurfel);

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

window.onload = function(){
	fillDatasetSelector();

	splatRadiusSlider = document.getElementById("splatRadiusSlider");
	splatRadiusSlider.value = 2;

	var canvas = document.getElementById("glcanvas");
	gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("Unable to initialize WebGL2. Your browser may not support it");
		return;
	}
	if (!getGLExtension("OES_texture_float_linear") || !getGLExtension("EXT_color_buffer_float")) {
		alert("Required WebGL extensions missing, aborting");
		return;
	}

	WIDTH = canvas.getAttribute("width");
	HEIGHT = canvas.getAttribute("height");

	proj = mat4.perspective(mat4.create(), 60 * Math.PI / 180.0,
		WIDTH / HEIGHT, 1, 500);
	projView = mat4.create();

	camera = new ArcballCamera(center, 2, [WIDTH, HEIGHT]);

	// Register mouse and touch listeners
	var controller = new Controller();
	controller.mousemove = function(prev, cur, evt) {
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
	for (v in pointClouds) {
		var opt = document.createElement("option");
		opt.value = v;
		opt.innerHTML = v;
		selector.appendChild(opt);
	}
}

