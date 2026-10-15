const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

const IPINFO_TOKEN = process.env.IPINFO_TOKEN || "0b9f1adb71f1a1";
const TIMEOUT = 7000;

function formatProxy(proxy) {
  const parts = proxy.trim().split(":");
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${user}:${pass}@${host}:${port}`;
  }
  return `http://${proxy.trim()}`;
}

function detectIPVersion(ip) {
  return ip.includes(":") ? "IPv6" : "IPv4";
}

function classifyIP(data) {
  const org = (data.as_name || data.org || "").toLowerCase();

  if (data.mobile === true) return "mobile";

  const mobileKeywords = ["vodafone", "t-mobile", "telekom", "orange", "o2", "att", "verizon"];
  if (mobileKeywords.some((k) => org.includes(k))) return "mobile";

  const dcKeywords = ["amazon", "aws", "google", "microsoft", "azure", "digitalocean", "ovh", "cloudflare", "linode", "hetzner"];
  if (dcKeywords.some((k) => org.includes(k))) return "datacenter";

  return "isp";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let proxy;
  try {
    const body = JSON.parse(event.body || "{}");
    proxy = body.proxy;
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: "Invalid JSON body" }),
    };
  }

  if (!proxy) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: "Proxy missing" }),
    };
  }

  try {
    const proxyUrl = formatProxy(proxy);
    const agent = new HttpsProxyAgent(proxyUrl);

    const res = await axios.get(`https://api.ipinfo.io/lite/me?token=${IPINFO_TOKEN}`, {
      httpAgent: agent,
      httpsAgent: agent,
      timeout: TIMEOUT,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const data = res.data;
    const ip = data.ip;
    if (!ip) throw new Error("No IP returned");

    const ipVersion = detectIPVersion(ip);
    const type = classifyIP(data);
    const isp = data.as_name || data.org || "unknown";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        proxy,
        ip,
        type,
        ipVersion,
        isp,
        line: `${proxy} | ${ip} | ${type} | ${ipVersion} | ${isp}`,
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: err.message || "Connection timed out",
      }),
    };
  }
};