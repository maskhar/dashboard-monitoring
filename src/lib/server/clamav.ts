import net from "node:net";
import { HttpError } from "./authz";

export async function scanForMalware(bytes: Buffer) {
  const host = process.env.CLAMAV_HOST;
  if (!host) {
    if (process.env.AUTH_MODE === "production") throw new HttpError(503, "Malware scanner is not configured");
    return "SKIPPED";
  }
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  const response = await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const output: Buffer[] = [];
    const timer = setTimeout(() => socket.destroy(new Error("scan timeout")), 30000);
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        const chunk = bytes.subarray(offset, Math.min(offset + 65536, bytes.length));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => output.push(Buffer.from(chunk)));
    socket.on("end", () => resolve(Buffer.concat(output).toString("utf8").replace(/\0/g, "").trim()));
    socket.on("error", reject);
    socket.on("close", () => clearTimeout(timer));
  }).catch(() => { throw new HttpError(503, "Malware scanner is unavailable"); });
  if (response.endsWith("OK")) return "CLEAN";
  if (response.includes("FOUND")) throw new HttpError(422, "Evidence file was rejected by malware scanner");
  throw new HttpError(503, "Malware scanner returned an invalid response");
}
