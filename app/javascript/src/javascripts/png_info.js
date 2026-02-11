/**
 * PNGInfo Extractor
 *
 * Extracts tEXt chunks from PNG files to look for gen parameter PNGInfo
 * Uses HTTP Range requests to fetch only the header portion of the file.
 */

import Page from "./utility/page";

const PngInfo = {};

// Maximum bytes to fetch (32KB should cover metadata chunks before IDAT)
const MAX_FETCH_BYTES = 32 * 1024;


// PNG signature: 0x89 P N G \r \n 0x1A \n
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/**
 * Parse PNG chunks from an ArrayBuffer
 * Stops when it hits IDAT (image data) since metadata comes before that
 */
PngInfo.parseChunks = function(buffer) {
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
PngInfo.decodeText = function(bytes) {
  try {
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
};

/**
 * Fetch PNG metadata using Range request
 */
PngInfo.fetchMetadata = async function(url) {
  const response = await fetch(url, {
    headers: {
      "Range": `bytes=0-${MAX_FETCH_BYTES - 1}`
    }
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return PngInfo.parseChunks(buffer);
};

/**
 * Render metadata chunks to HTML
 */
PngInfo.renderMetadata = function(chunks) {
  if (!chunks || chunks.length === 0) return null;

  const details = document.createElement("details");
  details.id = "png-info";

  const summary = document.createElement("summary");
  summary.textContent = "Generation Info";
  details.appendChild(summary);

  const content = document.createElement("div");
  content.className = "png-info-content";

  chunks.forEach(chunk => {
    const item = document.createElement("div");
    item.className = "png-info-item";

    const key = document.createElement("div");
    key.className = "png-info-key";
    key.textContent = chunk.keyword;
    item.appendChild(key);

    const value = document.createElement("code");
    value.className = "png-info-value";
    value.textContent = chunk.text;
    item.appendChild(value);

    content.appendChild(item);
  });

  details.appendChild(content);

  const wrapper = document.createElement("div");
  wrapper.className = "ui-corner-all ui-state-highlight notice notice-resized";
  wrapper.appendChild(details);
  return wrapper;
};

/**
 * Get the original file URL (handle sample URL rewriting)
 */
PngInfo.getOriginalUrl = function() {
  const container = document.getElementById("image-container");
  if (!container) return null;

  // Data comes from two places:
  // - Direct attributes: data-file-ext, data-size
  // - JSON in data-post: { file: { url, ext, size } }
  const fileExt = container.dataset.fileExt;
  const fileSize = parseInt(container.dataset.size, 10);

  if (fileExt !== "png") {
    return null;
  }

  // Get URL from the post JSON data
  try {
    const postData = JSON.parse(container.dataset.post);
    return postData.file?.url || null;
  } catch {
    return null;
  }
};

/**
 * Initialize on post show pages
 */
PngInfo.initialize = async function() {
  // Only run on post show pages
  if (Page.Controller !== "posts" || Page.Action !== "show") {
    return;
  }

  const url = PngInfo.getOriginalUrl();
  if (!url) return;

  try {
    const chunks = await PngInfo.fetchMetadata(url);
    const element = PngInfo.renderMetadata(chunks);

    if (element) {
      // Insert after the resize notice, or after the image container
      const resizeNotice = document.getElementById("image-resize-notice");
      const imageContainer = document.getElementById("image-container");
      const anchor = resizeNotice || imageContainer;
      if (anchor) {
        anchor.after(element);
      }
    }
  } catch (err) {
    console.warn("PngInfo: Failed to extract metadata", err);
  }
};

// Auto-initialize when DOM is ready
$(PngInfo.initialize);

export default PngInfo;
