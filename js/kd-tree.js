'use strict';

var KdTree = function(numKdNodes, nodes, primIndices, bounds, surfels) {
	this.numKdNodes = numKdNodes;
	this.nodes = nodes;
	this.nodesFloatView = new Float32Array(nodes.buffer, nodes.byteOffset, nodes.length);
	this.primIndices = primIndices;
	this.bounds = bounds;
	this.surfels = surfels;
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

KdTree.prototype.queryNeighbors = function(pos, radius, callback) {
	if (!boxContainsPoint(this.bounds, pos)) {
		return;
	}

	var radiusSqr = Math.pow(radius, 2.0);
	var splatCenter = vec3.create();
	var splatDist = vec3.create();

	const maxNodeStack = 64;
	// The node indices to traverse next
	var nodeStack = new Uint32Array(maxNodeStack);
	var stackPos = 0;
	var currentNode = 0;
	while (true) {
		if (!nodeIsLeaf(this.nodes, currentNode)) {
			// See which child nodes are touched by the query
			var splitAxis = nodeSplitAxis(this.nodes, currentNode);
			var splitPos = nodeSplitPos(this.nodesFloatView, currentNode);
			var distToSplitSqr = Math.pow(pos[splitAxis] - splitPos, 2.0);

			// Find which child we should traverse first, the low side (left)
			// or the upper side (right) 
			var leftFirst = pos[splitAxis] < splitPos;
			var firstChild, secondChild;
			if (leftFirst) {
				firstChild = currentNode + 1;
				secondChild = nodeRightChild(this.nodes, currentNode);
			} else {
				firstChild = nodeRightChild(this.nodes, currentNode);
				secondChild = currentNode + 1;
			}

			// If we're entirely on one side, just traverse that side
			if (Math.abs(distToSplitSqr) > radiusSqr) {
				currentNode = firstChild;
			} else {
				// We need to do both, push the second child on and traverse the first
				nodeStack[stackPos] = secondChild;
				stackPos += 1;
				currentNode = firstChild;
			}
		} else {
			// It's a leaf, find which primitives are in the query radius
			var offset = nodePrimIndicesOffset(this.nodes, currentNode);
			for (var i = 0; i < nodeNumPrims(this.nodes, currentNode); ++i) {
				var p = this.primIndices[i + offset];
				var radius = this.surfels[8 * p + 3];
				splatCenter = vec3.set(splatCenter, this.surfels[8 * p],
					this.surfels[8 * p + 1], this.surfels[8 * p + 2]);
				splatDist = vec3.sub(splatDist, splatCenter, pos);
				if (vec3.sqrLen(splatDist) <= radiusSqr) {
					callback(p);
				}
			}
			// Pop the next node off the stack
			if (stackPos > 0) {
				stackPos -= 1;
				currentNode = nodeStack[stackPos];
			} else {
				break;
			}
		}
	}
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
	return floatView[2 * i];
}

var nodePrimIndicesOffset = function(nodes, i) {
	return nodes[2 * i];
}

var nodeNumPrims = function(nodes, i) {
	return nodes[2 * i + 1] >> 2;
}

var nodeRightChild = function(nodes, i) {
	return  nodes[2 * i + 1] >> 2;
}

var nodeSplitAxis = function(nodes, i) {
	return nodes[2 * i + 1] & 3;
}

var nodeIsLeaf = function(nodes, i) {
	return  (nodes[2 * i + 1] & 3) == 3;
}

