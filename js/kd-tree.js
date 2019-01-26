'use strict';

const sizeofSurfel = 16;
const sizeofKdNode = 16;

// Create the kd tree from the loaded data buffer containing it
var KdTree = function(dataBuffer) {
	var header = new Uint32Array(dataBuffer, 0, 5);
	this.numSurfels = header[0];
	var surfelsOffset = header[1];
	this.numKdNodes = header[2];
	var numKdPrimIndicies = header[3];
	this.root_node_id = header[4];

	this.bounds = new Float32Array(dataBuffer, 20, 6);

	this.positions = new Uint16Array(dataBuffer, surfelsOffset,
		this.numSurfels * (sizeofSurfel / 2));
	this.colors = new Uint8Array(dataBuffer, surfelsOffset + this.numSurfels * sizeofSurfel);

	// Each kdnode is 4 uint32's big
	this.nodes = new Uint32Array(dataBuffer, header.byteLength + this.bounds.byteLength,
		this.numKdNodes * 4);
	this.nodesFloatView = new Float32Array(this.nodes.buffer, this.nodes.byteOffset,
		this.nodes.length);

	this.primIndices = new Uint32Array(dataBuffer, this.nodes.byteOffset + this.nodes.byteLength,
		numKdPrimIndicies);

	// Any asynchronously subtrees of this tree.
	// TODO: Is it better to keep these just in the root so we have
	// a single place to evict? Or it's simpler to keep them in the parent
	// subtree? The latter might be simpler actually.
	this.subtrees = {}
	this.loading = {}

	// Scratch space to use when querying, enough to hold one leaf in the tree
	this.scratchPos = new Uint16Array(128 * (sizeofSurfel / 2));
	this.scratchColor = new Uint8Array(128 * 4);

	this.nodeStack = new Uint32Array(64);
	this.nodeStackDepths = new Uint32Array(64);
	// Bounding boxes for the node traversal
	this.nodeStackBoxes = new Float32Array(64 * 6);
}

