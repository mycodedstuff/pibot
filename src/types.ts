import { Telegraf } from "telegraf"
import { TelegramClient } from "telegram"
import { Config } from "./config/config"

// Represents an download
export type Download = {
  percentage?: number,
  name: string,
  chunkNumber: number
}

export type CodeInputMode = "CLI" | "WEB" | "TG"

export type PiState = {
  config: Config,
  client: TelegramClient,
  bot: Telegraf,
  downloads: Map<string, Download>
}