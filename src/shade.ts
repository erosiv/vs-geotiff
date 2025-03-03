import { DataArray } from "tiff/lib/types";

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

};

export function shade(bitmap: Bitmap, scheme: number[][], data: DataArray, min: number, max: number){

  const scheme_size = scheme.length-1

  for (let w = 0; w < bitmap._width; ++w) {
    for (let h = 0; h < bitmap._height; ++h) {

      const offset = Bitmap.header + (h * bitmap._width + w) * 4;
      let val = data[h*bitmap._width + w];
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

      bitmap._data[offset + 0] = 255*color[0];  // R value
      bitmap._data[offset + 1] = 255*color[1];  // G value
      bitmap._data[offset + 2] = 255*color[2];  // B value
      bitmap._data[offset + 3] = 255;					  // A value

    }
  }
}