// For testing: Load all surfels from a specific level of the tree, and return
// the combined position and attribute buffers for rendering
KdTree.prototype.queryLevel = function(level, query) {
	if (!query) {
		query = {
			pos: new Buffer(128 * 2, "uint16"),
			color: new Buffer(128 * 4, "uint8"),
		};
	}

	var stackPos = 0;
	var currentNode = 0;
	var currentDepth = 0;
	var currentBounds = new Float32Array(6);
	currentBounds.set(this.bounds);

	while (true) {
		var loadedSurfels = 0;
		if (currentDepth == level || nodeIsLeaf(this.nodes, currentNode)) {
			// If we've reached the desired level or the bottom of the tree,
			// append this nodes surfel(s) to the list to be returned
			var primOffset = nodePrimIndicesOffset(this.nodes, currentNode);
			if (!nodeIsLeaf(this.nodes, currentNode)) {
				loadedSurfels = 1;
				for (var i = 0; i < sizeofSurfel / 2; ++i) {
					this.scratchPos[i] = this.positions[primOffset * (sizeofSurfel / 2) + i]
				}
				for (var i = 0; i < 4; ++i) {
					this.scratchColor[i] = this.colors[primOffset * 4 + i]
				}
			} else {
				var numPrims = nodeNumPrims(this.nodes, currentNode);
				loadedSurfels = numPrims;
				if (numPrims * sizeofSurfel > this.scratchPos.byteLength) {
					this.scratchPos = new Uint16Array(numPrims * (sizeofSurfel / 2));
					this.scratchColor = new Uint8Array(numPrims * 4);
				}
				for (var p = 0; p < numPrims; ++p) {
					var prim = this.primIndices[primOffset + p];
					for (var i = 0; i < sizeofSurfel / 2; ++i) {
						this.scratchPos[p * (sizeofSurfel / 2) + i] = this.positions[prim * (sizeofSurfel / 2) + i]
					}
					for (var i = 0; i < 4; ++i) {
						this.scratchColor[p * 4 + i] = this.colors[prim * 4 + i]
					}
				}
			}
		} else if (currentDepth < level) {
			var children = [nodeLeftChild(this.nodes, currentNode),
				nodeRightChild(this.nodes, currentNode)];
			var external = [leftChildExternal(this.nodes, currentNode),
				rightChildExternal(this.nodes, currentNode)];

			var splitPos = nodeSplitPos(this.nodesFloatView, currentNode);
			var splitAxis = nodeSplitAxis(this.nodes, currentNode);

			// If neither child is external push them onto the stack and traverse them
			if (!external[0] && !external[1]) {
				this.nodeStack[stackPos] = children[1];
				this.nodeStackDepths[stackPos] = currentDepth + 1;
				this.nodeStackBoxes.set(currentBounds, stackPos * 6);
				this.nodeStackBoxes[stackPos * 6 + splitAxis] = splitPos;
				stackPos += 1;

				currentNode = children[0];
				currentDepth += 1;
				currentBounds[3 + splitAxis] = splitPos;
				continue;
			} else {
				// Otherwise, one or both children are external and we need to find
				// their subtree and traverse it or start loading it.
				for (var i = 0; i < 2; ++i) {
					if (external[i]) {
						// If we've loaded this subtree, traverse it, otherwise request it if
						// we're not already trying to load it
						if (this.subtrees[children[i]]) {
							query = this.subtrees[children[i]].queryLevel(level - currentDepth - 1, query);
						} else {
							// Show the parent LOD surfel as a placehold while we load
							var primOffset = nodePrimIndicesOffset(this.nodes, currentNode);
							loadedSurfels = 1;
							for (var j = 0; j < sizeofSurfel / 2; ++j) {
								this.scratchPos[j] = this.positions[primOffset * (sizeofSurfel / 2) + j]
							}
							for (var j = 0; j < 4; ++j) {
								this.scratchColor[j] = this.colors[primOffset * 4 + j]
							}

							// Request to load the subtree if we're not already doing so, and
							// have not hit the request rate limit we're setting
							if (!this.loading[children[i]] && activeLoadRequests < 8) {
								this.loading[children[i]] = 1;
								var dataset = {
									url: "tools/build/" + children[i] + ".srsf",
									testing: true,
									tree: children[i]
								};
								var self = this;
								loadKdTree(dataset, function(ds, buffer) {
									self.subtrees[ds.tree] = new KdTree(buffer);
									self.loading[ds.tree] = null;
								});
							}
						}
					} else {
						// This won't happen b/c of how I build the trees
						alert("ERROR: mixed external/internal node");
					}
				}
			}
		}

		// Take the surfels we took from the interior nodes or leaves and
		// append them to our output buffer.
		if (loadedSurfels > 0) {
			var pos = this.scratchPos.subarray(0, loadedSurfels * (sizeofSurfel / 2));
			var color = this.scratchColor.subarray(0, loadedSurfels * 4);
			query.pos.append(pos);
			query.color.append(color);
		}

		// In the first two cases of the if we've hit the bottom of
		// what we can traverse in this tree, and should pop the stack
		if (stackPos > 0) {
			stackPos -= 1;
			currentNode = this.nodeStack[stackPos];
			currentDepth = this.nodeStackDepths[stackPos];
			for (var i = 0; i < 6; ++i) {
				currentBounds[i] = this.nodeStackBoxes[stackPos * 6 + i];
			}
		} else {
			break;
		}
	}
	return query;
}

