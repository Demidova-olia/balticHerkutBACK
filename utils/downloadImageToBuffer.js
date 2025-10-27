const axios = require("axios");

async function downloadImageToBuffer(url) {
  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(data);
}

module.exports = { downloadImageToBuffer };
