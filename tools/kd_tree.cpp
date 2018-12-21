#include <iostream>
#include <glm/glm.hpp>
#include <glm/ext.hpp>
#include "kd_tree.h"

Box::Box() : lower(std::numeric_limits<float>::infinity()),
	upper(-std::numeric_limits<float>::infinity())
{}
void Box::extend(const glm::vec3 &p) {
	lower = glm::min(lower, p);
	upper = glm::max(upper, p);
}
void Box::box_union(const Box &b) {
	extend(b.lower);
	extend(b.upper);
}
AXIS Box::longest_axis() const {
	const glm::vec3 diag = upper - lower;
	if (diag.x >= diag.y && diag.x >= diag.z) {
		return X;
	}
	if (diag.y >= diag.z) {
		return Y;
	}
	return Z;
}
std::ostream& operator<<(std::ostream &os, const Box &b) {
	os << "Box [" << glm::to_string(b.lower) << ", "
		<< glm::to_string(b.upper) << "]";
	return os;
}

Box surfel_bounds(const glm::vec3 &center, const glm::vec3 &normal, const float radius) {
	glm::vec3 ax0 = glm::normalize(glm::cross(normal, glm::vec3(1, 0, 0)));
	glm::vec3 ax1 = glm::normalize(glm::cross(normal, ax0));
	ax0 = glm::normalize(glm::cross(normal, ax1));
	Box b;
	b.extend(center + radius * ax0);
	b.extend(center - radius * ax0);
	b.extend(center + radius * ax1);
	b.extend(center - radius * ax1);
	b.extend(center + normal * 0.0001);
	b.extend(center - normal * 0.0001);
	std::cout << "surfel center: " << glm::to_string(center)
		<< " coordinate frame: "
		<< "\nn = " << glm::to_string(normal)
		<< "\nax0 = " << glm::to_string(ax0)
		<< "\nax1 = " << glm::to_string(ax1)
		<< "\nboudsn: " << b;
	return b;

}

