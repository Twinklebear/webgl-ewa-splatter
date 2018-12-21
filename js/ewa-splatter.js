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
var colorsChanged = false;

var tabFocused = true;
var newPointCloudUpload = true;
var splatShader = null;
var splatRenderTargets = null;
var splatAccumFbo = null
var normalizationPassShader = null;
var brushShader = null;

const sizeofSurfel = 32;
const sizeofKdNode = 8;
var numSurfels = null;
var surfelBuffer = null;
var surfelDataset = null;
var surfelPositions = null;
var surfelColors = null;

var kdTree = null;

var splatRadiusSlider = null;
var brushRadiusSlider = null;
var brushColorPicker = null;
var brushingMode = null;
var mousePos = null;

// For the render time targetting we could do progressive
// rendering of the splats, or render at a lower resolution
var targetFrameTime = 32;
var WIDTH = 640;
var HEIGHT = 480;
const center = vec3.set(vec3.create(), 0.0, 0.0, 0.0);

var pointClouds = {
	"Test": {
		url: "painted_santa2_kd.rsf",
		//url: "dinosaur_kd.rsf",
		//url: "Sankt_Johann_B2_kd.rsf",
		//url: "utah_cs_bldg_kd.rsf",
		size: 3637488,
		zoom_start: -30,
		testing: true,
	},
	"Dinosaur": {
		url: "erx9893x0olqbfq/dinosaur.rsf",
		size: 2697312,
		zoom_start: -40,
	},
	"Leo": {
		url: "h4kradxo3lbtar8/leo.rsf",
		size: 2708256,
		zoom_start: -8,
	},
	"Santa": {
		url: "m6yri2u10qs31pm/painted_santa.rsf",
		size: 3637488,
		zoom_start: -30,
	},
	"Igea": {
		url: "v0xl67jgo4x5pxd/igea.rsf",
		size: 6448560,
		zoom_start: -70,
	},
	"Man": {
		url: "yfk9l8rweuk2m51/male.rsf",
		size: 7110624,
		zoom_start: -40,
	},
	"Sankt Johann": {
		url: "7db4xlbhnl2muzv/Sankt_Johann_B2.rsf",
		size: 11576112,
		zoom_start: -40,
	},
	"Warnock Engineering Building": {
		url: "xxkw3lp3m3rnn9g/utah_cs_bldg.rsf",
		size: 13677168,
		zoom_start: -50,
	}
};

var loadPointCloud = function(dataset, onload) {
	var loadingProgressText = document.getElementById("loadingText");
	var loadingProgressBar = document.getElementById("loadingProgressBar");
	loadingProgressText.innerHTML = "Loading Dataset";
	loadingProgressBar.setAttribute("style", "width: 0%");

	var errFcn = function() {
		loadingProgressText.innerHTML = "Error Loading Dataset";
		loadingProgressBar.setAttribute("style", "width: 0%");
	};

	if (!dataset.file) {
		var url = "https://www.dl.dropboxusercontent.com/s/" + dataset.url + "?dl=1";
		if (dataset.testing) {
			url = dataset.url;
		}
		var req = new XMLHttpRequest();

		req.open("GET", url, true);
		req.responseType = "arraybuffer";
		req.onprogress = function(evt) {
			var percent = evt.loaded / dataset.size * 100;
			loadingProgressBar.setAttribute("style", "width: " + percent.toFixed(2) + "%");
		};
		req.onerror = errFcn;
		req.onload = function(evt) {
			loadingProgressText.innerHTML = "Loaded Dataset";
			loadingProgressBar.setAttribute("style", "width: 100%");
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
		reader.onerror = errFcn;
		reader.onload = function(evt) {
			loadingProgressText.innerHTML = "Loaded Dataset";
			loadingProgressBar.setAttribute("style", "width: 100%");
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

	loadPointCloud(pointClouds[selection], function(dataset, dataBuffer) {
		var header = new Uint32Array(dataBuffer, 0, 4);
		var bounds = new Float32Array(dataBuffer, 16, 6);

		numSurfels = header[0];
		surfelPositions = new Float32Array(dataBuffer, header[1], numSurfels * (sizeofSurfel / 4));
		surfelColors = new Uint8Array(dataBuffer, header[1] + numSurfels * sizeofSurfel);

		var numKdNodes = header[2];
		var kdNodes = new Uint32Array(dataBuffer, 40, numKdNodes * 2);
		var kdPrimIndices = new Uint32Array(dataBuffer, 40 + numKdNodes * sizeofKdNode, header[3]);
		kdTree = new KdTree(numKdNodes, kdNodes, kdPrimIndices, bounds, surfelPositions);

		var firstUpload = !splatAttribVbo;
		if (firstUpload) {
			splatAttribVbo = [gl.createBuffer(), gl.createBuffer()]; 
		}

		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo[0]);
		gl.bufferData(gl.ARRAY_BUFFER, surfelPositions, gl.STATIC_DRAW);

		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 4, gl.FLOAT, false, sizeofSurfel, 0);
		gl.vertexAttribDivisor(1, 1);

		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.FLOAT, false, sizeofSurfel, 16);
		gl.vertexAttribDivisor(2, 1);

		gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo[1]);
		gl.bufferData(gl.ARRAY_BUFFER, surfelColors, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, 0);
		gl.vertexAttribDivisor(3, 1);
		
		newPointCloudUpload = true;
		document.getElementById("numSplats").innerHTML = numSurfels;
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
				if (colorsChanged) {
					colorsChanged = false;
					gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo[1]);
					gl.bufferSubData(gl.ARRAY_BUFFER, 0, surfelColors);
				}
				projView = mat4.mul(projView, proj, camera.camera);

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

				// Draw the brush on top of the mesh, if we're brushing
				if (brushingMode.checked && mousePos != null && kdTree != null) {
					var screen = [(mousePos[0] / WIDTH) * 2.0 - 1, 1.0 - 2.0 * (mousePos[1] / HEIGHT)];
					var screenP = vec4.set(vec4.create(), screen[0], screen[1], 1.0, 1.0);
					var invProjView = mat4.invert(mat4.create(), projView);
					var worldPos = vec4.transformMat4(vec4.create(), screenP, invProjView);
					var dir = vec3.set(vec3.create(), worldPos[0], worldPos[1], worldPos[2]);
					dir = vec3.normalize(dir, dir);

					var orig = camera.eyePos();
					orig = vec3.set(vec3.create(), orig[0], orig[1], orig[2]);

					var hit = kdTree.intersect(orig, dir);
					if (hit != null) {
						hitP = hit[0];
						hitPrim = hit[1];
						var brushColor = hexToRGB(brushColorPicker.value);
						gl.disable(gl.DEPTH_TEST);

						brushShader.use();
						gl.uniformMatrix4fv(brushShader.uniforms["proj_view"], false, projView);
						gl.uniform3f(brushShader.uniforms["brush_pos"], hitP[0], hitP[1], hitP[2]);
						gl.uniform3f(brushShader.uniforms["brush_normal"],
							surfelPositions[8 * hitPrim + 4],
							surfelPositions[8 * hitPrim + 5],
							surfelPositions[8 * hitPrim + 6]);
						gl.uniform3f(brushShader.uniforms["brush_color"],
							brushColor[0] / 255.0, brushColor[1] / 255.0, brushColor[2] / 255.0);
						gl.uniform1f(brushShader.uniforms["brush_radius"], brushRadiusSlider.value * 2);
						gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, splatVerts.length / 3, 1);

						gl.enable(gl.DEPTH_TEST);
					}
				}

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

