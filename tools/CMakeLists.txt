cmake_minimum_required(VERSION 3.5)
project(tools)

find_package(sfl REQUIRED)
add_executable(sfl_converter sfl_converter.cpp)
target_link_libraries(sfl_converter sfl)
set_target_properties(sfl_converter PROPERTIES
	CXX_STANDARD 14
	CXX_STANDARD_REQUIRED ON)

