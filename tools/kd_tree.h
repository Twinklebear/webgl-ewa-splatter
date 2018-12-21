#pragma once

#include <ostream>
#include <glm/glm.hpp>

enum AXIS {X, Y, Z};

struct Box {
	glm::vec3 lower, upper;

	Box();
	void extend(const glm::vec3 &p);
	void box_union(const Box &b);
	AXIS longest_axis() const;
};
std::ostream& operator<<(std::ostream &os, const Box &b);

Box surfel_bounds(const glm::vec3 &center, const glm::vec3 &normal, const float radius);

struct SplatKdTree {
};