var hexToRGB = function(hex) {
	var val = parseInt(hex.substr(1), 16);
	var r = (val >> 16) & 255;
	var g = (val >> 8) & 255;
	var b = val & 255;
	return [r, g, b];
}

var saveModel = function() {
	var blob = new Blob([surfelBuffer], {type: "application/byte-stream"});
	var name = surfelDataset.url;
	var fnd = surfelDataset.url.indexOf("/");
	if (fnd != -1) {
		name = surfelDataset.url.substr(fnd);
	}
	saveAs(blob, name);
}

var uploadModel = function(files) {
	var file = files[0];
	pointClouds["uploaded_" + file.name] = {
		file: file,
		url: file.name,
		size: file.size,
		zoom_start: -10,
		scale: 1.0/30.0,
	}
	var selector = document.getElementById("datasets");
	var opt = document.createElement("option");
	opt.value = "uploaded_" + file.name;
	opt.innerHTML = "Uploaded: " + file.name;
	selector.appendChild(opt);
	selector.value = opt.value;
	selectPointCloud();
}

window.onload = function() {
	fillDatasetSelector();

	brushRadiusSlider = document.getElementById("brushRadiusSlider");
	brushColorPicker = document.getElementById("brushColorPicker");
	brushingMode = document.getElementById("brushMode");

	document.addEventListener("keydown", function(evt) {
		if (evt.key == "Control") {
			brushingMode.checked = true;
		}
	});

	document.addEventListener("keyup", function(evt) {
		if (evt.key == "Control") {
			brushingMode.checked = false;
			mousePos = null;
		}
	});

	splatRadiusSlider = document.getElementById("splatRadiusSlider");
	splatRadiusSlider.value = 2.5;

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
		WIDTH / HEIGHT, 0.1, 500);
	projView = mat4.create();

	camera = new ArcballCamera(center, 2, [WIDTH, HEIGHT]);

	var paintSurface = function(mouse, evt) {
		if (numSurfels == null || !brushingMode.checked) {
			return;

		}

		var screen = [(mouse[0] / WIDTH) * 2.0 - 1, 1.0 - 2.0 * (mouse[1] / HEIGHT)];
		var screenP = vec4.set(vec4.create(), screen[0], screen[1], 1.0, 1.0);
		var invProjView = mat4.mul(mat4.create(), proj, camera.camera);
		mat4.invert(invProjView, invProjView);
		var worldPos = vec4.transformMat4(vec4.create(), screenP, invProjView);
		var dir = vec3.set(vec3.create(), worldPos[0], worldPos[1], worldPos[2]);
		dir = vec3.normalize(dir, dir);

		var orig = camera.eyePos();
		orig = vec3.set(vec3.create(), orig[0], orig[1], orig[2]);

		var hit = kdTree.intersect(orig, dir);
		if (hit != null) {
			hitP = hit[0];
			hitPrim = hit[1];
			var brushColor = hexToRGB(brushColorPicker.value);
			var brushedSplats = kdTree.queryNeighbors(hitP, brushRadiusSlider.value,
				function(primID) {
					surfelColors[4 * primID] = brushColor[0];
					surfelColors[4 * primID + 1] = brushColor[1];
					surfelColors[4 * primID + 2] = brushColor[2];
			});
			colorsChanged = true;
			gl.bindBuffer(gl.ARRAY_BUFFER, splatAttribVbo[1]);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, surfelColors);
		}
	};

	// Register mouse and touch listeners
	var controller = new Controller();
	controller.press = paintSurface;

	controller.mousemove = function(prev, cur, evt) {
		mousePos = cur;
		if (evt.buttons == 1) {
			if (!brushingMode.checked) {
				camera.rotate(prev, cur);
			} else {
				paintSurface(cur, evt);
			}
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
	for (v in pointClouds) {
		var opt = document.createElement("option");
		opt.value = v;
		opt.innerHTML = v;
		selector.appendChild(opt);
	}
}

