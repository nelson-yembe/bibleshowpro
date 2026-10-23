/**
 * Reading Bible files picked in Settings. XML Bibles arrive in mixed encodings, and their
 * declarations are not always true: a file marked ISO-8859-1 is often really UTF-8.
 */

/** Decode as strict UTF-8 when the bytes allow it, else as the file declares (Latin-1 by default). */
export function decodeBibleBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    const head = new TextDecoder("windows-1252").decode(bytes.slice(0, 200));
    const declared = /encoding=["']([\w.-]+)["']/i.exec(head)?.[1];
    try {
      return new TextDecoder(declared && !/^utf-?8$/i.test(declared) ? declared : "windows-1252").decode(bytes);
    } catch {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }
}

export async function readBibleFile(file: File): Promise<string> {
  return decodeBibleBytes(new Uint8Array(await file.arrayBuffer()));
}

/** "The Holy Bible, NIV.xml" → "The Holy Bible, NIV": a name for files that carry none. */
export function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export const BIBLE_FILE_ACCEPT = ".json,.xml,.osis,.usfm,.sfm,.txt,application/json,text/xml";
