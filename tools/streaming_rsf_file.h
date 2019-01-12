#pragma once

#include <cmath>
#include <string>
#include <vector>
#include "rsf_file.h"

/* The streaming RAW surfel file (.srsf) is a set of files, each containing
 * multiple sub-trees of the total kd-tree of the original dataset. Sub-tree files
 * are named by their sub-tree batch id, a separate map file describes which sub-trees
 * are stored in which files.
 * Primitive indices are relative to the file itself, while node ids are global.
 * Thus to find the offset to a node in a sub-tree, the root node id of the
 * file should be subtracted from the node id.
 *
 * The map file is structured as follows:
 *
 * uint32 num_files
 * [{uint32 num_trees, [uint32 root ids, ...]}, ...] (file/sub-tree mapping info)
 *
 * The sub-tree files referred to in the map file are named by their
 * index in the files listing. For example, the first sub-trees file
 * in the array will be file 0.srsf, the second is 1.srsf, etc.
 *
 * Within each sub-tree file, the surfels listed are shared between
 * all the sub-trees. The list of surfels is specified first as an array.
 * Each sub-tree file is as follows:
 *
 * There are two uint32's, specifying the number of surfels, and the offset to the color values
 * The positions are stored as half-precision vec4's quantized to the sub-tree bounds.
 * The radius is stored as the w component of the positions, also in half-precision.
 * The normals are stored as half-precision vec4's
 * The colors are stored as RGBA8, after the positions/radius/normals data array
 *
 * uint32 kd_header_offset
 * uint32 nsurfels
 * [vec3h position, half radius, vec4h normal, ...] (surfel pos/normal/radius)
 * [rgba8, ...] (surfel colors)
 *
 * @kd_header_offset:
 * uint32 num_kd_trees
 * [uint32 sub_tree_offset, ...] (offsets to each sub-tree in the file)
 *
 * Each subtree is then stored at its offset + the kd_header_offset:
 * @kd_header_offset + sub_tree_offset
 * uint32 num_kd_nodes
 * uint32 num_kd_prim_indices
 * uint32 root_node_id
 * box3f kd_tree_bounds
 * [StreamingKdNode, ...] (kd tree nodes)
 * [uint32, ...] (prim indices refer to the shared surfels array)
 */
void write_streaming_surfels(const std::string &dirname, const std::vector<Surfel> &surfels);
//void read_streaming_surfels(const std::string &fname, std::vector<Surfel> &surfels);

