// Represents an download
export type Download = {
  percentage?: number,
  name: string,
  chunkNumber: number
}

export type CodeInputMode = "CLI" | "WEB" | "TG"
