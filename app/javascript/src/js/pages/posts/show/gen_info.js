/**
 * GenInfo Extractor
 *
 * Extracts generation parameters from image files:
 * - PNG: tEXt, zTXt and iTxt chunks
 * - WebP: EXIF UserComment
 * - JPEG: EXIF UserComment
 * - Reforge "stealth info" in PNG or WEBP colour or alpha channels
 */

const GenInfo = {};

GenInfo.decompress = async (data, encoding) => {
  return new Response(new Blob([data]).stream().pipeThrough(
    new DecompressionStream(encoding))).arrayBuffer();
};

/**
 * Parse PNG chunks from an ArrayBuffer
 */
GenInfo.parsePngChunks = async function (buffer) {
  const view = new DataView(buffer);

  // PNG signature: 0x89 P N G \r \n 0x1A \n
  const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (view.getUint8(i) !== PNG_SIGNATURE[i]) {
      return [];
    }
  }

  let offset = PNG_SIGNATURE.length; // Skip signature

  const latin1 = new TextDecoder("latin1");
  const utf8 = new TextDecoder("utf-8");

  const info = [];
  while (offset < buffer.byteLength - 12) { // Need at least 12 bytes for a chunk
    const length = view.getUint32(offset);
    const typeBytes = new Uint8Array(buffer, offset + 4, 4);
    const type = String.fromCharCode(...typeBytes);

    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      let chunk = new Uint8Array(buffer, offset + 8, Math.min(length, buffer.byteLength - offset - 12));

      let nullIndex = chunk.indexOf(0);
      let keyword = latin1.decode(chunk.subarray(0, nullIndex));
      chunk = chunk.subarray(nullIndex + 1);

      let textDecoder = latin1;
      if (type === "iTXt") {
        const isCompressed = chunk[0];
        // Next byte is the compression type, it's always 0 for DEFLATE
        // Next bytes to null terminator are for the language tag we don't care about
        nullIndex = chunk.indexOf(0, 2);
        chunk = chunk.subarray(nullIndex + 1);

        // Next bytes to null terminator is the translated keyword, we'll use it
        nullIndex = chunk.indexOf(0);
        const translatedKeyword = utf8.decode(chunk.subarray(0, nullIndex));
        if (translatedKeyword) {
          keyword += ` (${translatedKeyword})`;
        }

        // After that is the compressed text
        chunk = chunk.subarray(nullIndex + 1);
        if (isCompressed) {
          chunk = await GenInfo.decompress(chunk, "deflate");
        }

        textDecoder = utf8;
      } else if (type === "zTXt") {
        // Next byte is the compression type, it's always 0 for DEFLATE
        chunk = chunk.subarray(1);
        // After that is the compressed text
        chunk = await GenInfo.decompress(chunk, "deflate");
      } // else tEXt, no special handling

      info.push({
        keyword: keyword,
        text: textDecoder.decode(chunk),
      });
    }

    // Move to next chunk: 4 (length) + 4 (type) + length (data) + 4 (CRC)
    offset += 12 + length;
  }

  return info;
};

/**
 * Parse WebP chunks from an ArrayBuffer
 * https://developers.google.com/speed/webp/docs/riff_container
 */
GenInfo.parseWebPChunks = function (buffer) {
  const view = new DataView(buffer);

  // WebP header: RIFF <int size> WEBP
  const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
  for (let i = 0; i < RIFF_SIGNATURE.length; i++) {
    if (view.getUint8(i) !== RIFF_SIGNATURE[i]) {
      return [];
    }
  }
  let offset = RIFF_SIGNATURE.length;

  const fileSize = view.getUint32(offset, true);
  offset += 4;

  const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];
  for (let i = 0; i < WEBP_SIGNATURE.length; i++) {
    if (view.getUint8(offset + i) !== WEBP_SIGNATURE[i]) {
      return [];
    }
  }
  offset += WEBP_SIGNATURE.length;

  // List of RIFF chunks (fourCC size body)
  let info = [];
  while (offset < fileSize - 8) { // Need at least 8 bytes for a chunk
    const fourCC = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    const name = String.fromCharCode(
      fourCC & 0xFF,
      (fourCC >> 8) & 0xFF,
      (fourCC >> 16) & 0xFF,
      (fourCC >> 24) & 0xFF,
    );
    console.log(name);
    if (name == "EXIF") {
      info = info.concat(GenInfo.parseExifUserComment(buffer, offset + 8, size));
    }

    // Spec: If Chunk Size is odd, a single padding byte -- which MUST be 0 to conform with RIFF -- is added.
    const padding = size & 1;
    // Move to next chunk: 4 (fourCC) + 4 (size) + padding + size
    offset += 8 + size + padding;
  }

  return info;
};