KdTree.prototype.queryFrustum = function(frustum, eyePos, level, query) {
	if (!query) {
		query = {
			pos: new Buffer(128 * 2, "uint16"),
			color: new Buffer(128 * 4, "uint8"),
		};
	}
	if (!frustum.containsBox(this.bounds)) {
		return query;
	}

	var boxLower = vec4.create();
	var boxUpper = vec4.create();
	vec4.set(boxLower, this.bounds[0], this.bounds[1], this.bounds[2], 1.0);
	vec4.set(boxUpper, this.bounds[3], this.bounds[4], this.bounds[5], 1.0);
	boxUpper = vec4.transformMat4(boxUpper, boxUpper, projView);
	boxUpper[0] /= boxUpper[3];
	boxUpper[1] /= boxUpper[3];
	boxUpper[2] /= boxUpper[3];
	boxUpper[3] = 1.0;
	console.log(boxUpper);

	boxLower = vec4.transformMat4(boxLower, boxLower, projView);
	boxLower[0] /= boxLower[3];
	boxLower[1] /= boxLower[3];
	boxLower[2] /= boxLower[3];
	boxLower[3] = 1.0;
	console.log(boxLower);

	var boxDiag = vec4.create();
	vec4.sub(boxDiag, boxUpper, boxLower);
	console.log(boxDiag);
	console.log("Root touches " + vec4.len(boxDiag) + " pixels via upper/lower?");

	vec4.set(boxDiag, this.bounds[3] - this.bounds[0],
		this.bounds[4] - this.bounds[1],
		this.bounds[5] - this.bounds[2], 0.0);
	// Determine the pixel footprint of the child node
	boxDiag = vec4.transformMat4(boxDiag, boxDiag, projView);
	console.log(boxDiag);
	console.log("Root touches " + vec4.len(boxDiag) + " pixels");

	var stackPos = 0;
	var currentNode = 0;
	var currentDepth = 0;
	var currentBounds = new Float32Array(6);
	currentBounds.set(this.bounds);

	var scratchBounds = new Float32Array(6);
	while (true) {
		var loadedSurfels = 0;
		// Any leaf nodes within the frustum we just take the surfels and render
		if (currentDepth == level || nodeIsLeaf(this.nodes, currentNode)) {
			// If we've reached the desired level or the bottom of the tree,
			// append this nodes surfel(s) to the list to be returned
			var primOffset = nodePrimIndicesOffset(this.nodes, currentNode);
			if (!nodeIsLeaf(this.nodes, currentNode)) {
				loadedSurfels = 1;
				for (var i = 0; i < sizeofSurfel / 2; ++i) {
					this.scratchPos[i] = this.positions[primOffset * (sizeofSurfel / 2) + i]
				}
				for (var i = 0; i < 4; ++i) {
					this.scratchColor[i] = this.colors[primOffset * 4 + i]
				}
			} else {
				var numPrims = nodeNumPrims(this.nodes, currentNode);
				loadedSurfels = numPrims;
				if (numPrims * sizeofSurfel > this.scratchPos.byteLength) {
					this.scratchPos = new Uint16Array(numPrims * (sizeofSurfel / 2));
					this.scratchColor = new Uint8Array(numPrims * 4);
				}
				for (var p = 0; p < numPrims; ++p) {
					var prim = this.primIndices[primOffset + p];
					for (var i = 0; i < sizeofSurfel / 2; ++i) {
						this.scratchPos[p * (sizeofSurfel / 2) + i] = this.positions[prim * (sizeofSurfel / 2) + i]
					}
					for (var i = 0; i < 4; ++i) {
						this.scratchColor[p * 4 + i] = this.colors[prim * 4 + i]
					}
				}
			}
		} else {
			var splitPos = nodeSplitPos(this.nodesFloatView, currentNode);
			var splitAxis = nodeSplitAxis(this.nodes, currentNode);

			var childVisible = [false, false];
			// Check if the left/right child are visible and within the
			// pixel footprint LOD threshold
			scratchBounds.set(currentBounds);
			scratchBounds[3 + splitAxis] = splitPos;
			childVisible[0] = frustum.containsBox(scratchBounds);
			vec4.set(boxDiag, scratchBounds[3] - scratchBounds[0],
				scratchBounds[4] - scratchBounds[1],
				scratchBounds[5] - scratchBounds[2], 0);
			// Determine the pixel footprint of the child node
			boxDiag = vec4.transformMat4(boxDiag, boxDiag, projView);
			childVisible[0] = childVisible[0] && vec4.len(boxDiag) > 2.0;


			scratchBounds.set(currentBounds);
			scratchBounds[splitAxis] = splitPos;
			childVisible[1] = frustum.containsBox(scratchBounds);
			vec4.set(boxDiag, scratchBounds[3] - scratchBounds[0],
				scratchBounds[4] - scratchBounds[1],
				scratchBounds[5] - scratchBounds[2], 0);
			// Determine the pixel footprint of the child node
			boxDiag = vec4.transformMat4(boxDiag, boxDiag, projView);
			childVisible[1] = childVisible[1] && vec4.len(boxDiag) > 2.0;

			var children = [nodeLeftChild(this.nodes, currentNode),
				nodeRightChild(this.nodes, currentNode)];
			var external = [leftChildExternal(this.nodes, currentNode),
				rightChildExternal(this.nodes, currentNode)];

			// If neither child is external push them onto the stack and traverse them
			if (!external[0] && !external[1]) {
				// If both children are visible, traverse the closer one first
				if (childVisible[0] && childVisible[1]) {
					this.nodeStack[stackPos] = children[1];
					this.nodeStackDepths[stackPos] = currentDepth + 1;
					this.nodeStackBoxes.set(currentBounds, stackPos * 6);
					this.nodeStackBoxes[stackPos * 6 + splitAxis] = splitPos;
					stackPos += 1;

					currentNode = children[0];
					currentDepth += 1;
					currentBounds[3 + splitAxis] = splitPos;
				} else if (childVisible[0]) {
					currentNode = children[0];
					currentDepth += 1;
					currentBounds[3 + splitAxis] = splitPos;
				} else if (childVisible[1]) {
					currentNode = children[1];
					currentDepth += 1;
					currentBounds[splitAxis] = splitPos;
				}
				if (childVisible[0] || childVisible[1]) {
					continue;
				}
			} else {
				// Otherwise, one or both children are external and we need to find
				// their subtree and traverse it or start loading it.
				for (var i = 0; i < 2; ++i) {
					if (external[i]) {
						if (!childVisible[i]) {
							continue;
						}
						// If we've loaded this subtree, traverse it, otherwise request it if
						// we're not already trying to load it
						if (this.subtrees[children[i]]) {
							query = this.subtrees[children[i]].queryFrustum(frustum, eyePos,
								level - currentDepth - 1, query);
						} else {
							// Show the parent LOD surfel as a placehold while we load
							var primOffset = nodePrimIndicesOffset(this.nodes, currentNode);
							loadedSurfels = 1;
							for (var j = 0; j < sizeofSurfel / 2; ++j) {
								this.scratchPos[j] = this.positions[primOffset * (sizeofSurfel / 2) + j]
							}
							for (var j = 0; j < 4; ++j) {
								this.scratchColor[j] = this.colors[primOffset * 4 + j]
							}

							// Request to load the subtree if we're not already doing so, and
							// have not hit the request rate limit we're setting
							if (!this.loading[children[i]] && activeLoadRequests < 8) {
								this.loading[children[i]] = 1;
								var dataset = {
									url: "tools/build/" + children[i] + ".srsf",
									testing: true,
									tree: children[i]
								};
								var self = this;
								loadKdTree(dataset, function(ds, buffer) {
									self.subtrees[ds.tree] = new KdTree(buffer);
									self.loading[ds.tree] = null;
								});
							}
						}
					} else {
						// This won't happen b/c of how I build the trees
						alert("ERROR: mixed external/internal node");
					}
				}
			}
		}

		// Take the surfels we took from the interior nodes or leaves and
		// append them to our output buffer.
		if (loadedSurfels > 0) {
			var pos = this.scratchPos.subarray(0, loadedSurfels * (sizeofSurfel / 2));
			var color = this.scratchColor.subarray(0, loadedSurfels * 4);
			query.pos.append(pos);
			query.color.append(color);
		}

		// In the first two cases of the if we've hit the bottom of
		// what we can traverse in this tree, and should pop the stack
		if (stackPos > 0) {
			stackPos -= 1;
			currentNode = this.nodeStack[stackPos];
			currentDepth = this.nodeStackDepths[stackPos];
			for (var i = 0; i < 6; ++i) {
				currentBounds[i] = this.nodeStackBoxes[stackPos * 6 + i];
			}
		} else {
			break;
		}
	}
	return query;
}

