// 校验更新源：updates/latest.json 里的 signature 必须能对「安装包字节」验签通过。
// 等价于 updater 内部做的两步：base64 解出 minisign 文本 → Ed25519 验签（rsign 用 "ED" 预哈希）。
//
// 这条检查不是形式主义：signature 字段最容易写错成「.sig 文件内容的 base64」
// （多编一层），结构上看着正常（长得像 base64），但 updater 解一次会拿到 base64
// 文本而不是 minisign 文本，更新时直接签名校验失败。发布前跑一遍，几秒钟出结果。
//
// 用法: node scripts/verify-update-signature.mjs [repo根=当前目录]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.argv[2] || ".";
const conf = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8").replace(/^\uFEFF/, ""));
const latest = JSON.parse(fs.readFileSync(path.join(root, "updates/latest.json"), "utf8"));
const rel = latest.platforms["windows-x86_64"];

let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "   (" + detail + ")" : ""}`);
  if (!ok) fail++;
};

// 1) updater 第一步：signature 单次 base64 解码后必须是 minisign 文本
const text = Buffer.from(rel.signature, "base64").toString("utf8");
check("signature 单次解码即 minisign 文本", text.startsWith("untrusted comment:"), `长度 ${rel.signature.length}`);

// 2) 本地安装包
const exePath = path.join(root, "src-tauri/target/release/bundle/nsis", rel.url.split("/").pop());
const data = fs.readFileSync(exePath);
check("安装包存在且与 URL 同名", data.length > 1000, `${path.basename(exePath)} ${data.length} 字节`);

// 3) 公钥（tauri.conf → 文本 → 第 2 行 base64 → 2B 算法 + 8B keyId + 32B 公钥）
const pubRaw = Buffer.from(Buffer.from(conf.plugins.updater.pubkey, "base64").toString().split("\n")[1].trim(), "base64");
check("公钥 42 字节且算法为 Ed", pubRaw.length === 42 && pubRaw.subarray(0, 2).toString() === "Ed", `keyId ${pubRaw.subarray(2, 10).toString("hex").toUpperCase()}`);

// 4) Ed25519 验签：签名 blob 同样是 2B 算法 + 8B keyId + 64B 签名
//    rsign 用预哈希（"ED"），被签名的消息是 BLAKE2b-512(文件字节)
const sigBlob = Buffer.from(text.split("\n")[1].trim(), "base64");
const key = crypto.createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pubRaw.subarray(10)]),
  format: "der",
  type: "spki",
});
const sig = sigBlob.subarray(10);
const prehashed = sigBlob.subarray(0, 2).toString() === "ED";
const msg = prehashed ? crypto.createHash("blake2b512").update(data).digest() : data;
const ok = crypto.verify(null, msg, key, sig);
check(`Ed25519 验签${prehashed ? "（预哈希 BLAKE2b-512）" : ""}`, ok, ok ? "updater 会接受这个更新" : "签名与安装包不匹配");

process.exit(fail ? 1 : 0);
