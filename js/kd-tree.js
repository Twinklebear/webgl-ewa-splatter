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
}

// For testing: Load all surfels from a specific level of the tree, and return
// the combined position and attribute buffers for rendering
KdTree.prototype.queryLevel = function(level) {
	// TODO: We incur a ton of memory allocation and de-allocation doing the
	// traversal and configuration this way. There should be some way to
	// re-use the splatpos buffers better, so that after loading the initial
	// set for some viewpoint when we re-query or re-build for small view changes
	// we don't need to re-allocate and re-build everything.
	var splatPos = null;
	var splatColors = null;

	// TODO: It will probably be more efficient to merge the traversal
	// of this tree and all asynchronously loaded subtrees into a single
	// function call, so we can re-use the stack much more.

	const maxNodeStack = 64;
	// The node indices to traverse next
	var nodeStack = new Uint32Array(maxNodeStack);
	var nodeStackDepths = new Uint32Array(maxNodeStack);

	var stackPos = 0;
	var currentNode = 0;
	var currentDepth = 0;
	while (true) {
		if (currentDepth == level || nodeIsLeaf(this.nodes, currentNode)) {
			// If we've reached the desired level or the bottom of the tree,
			// append this nodes surfel(s) to the list to be returned
			var pos = null;
			var color = null;
			var primOffset = nodePrimIndicesOffset(this.nodes, currentNode);
			if (!nodeIsLeaf(this.nodes, currentNode)) {
				pos = new Uint16Array(sizeofSurfel / 2);
				color = new Uint8Array(4);
				for (var i = 0; i < sizeofSurfel / 2; ++i) {
					pos[i] = this.positions[primOffset * (sizeofSurfel / 2) + i]
				}
				for (var i = 0; i < 4; ++i) {
					color[i] = this.colors[primOffset * 4 + i]
				}
			} else {
				var numPrims = nodeNumPrims(this.nodes, currentNode);
				pos = new Uint16Array((sizeofSurfel / 2) * numPrims);
				color = new Uint8Array(4 * numPrims);
				for (var p = 0; p < numPrims; ++p) {
					var prim = this.primIndices[p];
					for (var i = 0; i < sizeofSurfel / 2; ++i) {
						pos[i] = this.positions[prim * (sizeofSurfel / 2) + i]
					}
					for (var i = 0; i < 4; ++i) {
						color[i] = this.colors[prim * 4 + i]
					}
				}
			}
			if (splatPos == null) {
				splatPos = pos;
				splatColors = color;
			} else {
				splatPos = appendTypedArray(splatPos, pos);
				splatColors = appendTypedArray(splatColors, color);
			}
		} else if (currentDepth < level) {
			var children = [nodeLeftChild(this.nodes, currentNode),
				nodeRightChild(this.nodes, currentNode)];
			var external = [leftChildExternal(this.nodes, currentNode),
				rightChildExternal(this.nodes, currentNode)];

			// If neither child is external push them onto the stack and traverse them
			if (!external[0] && !external[1]) {
				nodeStack[stackPos] = children[1];
				nodeStackDepths[stackPos] = currentDepth + 1;
				stackPos += 1;

				currentNode = children[0];
				currentDepth += 1;
				continue;
			} else {
				// Otherwise, one or both children are external and we need to find
				// their subtree and traverse it or start loading it.
				for (var i = 0; i < 2; ++i) {
					if (external[i]) {
						// If we've loaded this subtree, traverse it, otherwise request it if
						// we're not already trying to load it
						if (this.subtrees[children[i]]) {
							var st = this.subtrees[children[i]].queryLevel(level - currentDepth - 1);
							if (st[0] != null) {
								if (splatPos == null) {
									splatPos = st[0];
									splatColors = st[1];
								} else {
									splatPos = appendTypedArray(splatPos, st[0]);
									splatColors = appendTypedArray(splatColors, st[1]);
								}
							}
						} else if (!this.loading[children[i]]) {
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
					} else {
						// TODO: This won't happen b/c of how I build the trees
						console.log("mixed external/internal node");
						// If it's not external then we know it's the only non-external one
						// and we can traverse it next
						currentNode = children[i];
						currentDepth += 1;
					}
				}
				// We did have one local node that we should traverse which we
				// set as our currentNode, so go traverse it.
				if (!external[0] || !external[1]) {
					continue;
				}
			}
		}
		// In the first two cases of the if we've hit the bottom of
		// what we can traverse in this tree, and should pop the stack
		if (stackPos > 0) {
			stackPos -= 1;
			currentNode = nodeStack[stackPos];
			currentDepth = nodeStackDepths[stackPos];
		} else {
			break;
		}
	}
	return [splatPos, splatColors];
}

KdTree.prototype.intersect = function(rayOrig, rayDir) {
	var invDir = vec3.inverse(vec3.create(), rayDir);
	var negDir = [rayDir[0] < 0 ? 1 : 0, rayDir[1] < 0 ? 1 : 0, rayDir[2] < 0 ? 1 : 0];

	var tRange = intersectBox(this.bounds, rayOrig, invDir, negDir);
	if (tRange == null) {
		return null;
	}

	var tHit = Number.POSITIVE_INFINITY;
	var hitPrim = -1;
	var splatCenter = vec3.create();
	var splatNormal = vec3.create();

	const maxNodeStack = 64;
	// The node indices to traverse next
	var nodeStack = new Uint32Array(maxNodeStack);
	// The t ranges of the nodes to be traversed
	var nodeStackTvals = new Float32Array(maxNodeStack * 2);
	var stackPos = 0;
	var currentNode = 0;
	while (true) {
		// Break if we found a closer hit
		if (tHit < tRange[0]) {
			break;
		}

		if (!nodeIsLeaf(this.nodes, currentNode)) {
			// Intersect with the interior node splitting plane
			var splitAxis = nodeSplitAxis(this.nodes, currentNode);
			var splitPos = nodeSplitPos(this.nodesFloatView, currentNode);
			var tPlane = (splitPos - rayOrig[splitAxis]) * invDir[splitAxis];

			// Find which child we should traverse first, the low side (left)
			// or the upper side (right) 
			var leftFirst = rayOrig[splitAxis] < splitPos
				|| (rayOrig[splitAxis] == splitPos && rayDir[splitAxis] <= 0.0);

			var firstChild, secondChild;
			if (leftFirst) {
				firstChild = currentNode + 1;
				secondChild = nodeRightChild(this.nodes, currentNode);
			} else {
				firstChild = nodeRightChild(this.nodes, currentNode);
				secondChild = currentNode + 1;
			}

			// See which nodes we actually need to traverse, based on the t range
			// intersected by the ray
			if (tPlane > tRange[1] || tPlane <= 0) {
				currentNode = firstChild;
			} else if (tPlane < tRange[0]) {
				currentNode = secondChild;
			} else {
				// We need to do both, push the second child on and traverse the first
				nodeStack[stackPos] = secondChild;
				nodeStackTvals[2 * stackPos] = tPlane;
				nodeStackTvals[2 * stackPos + 1] = tRange[1];
				stackPos += 1;

				currentNode = firstChild;
				tRange[1] = tPlane;
			}
		} else {
			// It's a leaf, intersect with its primitives
			var offset = nodePrimIndicesOffset(this.nodes, currentNode);
			for (var i = 0; i < nodeNumPrims(this.nodes, currentNode); ++i) {
				var p = this.primIndices[i + offset];
				var radius = this.surfels[8 * p + 3];
				splatCenter = vec3.set(splatCenter, this.surfels[8 * p],
					this.surfels[8 * p + 1], this.surfels[8 * p + 2]);
				splatNormal = vec3.set(splatNormal, this.surfels[8 * p + 4],
					this.surfels[8 * p + 5], this.surfels[8 * p + 6]);
				var t = intersectDisk(rayOrig, rayDir, tHit, splatCenter, splatNormal, radius);
				if (t >= 0.0) {
					tHit = t;
					hitPrim = p;
				}
			}
			// Pop the next node off the stack
			if (stackPos > 0) {
				stackPos -= 1;
				currentNode = nodeStack[stackPos];
				tRange[0] = nodeStackTvals[2 * stackPos];
				tRange[1] = nodeStackTvals[2 * stackPos + 1];
			} else {
				break;
			}
		}
	}

	if (tHit < Number.POSITIVE_INFINITY) {
		var hitP = vec3.create();
		var hitP = vec3.add(hitP, rayOrig, vec3.scale(hitP, rayDir, tHit));
		return [hitP, hitPrim];
	}
	return null;
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