var intersectBox = function(box, rayOrig, invDir, negDir) {
	// Check X & Y intersection
	var tmin = (box[3 * negDir[0]] - rayOrig[0]) * invDir[0];
	var tmax = (box[3 * (1 - negDir[0])] - rayOrig[0]) * invDir[0];

	var tymin = (box[3 * negDir[1] + 1] - rayOrig[1]) * invDir[1];
	var tymax = (box[3 * (1 - negDir[1]) + 1] - rayOrig[1]) * invDir[1];

	if (tmin > tymax || tymin > tmax) {
		return null;
	}
	if (tymin > tmin) {
		tmin = tymin;
	}
	if (tymax < tmax) {
		tmax = tymax;
	}

	// Check Z intersection
	var tzmin = (box[3 * negDir[2] + 2] - rayOrig[2]) * invDir[2];
	var tzmax = (box[3 * (1 - negDir[2]) + 2] - rayOrig[2]) * invDir[2];
	if (tmin > tzmax || tzmin > tmax) {
		return null;
	}
	if (tzmin > tmin) {
		tmin = tzmin;
	}
	if (tzmax < tmax) {
		tmax = tzmax;
	}
	// We're only testing with the initial ray against the kd tree bounds,
	// so we know the ray tMax = INF and tMin = 0, so this will always be
	// a hit if we reach this point. Just keep tmin within the valid ray interval
	if (tmin < 0) {
		tmin = 0;
	}
	return [tmin, tmax];
}