/**
 * Parse JPEG EXIF UserComment from an ArrayBuffer.
 * Follows the same approach as piexif: find APP1, walk IFD0 -> ExifIFD -> UserComment.
 * Returns chunks array compatible with PNG output format.
 */
GenInfo.parseJpegUserComment = function (buffer) {
  const view = new DataView(buffer);

  // Verify JPEG SOI marker
  if (view.getUint16(0) !== 0xFFD8) {
    return [];
  }

  let info = [];

  // Find APP1 (Exif) marker
  let offset = 2;
  while (offset < buffer.byteLength - 4) {
    const marker = view.getUint16(offset);
    if (marker === 0xFFE1) {
      const segmentLength = view.getUint16(offset + 2);
      const segmentStart = offset + 4;

      // Check for "Exif\0\0" header
      if (view.getUint32(segmentStart) === 0x45786966 // "Exif"
        && view.getUint16(segmentStart + 4) === 0x0000) {
        info = info.concat(GenInfo.parseExifUserComment(buffer, segmentStart + 6, segmentLength - 2));
      }
    }

    // Not APP1 or not Exif — skip this segment
    if ((marker & 0xFF00) !== 0xFF00) {
      break; // Not a valid marker
    }

    const len = view.getUint16(offset + 2);
    offset += 2 + len;
  }

  return info;
};

/**
 * Parse EXIF IFDs to extract UserComment.
 */
GenInfo.parseExifUserComment = function (buffer, start, length) {
  let view = new DataView(buffer, start, length);

  // EXIF constants
  const EXIF_IFD_TAG = 0x8769;
  const USER_COMMENT_TAG = 0x9286;

  // Read byte order
  const byteOrder = view.getUint16(0);
  const le = byteOrder === 0x4949; // "II" = little-endian

  const getU16 = off => view.getUint16(off, le);
  const getU32 = off => view.getUint32(off, le);

  // IFD0 offset (from TIFF header)
  const ifd0Offset = getU32(4);

  // Walk IFD0 to find ExifIFD pointer
  const ifd0Entries = getU16(ifd0Offset);
  let exifIfdOffset = null;
  for (let i = 0; i < ifd0Entries; i++) {
    const entryOff = ifd0Offset + 2 + (i * 12);
    if (getU16(entryOff) === EXIF_IFD_TAG) {
      exifIfdOffset = getU32(entryOff + 8);
      break;
    }
  }

  if (exifIfdOffset === null) {
    return [];
  }

  const info = [];

  // Walk ExifIFD to find UserComment
  const exifEntries = getU16(exifIfdOffset);
  for (let i = 0; i < exifEntries; i++) {
    const entryOff = exifIfdOffset + 2 + (i * 12);
    if (getU16(entryOff) === USER_COMMENT_TAG) {
      const count = getU32(entryOff + 4);
      // Value offset (UNDEFINED type, count > 4 means offset is stored)
      const valueOffset = count > 4 ? getU32(entryOff + 8) : entryOff + 8;
      const commentBytes = new Uint8Array(buffer, view.byteOffset + valueOffset, Math.min(
        count, buffer.byteLength - view.byteOffset - valueOffset));

      // First 8 bytes are charset identifier
      const charset = String.fromCharCode(...commentBytes.subarray(0, 8)).replace(/\0/g, "");
      let encoding;
      switch (charset) {
        case "UNICODE":
          encoding = "utf-16be";
          break;
        case "JIS":
          encoding = "shift-jis";
          break;
        case "ASCII":
          encoding = "ascii";
          break;
        default: // UNDEFINED: try UTF-8
          encoding = "utf-8";
          break;
      }

      const payload = commentBytes.subarray(8);
      const text = new TextDecoder(encoding).decode(payload);
      if (text) {
        info.push({ keyword: "EXIF UserComment", text: text });
      }
    }
  }

  return info;
};

/**
 * See: https://github.com/Panchovix/stable-diffusion-webui-reForge/blob/739b2e1d9ab63160eaff9c8f73172c8da68424e1/modules/stealth_infotext.py#L57
 */
