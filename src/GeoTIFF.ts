import * as tiff from 'erosiv-tiff'
import { DataArray } from "erosiv-tiff/lib/types";
import {Bitmap, shade} from './Bitmap'
import * as cmap from "./cmap"

enum BitmapShading {
  None = "None",
  Grayscale = "Grayscale",
  Turbo = "Turbo",
  Viridis = "Viridis"
}

export class GeoTIFF {
  
  private readonly _raw: DataArray;
  private readonly _bytes: number;
  private readonly _min: number;
  private readonly _max: number;
  _bitmap: Bitmap;
  public _shade: BitmapShading;

  constructor(source: Uint8Array | undefined){

    if(source instanceof Uint8Array){

      const ifd = tiff.decode(source)[0]
      const kbytes = source.length/1000;
      const width = ifd.width;
      const height = ifd.height;

      this._raw = ifd.data;
      this._bytes = kbytes;
      this._bitmap = new Bitmap(width, height)
      
      this._min = Number.MAX_VALUE
      this._max = Number.MIN_VALUE
      for(let p = 0; p < width*height; ++p){
        const val = ifd.data[p];
        if(isNaN(val)) 
          continue;
        this._min = Math.min(this._min, val)
        this._max = Math.max(this._max, val)
      }

      this._shade = BitmapShading.Grayscale;
      shade(this._bitmap, cmap.grayscale, this._raw, this._min, this._max)

    } else {

      this._raw = new Float32Array()
      this._bytes = 0
      this._bitmap = new Bitmap(0, 0)
      this._min = 0.0
      this._max = 0.0
      this._shade = BitmapShading.None

    }

  }

  public get bytes() { return this._bytes; }
  public get width() { return this._bitmap._width; }
  public get height() { return this._bitmap._height; }

  public get min() { return this._min }
  public get max() { return this._max }

  //
  // Shading Functions
  //

  public reshade(): Bitmap {

    if(this._shade == BitmapShading.Grayscale){
      this._shade = BitmapShading.Turbo;
      shade(this._bitmap, cmap.turbo, this._raw, this._min, this._max)	
    } else if(this._shade == BitmapShading.Turbo) {
      this._shade = BitmapShading.Viridis;
      shade(this._bitmap, cmap.viridis, this._raw, this._min, this._max)	
    } else {
      this._shade = BitmapShading.Grayscale;
      shade(this._bitmap, cmap.grayscale, this._raw, this._min, this._max)
    }
    return this._bitmap
  }

}