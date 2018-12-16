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
"layout(location=1) in highp vec4 splat_pos_radius;" +
"layout(location=2) in highp vec4 splat_normal;" +
"layout(location=3) in highp vec4 splat_color_in;" +

"uniform bool depth_prepass;" +
"uniform highp vec3 eye_pos;" +
"uniform mat4 proj_view;" +
"uniform float radius_scale;" +
"uniform float scaling;" +

"out highp vec2 uv;" +
"flat out highp vec3 normal;" +
"flat out highp vec3 splat_color;" +

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

"void main(void) {" +
	"mat3 rot_mat = mat3(1.0);" +
	"vec3 quad_normal = vec3(0, 0, 1);" +
	"float scaled_radius = splat_pos_radius.w * radius_scale * scaling;" +
	"uv = 2.0 * pos.xy;" +
	"normal = normalize(splat_normal.xyz);" +
	"splat_color = splat_color_in.xyz;" +
	"if (abs(normal) != quad_normal) {" +
		"vec3 rot_axis = normalize(cross(quad_normal, normal));" +
		"float rot_angle = acos(dot(quad_normal, normal));" +
		"rot_mat = rotation_matrix(rot_axis, rot_angle);" +
	"}" +
	"vec3 sp = rot_mat * scaled_radius * pos + splat_pos_radius.xyz * scaling;" +
	"vec3 view_dir = normalize(sp - eye_pos);" +
	"if (depth_prepass) {" +
		"sp += view_dir * scaled_radius * 0.5;" +
	"}" +
	"gl_Position = proj_view * vec4(sp, 1.0);" +
"}";

var fragShader =
"#version 300 es\n" +
"precision highp int;" +
"precision highp float;\n" +
"#define M_PI 3.1415926535897932384626433832795\n" +

"uniform bool depth_prepass;" +
"in highp vec2 uv;" +
"flat in highp vec3 normal;" +
"flat in highp vec3 splat_color;" +

"layout(location=0) out highp vec4 color;" +
"layout(location=1) out highp vec3 normal_out;" +

"void main(void) {" +
	"highp float len = length(uv);" +
	"if (len > 1.0) {" +
		"discard;" +
	"}" +
	"if (!depth_prepass) {" +
		"highp float opacity = 1.0 / sqrt(2.0 * M_PI) * exp(-pow(len * 2.5, 2.0)/2.0);" +
		"color = vec4(splat_color * opacity, opacity);" +
		"normal_out = opacity * normal;" +
	"}" +
"}";

var quadVertShader =
"#version 300 es\n" +
"const vec4 pos[4] = vec4[4](" +
	"vec4(-1, 1, 0.5, 1)," +
	"vec4(-1, -1, 0.5, 1)," +
	"vec4(1, 1, 0.5, 1)," +
	"vec4(1, -1, 0.5, 1)" +
");" +
"void main(void){" +
	"gl_Position = pos[gl_VertexID];" +
"}";

var normalizationFragShader =
"#version 300 es\n" +
"precision highp int;" +
"precision highp float;" +
"uniform sampler2D splat_colors;" +
"uniform sampler2D splat_normals;" +
"uniform highp vec3 eye_dir;" +
"out highp vec4 color;" +

"float linear_to_srgb(float x) {" +
	"if (x <= 0.0031308) {" +
		"return 12.92 * x;" +
	"}" +
	"return 1.055 * pow(x, 1.0/2.4) - 0.055;" +
"}" +

"void main(void){ " +
	"ivec2 uv = ivec2(gl_FragCoord.xy);" +
	"color = texelFetch(splat_colors, uv, 0);" +
	"if (color.a != 0.0) {" +
		"color.rgb = color.rgb / color.a;" +
		"vec3 normal = normalize(texelFetch(splat_normals, uv, 0).xyz / color.a);" +
		"vec3 light_dir = normalize(vec3(0.5, 0.5, 1));" +
		"vec3 light_dir2 = normalize(vec3(-0.5, 0.25, -0.5));" +
		"float intensity = 0.25;" +
		"if (dot(light_dir, normal) > 0.0) {" +
			"intensity += dot(light_dir, normal);" +
			"highp vec3 h = normalize(normalize(-eye_dir) + light_dir);" +
			"highp float ndoth = dot(h, normal);" +
			"if (ndoth > 0.0) {" +
				"intensity += pow(ndoth, 40.0);" +
			"}" +
		"}" +
		"if (dot(light_dir2, normal) > 0.0) {" +
			"intensity += dot(light_dir2, normal) * 0.5;" +
		"}" +
		"color.rgb *= intensity;" +
	"} else {" +
		"color.rgb = vec3(0.02);" +
	"}" +
	"color.r = linear_to_srgb(color.r);" +
	"color.g = linear_to_srgb(color.g);" +
	"color.b = linear_to_srgb(color.b);" +
	"color.a = 1.0;" +
