cmake_minimum_required(VERSION 3.16)
project(archopt_engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

find_package(Threads REQUIRED)

add_library(archopt_core STATIC
  src/graph.cpp
  src/evaluate.cpp
  src/optimizer.cpp
  src/io.cpp)
target_include_directories(archopt_core PUBLIC include)
target_link_libraries(archopt_core PUBLIC Threads::Threads)
if(MSVC)
  target_compile_options(archopt_core PRIVATE /W3 /utf-8)
else()
  target_compile_options(archopt_core PRIVATE -Wall -Wextra)
endif()

add_executable(archopt_engine src/main.cpp)
target_link_libraries(archopt_engine PRIVATE archopt_core)

enable_testing()
add_executable(archopt_tests tests/test_engine.cpp)
target_link_libraries(archopt_tests PRIVATE archopt_core)
add_test(NAME engine_unit_tests COMMAND archopt_tests)
