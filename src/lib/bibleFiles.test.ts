import { describe, expect, it } from "vitest";
import { decodeBibleBytes, fileStem } from "@/lib/bibleFiles";

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("decodeBibleBytes", () => {
  it("reads UTF-8, even when the file claims to be Latin-1", () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><v>Genèse ®</v>';
    expect(decodeBibleBytes(utf8(xml))).toBe(xml);
  });

  it("reads real Latin-1 bytes as the file declares", () => {
    const head = utf8('<?xml version="1.0" encoding="ISO-8859-1"?><v>Gen');
    const bytes = new Uint8Array([...head, 0xe8, ...utf8("se</v>")]);
    expect(decodeBibleBytes(bytes)).toContain("Genèse");
  });

  it("reads UTF-16 with a byte-order mark", () => {
    const text = "\\id JHN";
    const bytes = new Uint8Array([0xff, 0xfe, ...Array.from(text).flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(decodeBibleBytes(bytes)).toBe(text);
  });
});

describe("fileStem", () => {
  it("drops the extension only", () => {
    expect(fileStem("The Holy Bible, New International Version®.xml")).toBe("The Holy Bible, New International Version®");
    expect(fileStem("lsg.v2.osis")).toBe("lsg.v2");
  });
});