"}";

var gl = null;
var proj = null;
var camera = null;
var projView = null;
var projViewLoc = null;
var eyePosLoc = null;
var depthPrepasLoc = null;
var splatRadiusScaleLoc = null;
var scalingLoc = null;
var normalizationPassEyeDirLoc = null;

var vao = null;
var splatAttribVbo = null;

var tabFocused = true;
var newPointCloudUpload = true;
var splatShader = null;
var splatAccumColorTex = null;
var splatAccumNormalTex = null;
var splatDepthTex = null;
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
		zoom_start: -30,
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
		scale: 1.0/30.0,
		size: 6448560,
		zoom_start: -20,
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

				gl.useProgram(splatShader);

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

				gl.uniform1f(scalingLoc, surfelDataset.scale);
				gl.uniformMatrix4fv(projViewLoc, false, projView);

				gl.uniform3fv(eyePosLoc, camera.eyePos());

				gl.uniform1f(splatRadiusScaleLoc, splatRadiusSlider.value);

				// Render depth prepass to filter occluded splats
				gl.uniform1i(depthPrepassLoc, 1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, splatAccumFbo);
				gl.depthMask(true);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				gl.colorMask(false, false, false, false);
				gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0,
					splatVerts.length / 3, surfelBuffer.length / sizeofSurfel);

				// Render splat pass to accumulate splats for each pixel
				gl.uniform1i(depthPrepassLoc, 0);
				gl.colorMask(true, true, true, true);
				gl.depthMask(false);
				gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0,
					splatVerts.length / 3, surfelBuffer.length / sizeofSurfel);

				// Render normalization full screen shader pass to produce final image
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				gl.disable(gl.BLEND);
				gl.useProgram(normalizationPassShader);
				var eyeDir = camera.eyeDir();
				gl.uniform3fv(normalizationPassEyeDirLoc, eyeDir);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// Wait for rendering to actually finish so we can time it
				gl.finish();
				var endTime = new Date();
				var renderTime = endTime - startTime;
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

	splatShader = compileShader(vertShader, fragShader);
	gl.useProgram(splatShader);

	eyePosLoc = gl.getUniformLocation(splatShader, "eye_pos");
	projViewLoc = gl.getUniformLocation(splatShader, "proj_view");
	depthPrepassLoc = gl.getUniformLocation(splatShader, "depth_prepass");
	projView = mat4.create();

	splatRadiusSlider.value = 2;
	splatRadiusScaleLoc = gl.getUniformLocation(splatShader, "radius_scale");
	scalingLoc = gl.getUniformLocation(splatShader, "scaling");

	normalizationPassShader = compileShader(quadVertShader, normalizationFragShader);
	gl.useProgram(normalizationPassShader);
	normalizationPassEyeDirLoc = gl.getUniformLocation(normalizationPassShader, "eye_dir");
	gl.uniform1i(gl.getUniformLocation(normalizationPassShader, "splat_colors"), 0);
	gl.uniform1i(gl.getUniformLocation(normalizationPassShader, "splat_normals"), 1);

	// Setup the render targets for the splat rendering pass
	splatDepthTex = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, splatDepthTex);
	gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, WIDTH, HEIGHT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	splatAccumColorTex = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, splatAccumColorTex);
	gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, WIDTH, HEIGHT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	splatAccumNormalTex = gl.createTexture();
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, splatAccumNormalTex);
	gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, WIDTH, HEIGHT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	splatAccumFbo = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, splatAccumFbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D, splatAccumColorTex, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
		gl.TEXTURE_2D, splatAccumNormalTex, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D, splatDepthTex, 0);
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

var getGLExtension = function(ext) {
	if (!gl.getExtension(ext)) {
		alert("Missing " + ext + " WebGL extension");
		return false;
	}
	return true;
}

