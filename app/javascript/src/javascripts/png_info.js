/**
 * PNGInfo Extractor
 *
 * Extracts tEXt chunks from PNG files to look for gen parameter PNGInfo
 * Uses HTTP Range requests to fetch only the header portion of the file.
 */

const PngInfo = {};

// Maximum bytes to fetch (32KB should cover metadata chunks before IDAT)
const MAX_FETCH_BYTES = 32 * 1024;

// PNG signature: 0x89 P N G \r \n 0x1A \n
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/**
 * Parse PNG chunks from an ArrayBuffer
 * Stops when it hits IDAT (image data) since metadata comes before that
 */
PngInfo.parseChunks = function (buffer) {
  const view = new DataView(buffer);
  const chunks = [];

  // Verify PNG signature
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (view.getUint8(i) !== PNG_SIGNATURE[i]) {
      throw new Error("Not a valid PNG file");
    }
  }

  let offset = 8; // Skip signature

  while (offset < buffer.byteLength - 12) { // Need at least 12 bytes for a chunk
    const length = view.getUint32(offset);
    const typeBytes = new Uint8Array(buffer, offset + 4, 4);
    const type = String.fromCharCode(...typeBytes);

    // Stop at IDAT - we've got all the metadata
    if (type === "IDAT") {
      break;
    }

    // Extract tEXt chunks
    if (type === "tEXt") {
      const data = new Uint8Array(buffer, offset + 8, Math.min(length, buffer.byteLength - offset - 12));
      const nullIndex = data.indexOf(0);
      if (nullIndex !== -1) {
        chunks.push({
          keyword: PngInfo.decodeText(data.slice(0, nullIndex)),
          text: PngInfo.decodeText(data.slice(nullIndex + 1)),
        });
      }
    }

    // Move to next chunk: 4 (length) + 4 (type) + length (data) + 4 (CRC)
    offset += 12 + length;
  }

  return chunks;
};

/**
 * Decode bytes to string
 */
PngInfo.decodeText = function (bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
};

/**
 * Fetch PNG metadata using Range request
 */
PngInfo.fetchMetadata = async function (url) {
  const response = await fetch(url, {
    headers: {
      "Range": `bytes=0-${MAX_FETCH_BYTES - 1}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return PngInfo.parseChunks(buffer);
};

/**
 * Render metadata chunks to HTML
 */
PngInfo.renderMetadata = function (chunks) {
  if (!chunks || chunks.length === 0) return null;

  const $details = $("<details>").attr("id", "png-info");
  $details.append($("<summary>").text("Generation Info"));

  const $content = $("<div>").addClass("png-info-content");

  chunks.forEach(chunk => {
    const $item = $("<div>").addClass("png-info-item");
    $item.append($("<div>").addClass("png-info-key").text(chunk.keyword));
    $item.append($("<code>").addClass("png-info-value").text(chunk.text));
    $content.append($item);
  });

  $details.append($content);
  return $details;
};

/**
 * Get the original file URL (handle sample URL rewriting)
 */
PngInfo.getOriginalUrl = function () {
  const $container = $("#image-container");
  if (!$container.length) return null;

  const fileExt = $container.data("file-ext");
  if (fileExt !== "png") return null;

  const postData = $container.data("post");
  return postData?.file?.url || null;
};

/**
 * Fetch and render PNG metadata, inserting it into the page.
 * Returns true if metadata was found, false otherwise.
 */
PngInfo.loadAndShow = async function () {
  const url = PngInfo.getOriginalUrl();
  if (!url) return false;

  const $container = $("#png-info-container");
  if (!$container.length) return false;

  const chunks = await PngInfo.fetchMetadata(url);
  const $element = PngInfo.renderMetadata(chunks);

  if ($element) {
    $container.append($element);
    $element.attr("open", true);
    return true;
  }

  $container.append(
    $("<span>").text("No generation info found."),
  );
  return false;
};

export default PngInfo;
