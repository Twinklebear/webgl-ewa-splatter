# WebGL EWA Splatter

An elliptical weighted average (EWA) surface splatter renderer, implemented in WebGL,
which also supports painting on the surfaces.
[Try it out online!](https://www.willusher.io/webgl-ewa-splatter/)
This implements the papers: *Object Space EWA Surface Splatting: A Hardware
Accelerated Approach to High Quality Point Rendering* by Ren, Pfister and Zwicker,
and *High-Quality Point-Based Rendering on Modern GPUs* by Botsch and Kobbelt, with a few shortcuts.
It also uses the deferred shading for splatting approach described
in *High-quality surface splatting on today's GPUs*
by Botsch, Hornung, Zwicker and Kobbelt.

The renderer uses an arcball camera which supports mouse or touch input,
and downloads datasets via XMLHttpRequest from Dropbox when selected.

Built on top of [webgl-util](https://github.com/Twinklebear/webgl-util) for some WebGL utilities,
[glMatrix](http://glmatrix.net/) for matrix/vector operations, and
[FileSaver.js](https://github.com/eligrey/FileSaver.js/) for saving models.

## Images

The Santa from [Pointshop3D](https://graphics.ethz.ch/pointshop3d/), painted using
Pointshop3D.

[![santa](https://i.imgur.com/yqCfPZz.png)](https://www.willusher.io/webgl-ewa-splatter/#Santa)

The Dinosaur from [Pointshop3D](https://graphics.ethz.ch/pointshop3d/).

[![dinosaur](https://i.imgur.com/c6Cj6xa.png)](https://www.willusher.io/webgl-ewa-splatter/#Dinosaur)

The Sankt Johann scan from [University of Stuttgart](http://www.ifp.uni-stuttgart.de/publications/software/laser_splatting/).

[![Sankt Johann](https://i.imgur.com/UBjFKRa.png)](https://www.willusher.io/webgl-ewa-splatter/#Sankt%20Johann)