var boxContainsPoint = function(box, point) {
	return point[0] >= box[0] && point[0] <= box[3]
		&& point[1] >= box[1] && point[1] <= box[4]
		&& point[2] >= box[2] && point[2] <= box[5];
}

var intersectDisk = function(orig, dir, tMax, center, normal, radius) {
	var d = vec3.sub(vec3.create(), center, orig);
	var t = vec3.dot(d, normal) / vec3.dot(dir, normal);
	if (t > 0.0 && t < tMax) {
		var hitP = vec3.add(d, orig, vec3.scale(d, dir, t));
		var v = vec3.sub(vec3.create(), hitP, center);
		var dist = vec3.len(v);
		if (dist <= radius) {
			return t;
		}
	}
	return -1.0;
}

// The node functions each take the list of nodes, and the
// index to query. Node split pos is unique in that it must take
// a float view of the array to return the split position
var nodeSplitPos = function(floatView, i) {
	return floatView[4 * i];
}

var nodePrimIndicesOffset = function(nodes, i) {
	return nodes[4 * i + 1];
}

var nodeRightChild = function(nodes, i) {
	return  nodes[4 * i + 2] >> 1;
}

var rightChildExternal = function(nodes, i) {
	return  nodes[4 * i + 2] & 1;
}

var nodeLeftChild = function(nodes, i) {
	return  nodes[4 * i + 3] >> 3;
}

var leftChildExternal = function(nodes, i) {
	return  nodes[4 * i + 3] & 4;
}

var nodeNumPrims = function(nodes, i) {
	return nodes[4 * i + 3] >> 2;
}

var nodeSplitAxis = function(nodes, i) {
	return nodes[4 * i + 3] & 3;
}

var nodeIsLeaf = function(nodes, i) {
	return  (nodes[4 * i + 3] & 3) == 3;
}

