import { resizeCompress, convert, stripMeta } from './image.js';

import { merge, split, imagesToPdf, pdfToImages, compressPdf } from './pdf.js';







export const TOOLS = [

  resizeCompress, convert, stripMeta,

  compressPdf, merge, split, imagesToPdf, pdfToImages,

];

export const DEFAULT_TOOL = resizeCompress.id;