GenInfo.decodeStealthData = async function (blob) {
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: "none",
  });

  let pixels = null;
  const getPixels = forPixelCount => {
    const height = Math.min(forPixelCount, bitmap.height);
    const width = Math.min(Math.ceil(forPixelCount / height), bitmap.width);
    if (pixels && pixels.width >= width) {
      return pixels;
    }

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, width, height, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  };

  const signatureAlphaPlain = "stealth_pnginfo";
  const signatureAlphaCompressed = "stealth_pngcomp";
  const signatureRgbPlain = "stealth_rgbinfo";
  const signatureRgbCompressed = "stealth_rgbcomp";
  const signatureLength = signatureAlphaPlain.length;

  const lengthLength = 4; // Length of the length field

  const decoder = new TextDecoder("utf-8");

  // Start with big enough for signatures
  let rgbBytes = new Uint8Array(signatureLength);
  let rgbByteCount = 0;
  let alphaBytes = new Uint8Array(signatureLength);
  let alphaByteCount = 0;

  const State = Object.freeze({
    SIGNATURE: Symbol("State.SIGNATURE"),
    LENGTH: Symbol("State.LENGTH"),
    PAYLOAD: Symbol("State.PAYLOAD"),
    FINISHED: Symbol("State.FINISHED"),
  });

  let rgbState = State.SIGNATURE;
  let alphaState = State.SIGNATURE;

  let rgbSignature = "";
  let alphaSignature = "";

  let rgbPayloadCompressed = false;
  let alphaPayloadCompressed = false;

  let rgbPayloadLength = 0;
  let alphaPayloadLength = 0;

  const decodePayloads = async () => {
    const payloads = [];
    if (rgbState === State.FINISHED && rgbByteCount > 0) {
      if (rgbPayloadCompressed) {
        rgbBytes = await GenInfo.decompress(rgbBytes, "gzip");
      }
      const text = decoder.decode(rgbBytes);
      payloads.push({keyword: "RGB encoded", text: text});
    }
    if (alphaState === State.FINISHED && alphaByteCount > 0) {
      if (alphaPayloadCompressed) {
        alphaBytes = await GenInfo.decompress(alphaBytes, "gzip");
      }
      const text = decoder.decode(alphaBytes);
      payloads.push({keyword: "Alpha encoded", text: text});
    }
    return payloads;
  };

  // 1 bit per pixel for alpha
  const headerPixelCount = (signatureLength + 4) * 8;
  pixels = getPixels(headerPixelCount);

  let rgbBuffer = 0;
  let rgbBitCount = 0;
  let alphaBuffer = 0;
  let alphaBitCount = 0;
  for (let x = 0; x < pixels.width; x++) {
    for (let y = 0; y < pixels.height; y++) {
      const index = ((y * pixels.width) + x) * 4;

      if (rgbState !== State.FINISHED) {
        const r = pixels.data[index + 0];
        const g = pixels.data[index + 1];
        const b = pixels.data[index + 2];
        rgbBuffer <<= 1;
        rgbBuffer |= r & 1;
        rgbBuffer <<= 1;
        rgbBuffer |= g & 1;
        rgbBuffer <<= 1;
        rgbBuffer |= b & 1;
        rgbBitCount += 3;
        if (rgbBitCount === 24) {
          rgbBytes[rgbByteCount++] = (rgbBuffer >> 16) & 0xFF;
          rgbBytes[rgbByteCount++] = (rgbBuffer >> 8) & 0xFF;
          rgbBytes[rgbByteCount++] = (rgbBuffer >> 0) & 0xFF;
          rgbBuffer = 0;
          rgbBitCount = 0;
        }
      }

      switch (rgbState) {
        case State.SIGNATURE: {
          if (rgbByteCount === signatureLength) {
            rgbSignature = decoder.decode(rgbBytes.subarray(0, signatureLength));
            if (rgbSignature === signatureRgbCompressed) {
              rgbPayloadCompressed = true;
            }
            rgbByteCount = 0;
            if (rgbPayloadCompressed || rgbSignature === signatureRgbPlain) {
              rgbState = State.LENGTH;
            } else {
              rgbState = State.FINISHED;
            }
          }
          break;
        }
        case State.LENGTH: {
          if (rgbByteCount >= lengthLength) {
            const payloadBitCount = new DataView(rgbBytes.buffer).getInt32(0);
            const unusedBytes = rgbBytes.slice(lengthLength, rgbByteCount);
            const maxBitCount = bitmap.width * bitmap.height * 3;
            rgbPayloadLength = Math.max(unusedBytes.length, Math.floor(Math.min(payloadBitCount, maxBitCount) / 8));
            rgbByteCount = 0;
            if (rgbPayloadLength > 0) {
              // Round up next multiple of 3
              rgbBytes = new Uint8Array(Math.ceil(rgbPayloadLength / 3) * 3);
              rgbBytes.set(unusedBytes);
              rgbByteCount = unusedBytes.length;
              rgbState = State.PAYLOAD;
              pixels = getPixels(headerPixelCount + (payloadBitCount / 3));
            } else {
              rgbState = State.FINISHED;
            }
          }
          break;
        }
        case State.PAYLOAD: {
          if (rgbByteCount >= rgbPayloadLength) {
            rgbBytes = rgbBytes.subarray(0, rgbPayloadLength);
            rgbState = State.FINISHED;
          }
          break;
        }
      }

      if (alphaState !== State.FINISHED) {
        const a = pixels.data[index + 3];
        alphaBuffer <<= 1;
        alphaBuffer |= a & 1;
        alphaBitCount += 1;
        if (alphaBitCount === 8) {
          alphaBytes[alphaByteCount++] = (alphaBuffer >> 0) & 0xFF;
          alphaBuffer = 0;
          alphaBitCount = 0;
        }
      }

      switch (alphaState) {
        case State.SIGNATURE: {
          if (alphaByteCount === signatureLength) {
            alphaSignature = decoder.decode(alphaBytes.subarray(0, signatureLength));
            if (alphaSignature === signatureAlphaCompressed) {
              alphaPayloadCompressed = true;
            }
            alphaByteCount = 0;
            if (alphaPayloadCompressed || alphaSignature === signatureAlphaPlain) {
              alphaState = State.LENGTH;
            } else {
              alphaState = State.FINISHED;
            }
          }
          break;
        }
        case State.LENGTH: {
          if (alphaByteCount === lengthLength) {
            const payloadBitCount = new DataView(alphaBytes.buffer).getInt32(0);
            const maxBitCount = bitmap.width * bitmap.height;
            alphaPayloadLength = Math.floor(Math.min(payloadBitCount, maxBitCount) / 8);
            alphaByteCount = 0;
            if (alphaPayloadLength > 0) {
              alphaBytes = new Uint8Array(alphaPayloadLength);
              alphaState = State.PAYLOAD;
              pixels = getPixels(headerPixelCount + payloadBitCount);
            } else {
              alphaState = State.FINISHED;
            }
          }
          break;
        }
        case State.PAYLOAD: {
          if (alphaByteCount === alphaPayloadLength) {
            alphaState = State.FINISHED;
          }
          break;
        }
      }

      if (rgbState === State.FINISHED && alphaState === State.FINISHED) {
        return await decodePayloads();
      }
    }
  }

  return await decodePayloads();
};

