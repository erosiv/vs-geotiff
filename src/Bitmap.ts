import { DataArray } from "erosiv-tiff/lib/types";
import * as cmap from "./cmap"

export enum BitmapShading {
  Grayscale = "Grayscale",
  Turbo = "Turbo",
  Viridis = "Viridis",
  Cividis = "Cividis",
  Hot = "Hot",
  Cool = "Cool",
  HSV = "HSV",
  Terrain = "Terrain",
  GISTEarth = "GISTEarth",
  GNUPlot = "GNUPlot",
  Rainbow = "Rainbow"
}

const ShadingMap = {
  "Grayscale": cmap.grayscale,
  "Turbo": cmap.turbo,
  "Viridis": cmap.viridis,
  "Cividis": cmap.cividis,
  "Hot": cmap.hot,
  "Cool": cmap.cool,
  "HSV": cmap.hsv,
  "Terrain": cmap.terrain,
  "GISTEarth": cmap.gist_earth,
  "GNUPlot": cmap.gnuplot,
  "Rainbow": cmap.rainbow
}

export class Bitmap {

  readonly _data: Uint8Array;
  readonly _width: number;
  readonly _height: number;

  public static readonly header: number = 70;

  constructor(
    _width: number,
    _height: number
  ){

    this._width = _width;
    this._height = _height;

    const pixels = _width * _height;
    const image_size = 4 * pixels;

    this._data = new Uint8Array(Bitmap.header + image_size);
    
    const view = new DataView(this._data.buffer);
    view.setUint16(0, 0x424D, false);						// BM magic number.
    view.setUint32(2, this._data.length, true);	// File size.
    view.setUint32(10, Bitmap.header, true);		// Offset to image data.
    view.setUint32(14, 40, true);								// Size of BITMAPINFOHEADER
    view.setInt32(18, this._width, true);				// Width
    view.setInt32(22, this._height, true);			// Height (signed because negative values flip the image vertically).
    view.setUint16(26, 1, true);								// Number of colour planes (colours stored as separate images; must be 1).
    view.setUint16(28, 32, true);								// Bits per pixel.
    view.setUint32(30, 6, true);								// Compression method, 6 = BI_ALPHABITFIELDS
    view.setUint32(34, image_size, true);				// Image size in bytes.
    view.setInt32(38, 10000, true);							// Horizontal resolution, pixels per metre. This will be unused in this situation.
    view.setInt32(42, 10000, true);							// Vertical resolution, pixels per metre.
    view.setUint32(46, 0, true);								// Number of colours. 0 = all
    view.setUint32(50, 0, true);								// Number of important colours. 0 = all
    view.setUint32(54, 0x000000FF, true);				// Red Bitmask
    view.setUint32(58, 0x0000FF00, true);				// Green Bitmask
    view.setUint32(62, 0x00FF0000, true);				// Blue Bitmask
    view.setUint32(66, 0xFF000000, true);				// Alpha Bitmask

  }

  shade(shading: BitmapShading, data: DataArray, min: number, max: number): void {

    const scheme = ShadingMap[shading]
    const scheme_size = scheme.length-1
  
    for (let w = 0; w < this._width; ++w) {
      for (let h = 0; h < this._height; ++h) {
  
        const offset = Bitmap.header + (h * this._width + w) * 4;
        let val = data[h*this._width + w];
        if(isNaN(val)){
          this._data[offset + 0] = 0; // R value
          this._data[offset + 1] = 0; // G value
          this._data[offset + 2] = 0; // B value
          this._data[offset + 3] = 0;	// A value
          continue;
        }
        
        val = (val - min)/(max - min)
        let x = Math.max(0.0, Math.min(1.0, val))
        let a = Math.floor(x*scheme_size)
        let b = Math.min(scheme_size, a + 1)
        let f = x*scheme_size - a
  
        let color = [	
          scheme[a][0] + (scheme[b][0] - scheme[a][0]) * f,
          scheme[a][1] + (scheme[b][1] - scheme[a][1]) * f,
          scheme[a][2] + (scheme[b][2] - scheme[a][2]) * f
        ];
  
        this._data[offset + 0] = 255*color[0];  // R value
        this._data[offset + 1] = 255*color[1];  // G value
        this._data[offset + 2] = 255*color[2];  // B value
        this._data[offset + 3] = 255;					  // A value
  
      }
    }
  }

};