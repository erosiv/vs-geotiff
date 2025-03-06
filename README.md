# vs-geotiff

vs-geotiff is a Visual Studio Code extension for viewing `TIFF` and `GeoTIFF` data natively. This extension is primarily intended for displaying floating point data.

This extension was written because existing extensions didn't support floating point `TIFF` data and were unmaintained.

## Features

- Image information in statusbar

![Image Info in Statusbar](image/info.png)

- Renders `TIFF` and `GeoTIFF` files as an editor, with correct alpha clipping of `NaN` and `GDAL_NODATA` values.
- Supports `Float32`, `Float64` and Stripped / Tiled Layout TIFF Files
- Zoom and pan controls, with `CTRL+Scroll` and mouse dragging

<p align="center">
<img alt="Clipped TIFF Render" src="image/render_clip.png" width="50%" align="center"/>
</p>

- Supports various shading schemes for different applications

![Shading Schemes](image/shading.png)

<p align="center">
<img alt="Shading Grayscale" src="image/shade_grayscale.png" width="24%" align="center"/>
<img alt="Shading Turbo" src="image/shade_turbo.png" width="24%" align="center"/>
<img alt="Shading Viridis" src="image/shade_viridis.png" width="24%" align="center"/>
<img alt="Shading Cividis" src="image/shade_cividis.png" width="24%" align="center"/>
<img alt="Shading Cool" src="image/shade_cool.png" width="24%" align="center"/>
<img alt="Shading HSV" src="image/shade_hsv.png" width="24%" align="center"/>
<img alt="Shading Terrain" src="image/shade_terrain.png" width="24%" align="center"/>
<img alt="Shading Rainbow" src="image/shade_rainbow.png" width="24%" align="center"/>
</p>

## Extension Settings

This extension contributes the following settings:

* `vs-geotiff.defaultShading`: Default shading scheme setting

## Known Issues

vs-geotiff currently doesn't render RGB TIFF data correctly. Pull requests are welcome. 

Some tiff files can take longer to load, due to the javascript native TIFF loading library.

## Release Notes

### 0.0.1

Initial Release