/**
 * Fetch image metadata using Range request
 */
GenInfo.fetchMetadata = async function (url, fileExt) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    console.error(`Failed to fetch image: ${response.status}`);
    return [];
  }

  const blob = await response.blob();

  let stealthInfo = [];
  if (fileExt === "png" || fileExt === "webp") {
    try {
      stealthInfo = await GenInfo.decodeStealthData(blob);
    } catch (exception) {
      console.error(exception);
    }
  }

  try {
    const buffer = await blob.arrayBuffer();
    switch (fileExt) {
      case "png":
        return stealthInfo.concat(await GenInfo.parsePngChunks(buffer));
      case "jpg":
      case "jpeg":
        return stealthInfo.concat(GenInfo.parseJpegUserComment(buffer));
      case "webp":
        return stealthInfo.concat(GenInfo.parseWebPChunks(buffer));
    }
  } catch (exception) {
    console.error(exception);
  }

  return [];
};

/**
 * Render metadata chunks to HTML
 */
GenInfo.renderMetadata = function (chunks) {
  if (!chunks || chunks.length === 0) return null;

  const $details = $("<details>").attr("id", "gen-info");
  $details.append($("<summary>").text("Generation Info"));

  const $content = $("<div>").addClass("gen-info-content");

  chunks.forEach(chunk => {
    const $item = $("<div>").addClass("gen-info-item");
    $item.append($("<div>").addClass("gen-info-key").text(chunk.keyword));
    $item.append($("<code>").addClass("gen-info-value").text(chunk.text));
    $content.append($item);
  });

  $details.append($content);
  return $details;
};

/**
 * Get the original file URL and extension (handle sample URL rewriting)
 */
GenInfo.getOriginalUrl = function () {
  const $container = $("#image-container");
  if (!$container.length) return null;

  const fileExt = $container.data("file-ext");
  if (!["png", "jpg", "jpeg", "webp"].includes(fileExt)) return null;

  const url = $container.data("file-url");
  if (!url) return null;

  return { url, fileExt };
};

/**
 * Fetch and render metadata, inserting it into the page.
 * Returns true if metadata was found, false otherwise.
 */
GenInfo.loadAndShow = async function () {
  const result = GenInfo.getOriginalUrl();
  if (!result) return false;

  const $container = $("#gen-info-container");
  if (!$container.length) return false;

  const chunks = await GenInfo.fetchMetadata(result.url, result.fileExt);
  const $element = GenInfo.renderMetadata(chunks);

  if ($element) {
    $container.append($element);
    $element.attr("open", true);
    return true;
  }

  const $details = $("<details>")
    .attr({
      "id": "gen-info",
      "open": true,
    })
    .appendTo($container);
  $("<summary>").text("Generation Info").appendTo($details);
  $("<span>").text("No generation info found.").appendTo($details);
  return false;
};

export default GenInfo;
