#pragma once

#include <cmath>
#include <string>
#include <vector>
#include "rsf_file.h"

/* The streaming RAW surfel file (.srsf) is a set of files, each containing
 * a sub-tree of the total kd-tree of the original dataset. Sub-tree files
 * are named by their root node id, the root subtree file will be 0.srsf
 * Primitive indices are relative to the file itself, while node ids are global.
 * Thus to find the offset to a node in the file, the root node id of the
 * file should be subtracted from the node id.
 *
 * There are two uint64's, specifying the number of surfels, and the offset to the color values
 * The positions are stored as half-precision vec4's quantized to the sub-tree bounds.
 * The radius is stored as the w component of the positions, also in half-precision.
 * The normals are stored as half-precision vec4's
 * The colors are stored as RGBA8, after the positions/radius/normals data array
 *
 * uint32 nsurfels
 * uint32 surfels_data_offset
 * uint32 num_kd_nodes
 * uint32 num_kd_prim_indices
 * uint32 root_node_id
 * box3f kd_tree_bounds
 * [StreamingKdNode, ...] (kd tree nodes)
 * [uint32, ...] (prim indices)
 * [vec3h position, half radius, vec4h normal, ...] (surfel pos/normal/radius)
 * [rgba8, ...] (surfel colors)
 */
void write_streaming_surfels(const std::string &dirname, const std::vector<Surfel> &surfels);
//void read_streaming_surfels(const std::string &fname, std::vector<Surfel> &surfels);

